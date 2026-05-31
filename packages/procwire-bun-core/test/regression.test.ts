/**
 * Regression tests for production-readiness bug fixes (bun-core).
 *
 * Each `describe` targets ONE bug: written to FAIL against the buggy code and
 * PASS once the fix is applied. These mirror the @procwire/core fixes.
 */
import { describe, it, expect, spyOn, jest } from "bun:test";
import { Module, ModuleErrors, ModuleManager } from "../src/index.js";

interface ModuleInternals {
  _onSocketError(err: Error): void;
  _nextRequestId: number;
  _allocateRequestId(): number;
}

const mockSocket = (): never => ({ write: () => true, end: () => {} }) as never;

function readyModule(): Module {
  const mod = new Module("worker").executable("bun", ["w.ts"]).method("foo");
  mod._setState("ready");
  mod._attachSchema({ methods: { foo: { id: 1, response: "result" } }, events: {} });
  mod._attachDataChannel(mockSocket());
  return mod;
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

// ═══════════════════════════════════════════════════════════════════════════
// Bug C5 (bun-core): _onSocketError forwarded socket errors via emit("error").
// Node's EventEmitter throws synchronously when "error" is emitted with no
// listener, so an unobserved socket error would crash the whole parent process.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug C5 (bun-core): unobserved socket error must not crash the process", () => {
  it("does not throw when a socket error fires with no 'error' listener", () => {
    const mod = new Module("worker").executable("bun", ["w.ts"]).method("foo");

    expect(() =>
      (mod as unknown as ModuleInternals)._onSocketError(new Error("ECONNRESET")),
    ).not.toThrow();
  });

  it("still forwards the error to a registered 'error' listener", () => {
    const mod = new Module("worker").executable("bun", ["w.ts"]).method("foo");

    let caught: Error | undefined;
    mod.on("error", (err: Error) => {
      caught = err;
    });

    const err = new Error("EPIPE");
    expect(() => (mod as unknown as ModuleInternals)._onSocketError(err)).not.toThrow();
    expect(caught).toBe(err);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bug C6 (bun-core): requestId is a uint32 on the wire but _nextRequestId++
// never wrapped. After 2^32 requests the encoder would overflow and every send
// would break. The id must wrap within the uint32 range and skip 0 (reserved).
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug C6 (bun-core): requestId must wrap at the uint32 boundary", () => {
  it("wraps to a non-zero id instead of overflowing past uint32", () => {
    const mod = new Module("worker").executable("bun", ["w.ts"]).method("foo");
    const internals = mod as unknown as ModuleInternals;

    internals._nextRequestId = 0xffffffff;
    expect(internals._allocateRequestId()).toBe(0xffffffff); // last valid uint32
    expect(internals._allocateRequestId()).toBe(1); // wrapped, skipping reserved 0
    expect(internals._allocateRequestId()).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bug M1 (bun-core): remoteError used String(errorData), so an object error
// payload collapsed to "[object Object]". Derive a useful message and preserve
// the original payload on the error.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug M1 (bun-core): remote error must preserve a useful message", () => {
  it("uses the object's message field instead of String(obj)", () => {
    const err = ModuleErrors.remoteError({ message: "boom", code: 42 });
    expect(err.message).toBe("boom");
    expect((err as { data?: unknown }).data).toEqual({ message: "boom", code: 42 });
  });

  it("falls back to JSON for an object without a message field", () => {
    const err = ModuleErrors.remoteError({ code: "E_OOPS" });
    expect(err.message).not.toBe("[object Object]");
    expect(err.message).toContain("E_OOPS");
  });

  it("passes a plain string message through unchanged", () => {
    expect(ModuleErrors.remoteError("plain failure").message).toBe("plain failure");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bug C7 (bun-core): the AbortSignal "abort" listener was added with
// { once: true } but only removed if the signal actually fired. When a request
// settles normally the listener stayed attached, so a reused long-lived signal
// accumulated listeners (leak + MaxListenersExceededWarning).
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug C7 (bun-core): abort listener must be removed when a request settles", () => {
  it("removes the abort listener from the signal when the request is cleaned up", () => {
    const mod = new Module("worker")
      .executable("bun", ["w.ts"])
      .method("foo", { cancellable: true });
    mod._setState("ready");
    mod._attachSchema({ methods: { foo: { id: 1, response: "result" } }, events: {} });
    mod._attachDataChannel({ write: () => true, end: () => {} } as never);

    const controller = new AbortController();
    const removeSpy = spyOn(controller.signal, "removeEventListener");

    const p = mod.send("foo", {}, { signal: controller.signal });
    void p.catch(() => {});

    // The pending request stores an abortCleanup; cleaning it up (as a normal
    // response would) must remove the abort listener from the signal.
    (mod as unknown as { _cleanupRequest(id: number): void })._cleanupRequest(1);

    expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bug C2 (bun-core): send() to a method with no configured timeout waited
// forever. A default request timeout bounds it; it is overridable per-module
// via .requestTimeout(), and a value of 0 disables it.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug C2 (bun-core): a default request timeout bounds hanging requests", () => {
  it("rejects with a timeout when the method has no explicit timeout", async () => {
    jest.useFakeTimers();
    try {
      const mod = readyModule();
      let outcome: unknown = "pending";
      void mod.send("foo", {}).then(
        (v) => (outcome = ["resolved", v]),
        (e) => (outcome = e),
      );

      jest.advanceTimersByTime(0);
      await flush();
      expect(outcome).toBe("pending"); // not settled before the timeout

      jest.advanceTimersByTime(30_000);
      await flush();
      expect(outcome).toBeInstanceOf(Error);
      expect((outcome as Error).message).toMatch(/timeout/i);
    } finally {
      jest.useRealTimers();
    }
  });

  it("treats requestTimeout(0) as disabling the default", async () => {
    jest.useFakeTimers();
    try {
      const mod = new Module("worker").executable("bun", ["w.ts"]).method("foo").requestTimeout(0);
      mod._setState("ready");
      mod._attachSchema({ methods: { foo: { id: 1, response: "result" } }, events: {} });
      mod._attachDataChannel(mockSocket());

      let outcome: unknown = "pending";
      void mod.send("foo", {}).then(
        () => (outcome = "resolved"),
        (e) => (outcome = e),
      );

      jest.advanceTimersByTime(120_000);
      await flush();
      expect(outcome).toBe("pending"); // never times out
    } finally {
      jest.useRealTimers();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bug C10 (bun-core): a crashed module schedules a restart after a delay.
// shutdown() resets isShuttingDown on return and restart timers were untracked,
// so a restart firing after shutdown completed would resurrect the module.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug C10 (bun-core): shutdown must cancel a pending crash-restart", () => {
  it("does not resurrect a module when shutdown races the restart delay", async () => {
    jest.useFakeTimers();
    try {
      const manager = new ModuleManager();
      manager.on("module:error", () => {}); // swallow crash/error events

      const mod = new Module("worker")
        .executable("bun", ["x.ts"])
        .method("foo")
        .spawnPolicy({ restartOnCrash: true });
      manager.register(mod);
      mod._setState("ready");

      const spawnSpy = spyOn(
        manager as unknown as { spawnModule: (n: string) => Promise<void> },
        "spawnModule",
      ).mockImplementation(() => Promise.resolve());

      // Simulate a crash of a ready module -> schedules a restart after a delay.
      (
        manager as unknown as {
          handleProcessExit: (m: Module, c: number | null, s: string | null) => void;
        }
      ).handleProcessExit(mod, 1, null);

      // Shut down while the restart is still pending.
      const shutdownDone = manager.shutdown();
      jest.advanceTimersByTime(5000);
      await shutdownDone;
      await flush();

      // Fixed: the pending restart was cancelled -> no re-spawn.
      expect(spawnSpy).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
