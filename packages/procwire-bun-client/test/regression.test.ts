/**
 * Regression tests for production-readiness bug fixes (bun-client).
 *
 * Each `describe` targets ONE bug: written to FAIL against the buggy code and
 * PASS once the fix is applied. These mirror the @procwire/client fixes.
 */
import { describe, it, expect } from "bun:test";
import { Client } from "../src/index.js";

interface ClientInternals {
  _onSocketError(err: Error): void;
  _onConnectionOpen(socket: unknown): void;
  _onConnectionClose(): void;
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
