/**
 * Regression tests for production-readiness bug fixes.
 *
 * Each `describe` block targets ONE specific bug. The tests are written to FAIL
 * against the buggy code (demonstrating the bug exists) and PASS once the fix is
 * applied. They also guard against regressing the surrounding behavior.
 */
import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { Socket } from "node:net";
import { Module } from "../src/module.js";
import { msgpackCodec } from "@procwire/codecs";

/**
 * Mock socket usable as a net.Socket in tests.
 * It is a real EventEmitter so `emit("data"|"error"|"close")` drives the module.
 */
function createMockSocket(): Socket & EventEmitter {
  const emitter = new EventEmitter();
  const mockSocket = Object.assign(emitter, {
    write: vi.fn().mockReturnValue(true),
    destroy: vi.fn(),
    destroyed: false,
    setNoDelay: vi.fn(),
    cork: vi.fn(),
    uncork: vi.fn(),
  }) as unknown as Socket & EventEmitter;
  return mockSocket;
}

function setupReadyModule(): { mod: Module; socket: Socket & EventEmitter } {
  const mod = new Module("worker")
    .executable("node", ["index.js"])
    .method("foo", { response: "result", codec: msgpackCodec });

  mod._setState("ready");
  mod._attachSchema({
    methods: { foo: { id: 1, response: "result" } },
    events: {},
  });

  const socket = createMockSocket();
  mod._attachDataChannel(socket);

  return { mod, socket };
}

// ═══════════════════════════════════════════════════════════════════════════
// Bug C5: a socket "error" must not crash the parent process when the user
// has not attached a Module "error" listener.
//
// Node's EventEmitter throws synchronously when "error" is emitted with no
// registered listener. The Module forwards socket errors via emit("error"),
// and ModuleManager does NOT attach a per-Module "error" listener, so an
// unobserved socket error would take down the whole parent process.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug C5: unobserved socket error must not crash the process", () => {
  it("does not throw when the socket errors and no 'error' listener is attached", () => {
    const { socket } = setupReadyModule();

    // No mod.on("error", ...) listener registered on purpose.
    // Buggy behavior: socket "error" -> mod.emit("error") with no listener -> throws.
    expect(() => socket.emit("error", new Error("ECONNRESET"))).not.toThrow();
  });

  it("still forwards socket errors to a registered 'error' listener", () => {
    const { mod, socket } = setupReadyModule();

    const onError = vi.fn();
    mod.on("error", onError);

    const err = new Error("EPIPE");
    expect(() => socket.emit("error", err)).not.toThrow();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(err);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bug C8: _detach() destroys the socket but leaves its "data"/"error"/"close"
// listeners attached. destroy() does not synchronously remove listeners, so a
// buffered "data" event arriving after detach runs `this._frameBuffer!.push()`
// when _frameBuffer is already null -> TypeError. On restart cycles the
// closures also leak on the old socket.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug C8: _detach must remove socket listeners and survive late events", () => {
  it("does not throw when a 'data' event arrives after detach", () => {
    const { mod, socket } = setupReadyModule();

    mod._detach();

    // Buggy behavior: the still-attached "data" handler calls
    // this._frameBuffer!.push(chunk) with _frameBuffer === null -> TypeError.
    expect(() => socket.emit("data", Buffer.alloc(11))).not.toThrow();
  });

  it("removes all socket listeners on detach (no leak across reconnects)", () => {
    const { mod, socket } = setupReadyModule();

    // The module attaches data/error/close; DrainWaiter also attaches a close
    // listener, so close starts >= 1.
    expect(socket.listenerCount("data")).toBe(1);
    expect(socket.listenerCount("error")).toBe(1);
    expect(socket.listenerCount("close")).toBeGreaterThanOrEqual(1);

    mod._detach();

    expect(socket.listenerCount("data")).toBe(0);
    expect(socket.listenerCount("error")).toBe(0);
    expect(socket.listenerCount("close")).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bug C6: requestId is a uint32 on the wire but _nextRequestId++ never wraps.
// After 2^32 requests, encodeHeaderInto -> writeUInt32BE throws RangeError and
// every subsequent send breaks. The id must wrap within the uint32 range and
// skip 0 (reserved for fire-and-forget / events).
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug C6: requestId must wrap at the uint32 boundary", () => {
  function reqIdOfFirstWrite(socket: Socket & EventEmitter): number {
    const writeMock = socket.write as ReturnType<typeof vi.fn>;
    const header = writeMock.mock.calls[0]![0] as Buffer;
    return header.readUInt32BE(3); // [methodId:2][flags:1][reqId:4]
  }

  it("wraps to a valid non-zero id instead of throwing RangeError", async () => {
    const { mod, socket } = setupReadyModule();
    const writeMock = socket.write as ReturnType<typeof vi.fn>;

    // Drive the counter to the last valid uint32 value.
    (mod as unknown as { _nextRequestId: number })._nextRequestId = 0xffffffff;

    // First send consumes 0xffffffff (still valid on both buggy and fixed code).
    const p1 = mod.send("foo", {});
    const s1 = p1.then(
      () => "ok",
      (e) => e,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(writeMock).toHaveBeenCalled();
    expect(reqIdOfFirstWrite(socket)).toBe(0xffffffff);

    writeMock.mockClear();

    // Second send: buggy code computes 0x100000000 and writeUInt32BE throws,
    // so NOTHING is written. Fixed code wraps to 1 (skipping reserved 0).
    const p2 = mod.send("foo", {});
    const s2 = p2.then(
      () => "ok",
      (e) => e,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(writeMock).toHaveBeenCalled();
    expect(reqIdOfFirstWrite(socket)).toBe(1);

    // Cleanup: detach rejects the still-pending sends so nothing leaks.
    mod._detach();
    await Promise.all([s1, s2]);
  });
});
