/**
 * Stress tests: Many Workers
 *
 * Tests managing multiple concurrent workers.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProcessManager } from "@procwire/transport";
import { spawnWorker, measureTime } from "../../utils/test-helpers.js";

describe("Stress - Many Workers", { timeout: 60000 }, () => {
  let manager: ProcessManager;

  beforeEach(() => {
    manager = new ProcessManager({
      defaultTimeout: 30000,
      restartPolicy: { enabled: false, maxRestarts: 0, backoffMs: 100 },
      gracefulShutdownMs: 10000,
    });
  });

  afterEach(async () => {
    await manager.terminateAll();
  });

  describe("spawning multiple workers", () => {
    it("should spawn 5 workers concurrently", async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        spawnWorker(manager, `worker-${i}`, "echo-worker.ts"),
      );

      const handles = await Promise.all(promises);

      expect(handles.length).toBe(5);
      handles.forEach((handle, i) => {
        expect(handle.state).toBe("running");
        expect(handle.id).toBe(`worker-${i}`);
      });
    });

    it("should spawn 10 workers concurrently", async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        spawnWorker(manager, `worker-10-${i}`, "echo-worker.ts"),
      );

      const handles = await Promise.all(promises);

      expect(handles.length).toBe(10);
      handles.forEach((handle) => {
        expect(handle.state).toBe("running");
      });
    });

    it("should spawn 20 workers sequentially", async () => {
      const handles = [];

      for (let i = 0; i < 20; i++) {
        const handle = await spawnWorker(manager, `seq-worker-${i}`, "echo-worker.ts");
        handles.push(handle);
      }

      expect(handles.length).toBe(20);
      handles.forEach((handle) => {
        expect(handle.state).toBe("running");
      });
    });
  });

  describe("communicating with multiple workers", () => {
    it("should send requests to all workers in parallel", async () => {
      const workerCount = 10;
      const handles = await Promise.all(
        Array.from({ length: workerCount }, (_, i) =>
          spawnWorker(manager, `parallel-${i}`, "echo-worker.ts"),
        ),
      );

      // Send requests to all workers simultaneously
      const requests = handles.map((handle, i) => handle.request("echo", { workerId: i }));

      const results = (await Promise.all(requests)) as Array<{ workerId: number }>;

      results.forEach((result, i) => {
        expect(result.workerId).toBe(i);
      });
    });

    it("should handle round-robin requests across workers", async () => {
      const workerCount = 5;
      const handles = await Promise.all(
        Array.from({ length: workerCount }, (_, i) =>
          spawnWorker(manager, `rr-${i}`, "echo-worker.ts"),
        ),
      );

      const results = [];
      const requestCount = 50;

      for (let i = 0; i < requestCount; i++) {
        const workerIndex = i % workerCount;
        const result = await handles[workerIndex]!.request("echo", { req: i });
        results.push(result);
      }

      expect(results.length).toBe(requestCount);
    });

    it("should handle burst requests to all workers", async () => {
      const workerCount = 5;
      const handles = await Promise.all(
        Array.from({ length: workerCount }, (_, i) =>
          spawnWorker(manager, `burst-${i}`, "echo-worker.ts"),
        ),
      );

      // Send 100 requests to each worker
      const allRequests = handles.flatMap((handle, workerId) =>
        Array.from({ length: 100 }, (_, reqId) => handle.request("echo", { workerId, reqId })),
      );

      const results = await Promise.all(allRequests);

      expect(results.length).toBe(workerCount * 100);
    });
  });

  describe("worker isolation", () => {
    it("should isolate state between workers", async () => {
      const handles = await Promise.all([
        spawnWorker(manager, "iso-1", "compute-worker.ts"),
        spawnWorker(manager, "iso-2", "compute-worker.ts"),
      ]);

      // Reset and increment on worker 1 only
      await handles[0]!.request("reset_concurrent");
      await handles[1]!.request("reset_concurrent");

      await Promise.all([
        handles[0]!.request("concurrent_test", { id: 1, delay: 50 }),
        handles[0]!.request("concurrent_test", { id: 2, delay: 50 }),
      ]);

      const stats1 = (await handles[0]!.request("get_max_concurrent")) as { max: number };
      const stats2 = (await handles[1]!.request("get_max_concurrent")) as { max: number };

      expect(stats1.max).toBeGreaterThanOrEqual(1);
      expect(stats2.max).toBe(0);
    });

    it("should allow independent operations on each worker", async () => {
      const handles = await Promise.all(
        Array.from({ length: 5 }, (_, i) => spawnWorker(manager, `indep-${i}`, "slow-worker.ts")),
      );

      // Each worker processes different delays
      const requests = handles.map((handle, i) =>
        handle.request("slow_echo", { message: `worker-${i}`, delay: (i + 1) * 50 }),
      );

      const start = Date.now();
      const results = (await Promise.all(requests)) as Array<{ message: string }>;
      const elapsed = Date.now() - start;

      // All workers process in parallel, so elapsed should be ~250ms (max delay)
      // not ~750ms (sum of delays)
      expect(elapsed).toBeLessThan(500);

      results.forEach((result, i) => {
        expect(result.message).toBe(`worker-${i}`);
      });
    });
  });

  describe("termination of multiple workers", () => {
    it("should terminate all workers gracefully", async () => {
      const workerCount = 10;
      await Promise.all(
        Array.from({ length: workerCount }, (_, i) =>
          spawnWorker(manager, `term-${i}`, "echo-worker.ts"),
        ),
      );

      // Verify all running
      for (let i = 0; i < workerCount; i++) {
        expect(manager.isRunning(`term-${i}`)).toBe(true);
      }

      await manager.terminateAll();

      // Verify all stopped
      for (let i = 0; i < workerCount; i++) {
        expect(manager.isRunning(`term-${i}`)).toBe(false);
      }
    });

    it("should terminate workers individually", async () => {
      const handles = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          spawnWorker(manager, `ind-term-${i}`, "echo-worker.ts"),
        ),
      );

      // Terminate every other worker
      for (let i = 0; i < 5; i += 2) {
        await manager.terminate(`ind-term-${i}`);
      }

      expect(manager.isRunning("ind-term-0")).toBe(false);
      expect(manager.isRunning("ind-term-1")).toBe(true);
      expect(manager.isRunning("ind-term-2")).toBe(false);
      expect(manager.isRunning("ind-term-3")).toBe(true);
      expect(manager.isRunning("ind-term-4")).toBe(false);

      // Remaining workers should still work
      const result = await handles[1]!.request("echo", { still: "working" });
      expect(result).toEqual({ still: "working" });
    });
  });

  describe("spawn timing", () => {
    it("should measure spawn time for multiple workers", async () => {
      const workerCount = 10;

      const { elapsed } = await measureTime(() =>
        Promise.all(
          Array.from({ length: workerCount }, (_, i) =>
            spawnWorker(manager, `timing-${i}`, "echo-worker.ts"),
          ),
        ),
      );

      console.log(
        `Spawned ${workerCount} workers in ${elapsed}ms ` +
          `(${(elapsed / workerCount).toFixed(1)}ms per worker)`,
      );

      // Should spawn reasonably fast
      expect(elapsed).toBeLessThan(30000);
    });
  });
});
