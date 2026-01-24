import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ReconnectManager, DEFAULT_RECONNECT_OPTIONS } from "../src/reconnect/index.js";
import type { Reconnectable } from "../src/reconnect/types.js";

/**
 * Creates a mock reconnectable target for testing.
 */
function createMockTarget(): Reconnectable & {
  connectCalls: number;
  simulateFailure: boolean;
  failuresRemaining: number;
} {
  const mock = {
    connectCalls: 0,
    simulateFailure: false,
    failuresRemaining: 0,
    connect: vi.fn().mockImplementation(async () => {
      mock.connectCalls++;
      if (mock.simulateFailure || mock.failuresRemaining > 0) {
        if (mock.failuresRemaining > 0) {
          mock.failuresRemaining--;
        }
        throw new Error("Connection failed");
      }
    }),
  };
  return mock;
}

describe("ReconnectManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("should use default options when none provided", () => {
      const target = createMockTarget();
      const reconnect = new ReconnectManager(target);

      expect(reconnect.getOptions()).toEqual(DEFAULT_RECONNECT_OPTIONS);
    });

    it("should merge provided options with defaults", () => {
      const target = createMockTarget();
      const reconnect = new ReconnectManager(target, {
        initialDelay: 200,
        maxAttempts: 5,
      });

      const options = reconnect.getOptions();
      expect(options.initialDelay).toBe(200);
      expect(options.maxAttempts).toBe(5);
      expect(options.maxDelay).toBe(DEFAULT_RECONNECT_OPTIONS.maxDelay);
      expect(options.multiplier).toBe(DEFAULT_RECONNECT_OPTIONS.multiplier);
    });
  });

  describe("backoff calculation", () => {
    it("should use exponential backoff formula", async () => {
      const target = createMockTarget();
      target.simulateFailure = true;

      const reconnect = new ReconnectManager(target, {
        initialDelay: 100,
        multiplier: 2,
        maxDelay: 10000,
        maxAttempts: 3,
        jitter: 0, // Disable jitter for predictable testing
      });

      const attemptingHandler = vi.fn();
      reconnect.on("reconnect:attempting", attemptingHandler);

      const disconnectPromise = reconnect.handleDisconnect(new Error("test"));

      // First attempt: delay = 100 * 2^0 = 100ms
      await vi.advanceTimersByTimeAsync(100);
      expect(attemptingHandler).toHaveBeenNthCalledWith(1, expect.objectContaining({ delay: 100 }));

      // Second attempt: delay = 100 * 2^1 = 200ms
      await vi.advanceTimersByTimeAsync(200);
      expect(attemptingHandler).toHaveBeenNthCalledWith(2, expect.objectContaining({ delay: 200 }));

      // Third attempt: delay = 100 * 2^2 = 400ms
      await vi.advanceTimersByTimeAsync(400);
      expect(attemptingHandler).toHaveBeenNthCalledWith(3, expect.objectContaining({ delay: 400 }));

      await disconnectPromise;
    });

    it("should cap delay at maxDelay", async () => {
      const target = createMockTarget();
      target.simulateFailure = true;

      const reconnect = new ReconnectManager(target, {
        initialDelay: 1000,
        multiplier: 10,
        maxDelay: 5000,
        maxAttempts: 3,
        jitter: 0,
      });

      const attemptingHandler = vi.fn();
      reconnect.on("reconnect:attempting", attemptingHandler);

      const disconnectPromise = reconnect.handleDisconnect(new Error("test"));

      // First attempt: min(1000 * 10^0, 5000) = 1000ms
      await vi.advanceTimersByTimeAsync(1000);
      expect(attemptingHandler).toHaveBeenNthCalledWith(1, expect.objectContaining({ delay: 1000 }));

      // Second attempt: min(1000 * 10^1, 5000) = 5000ms (capped)
      await vi.advanceTimersByTimeAsync(5000);
      expect(attemptingHandler).toHaveBeenNthCalledWith(2, expect.objectContaining({ delay: 5000 }));

      // Third attempt: min(1000 * 10^2, 5000) = 5000ms (capped)
      await vi.advanceTimersByTimeAsync(5000);
      expect(attemptingHandler).toHaveBeenNthCalledWith(3, expect.objectContaining({ delay: 5000 }));

      await disconnectPromise;
    });

    it("should add jitter within configured range", async () => {
      const target = createMockTarget();
      target.simulateFailure = true;

      // Run multiple trials to verify jitter produces different values
      const delays: number[] = [];

      for (let i = 0; i < 10; i++) {
        const reconnect = new ReconnectManager(target, {
          initialDelay: 1000,
          multiplier: 2,
          maxDelay: 10000,
          maxAttempts: 1,
          jitter: 0.2, // 20% jitter
        });

        reconnect.on("reconnect:attempting", ({ delay }) => {
          delays.push(delay);
        });

        const promise = reconnect.handleDisconnect(new Error("test"));
        await vi.advanceTimersByTimeAsync(2000);
        await promise;
      }

      // All delays should be within 20% of 1000 (800-1200)
      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(800);
        expect(delay).toBeLessThanOrEqual(1200);
      }

      // Should have some variation (not all the same)
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });

  describe("reconnection attempts", () => {
    it("should retry up to maxAttempts", async () => {
      const target = createMockTarget();
      target.simulateFailure = true;

      const reconnect = new ReconnectManager(target, {
        initialDelay: 100,
        maxAttempts: 5,
        jitter: 0,
      });

      const failedHandler = vi.fn();
      reconnect.on("reconnect:failed", failedHandler);

      const promise = reconnect.handleDisconnect(new Error("test"));

      // Advance through all 5 attempts
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(100 * Math.pow(2, i));
      }

      const result = await promise;

      expect(result).toBe(false);
      expect(target.connectCalls).toBe(5);
      expect(failedHandler).toHaveBeenCalledTimes(1);
      expect(failedHandler).toHaveBeenCalledWith({
        attempts: 5,
        lastError: expect.any(Error),
      });
    });

    it("should emit attempting event with correct delay", async () => {
      const target = createMockTarget();
      target.failuresRemaining = 2;

      const reconnect = new ReconnectManager(target, {
        initialDelay: 100,
        jitter: 0,
      });

      const attemptingHandler = vi.fn();
      reconnect.on("reconnect:attempting", attemptingHandler);

      const promise = reconnect.handleDisconnect(new Error("original error"));

      // Advance through attempts
      await vi.advanceTimersByTimeAsync(100); // First attempt
      await vi.advanceTimersByTimeAsync(200); // Second attempt
      await vi.advanceTimersByTimeAsync(400); // Third attempt (succeeds)

      await promise;

      expect(attemptingHandler).toHaveBeenCalledTimes(3);
      expect(attemptingHandler).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          attempt: 1,
          delay: 100,
        }),
      );
    });

    it("should emit success event on successful connect", async () => {
      const target = createMockTarget();
      target.failuresRemaining = 1;

      const reconnect = new ReconnectManager(target, {
        initialDelay: 100,
        jitter: 0,
      });

      const successHandler = vi.fn();
      reconnect.on("reconnect:success", successHandler);

      const promise = reconnect.handleDisconnect(new Error("test"));

      // First attempt fails
      await vi.advanceTimersByTimeAsync(100);
      // Second attempt succeeds
      await vi.advanceTimersByTimeAsync(200);

      const result = await promise;

      expect(result).toBe(true);
      expect(successHandler).toHaveBeenCalledTimes(1);
      expect(successHandler).toHaveBeenCalledWith({
        attempt: 2,
        totalTimeMs: expect.any(Number),
      });
    });

    it("should emit failed event when max attempts exceeded", async () => {
      const target = createMockTarget();
      target.simulateFailure = true;

      const reconnect = new ReconnectManager(target, {
        initialDelay: 100,
        maxAttempts: 2,
        jitter: 0,
      });

      const failedHandler = vi.fn();
      reconnect.on("reconnect:failed", failedHandler);

      const promise = reconnect.handleDisconnect(new Error("test"));

      await vi.advanceTimersByTimeAsync(100); // First attempt
      await vi.advanceTimersByTimeAsync(200); // Second attempt

      await promise;

      expect(failedHandler).toHaveBeenCalledTimes(1);
      expect(failedHandler).toHaveBeenCalledWith({
        attempts: 2,
        lastError: expect.any(Error),
      });
    });

    it("should not start if already reconnecting", async () => {
      const target = createMockTarget();
      target.simulateFailure = true;

      const reconnect = new ReconnectManager(target, {
        initialDelay: 100,
        maxAttempts: 10,
        jitter: 0,
      });

      // Start first reconnection
      const promise1 = reconnect.handleDisconnect(new Error("test1"));

      // Try to start second while first is in progress
      const result2 = await reconnect.handleDisconnect(new Error("test2"));

      expect(result2).toBe(false);

      // Clean up
      reconnect.cancel();
      await vi.advanceTimersByTimeAsync(10000);
      await promise1;
    });

    it("should not start if disabled", async () => {
      const target = createMockTarget();

      const reconnect = new ReconnectManager(target, { enabled: false });

      const result = await reconnect.handleDisconnect(new Error("test"));

      expect(result).toBe(false);
      expect(target.connectCalls).toBe(0);
    });
  });

  describe("request queueing", () => {
    it("should queue requests during reconnection", async () => {
      const target = createMockTarget();
      target.failuresRemaining = 1;

      const reconnect = new ReconnectManager(target, {
        initialDelay: 100,
        jitter: 0,
        queueRequests: true,
      });

      const queuedHandler = vi.fn();
      reconnect.on("reconnect:request-queued", queuedHandler);

      // Start reconnection
      const disconnectPromise = reconnect.handleDisconnect(new Error("test"));

      // Queue a request
      const requestPromise = reconnect.queueRequest("testMethod", async () => "result");

      expect(queuedHandler).toHaveBeenCalledWith({
        method: "testMethod",
        queueSize: 1,
      });

      // Complete reconnection
      await vi.advanceTimersByTimeAsync(100); // First attempt fails
      await vi.advanceTimersByTimeAsync(200); // Second attempt succeeds

      await disconnectPromise;

      // Request should resolve
      const result = await requestPromise;
      expect(result).toBe("result");
    });

    it("should execute queued requests after reconnect", async () => {
      const target = createMockTarget();
      target.failuresRemaining = 1;

      const reconnect = new ReconnectManager(target, {
        initialDelay: 100,
        jitter: 0,
      });

      const disconnectPromise = reconnect.handleDisconnect(new Error("test"));

      // Queue multiple requests
      const results: string[] = [];
      const promise1 = reconnect.queueRequest("method1", async () => "result1");
      const promise2 = reconnect.queueRequest("method2", async () => "result2");

      // Complete reconnection
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(200);

      await disconnectPromise;

      results.push(await promise1!);
      results.push(await promise2!);

      expect(results).toEqual(["result1", "result2"]);
    });

    it("should reject queue on reconnect failure", async () => {
      const target = createMockTarget();
      target.simulateFailure = true;

      const reconnect = new ReconnectManager(target, {
        initialDelay: 100,
        maxAttempts: 1,
        jitter: 0,
      });

      const disconnectPromise = reconnect.handleDisconnect(new Error("test"));

      // Queue a request - add catch handler immediately to prevent unhandled rejection warning
      const requestPromise = reconnect.queueRequest("testMethod", async () => "result");
      requestPromise!.catch(() => {}); // Prevent unhandled rejection

      // Let reconnection fail
      await vi.advanceTimersByTimeAsync(100);

      await disconnectPromise;

      // Request should be rejected
      await expect(requestPromise).rejects.toThrow();
    });

    it("should timeout individual queued requests", async () => {
      const target = createMockTarget();
      target.simulateFailure = true;

      const reconnect = new ReconnectManager(target, {
        initialDelay: 100,
        maxAttempts: 3,
        jitter: 0,
        queueTimeout: 50, // Short timeout for testing
      });

      const timeoutHandler = vi.fn();
      reconnect.on("reconnect:request-timeout", timeoutHandler);

      const disconnectPromise = reconnect.handleDisconnect(new Error("test"));

      // Queue a request - add catch handler immediately to prevent unhandled rejection warning
      const requestPromise = reconnect.queueRequest("testMethod", async () => "result");
      requestPromise!.catch(() => {}); // Prevent unhandled rejection

      // Advance past queue timeout (but still within first attempt)
      await vi.advanceTimersByTimeAsync(51);

      expect(timeoutHandler).toHaveBeenCalledWith({
        method: "testMethod",
        waitedMs: expect.any(Number),
      });

      await expect(requestPromise).rejects.toThrow(/timed out/);

      // Let the reconnection complete (3 attempts: 100, 200, 400)
      await vi.advanceTimersByTimeAsync(700);
      await disconnectPromise;
    });

    it("should respect maxQueueSize limit", async () => {
      const target = createMockTarget();
      target.simulateFailure = true;

      const reconnect = new ReconnectManager(target, {
        initialDelay: 100,
        maxAttempts: 2,
        maxQueueSize: 2,
        jitter: 0,
      });

      const disconnectPromise = reconnect.handleDisconnect(new Error("test"));

      // Queue up to limit
      const p1 = reconnect.queueRequest("method1", async () => {});
      const p2 = reconnect.queueRequest("method2", async () => {});

      // Add catch handlers to prevent unhandled rejection warnings
      p1!.catch(() => {});
      p2!.catch(() => {});

      // Third should throw
      expect(() => {
        reconnect.queueRequest("method3", async () => {});
      }).toThrow(/queue full/i);

      // Let reconnection fail (2 attempts: 100, 200)
      await vi.advanceTimersByTimeAsync(300);
      await disconnectPromise;

      // Handle the rejections
      await expect(p1).rejects.toThrow();
      await expect(p2).rejects.toThrow();
    });

    it("should not queue if queueRequests is disabled", async () => {
      const target = createMockTarget();
      target.simulateFailure = true;

      const reconnect = new ReconnectManager(target, {
        initialDelay: 100,
        maxAttempts: 2,
        queueRequests: false,
        jitter: 0,
      });

      const disconnectPromise = reconnect.handleDisconnect(new Error("test"));

      // Queue request should return null
      const result = reconnect.queueRequest("testMethod", async () => "result");
      expect(result).toBeNull();

      // Let reconnection complete (2 attempts: 100, 200)
      await vi.advanceTimersByTimeAsync(300);
      await disconnectPromise;
    });

    it("should return null when not reconnecting", () => {
      const target = createMockTarget();
      const reconnect = new ReconnectManager(target);

      const result = reconnect.queueRequest("testMethod", async () => "result");
      expect(result).toBeNull();
    });
  });

  describe("cancellation", () => {
    it("should cancel ongoing reconnection", async () => {
      const target = createMockTarget();
      // Use a more limited failure to make cleanup predictable
      target.failuresRemaining = 10;

      const reconnect = new ReconnectManager(target, {
        initialDelay: 100,
        maxAttempts: 10,
        jitter: 0,
      });

      const failedHandler = vi.fn();
      reconnect.on("reconnect:failed", failedHandler);

      const promise = reconnect.handleDisconnect(new Error("test"));

      // First attempt: sleep(100) then connect()
      await vi.advanceTimersByTimeAsync(100);
      expect(target.connectCalls).toBe(1);

      // Cancel immediately - will be checked at the start of next iteration
      reconnect.cancel();

      // The loop will check cancelled after the sleep and before connect
      // Next sleep is 200ms
      await vi.advanceTimersByTimeAsync(200);

      const result = await promise;
      expect(result).toBe(false);
      expect(failedHandler).toHaveBeenCalledTimes(1);
    });

    it("should reject all queued requests on cancel", async () => {
      const target = createMockTarget();
      target.failuresRemaining = 10;

      const reconnect = new ReconnectManager(target, {
        initialDelay: 100,
        maxAttempts: 10,
        jitter: 0,
      });

      const disconnectPromise = reconnect.handleDisconnect(new Error("test"));

      // Queue requests - add error handlers immediately to prevent unhandled rejection warnings
      const promise1 = reconnect.queueRequest("method1", async () => "result1");
      const promise2 = reconnect.queueRequest("method2", async () => "result2");

      // Add catch handlers to prevent unhandled rejection during test
      promise1!.catch(() => {});
      promise2!.catch(() => {});

      // First attempt: sleep(100) then connect()
      await vi.advanceTimersByTimeAsync(100);
      expect(target.connectCalls).toBe(1);

      // Cancel
      reconnect.cancel();

      // Allow the loop to exit (sleep 200ms then cancel check)
      await vi.advanceTimersByTimeAsync(200);

      // Wait for disconnect to complete
      await disconnectPromise;

      // Both should be rejected (rejectQueue is called on failure)
      await expect(promise1).rejects.toThrow();
      await expect(promise2).rejects.toThrow();
    });
  });

  describe("state management", () => {
    it("should track isReconnecting correctly", async () => {
      const target = createMockTarget();
      target.failuresRemaining = 1;

      const reconnect = new ReconnectManager(target, {
        initialDelay: 100,
        jitter: 0,
      });

      expect(reconnect.isReconnecting()).toBe(false);

      const promise = reconnect.handleDisconnect(new Error("test"));

      expect(reconnect.isReconnecting()).toBe(true);

      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(200);

      await promise;

      expect(reconnect.isReconnecting()).toBe(false);
    });

    it("should reset state correctly", async () => {
      const target = createMockTarget();
      target.simulateFailure = true;

      const reconnect = new ReconnectManager(target, {
        initialDelay: 100,
        maxAttempts: 2,
        jitter: 0,
      });

      const promise = reconnect.handleDisconnect(new Error("test"));

      // First attempt (sleep 100ms, then connect fails)
      await vi.advanceTimersByTimeAsync(100);
      expect(target.connectCalls).toBe(1);

      // Cancel first to stop the loop, then reset
      reconnect.cancel();

      // Allow the loop to exit (next sleep is 200ms, then cancel check)
      await vi.advanceTimersByTimeAsync(200);
      await promise;

      // Now reset state for a fresh start
      reconnect.reset();

      expect(reconnect.getState()).toEqual({
        attempt: 0,
        isReconnecting: false,
        reconnectStartedAt: null,
        queueSize: 0,
        lastError: null,
      });
    });
  });
});
