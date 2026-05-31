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
