/**
 * Regression tests for production-readiness bug fixes (bun-client).
 *
 * Each `describe` targets ONE bug: written to FAIL against the buggy code and
 * PASS once the fix is applied. These mirror the @procwire/client fixes.
 */
import { describe, it, expect, spyOn } from "bun:test";
import { Client } from "../src/index.js";
import { buildFrame } from "@procwire/protocol";
import { msgpackCodec } from "@procwire/codecs";

interface ClientInternals {
  _onSocketError(err: Error): void;
  _onConnectionOpen(socket: unknown): void;
  _onConnectionClose(): void;
  _onSocketData(socket: unknown, data: Buffer): void;
  _socket: unknown;
  _activeContexts: Map<number, { _markAborted(): void }>;
  _abortCallbacks: Map<number, Set<() => void>>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Bug C5 (bun-client): the socket error handler forwarded errors via
// emit("error"). Node's EventEmitter throws synchronously when "error" is
// emitted with no listener, so an unobserved socket error crashed the child.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug C5 (bun-client): unobserved socket error must not crash the child", () => {
  it("does not throw when a socket error fires with no 'error' listener", () => {
    const client = new Client();

    expect(() =>
      (client as unknown as ClientInternals)._onSocketError(new Error("ECONNRESET")),
    ).not.toThrow();
  });

  it("still forwards the error to a registered 'error' listener", () => {
    const client = new Client();

    let caught: Error | undefined;
    client.on("error", (err: Error) => {
      caught = err;
    });

    const err = new Error("EPIPE");
    expect(() => (client as unknown as ClientInternals)._onSocketError(err)).not.toThrow();
    expect(caught).toBe(err);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bug C4a (bun-client): the open handler unconditionally overwrote _socket /
// _frameBuffer / _drainWaiter on every connection, so a second or stray
// connection corrupted the active connection's in-flight state. The model is
// single-parent, so extra connections must be rejected.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug C4a (bun-client): a second connection must be rejected", () => {
  it("keeps the first socket and ends the second connection", () => {
    const client = new Client();
    const internals = client as unknown as ClientInternals;

    let endedA = false;
    let endedB = false;
    const sockA = { end: () => (endedA = true) };
    const sockB = { end: () => (endedB = true) };

    internals._onConnectionOpen(sockA);
    expect(internals._socket).toBe(sockA);

    internals._onConnectionOpen(sockB);

    // Fixed: A stays active, B is ended. Buggy: _socket overwritten to B.
    expect(internals._socket).toBe(sockA);
    expect(endedB).toBe(true);
    expect(endedA).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bug C3 (bun-client): the close handler only cleared the DrainWaiter and
// emitted "disconnected". It never cleared _activeContexts / _abortCallbacks,
// never fired in-flight onAbort callbacks, and never nulled _socket. In-flight
// handler state leaked and cancellation cleanup never ran.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug C3 (bun-client): disconnect must clean up in-flight request state", () => {
  it("aborts contexts, fires onAbort, clears maps, and nulls the socket", () => {
    const client = new Client();
    const internals = client as unknown as ClientInternals;

    internals._onConnectionOpen({ end: () => {} });

    let aborted = false;
    let abortCbFired = false;
    internals._activeContexts.set(7, {
      _markAborted: () => {
        aborted = true;
      },
    });
    internals._abortCallbacks.set(
      7,
      new Set([
        () => {
          abortCbFired = true;
        },
      ]),
    );

    internals._onConnectionClose();

    expect(aborted).toBe(true);
    expect(abortCbFired).toBe(true);
    expect(internals._activeContexts.size).toBe(0);
    expect(internals._abortCallbacks.size).toBe(0);
    expect(internals._socket).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bug C4b (bun-client): the client ignored the maxPayloadSize option (always a
// default 1GB FrameBuffer), and an oversized/invalid frame threw out of the
// data handler (crash). Honor the option and drop the connection instead.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug C4b (bun-client): must honor maxPayloadSize", () => {
  it("drops the connection on a frame exceeding maxPayloadSize (no crash)", () => {
    const client = new Client({ maxPayloadSize: 100 });
    const internals = client as unknown as ClientInternals;

    let ended = false;
    const socket = { end: () => (ended = true), write: () => true };
    internals._onConnectionOpen(socket);

    const oversized = buildFrame({ methodId: 999, flags: 0, requestId: 1 }, Buffer.alloc(200));
    expect(() => internals._onSocketData(socket, oversized)).not.toThrow();
    expect(ended).toBe(true);
  });

  it("accepts a frame within maxPayloadSize", () => {
    const client = new Client({ maxPayloadSize: 1000 });
    const internals = client as unknown as ClientInternals;

    let ended = false;
    const socket = { end: () => (ended = true), write: () => true };
    internals._onConnectionOpen(socket);

    const ok = buildFrame(
      { methodId: 999, flags: 0, requestId: 1 },
      msgpackCodec.serialize({ x: 1 }),
    );
    expect(() => internals._onSocketData(socket, ok)).not.toThrow();
    expect(ended).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Feature D1 (bun-client): the child answers control-plane heartbeat pings so
// the parent can detect a hung child. A $ping must produce a $pong on stdout.
// ═══════════════════════════════════════════════════════════════════════════
describe("Feature D1 (bun-client): responds to heartbeat ping with pong", () => {
  function handleControl(client: Client, line: string): void {
    (client as unknown as { _handleControlLine(line: string): void })._handleControlLine(line);
  }

  it("writes a $pong when it receives a $ping", () => {
    const client = new Client();
    const logSpy = spyOn(console, "log").mockImplementation(() => {});
    try {
      handleControl(client, JSON.stringify({ jsonrpc: "2.0", method: "$ping" }));

      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(JSON.parse(logSpy.mock.calls[0]![0] as string)).toMatchObject({ method: "$pong" });
    } finally {
      logSpy.mockRestore();
    }
  });

  it("ignores non-ping and malformed control lines", () => {
    const client = new Client();
    const logSpy = spyOn(console, "log").mockImplementation(() => {});
    try {
      handleControl(client, JSON.stringify({ jsonrpc: "2.0", method: "$shutdown" }));
      handleControl(client, "not json");

      expect(logSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
    }
  });
});
