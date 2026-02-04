import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import type { Socket } from "node:net";
import { DrainWaiter } from "../src/drain-waiter.js";

interface MockSocket extends EventEmitter {
  writableNeedDrain: boolean;
  destroyed: boolean;
}

/**
 * Creates a mock socket for testing DrainWaiter.
 */
function createMockSocket(options: { needsDrain?: boolean; destroyed?: boolean } = {}): MockSocket {
  const emitter = new EventEmitter() as MockSocket;
  emitter.writableNeedDrain = options.needsDrain ?? false;
  emitter.destroyed = options.destroyed ?? false;
  return emitter;
}

describe("DrainWaiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("waitForDrain", () => {
    it("should return immediately if socket doesn't need drain", async () => {
      const mockSocket = createMockSocket({ needsDrain: false });
      const drainWaiter = new DrainWaiter(mockSocket as unknown as Socket);

      await drainWaiter.waitForDrain();
      // Should complete without waiting
    });

    it("should throw if socket is destroyed", async () => {
      const mockSocket = createMockSocket({ needsDrain: true, destroyed: true });
      const drainWaiter = new DrainWaiter(mockSocket as unknown as Socket);

      await expect(drainWaiter.waitForDrain()).rejects.toThrow(
        "Socket closed during backpressure wait",
      );
    });

    it("should wait for drain event when backpressure exists", async () => {
      const mockSocket = createMockSocket({ needsDrain: true });
      const drainWaiter = new DrainWaiter(mockSocket as unknown as Socket);

      let resolved = false;
      const promise = drainWaiter.waitForDrain().then(() => {
        resolved = true;
      });

      // Not resolved yet
      await vi.advanceTimersByTimeAsync(0);
      expect(resolved).toBe(false);

      // Emit drain
      mockSocket.emit("drain");

      await promise;
      expect(resolved).toBe(true);
    });

    it("should resolve all waiters when drain fires (singleton pattern)", async () => {
      const mockSocket = createMockSocket({ needsDrain: true });
      const drainWaiter = new DrainWaiter(mockSocket as unknown as Socket);

      const results: number[] = [];

      // Start 5 concurrent waiters
      const promise1 = drainWaiter.waitForDrain().then(() => results.push(1));
      const promise2 = drainWaiter.waitForDrain().then(() => results.push(2));
      const promise3 = drainWaiter.waitForDrain().then(() => results.push(3));
      const promise4 = drainWaiter.waitForDrain().then(() => results.push(4));
      const promise5 = drainWaiter.waitForDrain().then(() => results.push(5));

      // None resolved yet
      await vi.advanceTimersByTimeAsync(0);
      expect(results).toEqual([]);

      // Check that only one listener was added
      expect(mockSocket.listenerCount("drain")).toBe(1);

      // Single drain event resolves all
      mockSocket.emit("drain");

      await Promise.all([promise1, promise2, promise3, promise4, promise5]);
      expect(results).toHaveLength(5);
      expect(results.sort()).toEqual([1, 2, 3, 4, 5]);
    });

    it("should not add multiple listeners for concurrent waits", async () => {
      const mockSocket = createMockSocket({ needsDrain: true });
      const drainWaiter = new DrainWaiter(mockSocket as unknown as Socket);

      // Start many concurrent waiters
      const promises = Array.from({ length: 100 }, () => drainWaiter.waitForDrain());

      await vi.advanceTimersByTimeAsync(0);

      // Should have exactly one drain listener (singleton pattern)
      expect(mockSocket.listenerCount("drain")).toBe(1);

      // Resolve all
      mockSocket.emit("drain");
      await Promise.all(promises);
    });

    it("should allow new waiters after drain fires", async () => {
      const mockSocket = createMockSocket({ needsDrain: true });
      const drainWaiter = new DrainWaiter(mockSocket as unknown as Socket);

      // First batch
      const promise1 = drainWaiter.waitForDrain();
      mockSocket.emit("drain");
      await promise1;

      // Reset backpressure state for second batch
      mockSocket.writableNeedDrain = true;

      // Second batch
      let secondResolved = false;
      const promise2 = drainWaiter.waitForDrain().then(() => {
        secondResolved = true;
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(secondResolved).toBe(false);

      mockSocket.emit("drain");
      await promise2;
      expect(secondResolved).toBe(true);
    });

    it("should reject pending waiters when socket closes", async () => {
      const mockSocket = createMockSocket({ needsDrain: true });
      const drainWaiter = new DrainWaiter(mockSocket as unknown as Socket);

      // Start waiting
      const promise = drainWaiter.waitForDrain();

      // Socket closes - should reject the pending waiter
      mockSocket.emit("close");

      await expect(promise).rejects.toThrow("Socket closed during backpressure wait");

      // Verify no drain listeners remain
      expect(mockSocket.listenerCount("drain")).toBe(0);
    });
  });

  describe("clear", () => {
    it("should reject all pending waiters and mark as closed", async () => {
      const mockSocket = createMockSocket({ needsDrain: true });
      const drainWaiter = new DrainWaiter(mockSocket as unknown as Socket);

      // Start waiters
      const promise1 = drainWaiter.waitForDrain();
      const promise2 = drainWaiter.waitForDrain();

      drainWaiter.clear();

      // Pending waiters should be rejected
      await expect(promise1).rejects.toThrow("Socket closed during backpressure wait");
      await expect(promise2).rejects.toThrow("Socket closed during backpressure wait");

      // New drain requests after clear should throw immediately
      mockSocket.writableNeedDrain = true;
      await expect(drainWaiter.waitForDrain()).rejects.toThrow(
        "Socket closed during backpressure wait",
      );
    });

    it("should not throw if no drain needed after clear", async () => {
      const mockSocket = createMockSocket({ needsDrain: true });
      const drainWaiter = new DrainWaiter(mockSocket as unknown as Socket);

      // Start a waiter - capture the rejection
      const pendingPromise = drainWaiter.waitForDrain().catch(() => {
        // Expected rejection, ignore
      });

      drainWaiter.clear();

      // Wait for rejection to be handled
      await pendingPromise;

      // No drain needed - should return immediately (fast path before closed check)
      mockSocket.writableNeedDrain = false;
      await drainWaiter.waitForDrain();
      // Should complete without error
    });
  });
});
