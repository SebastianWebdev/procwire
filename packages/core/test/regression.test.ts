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
import { ModuleManager } from "../src/manager.js";
import { msgpackCodec } from "@procwire/codecs";
import { buildFrame, Flags } from "@procwire/protocol";

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
    pause: vi.fn(),
    resume: vi.fn(),
  }) as unknown as Socket & EventEmitter;
  return mockSocket;
}

function setupReadyModule(opts: { cancellable?: boolean } = {}): {
  mod: Module;
  socket: Socket & EventEmitter;
} {
  const mod = new Module("worker").executable("node", ["index.js"]).method("foo", {
    response: "result",
    codec: msgpackCodec,
    cancellable: opts.cancellable ?? false,
  });

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

// ═══════════════════════════════════════════════════════════════════════════
// Bug C7: the AbortSignal "abort" listener is added with { once: true } but is
// only removed if the signal actually fires. When a request settles normally
// the listener stays attached, so a reused long-lived signal accumulates
// listeners (leak + MaxListenersExceededWarning).
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug C7: abort listener must be removed when a request settles normally", () => {
  it("removes the abort listener from the signal after send() completes", async () => {
    const { mod, socket } = setupReadyModule({ cancellable: true });
    const controller = new AbortController();
    const removeSpy = vi.spyOn(controller.signal, "removeEventListener");

    const sendPromise = mod.send("foo", {}, { signal: controller.signal });
    await vi.waitFor(() => expect(socket.write).toHaveBeenCalled());

    // Full response -> request completes normally; abort never fires.
    const frame = buildFrame(
      { methodId: 1, flags: Flags.IS_RESPONSE, requestId: 1 },
      msgpackCodec.serialize({ ok: true }),
    );
    socket.emit("data", frame);
    await sendPromise;

    expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("removes the abort listener from the signal after a stream ends", async () => {
    const mod = new Module("worker")
      .executable("node", ["index.js"])
      .method("st", { response: "stream", cancellable: true, codec: msgpackCodec });
    mod._setState("ready");
    mod._attachSchema({ methods: { st: { id: 1, response: "stream" } }, events: {} });
    const socket = createMockSocket();
    mod._attachDataChannel(socket);

    const controller = new AbortController();
    const removeSpy = vi.spyOn(controller.signal, "removeEventListener");

    const gen = mod.stream("st", {}, { signal: controller.signal });
    const consume = (async () => {
      for await (const _ of gen) {
        // drain
      }
    })();

    await vi.waitFor(() => expect(socket.write).toHaveBeenCalled());

    // STREAM_END finishes the stream normally; abort never fires.
    const endFrame = buildFrame(
      { methodId: 1, flags: Flags.IS_STREAM | Flags.STREAM_END, requestId: 1 },
      Buffer.alloc(0),
    );
    socket.emit("data", endFrame);
    await consume;

    expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bug C2/C1: send() to a method with no configured timeout waited forever, and
// an ACK frame on a "result" method (which is intentionally ignored) left the
// pending request in the map forever. A default request timeout bounds both:
// the request rejects instead of hanging/leaking. The default is overridable
// per-method and per-module, and timeout: 0 disables it.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug C2/C1: a default request timeout bounds hanging/leaking requests", () => {
  it("rejects with a timeout when the method has no explicit timeout", async () => {
    vi.useFakeTimers();
    try {
      const { mod } = setupReadyModule();
      let outcome: unknown = "pending";
      const p = mod.send("foo", {});
      p.then(
        (v) => (outcome = ["resolved", v]),
        (e) => (outcome = e),
      );

      // Flush the _sendFrame microtasks; should still be pending before timeout.
      await vi.advanceTimersByTimeAsync(0);
      expect(outcome).toBe("pending");

      // Default 30s timeout elapses.
      await vi.advanceTimersByTimeAsync(30_000);
      expect(outcome).toBeInstanceOf(Error);
      expect((outcome as Error).message).toMatch(/timeout|timed out/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not leak a pending request when a 'result' method only gets an ACK", async () => {
    vi.useFakeTimers();
    try {
      const { mod, socket } = setupReadyModule(); // foo: response "result", no timeout
      const internals = mod as unknown as { _pendingRequests: Map<number, unknown> };

      let outcome: unknown = "pending";
      const p = mod.send("foo", {});
      p.then(
        (v) => (outcome = ["resolved", v]),
        (e) => (outcome = e),
      );
      await vi.advanceTimersByTimeAsync(0);

      // Child sends ONLY an ACK; a "result" method ignores it and keeps waiting.
      const ackFrame = buildFrame(
        { methodId: 1, flags: Flags.IS_RESPONSE | Flags.IS_ACK, requestId: 1 },
        msgpackCodec.serialize({ ack: true }),
      );
      socket.emit("data", ackFrame);
      await vi.advanceTimersByTimeAsync(0);
      expect(internals._pendingRequests.size).toBe(1); // still pending after ACK

      // Without a default timeout this would leak forever. It now times out.
      await vi.advanceTimersByTimeAsync(30_000);
      expect(outcome).toBeInstanceOf(Error);
      expect(internals._pendingRequests.size).toBe(0); // cleaned up
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats timeout: 0 as disabling the timeout", async () => {
    vi.useFakeTimers();
    try {
      const mod = new Module("worker")
        .executable("node", ["index.js"])
        .method("foo", { response: "result", codec: msgpackCodec, timeout: 0 });
      mod._setState("ready");
      mod._attachSchema({ methods: { foo: { id: 1, response: "result" } }, events: {} });
      mod._attachDataChannel(createMockSocket());

      let outcome: unknown = "pending";
      const p = mod.send("foo", {});
      p.then(
        (v) => (outcome = ["resolved", v]),
        (e) => (outcome = e),
      );

      await vi.advanceTimersByTimeAsync(120_000);
      expect(outcome).toBe("pending"); // never times out

      mod._detach(); // cleanup rejects the pending send
      await Promise.resolve();
    } finally {
      vi.useRealTimers();
    }
  });

  it("honors a per-module default set via .requestTimeout()", async () => {
    vi.useFakeTimers();
    try {
      const mod = new Module("worker")
        .executable("node", ["index.js"])
        .method("foo", { response: "result", codec: msgpackCodec })
        .requestTimeout(50);
      mod._setState("ready");
      mod._attachSchema({ methods: { foo: { id: 1, response: "result" } }, events: {} });
      mod._attachDataChannel(createMockSocket());

      let outcome: unknown = "pending";
      const p = mod.send("foo", {});
      p.then(
        (v) => (outcome = ["resolved", v]),
        (e) => (outcome = e),
      );

      await vi.advanceTimersByTimeAsync(0);
      expect(outcome).toBe("pending");
      await vi.advanceTimersByTimeAsync(50);
      expect(outcome).toBeInstanceOf(Error);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bug D2: the stream() consumer queue was unbounded. If the child produces
// chunks faster than the consumer reads them, the queue grows without limit
// (OOM). Apply socket-level backpressure: pause the socket when the queue
// exceeds a high-water mark and resume it once the consumer drains it.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug D2: stream backpressure pauses/resumes the socket", () => {
  function setupStreamModule(): { mod: Module; socket: Socket & EventEmitter } {
    const mod = new Module("worker")
      .executable("node", ["index.js"])
      .method("st", { response: "stream", codec: msgpackCodec });
    mod._setState("ready");
    mod._attachSchema({ methods: { st: { id: 1, response: "stream" } }, events: {} });
    const socket = createMockSocket();
    mod._attachDataChannel(socket);
    return { mod, socket };
  }

  function streamChunkFrame(value: unknown): Buffer {
    return buildFrame(
      { methodId: 1, flags: Flags.IS_RESPONSE | Flags.IS_STREAM, requestId: 1 },
      msgpackCodec.serialize(value),
    );
  }

  it("pauses the socket when the consumer lags and resumes after draining", async () => {
    const { mod, socket } = setupStreamModule();
    const pauseMock = socket.pause as ReturnType<typeof vi.fn>;
    const resumeMock = socket.resume as ReturnType<typeof vi.fn>;

    const gen = mod.stream("st", {});
    // Kick off the generator; it parks after sending the request frame.
    const firstPull = gen.next();
    await vi.waitFor(() => expect(socket.write).toHaveBeenCalled());
    // Flush microtasks so the generator reaches its parked await.
    await Promise.resolve();
    await Promise.resolve();

    // Producer outpaces consumer: emit far more chunks than the high-water mark.
    // Only the first resolves the parked pull; the rest accumulate in the queue.
    for (let i = 0; i < 600; i++) {
      socket.emit("data", streamChunkFrame({ i }));
    }
    await Promise.resolve();

    // Fixed: the queue exceeded the high-water mark -> the socket was paused.
    expect(pauseMock).toHaveBeenCalled();

    // End the stream and fully drain it; the queue empties -> socket resumes.
    socket.emit(
      "data",
      buildFrame(
        {
          methodId: 1,
          flags: Flags.IS_RESPONSE | Flags.IS_STREAM | Flags.STREAM_END,
          requestId: 1,
        },
        Buffer.alloc(0),
      ),
    );
    await firstPull;
    let done = false;
    while (!done) {
      const r = await gen.next();
      done = Boolean(r.done);
    }

    expect(resumeMock).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bug C10: a crashed module schedules a restart after a delay. shutdown() sets
// isShuttingDown only for its own duration and resets it on return, so a
// restart timer that fires after shutdown completes would re-spawn ("resurrect")
// the module. Pending restarts must be cancelled on shutdown.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug C10: shutdown must cancel a pending crash-restart", () => {
  it("does not resurrect a module when shutdown races the restart delay", async () => {
    vi.useFakeTimers();
    try {
      const manager = new ModuleManager();
      manager.on("module:error", () => {}); // swallow crash/error events

      const mod = new Module("worker")
        .executable("node", ["x.js"])
        .method("foo", { codec: msgpackCodec })
        .spawnPolicy({ restartOnCrash: true });
      manager.register(mod);
      mod._setState("ready");

      const spawnSpy = vi
        .spyOn(manager as unknown as { spawnModule: (n: string) => Promise<void> }, "spawnModule")
        .mockResolvedValue(undefined);

      // Simulate a crash of a ready module -> schedules a restart after a delay.
      (
        manager as unknown as {
          handleProcessExit: (m: Module, c: number | null, s: string | null) => void;
        }
      ).handleProcessExit(mod, 1, null);

      // Shut down while the restart is still pending.
      const shutdownDone = manager.shutdown();

      // Advance well past the restart delay.
      await vi.advanceTimersByTimeAsync(5000);
      await shutdownDone;

      // Fixed: the pending restart was cancelled -> no re-spawn.
      // Buggy: the restart timer fired after shutdown -> spawnModule was called.
      expect(spawnSpy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bug M1: a remote error whose payload is an object collapsed to the useless
// string "[object Object]" because remoteError used String(errorData). The
// message must be derived sensibly (object.message, else JSON), and the
// original payload preserved on the error for programmatic access.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug M1: remote error must preserve a useful message", () => {
  function sendAndReject(errorPayload: unknown): Promise<unknown> {
    const { mod, socket } = setupReadyModule();
    let rejection: unknown = "pending";
    const p = mod.send("foo", {});
    p.then(
      () => (rejection = "resolved"),
      (e) => (rejection = e),
    );
    return new Promise((r) => setTimeout(r, 5)).then(() => {
      socket.emit(
        "data",
        buildFrame(
          { methodId: 1, flags: Flags.IS_RESPONSE | Flags.IS_ERROR, requestId: 1 },
          msgpackCodec.serialize(errorPayload),
        ),
      );
      return new Promise((r) => setTimeout(r, 5)).then(() => rejection);
    });
  }

  it("uses the object's message field instead of String(obj)", async () => {
    const rejection = await sendAndReject({ message: "boom", code: 42 });
    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toBe("boom");
    expect((rejection as { data?: unknown }).data).toEqual({ message: "boom", code: 42 });
  });

  it("falls back to JSON for an object without a message field", async () => {
    const rejection = await sendAndReject({ code: "E_OOPS" });
    expect((rejection as Error).message).not.toBe("[object Object]");
    expect((rejection as Error).message).toContain("E_OOPS");
  });

  it("still passes a plain string message through unchanged", async () => {
    const rejection = await sendAndReject("plain failure");
    expect((rejection as Error).message).toBe("plain failure");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Feature D1: control-plane heartbeat. When enabled, the parent pings the child
// and, if no pong arrives within the timeout, treats it as dead (kills it so
// the normal crash/restart path runs). Detects a hung-but-not-exited child.
// ═══════════════════════════════════════════════════════════════════════════
describe("Feature D1 (core): heartbeat detects an unresponsive child", () => {
  function setup(): {
    manager: ModuleManager;
    mod: Module;
    proc: {
      stdin: { writable: boolean; write: ReturnType<typeof vi.fn> };
      kill: ReturnType<typeof vi.fn>;
      killed: boolean;
    };
  } {
    const manager = new ModuleManager();
    manager.on("module:error", () => {}); // swallow heartbeat-timeout error
    const mod = new Module("worker")
      .executable("node", ["x.js"])
      .method("foo", { codec: msgpackCodec });
    manager.register(mod);
    const proc = { stdin: { writable: true, write: vi.fn() }, kill: vi.fn(), killed: false };
    mod._attachProcess(proc as never);
    mod._setState("ready");
    return { manager, mod, proc };
  }

  type HeartbeatApi = {
    startHeartbeat(m: Module, c: { intervalMs: number; timeoutMs: number }): void;
    handlePong(name: string): void;
  };

  it("kills the process after the timeout when no pong arrives", () => {
    vi.useFakeTimers();
    try {
      const { manager, mod, proc } = setup();
      (manager as unknown as HeartbeatApi).startHeartbeat(mod, {
        intervalMs: 1000,
        timeoutMs: 3000,
      });

      vi.advanceTimersByTime(3500);

      expect(proc.kill).toHaveBeenCalledWith("SIGKILL");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the process alive while pongs keep arriving", () => {
    vi.useFakeTimers();
    try {
      const { manager, mod, proc } = setup();
      const api = manager as unknown as HeartbeatApi;
      api.startHeartbeat(mod, { intervalMs: 1000, timeoutMs: 3000 });

      for (let i = 0; i < 6; i++) {
        vi.advanceTimersByTime(1000);
        api.handlePong("worker");
      }

      expect(proc.kill).not.toHaveBeenCalled();
      expect(proc.stdin.write).toHaveBeenCalled(); // pings were sent
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not kill a healthy child when timeoutMs <= intervalMs", () => {
    // Regression: the timeout must be measured from an actual ping, not from
    // startup. With timeoutMs <= intervalMs the old check fired on the first
    // interval tick (intervalMs since startup >= timeoutMs) and killed a
    // perfectly healthy child before it was ever pinged.
    vi.useFakeTimers();
    try {
      const { manager, mod, proc } = setup();
      const api = manager as unknown as HeartbeatApi;
      api.startHeartbeat(mod, { intervalMs: 10000, timeoutMs: 3000 }); // timeout < interval
      api.handlePong("worker"); // child answers the initial ping promptly

      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(10000); // interval tick -> next ping
        api.handlePong("worker"); // answered promptly each time
      }

      expect(proc.kill).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bug S1: a failed _sendFrame in send()/stream() must clean up the pending
// state it registered before the send.
//
// send() registers the pending request (with its timeout timer) BEFORE
// awaiting _sendFrame. When the send itself fails (codec.serialize throws, or
// the drain wait rejects because the socket closed under backpressure), the
// caller gets the send error - but the orphaned responsePromise is later
// rejected by the timeout timer / _detach with NO observer attached. That is
// an unhandled promise rejection, which kills the parent process by default,
// even when the caller correctly try/catches send().
// stream() has the same shape: the _pendingStreams entry and the abort
// listener leak when the initial send fails.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug S1: failed send must not orphan pending state", () => {
  const bombCodec = {
    name: "bomb",
    serialize: (): Buffer => {
      throw new Error("serialize boom");
    },
    deserialize: (data: Buffer): unknown => data,
  };

  function setupWithBomb(): { mod: Module; socket: Socket & EventEmitter } {
    const mod = new Module("worker")
      .executable("node", ["index.js"])
      .requestTimeout(50)
      .method("foo", { response: "result", codec: bombCodec })
      .method("bar", { response: "stream", codec: bombCodec, cancellable: true });

    mod._setState("ready");
    mod._attachSchema({
      methods: {
        foo: { id: 1, response: "result" },
        bar: { id: 2, response: "stream" },
      },
      events: {},
    });

    const socket = createMockSocket();
    mod._attachDataChannel(socket);
    return { mod, socket };
  }

  function pendingRequestsOf(mod: Module): Map<number, unknown> {
    return (mod as unknown as { _pendingRequests: Map<number, unknown> })._pendingRequests;
  }

  function pendingStreamsOf(mod: Module): Map<number, unknown> {
    return (mod as unknown as { _pendingStreams: Map<number, unknown> })._pendingStreams;
  }

  it("send(): serialize failure rejects, clears the pending entry, and leaves no unhandled rejection", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);

    try {
      const { mod } = setupWithBomb();

      await expect(mod.send("foo", { x: 1 })).rejects.toThrow("serialize boom");

      // The pending entry (and its timeout timer) must be gone immediately.
      expect(pendingRequestsOf(mod).size).toBe(0);

      // Wait past the 50ms request timeout: a leaked timer would reject the
      // orphaned responsePromise here and surface as an unhandled rejection.
      await new Promise((r) => setTimeout(r, 150));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("send(): drain-wait rejection (socket closed under backpressure) also cleans up", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);

    try {
      const mod = new Module("worker")
        .executable("node", ["index.js"])
        .requestTimeout(50)
        .method("foo", { response: "result", codec: msgpackCodec });

      mod._setState("ready");
      mod._attachSchema({
        methods: { foo: { id: 1, response: "result" } },
        events: {},
      });

      const socket = createMockSocket();
      (socket.write as ReturnType<typeof vi.fn>).mockReturnValue(false); // backpressure
      // A real socket whose write() returned false reports writableNeedDrain,
      // which is what makes waitForDrain() actually wait.
      (socket as unknown as { writableNeedDrain: boolean }).writableNeedDrain = true;
      mod._attachDataChannel(socket);

      // send() runs synchronously up to the drain wait (write happens first).
      const sendPromise = mod.send("foo", { x: 1 });

      // Closing the socket rejects the drain waiter -> _sendFrame rejects.
      socket.emit("close");

      await expect(sendPromise).rejects.toThrow(/closed/i);
      expect(pendingRequestsOf(mod).size).toBe(0);

      await new Promise((r) => setTimeout(r, 150));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("stream(): serialize failure cleans the stream entry and removes the abort listener", async () => {
    const { mod } = setupWithBomb();

    const controller = new AbortController();
    const removeSpy = vi.spyOn(controller.signal, "removeEventListener");

    const gen = mod.stream("bar", { x: 1 }, { signal: controller.signal });
    await expect(gen.next()).rejects.toThrow("serialize boom");

    expect(pendingStreamsOf(mod).size).toBe(0);
    expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));
  });
});
