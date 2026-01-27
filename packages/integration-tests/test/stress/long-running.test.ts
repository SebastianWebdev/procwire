/**
 * Stress tests: Long Running
 *
 * Tests workers running for extended periods with continuous activity.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProcessManager } from "@procwire/transport";
import { spawnWorker, measureTime, delay } from "../../utils/test-helpers.js";

describe("Stress - Long Running", { timeout: 120000 }, () => {
  let manager: ProcessManager;

  beforeEach(() => {
    manager = new ProcessManager({
      defaultTimeout: 60000,
      restartPolicy: { enabled: false, maxRestarts: 0, backoffMs: 100 },
      gracefulShutdownMs: 10000,
    });
  });

  afterEach(async () => {
    await manager.terminateAll();
  });

  describe("sustained operation", () => {
    it("should maintain responsiveness over 10 seconds of operation", async () => {
      const handle = await spawnWorker(manager, "long-10s", "echo-worker.ts");

      const testDuration = 10000;
      const startTime = Date.now();
      const responseTimes: number[] = [];

      while (Date.now() - startTime < testDuration) {
        const requestStart = Date.now();
        await handle.request("ping");
        responseTimes.push(Date.now() - requestStart);

        // Small delay between requests
        await delay(100);
      }

      // Calculate stats
      const avgResponseTime =
        responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);

      console.log(
        `10s test: ${responseTimes.length} requests, ` +
          `avg=${avgResponseTime.toFixed(1)}ms, max=${maxResponseTime}ms`,
      );

      // Average response should be fast
      expect(avgResponseTime).toBeLessThan(50);
      // No request should be extremely slow
      expect(maxResponseTime).toBeLessThan(500);
    });

    it("should handle long-running task", async () => {
      const handle = await spawnWorker(manager, "long-task", "compute-worker.ts");

      const { result, elapsed } = await measureTime(() =>
        handle.request("long_task", { steps: 10, step_delay: 200 }),
      );

      const taskResult = result as { completed: boolean; results: number[] };
      expect(taskResult.completed).toBe(true);
      expect(taskResult.results.length).toBe(10);
      expect(elapsed).toBeGreaterThanOrEqual(1900); // 10 steps * 200ms
    });

    it("should remain responsive during long-running tasks", async () => {
      const handle = await spawnWorker(manager, "responsive-during-task", "compute-worker.ts");

      // Start long task
      const longTaskPromise = handle.request("long_task", { steps: 5, step_delay: 300 });

      // Check responsiveness during task
      const { elapsed } = await measureTime(() => handle.request("add", { a: 1, b: 2 }));

      // Should respond quickly even during long task
      expect(elapsed).toBeLessThan(100);

      // Wait for long task to complete
      const result = (await longTaskPromise) as { completed: boolean };
      expect(result.completed).toBe(true);
    });
  });

  describe("incremental operations", () => {
    it("should handle incrementing counter over time", async () => {
      const handle = await spawnWorker(manager, "counter", "echo-worker.ts");

      const iterations = 100;
      let total = 0;

      for (let i = 0; i < iterations; i++) {
        const result = (await handle.request("add", { a: total, b: 1 })) as { sum: number };
        total = result.sum;
        expect(total).toBe(i + 1);
      }

      expect(total).toBe(iterations);
    });

    it("should handle sequential requests with varying payloads", async () => {
      const handle = await spawnWorker(manager, "varying-payload", "streaming-worker.ts");

      for (let size = 100; size <= 10000; size += 1000) {
        const data = "x".repeat(size);
        const result = (await handle.request("echo_large", { data })) as {
          size: number;
        };
        expect(result.size).toBe(size);
      }
    });
  });

  describe("periodic health checks", () => {
    it("should respond to periodic pings over 15 seconds", async () => {
      const handle = await spawnWorker(manager, "ping-15s", "echo-worker.ts");

      const testDuration = 15000;
      const pingInterval = 500;
      const startTime = Date.now();
      let pingCount = 0;
      let failedPings = 0;

      while (Date.now() - startTime < testDuration) {
        try {
          const result = (await handle.request("ping", {}, 1000)) as { pong: boolean };
          if (result.pong) {
            pingCount++;
          } else {
            failedPings++;
          }
        } catch {
          failedPings++;
        }

        await delay(pingInterval);
      }

      console.log(`15s ping test: ${pingCount} successful, ${failedPings} failed`);

      // All pings should succeed
      expect(failedPings).toBe(0);
      // Should have done reasonable number of pings
      expect(pingCount).toBeGreaterThan(25);
    });
  });

  describe("worker uptime", () => {
    it("should report increasing uptime", async () => {
      const handle = await spawnWorker(manager, "uptime-check", "echo-worker.ts");

      const uptimes: number[] = [];

      for (let i = 0; i < 5; i++) {
        const result = (await handle.request("get_info")) as { uptime: number };
        uptimes.push(result.uptime);
        await delay(500);
      }

      // Uptimes should be increasing
      for (let i = 1; i < uptimes.length; i++) {
        expect(uptimes[i]).toBeGreaterThan(uptimes[i - 1]!);
      }
    });
  });

  describe("continuous data processing", () => {
    it("should process data continuously for 20 seconds", async () => {
      const handle = await spawnWorker(manager, "continuous-20s", "streaming-worker.ts");

      const testDuration = 20000;
      const startTime = Date.now();
      let processedItems = 0;

      while (Date.now() - startTime < testDuration) {
        const items = Array.from({ length: 10 }, (_, i) => ({
          id: processedItems + i,
          value: Math.random(),
        }));

        const result = (await handle.request("transform_items", { items })) as {
          items: unknown[];
        };

        processedItems += result.items.length;
        await delay(50);
      }

      console.log(`20s processing: ${processedItems} items processed`);

      // Should have processed substantial number of items
      expect(processedItems).toBeGreaterThan(1000);
    });
  });
});
