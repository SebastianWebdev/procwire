import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HeartbeatManager, DEFAULT_HEARTBEAT_OPTIONS } from "../src/heartbeat/index.js";
import { ReservedMethods } from "../src/protocol/reserved-methods.js";
import type { HeartbeatPongParams } from "../src/protocol/reserved-types.js";
import type { Channel } from "../src/channel/types.js";

/**
 * Creates a mock channel for testing.
 */
function createMockChannel(): Channel & {
  notifyCalls: Array<{ method: string; params: unknown }>;
  simulateNotifyError: boolean;
} {
  const mock = {
    notifyCalls: [] as Array<{ method: string; params: unknown }>,
    simulateNotifyError: false,
    isConnected: true,
    start: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    request: vi.fn().mockResolvedValue(undefined),
    notify: vi.fn().mockImplementation(async (method: string, params?: unknown) => {
      if (mock.simulateNotifyError) {
        throw new Error("Notify failed");
      }
      mock.notifyCalls.push({ method, params });
    }),
    onRequest: vi.fn().mockReturnValue(() => {}),
    onNotification: vi.fn().mockReturnValue(() => {}),
    on: vi.fn().mockReturnValue(() => {}),
  };
  return mock as unknown as Channel & typeof mock;
}

describe("HeartbeatManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("should use default options when none provided", () => {
      const channel = createMockChannel();
      const heartbeat = new HeartbeatManager(channel);

      expect(heartbeat.getOptions()).toEqual(DEFAULT_HEARTBEAT_OPTIONS);
    });

    it("should merge provided options with defaults", () => {
      const channel = createMockChannel();
      const heartbeat = new HeartbeatManager(channel, {
        interval: 10000,
        maxMissed: 5,
      });

      const options = heartbeat.getOptions();
      expect(options.interval).toBe(10000);
      expect(options.maxMissed).toBe(5);
      expect(options.timeout).toBe(DEFAULT_HEARTBEAT_OPTIONS.timeout);
      expect(options.enabled).toBe(DEFAULT_HEARTBEAT_OPTIONS.enabled);
    });
  });

  describe("ping/pong cycle", () => {
    it("should send ping immediately on start", () => {
      const channel = createMockChannel();
      const heartbeat = new HeartbeatManager(channel, { interval: 30000 });

      heartbeat.start();

      expect(channel.notifyCalls).toHaveLength(1);
      expect(channel.notifyCalls[0]!.method).toBe(ReservedMethods.HEARTBEAT_PING);
      expect(channel.notifyCalls[0]!.params).toHaveProperty("seq", 1);
      expect(channel.notifyCalls[0]!.params).toHaveProperty("timestamp");
    });

    it("should send ping at configured interval", () => {
      const channel = createMockChannel();
      const heartbeat = new HeartbeatManager(channel, { interval: 10000, timeout: 5000 });

      heartbeat.start();

      // First ping immediately
      expect(channel.notifyCalls).toHaveLength(1);

      // Handle first pong to clear pending state
      heartbeat.handlePong({ timestamp: Date.now(), seq: 1 });

      // Second ping after interval
      vi.advanceTimersByTime(10000);
      expect(channel.notifyCalls).toHaveLength(2);
      expect(channel.notifyCalls[1]!.params).toHaveProperty("seq", 2);

      // Handle second pong
      heartbeat.handlePong({ timestamp: Date.now(), seq: 2 });

      // Third ping after another interval
      vi.advanceTimersByTime(10000);
      expect(channel.notifyCalls).toHaveLength(3);
      expect(channel.notifyCalls[2]!.params).toHaveProperty("seq", 3);

      heartbeat.stop();
    });

    it("should emit pong event with correct latency", () => {
      const channel = createMockChannel();
      const heartbeat = new HeartbeatManager(channel, { timeout: 5000 });

      const pongHandler = vi.fn();
      heartbeat.on("heartbeat:pong", pongHandler);

      heartbeat.start();

      // Simulate some latency
      vi.advanceTimersByTime(100);

      // Handle pong
      const pongParams: HeartbeatPongParams = {
        timestamp: Date.now() - 100,
        seq: 1,
        load: { cpu_percent: 50, memory_mb: 256 },
      };
      heartbeat.handlePong(pongParams);

      expect(pongHandler).toHaveBeenCalledTimes(1);
      expect(pongHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          seq: 1,
          latencyMs: expect.any(Number),
          load: pongParams.load,
        }),
      );

      heartbeat.stop();
    });

    it("should reset missed counter on pong", () => {
      const channel = createMockChannel();
      const heartbeat = new HeartbeatManager(channel, { timeout: 1000, interval: 5000 });

      heartbeat.start();

      // Let first ping timeout to increment missed counter
      vi.advanceTimersByTime(1001);
      expect(heartbeat.getState().consecutiveMissed).toBe(1);

      // Now advance to next ping
      vi.advanceTimersByTime(4000);
      expect(channel.notifyCalls).toHaveLength(2);

      // Handle pong for second ping
      heartbeat.handlePong({ timestamp: Date.now(), seq: 2 });

      expect(heartbeat.getState().consecutiveMissed).toBe(0);

      heartbeat.stop();
    });

    it("should not send new ping while one is pending", () => {
      const channel = createMockChannel();
      const heartbeat = new HeartbeatManager(channel, { interval: 1000, timeout: 5000 });

      heartbeat.start();
      expect(channel.notifyCalls).toHaveLength(1);

      // Try to advance past interval - should not send another ping since first is pending
      vi.advanceTimersByTime(1000);
      expect(channel.notifyCalls).toHaveLength(1);

      // Handle pong to clear pending state
      heartbeat.handlePong({ timestamp: Date.now(), seq: 1 });

      // Now next interval tick should send
      vi.advanceTimersByTime(1000);
      expect(channel.notifyCalls).toHaveLength(2);

      heartbeat.stop();
    });
  });

  describe("missed detection", () => {
    it("should emit missed event on timeout", () => {
      const channel = createMockChannel();
      const heartbeat = new HeartbeatManager(channel, { timeout: 1000 });

      const missedHandler = vi.fn();
      heartbeat.on("heartbeat:missed", missedHandler);

      heartbeat.start();
      vi.advanceTimersByTime(1001);

      expect(missedHandler).toHaveBeenCalledTimes(1);
      expect(missedHandler).toHaveBeenCalledWith({
        seq: 1,
        missedCount: 1,
      });

      heartbeat.stop();
    });

    it("should increment missedCount counter on each miss", () => {
      const channel = createMockChannel();
      // Use longer interval than timeout to avoid interval firing during timeout
      const heartbeat = new HeartbeatManager(channel, {
        timeout: 1000,
        interval: 5000,
        maxMissed: 10,
      });

      const missedHandler = vi.fn();
      heartbeat.on("heartbeat:missed", missedHandler);

      heartbeat.start();

      // First timeout (ping 1 sent immediately)
      vi.advanceTimersByTime(1001);
      expect(missedHandler).toHaveBeenCalledWith({ seq: 1, missedCount: 1 });

      // Wait for second ping (interval fires at 5000ms, timeout at 6000ms)
      vi.advanceTimersByTime(4000); // At 5001ms - interval fires, ping 2 sent
      vi.advanceTimersByTime(1001); // At 6002ms - ping 2 times out
      expect(missedHandler).toHaveBeenLastCalledWith({ seq: 2, missedCount: 2 });

      // Wait for third ping
      vi.advanceTimersByTime(4000); // At 10001ms - interval fires, ping 3 sent
      vi.advanceTimersByTime(1001); // At 11002ms - ping 3 times out
      expect(missedHandler).toHaveBeenLastCalledWith({ seq: 3, missedCount: 3 });

      heartbeat.stop();
    });

    it("should emit dead event when maxMissed reached", () => {
      const channel = createMockChannel();
      const heartbeat = new HeartbeatManager(channel, {
        timeout: 1000,
        interval: 2000,
        maxMissed: 2,
      });

      const deadHandler = vi.fn();
      heartbeat.on("heartbeat:dead", deadHandler);

      heartbeat.start();

      // First miss
      vi.advanceTimersByTime(1001);
      expect(deadHandler).not.toHaveBeenCalled();

      // Second miss - should trigger dead
      vi.advanceTimersByTime(2000);
      vi.advanceTimersByTime(1001);
      expect(deadHandler).toHaveBeenCalledTimes(1);
      expect(deadHandler).toHaveBeenCalledWith({
        missedCount: 2,
        lastPongAt: null,
      });

      heartbeat.stop();
    });

    it("should not emit dead event before maxMissed", () => {
      const channel = createMockChannel();
      // Use longer interval than timeout to avoid overlap
      const heartbeat = new HeartbeatManager(channel, {
        timeout: 1000,
        interval: 5000,
        maxMissed: 3,
      });

      const deadHandler = vi.fn();
      heartbeat.on("heartbeat:dead", deadHandler);

      heartbeat.start();

      // First miss (ping 1 sent immediately, times out at 1001ms)
      vi.advanceTimersByTime(1001);
      expect(deadHandler).not.toHaveBeenCalled();

      // Second miss (interval fires at 5000ms, ping 2 times out at 6001ms)
      vi.advanceTimersByTime(4000); // At 5001ms
      vi.advanceTimersByTime(1001); // At 6002ms
      expect(deadHandler).not.toHaveBeenCalled();

      // Third miss - should trigger dead (interval fires at 10000ms, times out at 11001ms)
      vi.advanceTimersByTime(4000); // At 10002ms
      vi.advanceTimersByTime(1001); // At 11003ms
      expect(deadHandler).toHaveBeenCalledTimes(1);

      heartbeat.stop();
    });
  });

  describe("implicit heartbeat", () => {
    it("should reset missed counter on onActivity()", () => {
      const channel = createMockChannel();
      const heartbeat = new HeartbeatManager(channel, {
        timeout: 1000,
        interval: 2000,
        implicitHeartbeat: true,
      });

      heartbeat.start();

      // Let first ping timeout
      vi.advanceTimersByTime(1001);
      expect(heartbeat.getState().consecutiveMissed).toBe(1);

      // Simulate activity
      heartbeat.onActivity();
      expect(heartbeat.getState().consecutiveMissed).toBe(0);

      heartbeat.stop();
    });

    it("should not reset if implicitHeartbeat is disabled", () => {
      const channel = createMockChannel();
      const heartbeat = new HeartbeatManager(channel, {
        timeout: 1000,
        interval: 2000,
        implicitHeartbeat: false,
      });

      heartbeat.start();

      // Let first ping timeout
      vi.advanceTimersByTime(1001);
      expect(heartbeat.getState().consecutiveMissed).toBe(1);

      // Simulate activity - should NOT reset
      heartbeat.onActivity();
      expect(heartbeat.getState().consecutiveMissed).toBe(1);

      heartbeat.stop();
    });
  });

  describe("lifecycle", () => {
    it("should not send pings when disabled", () => {
      const channel = createMockChannel();
      const heartbeat = new HeartbeatManager(channel, { enabled: false });

      heartbeat.start();

      expect(channel.notifyCalls).toHaveLength(0);
      expect(heartbeat.isRunning()).toBe(false);
    });

    it("should clear timers on stop", () => {
      const channel = createMockChannel();
      const heartbeat = new HeartbeatManager(channel, { interval: 1000, timeout: 500 });

      heartbeat.start();
      heartbeat.handlePong({ timestamp: Date.now(), seq: 1 });

      heartbeat.stop();

      // Advance time - no more pings should be sent
      const callsBefore = channel.notifyCalls.length;
      vi.advanceTimersByTime(5000);
      expect(channel.notifyCalls.length).toBe(callsBefore);
    });

    it("should handle rapid start/stop", () => {
      const channel = createMockChannel();
      const heartbeat = new HeartbeatManager(channel, { interval: 1000 });

      heartbeat.start();
      heartbeat.stop();
      heartbeat.start();
      heartbeat.stop();
      heartbeat.start();

      expect(heartbeat.isRunning()).toBe(true);
      expect(channel.notifyCalls).toHaveLength(3);

      heartbeat.stop();
    });

    it("should be idempotent (multiple start/stop calls)", () => {
      const channel = createMockChannel();
      const heartbeat = new HeartbeatManager(channel);

      const startHandler = vi.fn();
      const stopHandler = vi.fn();
      heartbeat.on("heartbeat:start", startHandler);
      heartbeat.on("heartbeat:stop", stopHandler);

      heartbeat.start();
      heartbeat.start(); // Should be no-op
      heartbeat.start(); // Should be no-op

      expect(startHandler).toHaveBeenCalledTimes(1);

      heartbeat.stop();
      heartbeat.stop(); // Should be no-op
      heartbeat.stop(); // Should be no-op

      expect(stopHandler).toHaveBeenCalledTimes(1);
    });

    it("should emit start and stop events", () => {
      const channel = createMockChannel();
      const heartbeat = new HeartbeatManager(channel);

      const startHandler = vi.fn();
      const stopHandler = vi.fn();
      heartbeat.on("heartbeat:start", startHandler);
      heartbeat.on("heartbeat:stop", stopHandler);

      heartbeat.start();
      expect(startHandler).toHaveBeenCalledTimes(1);

      heartbeat.stop();
      expect(stopHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe("error handling", () => {
    it("should treat send failure as missed", async () => {
      const channel = createMockChannel();
      channel.simulateNotifyError = true;

      const heartbeat = new HeartbeatManager(channel, { timeout: 1000, interval: 30000 });

      const missedHandler = vi.fn();
      heartbeat.on("heartbeat:missed", missedHandler);

      heartbeat.start();

      // Allow the async notify to reject - use flushPromises instead of runAllTimersAsync
      await vi.advanceTimersByTimeAsync(0);

      expect(missedHandler).toHaveBeenCalledTimes(1);

      heartbeat.stop();
    });

    it("should ignore pong with wrong seq", () => {
      const channel = createMockChannel();
      const heartbeat = new HeartbeatManager(channel, { timeout: 5000 });

      const pongHandler = vi.fn();
      heartbeat.on("heartbeat:pong", pongHandler);

      heartbeat.start();

      // Send pong with wrong seq
      heartbeat.handlePong({ timestamp: Date.now(), seq: 999 });

      expect(pongHandler).not.toHaveBeenCalled();
      expect(heartbeat.getState().pendingPing).not.toBeNull();

      heartbeat.stop();
    });

    it("should ignore pong when no ping pending", () => {
      const channel = createMockChannel();
      const heartbeat = new HeartbeatManager(channel, { timeout: 5000 });

      const pongHandler = vi.fn();
      heartbeat.on("heartbeat:pong", pongHandler);

      // Don't start - no ping is pending
      heartbeat.handlePong({ timestamp: Date.now(), seq: 1 });

      expect(pongHandler).not.toHaveBeenCalled();
    });
  });

  describe("state management", () => {
    it("should track lastPongAt correctly", () => {
      const channel = createMockChannel();
      const heartbeat = new HeartbeatManager(channel, { timeout: 5000 });

      expect(heartbeat.getState().lastPongAt).toBeNull();

      heartbeat.start();

      vi.advanceTimersByTime(100);
      heartbeat.handlePong({ timestamp: Date.now(), seq: 1 });

      expect(heartbeat.getState().lastPongAt).not.toBeNull();

      heartbeat.stop();
    });

    it("should reset state correctly", () => {
      const channel = createMockChannel();
      const heartbeat = new HeartbeatManager(channel, { timeout: 1000, interval: 2000 });

      heartbeat.start();
      vi.advanceTimersByTime(1001);
      expect(heartbeat.getState().consecutiveMissed).toBe(1);

      heartbeat.reset();

      expect(heartbeat.getState()).toEqual({
        seq: 0,
        lastPongAt: null,
        consecutiveMissed: 0,
        isRunning: false,
        pendingPing: null,
      });
    });

    it("should return readonly state copy", () => {
      const channel = createMockChannel();
      const heartbeat = new HeartbeatManager(channel);

      const state1 = heartbeat.getState();
      const state2 = heartbeat.getState();

      // Should be equal but not the same reference
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });
  });
});
