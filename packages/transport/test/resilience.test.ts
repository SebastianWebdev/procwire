import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ResilientProcessHandle, DEFAULT_RESILIENT_OPTIONS } from "../src/resilience/index.js";
import { ReservedMethods } from "../src/protocol/reserved-methods.js";
import type { ProcessHandle, ProcessState } from "../src/process/types.js";
import type { Channel } from "../src/channel/types.js";
import type { Unsubscribe } from "../src/utils/disposables.js";

/**
 * Creates a mock channel for testing.
 */
function createMockChannel(): Channel & {
  requestCalls: Array<{ method: string; params: unknown; timeout?: number }>;
  notifyCalls: Array<{ method: string; params: unknown }>;
  notificationHandlers: Set<(notification: unknown) => void>;
  triggerNotification: (notification: unknown) => void;
} {
  const notificationHandlers = new Set<(notification: unknown) => void>();
  const requestCalls: Array<{ method: string; params: unknown; timeout?: number }> = [];
  const notifyCalls: Array<{ method: string; params: unknown }> = [];

  return {
    isConnected: true,
    requestCalls,
    notifyCalls,
    notificationHandlers,

    start: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),

    request: vi.fn().mockImplementation(async (method: string, params: unknown, timeout?: number) => {
      requestCalls.push({ method, params, ...(timeout !== undefined && { timeout }) });
      return {};
    }),

    notify: vi.fn().mockImplementation(async (method: string, params: unknown) => {
      notifyCalls.push({ method, params });
    }),

    onRequest: vi.fn().mockReturnValue(() => {}),

    onNotification: vi.fn().mockImplementation((handler: (notification: unknown) => void) => {
      notificationHandlers.add(handler);
      return () => {
        notificationHandlers.delete(handler);
      };
    }),

    on: vi.fn().mockReturnValue(() => {}),

    triggerNotification: (notification: unknown) => {
      for (const handler of notificationHandlers) {
        handler(notification);
      }
    },
  };
}

/**
 * Creates a mock ProcessHandle for testing.
 */
function createMockHandle(options: {
  id?: string;
  pid?: number | null;
  state?: ProcessState;
} = {}): ProcessHandle & {
  channel: ReturnType<typeof createMockChannel>;
  eventHandlers: Map<string, Set<(data: unknown) => void>>;
  emitEvent: (event: string, data: unknown) => void;
  setState: (state: ProcessState) => void;
} {
  const channel = createMockChannel();
  const eventHandlers = new Map<string, Set<(data: unknown) => void>>();
  let _state: ProcessState = options.state ?? "running";

  const mock = {
    id: options.id ?? "test-process",
    pid: options.pid ?? 12345,
    get state() {
      return _state;
    },
    controlChannel: channel,
    dataChannel: null,
    channel,
    eventHandlers,

    request: vi.fn().mockImplementation(async (method, params, timeout) => {
      return channel.request(method, params, timeout);
    }),

    notify: vi.fn().mockImplementation(async (method, params) => {
      return channel.notify(method, params);
    }),

    close: vi.fn().mockResolvedValue(undefined),

    on: vi.fn().mockImplementation((event: string, handler: (data: unknown) => void) => {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, new Set());
      }
      eventHandlers.get(event)!.add(handler);
      return () => {
        eventHandlers.get(event)?.delete(handler);
      };
    }) as ProcessHandle["on"],

    emitEvent: (event: string, data: unknown) => {
      const handlers = eventHandlers.get(event);
      if (handlers) {
        for (const handler of handlers) {
          handler(data);
        }
      }
    },

    setState: (state: ProcessState) => {
      _state = state;
    },
  };

  return mock as any;
}

describe("ResilientProcessHandle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("should wrap a ProcessHandle", () => {
      const handle = createMockHandle();
      const resilient = new ResilientProcessHandle(handle);

      expect(resilient.id).toBe("test-process");
      expect(resilient.pid).toBe(12345);
      expect(resilient.state).toBe("running");
      expect(resilient.handle).toBe(handle);
    });

    it("should accept custom options", () => {
      const handle = createMockHandle();
      const resilient = new ResilientProcessHandle(handle, {
        heartbeat: { interval: 10000 },
        reconnect: { maxAttempts: 10 },
        shutdown: { gracefulTimeoutMs: 10000 },
      });

      expect(resilient).toBeDefined();
    });

    it("should allow disabling features", () => {
      const handle = createMockHandle();
      const resilient = new ResilientProcessHandle(handle, {
        heartbeat: false,
        reconnect: false,
        shutdown: false,
      });

      expect(resilient).toBeDefined();
      // These should not throw when features are disabled
      resilient.start();
      resilient.stop();
    });
  });

  describe("delegation", () => {
    it("should delegate request to underlying handle", async () => {
      const handle = createMockHandle();
      const resilient = new ResilientProcessHandle(handle);

      await resilient.request("testMethod", { foo: "bar" }, 5000);

      expect(handle.request).toHaveBeenCalledWith("testMethod", { foo: "bar" }, 5000);
    });

    it("should delegate notify to underlying handle", async () => {
      const handle = createMockHandle();
      const resilient = new ResilientProcessHandle(handle);

      await resilient.notify("testNotify", { data: 123 });

      expect(handle.notify).toHaveBeenCalledWith("testNotify", { data: 123 });
    });

    it("should throw when accessing data channel that doesn't exist", async () => {
      const handle = createMockHandle();
      const resilient = new ResilientProcessHandle(handle);

      await expect(resilient.requestViaData("method")).rejects.toThrow(/Data channel not available/);
    });
  });

  describe("heartbeat integration", () => {
    it("should emit heartbeatMissed when pong not received", async () => {
      const handle = createMockHandle();
      const resilient = new ResilientProcessHandle(handle, {
        heartbeat: {
          interval: 100,
          timeout: 50,
          maxMissed: 3,
        },
        reconnect: false,
        shutdown: false,
      });

      const missedHandler = vi.fn();
      resilient.on("heartbeatMissed", missedHandler);

      resilient.start();

      // Wait for first interval + timeout
      await vi.advanceTimersByTimeAsync(150);

      expect(missedHandler).toHaveBeenCalledWith({ missedCount: 1 });

      resilient.stop();
    });

    it("should emit heartbeatDead after max misses", async () => {
      const handle = createMockHandle();
      const resilient = new ResilientProcessHandle(handle, {
        heartbeat: {
          interval: 100,
          timeout: 50,
          maxMissed: 2,
        },
        reconnect: false,
        shutdown: false,
      });

      const deadHandler = vi.fn();
      resilient.on("heartbeatDead", deadHandler);

      resilient.start();

      // Wait for 2 intervals + timeouts
      await vi.advanceTimersByTimeAsync(100); // First interval
      await vi.advanceTimersByTimeAsync(50);  // First timeout (miss 1)
      await vi.advanceTimersByTimeAsync(100); // Second interval
      await vi.advanceTimersByTimeAsync(50);  // Second timeout (miss 2 = dead)

      expect(deadHandler).toHaveBeenCalledWith({
        missedCount: 2,
        lastPongAt: null,
      });
      expect(resilient.isHealthy).toBe(false);

      resilient.stop();
    });

    it("should recover health on receiving pong", async () => {
      const handle = createMockHandle();
      const resilient = new ResilientProcessHandle(handle, {
        heartbeat: {
          interval: 5000, // Long interval to avoid overlap
          timeout: 1000,
          maxMissed: 3,
        },
        reconnect: false,
        shutdown: false,
      });

      const recoveredHandler = vi.fn();
      resilient.on("heartbeatRecovered", recoveredHandler);

      resilient.start();

      // Let first ping timeout (miss 1)
      await vi.advanceTimersByTimeAsync(1001);

      // Wait for next interval to send ping 2
      await vi.advanceTimersByTimeAsync(4000);

      // Simulate pong for seq=2 (the currently pending ping)
      handle.channel.triggerNotification({
        method: ReservedMethods.HEARTBEAT_PONG,
        params: { timestamp: Date.now(), seq: 2 },
      });

      // Process the notification
      await vi.advanceTimersByTimeAsync(0);

      expect(recoveredHandler).toHaveBeenCalled();
      expect(resilient.isHealthy).toBe(true);

      resilient.stop();
    });
  });

  describe("event forwarding", () => {
    it("should forward stateChange events from handle", () => {
      const handle = createMockHandle();
      const resilient = new ResilientProcessHandle(handle);

      const stateHandler = vi.fn();
      resilient.on("stateChange", stateHandler);

      handle.emitEvent("stateChange", { from: "running", to: "stopping" });

      expect(stateHandler).toHaveBeenCalledWith({ from: "running", to: "stopping" });
    });

    it("should forward exit events from handle", () => {
      const handle = createMockHandle();
      const resilient = new ResilientProcessHandle(handle);

      const exitHandler = vi.fn();
      resilient.on("exit", exitHandler);

      handle.emitEvent("exit", { code: 0, signal: null });

      expect(exitHandler).toHaveBeenCalledWith({ code: 0, signal: null });
    });

    it("should forward error events from handle", () => {
      const handle = createMockHandle();
      const resilient = new ResilientProcessHandle(handle);

      const errorHandler = vi.fn();
      resilient.on("error", errorHandler);

      const error = new Error("Test error");
      handle.emitEvent("error", error);

      expect(errorHandler).toHaveBeenCalledWith(error);
    });
  });

  describe("close", () => {
    it("should stop resilience features on close", async () => {
      const handle = createMockHandle();
      const resilient = new ResilientProcessHandle(handle, {
        heartbeat: { interval: 100 },
      });

      resilient.start();

      await resilient.close();

      // Heartbeat should be stopped - advancing time should not trigger events
      const missedHandler = vi.fn();
      resilient.on("heartbeatMissed", missedHandler);

      await vi.advanceTimersByTimeAsync(500);

      expect(missedHandler).not.toHaveBeenCalled();
    });

    it("should close underlying handle", async () => {
      const handle = createMockHandle();
      const resilient = new ResilientProcessHandle(handle);

      await resilient.close();

      expect(handle.close).toHaveBeenCalled();
    });
  });

  describe("isReconnecting", () => {
    it("should return false when reconnect is disabled", () => {
      const handle = createMockHandle();
      const resilient = new ResilientProcessHandle(handle, {
        reconnect: false,
      });

      expect(resilient.isReconnecting).toBe(false);
    });

    it("should return false when not reconnecting", () => {
      const handle = createMockHandle();
      const resilient = new ResilientProcessHandle(handle);

      expect(resilient.isReconnecting).toBe(false);
    });
  });
});
