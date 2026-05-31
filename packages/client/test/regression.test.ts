/**
 * Regression tests for production-readiness bug fixes (client side).
 *
 * Each `describe` targets ONE bug: the test is written to FAIL against the
 * buggy code (demonstrating the bug) and PASS once the fix is applied.
 */
import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { Socket } from "node:net";
import { Client } from "../src/client.js";
import type { RequestContextImpl } from "../src/request-context.js";
import { msgpackCodec } from "@procwire/codecs";
import { buildFrame } from "@procwire/protocol";

interface MockSocket extends EventEmitter {
  write: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  destroyed: boolean;
  cork: ReturnType<typeof vi.fn>;
  uncork: ReturnType<typeof vi.fn>;
  writableNeedDrain: boolean;
}

function createMockSocket(): MockSocket {
  const emitter = new EventEmitter() as MockSocket;
  emitter.write = vi.fn().mockReturnValue(true);
  emitter.destroy = vi.fn();
  emitter.destroyed = false;
  emitter.cork = vi.fn();
  emitter.uncork = vi.fn();
  emitter.writableNeedDrain = false;
  return emitter;
}

/** Internal shape we reach into for white-box testing. */
interface ClientInternals {
  _methodNameToId: Map<string, number>;
  _methodIdToName: Map<number, string>;
  _activeContexts: Map<number, RequestContextImpl>;
  _abortCallbacks: Map<number, Set<() => void>>;
  _socket: Socket | null;
  _frameBuffer: unknown;
  _handleConnection(socket: Socket): void;
}

/**
 * Bring a Client into a "connected" state with one method registered, mirroring
 * what start() + a parent connection would do, but driven from a mock socket.
 */
function connectClient(
  client: Client,
  methodName: string,
  methodId: number,
): { internals: ClientInternals; socket: MockSocket } {
  const internals = client as unknown as ClientInternals;
  // start() assigns ids by iterating registered methods; emulate that here.
  internals._methodNameToId.set(methodName, methodId);
  internals._methodIdToName.set(methodId, methodName);

  const socket = createMockSocket();
  internals._handleConnection(socket as unknown as Socket);
  return { internals, socket };
}

// ═══════════════════════════════════════════════════════════════════════════
// Bug C3: on disconnect the client only cleared the DrainWaiter and emitted
// "disconnected". It never cleared _activeContexts / _abortCallbacks, never
// fired in-flight onAbort callbacks, and never nulled _socket. In-flight
// handler state leaked and cancellation cleanup never ran.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug C3: disconnect must clean up in-flight request state", () => {
  it("clears active contexts, fires onAbort, and nulls the socket on close", async () => {
    let abortFired = false;

    const client = new Client().handle("foo", async (_data, ctx) => {
      ctx.onAbort(() => {
        abortFired = true;
      });
      // Never resolves: the request stays in-flight until disconnect.
      await new Promise<void>(() => {});
    });

    const { internals, socket } = connectClient(client, "foo", 1);

    // Drive a request frame so the handler runs and registers onAbort.
    const reqFrame = buildFrame(
      { methodId: 1, flags: 0, requestId: 7 },
      msgpackCodec.serialize({}),
    );
    socket.emit("data", reqFrame);
    await Promise.resolve();
    await Promise.resolve();

    expect(internals._activeContexts.size).toBe(1);
    expect(internals._abortCallbacks.get(7)?.size).toBe(1);

    // Connection drops.
    socket.emit("close");

    expect(abortFired).toBe(true);
    expect(internals._activeContexts.size).toBe(0);
    expect(internals._abortCallbacks.size).toBe(0);
    expect(internals._socket).toBeNull();
  });

  it("does not throw when a 'data' event arrives after disconnect", () => {
    const client = new Client().handle("foo", vi.fn());
    const { socket } = connectClient(client, "foo", 1);

    socket.emit("close");

    // After disconnect _frameBuffer is null; a late data event must not crash.
    const frame = buildFrame({ methodId: 1, flags: 0, requestId: 1 }, msgpackCodec.serialize({}));
    expect(() => socket.emit("data", frame)).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bug C5 (client): the client forwarded socket errors via emit("error"). Node's
// EventEmitter throws synchronously when "error" is emitted with no listener, so
// an unobserved socket error crashed the whole child process.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug C5 (client): unobserved socket error must not crash the child", () => {
  it("does not throw when the socket errors and no 'error' listener is attached", () => {
    const client = new Client().handle("foo", vi.fn());
    const { socket } = connectClient(client, "foo", 1);

    expect(() => socket.emit("error", new Error("ECONNRESET"))).not.toThrow();
  });

  it("forwards socket errors to a registered 'error' listener", () => {
    const client = new Client().handle("foo", vi.fn());
    const onError = vi.fn();
    client.on("error", onError);

    const { socket } = connectClient(client, "foo", 1);
    const err = new Error("EPIPE");

    expect(() => socket.emit("error", err)).not.toThrow();
    expect(onError).toHaveBeenCalledWith(err);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bug C4a: createServer's callback unconditionally overwrote _socket /
// _frameBuffer / _drainWaiter on every connection. A second or stray connection
// (or a reconnect) corrupted the in-flight state of the active connection. The
// model is single-parent, so extra connections must be rejected.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug C4a: a second connection must be rejected, not overwrite state", () => {
  it("keeps the first socket and destroys the second connection", () => {
    const client = new Client().handle("foo", vi.fn());
    const internals = client as unknown as ClientInternals;
    internals._methodNameToId.set("foo", 1);
    internals._methodIdToName.set(1, "foo");

    const sockA = createMockSocket();
    internals._handleConnection(sockA as unknown as Socket);
    expect(internals._socket).toBe(sockA as unknown as Socket);

    const sockB = createMockSocket();
    internals._handleConnection(sockB as unknown as Socket);

    // Fixed: A stays active, B is destroyed. Buggy: _socket overwritten to B.
    expect(internals._socket).toBe(sockA as unknown as Socket);
    expect(sockB.destroy).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bug P2: _sendErrorResponse wrote the pooled header buffer by reference (no
// Buffer.from copy, unlike the other send paths). The header ring buffer has 16
// slots, so after 16 more sends the slot is reused and encodeHeaderInto
// overwrites a header that may still be queued in the socket's write buffer
// under backpressure -> a corrupted frame is sent to the parent.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug P2: error responses must not reuse a queued pooled header", () => {
  it("does not overwrite an already-written error header when the ring wraps", () => {
    const client = new Client().handle("dummy", vi.fn());
    const internals = client as unknown as ClientInternals;
    internals._methodNameToId.set("dummy", 1);
    internals._methodIdToName.set(1, "dummy");

    const socket = createMockSocket();
    internals._handleConnection(socket as unknown as Socket);
    const writeMock = socket.write as ReturnType<typeof vi.fn>;

    // Unknown method id (500) -> _sendErrorResponse for requestId 1.
    const unknownFrame = (requestId: number): Buffer =>
      buildFrame({ methodId: 500, flags: 0, requestId }, msgpackCodec.serialize("x"));

    socket.emit("data", unknownFrame(1));
    const firstHeader = writeMock.mock.calls[0]![0] as Buffer; // header of request 1
    expect(firstHeader.readUInt32BE(3)).toBe(1);

    // 16 more error responses cycle the 16-slot ring back to the first slot.
    for (let r = 2; r <= 17; r++) {
      socket.emit("data", unknownFrame(r));
    }

    // Buggy: firstHeader is the pooled slot, now overwritten by request 17.
    // Fixed: firstHeader is a private copy, still request 1.
    expect(firstHeader.readUInt32BE(3)).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bug C4b: the Client ignored the maxPayloadSize option - it always created a
// FrameBuffer with the default (1GB) limit, so a hostile/buggy parent could
// declare a huge payload and exhaust memory. The option must be honored, and an
// oversized frame must drop the connection instead of crashing the child.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug C4b: client must honor maxPayloadSize", () => {
  it("drops the connection on a frame exceeding maxPayloadSize (no crash)", () => {
    const client = new Client({ maxPayloadSize: 100 });
    const internals = client as unknown as ClientInternals;

    const socket = createMockSocket();
    internals._handleConnection(socket as unknown as Socket);

    // A frame declaring a 200-byte payload exceeds the 100-byte limit.
    const oversized = buildFrame({ methodId: 999, flags: 0, requestId: 1 }, Buffer.alloc(200));

    // Fixed: FrameBuffer throws -> caught -> socket destroyed (no crash).
    // Buggy: option ignored -> default 1GB limit -> frame accepted, no destroy.
    expect(() => socket.emit("data", oversized)).not.toThrow();
    expect(socket.destroy).toHaveBeenCalled();
  });

  it("accepts a frame within maxPayloadSize", () => {
    const client = new Client({ maxPayloadSize: 1000 });
    const internals = client as unknown as ClientInternals;

    const socket = createMockSocket();
    internals._handleConnection(socket as unknown as Socket);

    const ok = buildFrame(
      { methodId: 999, flags: 0, requestId: 1 },
      msgpackCodec.serialize({ x: 1 }),
    );
    expect(() => socket.emit("data", ok)).not.toThrow();
    expect(socket.destroy).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Feature D1 (client): the child answers control-plane heartbeat pings so the
// parent can detect a hung child. A $ping must produce a $pong on stdout.
// ═══════════════════════════════════════════════════════════════════════════
describe("Feature D1 (client): responds to heartbeat ping with pong", () => {
  function handleControl(client: Client, line: string): void {
    (client as unknown as { _handleControlLine(line: string): void })._handleControlLine(line);
  }

  it("writes a $pong when it receives a $ping", () => {
    const client = new Client();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      handleControl(client, JSON.stringify({ jsonrpc: "2.0", method: "$ping" }));

      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(JSON.parse(logSpy.mock.calls[0]![0] as string)).toMatchObject({ method: "$pong" });
    } finally {
      logSpy.mockRestore();
    }
  });

  it("ignores unknown and malformed control lines", () => {
    const client = new Client();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      handleControl(client, JSON.stringify({ jsonrpc: "2.0", method: "$unknown" }));
      handleControl(client, "not json");

      expect(logSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
    }
  });

  it("shuts down gracefully on $shutdown", () => {
    const client = new Client();
    const shutdownSpy = vi.spyOn(client, "shutdown").mockResolvedValue(undefined);
    try {
      handleControl(client, JSON.stringify({ jsonrpc: "2.0", method: "$shutdown" }));
      expect(shutdownSpy).toHaveBeenCalledTimes(1);
    } finally {
      shutdownSpy.mockRestore();
    }
  });
});
