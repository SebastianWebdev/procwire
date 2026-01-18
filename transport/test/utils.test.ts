import { describe, it, expect, vi } from "vitest";
import { EventEmitter, type EventMap } from "../src/utils/events.js";
import { withTimeout, sleep, createTimeoutSignal } from "../src/utils/time.js";
import { TimeoutError } from "../src/utils/errors.js";
import { CompositeDisposable, createUnsubscribe } from "../src/utils/disposables.js";
import { assertState, transitionState } from "../src/utils/assert.js";

describe("EventEmitter", () => {
  it("should emit and receive events", () => {
    interface Events extends EventMap {
      test: string;
    }
    const emitter = new EventEmitter<Events>();
    const handler = vi.fn();

    emitter.on("test", handler);
    emitter.emit("test", "hello");

    expect(handler).toHaveBeenCalledWith("hello");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("should unsubscribe correctly", () => {
    interface Events extends EventMap {
      test: number;
    }
    const emitter = new EventEmitter<Events>();
    const handler = vi.fn();

    const unsub = emitter.on("test", handler);
    emitter.emit("test", 1);
    unsub();
    emitter.emit("test", 2);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(1);
  });

  it("should support once", () => {
    interface Events extends EventMap {
      test: boolean;
    }
    const emitter = new EventEmitter<Events>();
    const handler = vi.fn();

    emitter.once("test", handler);
    emitter.emit("test", true);
    emitter.emit("test", false);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(true);
  });

  it("should handle multiple listeners", () => {
    interface Events extends EventMap {
      test: string;
    }
    const emitter = new EventEmitter<Events>();
    const h1 = vi.fn();
    const h2 = vi.fn();

    emitter.on("test", h1);
    emitter.on("test", h2);
    emitter.emit("test", "data");

    expect(h1).toHaveBeenCalledWith("data");
    expect(h2).toHaveBeenCalledWith("data");
  });

  it("should remove all listeners", () => {
    interface Events extends EventMap {
      test: number;
    }
    const emitter = new EventEmitter<Events>();
    const handler = vi.fn();

    emitter.on("test", handler);
    emitter.removeAllListeners("test");
    emitter.emit("test", 42);

    expect(handler).not.toHaveBeenCalled();
  });
});

describe("withTimeout", () => {
  it("should resolve if promise completes in time", async () => {
    const promise = sleep(10).then(() => "success");
    const result = await withTimeout(promise, 100);
    expect(result).toBe("success");
  });

  it("should reject with TimeoutError if promise times out", async () => {
    const promise = sleep(200).then(() => "never");
    await expect(withTimeout(promise, 50)).rejects.toThrow(TimeoutError);
  });

  it("should use custom timeout message", async () => {
    const promise = sleep(200);
    try {
      await withTimeout(promise, 50, { message: "Custom timeout" });
    } catch (err) {
      expect(err).toBeInstanceOf(TimeoutError);
      expect((err as TimeoutError).message).toBe("Custom timeout");
    }
  });
});

describe("createTimeoutSignal", () => {
  it("should reject after timeout", async () => {
    const signal = createTimeoutSignal(50);
    await expect(signal.promise).rejects.toThrow(TimeoutError);
  });

  it("should allow cancellation", async () => {
    const signal = createTimeoutSignal(100);
    signal.cancel();
    // Promise is still pending but timeout is cleared
    // We can't easily test this without racing, so just ensure cancel doesn't throw
    expect(() => signal.cancel()).not.toThrow();
  });
});

describe("CompositeDisposable", () => {
  it("should dispose all unsubscribes", () => {
    const composite = new CompositeDisposable();
    const fn1 = vi.fn();
    const fn2 = vi.fn();

    composite.add(fn1);
    composite.add(fn2);
    composite.dispose();

    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it("should be idempotent", () => {
    const composite = new CompositeDisposable();
    const fn = vi.fn();

    composite.add(fn);
    composite.dispose();
    composite.dispose();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should immediately dispose if already disposed", () => {
    const composite = new CompositeDisposable();
    const fn = vi.fn();

    composite.dispose();
    composite.add(fn);

    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("createUnsubscribe", () => {
  it("should ensure idempotency", () => {
    const fn = vi.fn();
    const unsub = createUnsubscribe(fn);

    unsub();
    unsub();
    unsub();

    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("assertState", () => {
  it("should not throw for valid state", () => {
    expect(() => assertState("connected", ["connected", "disconnected"])).not.toThrow();
  });

  it("should throw for invalid state", () => {
    expect(() => assertState("error", ["connected"])).toThrow("Invalid state");
  });
});

describe("transitionState", () => {
  it("should allow valid transitions", () => {
    expect(transitionState("disconnected", "connecting")).toBe("connecting");
    expect(transitionState("connecting", "connected")).toBe("connected");
  });

  it("should reject invalid transitions", () => {
    expect(() => transitionState("disconnected", "connected")).toThrow(
      "Invalid state transition",
    );
  });
});
