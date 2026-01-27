/**
 * Communication tests: Concurrent Requests
 *
 * Tests handling of multiple concurrent requests.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProcessManager } from "@procwire/transport";
import { spawnWorker, measureTime } from "../../utils/test-helpers.js";

describe("Communication - Concurrent Requests", () => {
  let manager: ProcessManager;

  beforeEach(() => {
    manager = new ProcessManager({
      defaultTimeout: 30000,
      restartPolicy: { enabled: false, maxRestarts: 0, backoffMs: 100 },
      gracefulShutdownMs: 5000,
    });
  });

  afterEach(async () => {
    await manager.terminateAll();
  });

  describe("concurrent request handling", () => {
    it("should handle 10 concurrent requests", async () => {
      const handle = await spawnWorker(manager, "concurrent-10", "echo-worker.ts");

      const requests = Array.from({ length: 10 }, (_, i) =>
        handle.request("echo", { id: i }),
      );

      const results = await Promise.all(requests);

      expect(results.length).toBe(10);
      results.forEach((result, i) => {
        expect(result).toEqual({ id: i });
      });
    });

    it("should handle 100 concurrent requests", async () => {
      const handle = await spawnWorker(manager, "concurrent-100", "echo-worker.ts");

      const requests = Array.from({ length: 100 }, (_, i) =>
        handle.request("echo", { seq: i }),
      );

      const results = await Promise.all(requests);

      expect(results.length).toBe(100);
      results.forEach((result, i) => {
        expect((result as { seq: number }).seq).toBe(i);
      });
    });

    it("should maintain request/response correlation", async () => {
      const handle = await spawnWorker(manager, "correlation-worker", "slow-worker.ts");

      // Requests with varying delays to ensure responses arrive out-of-order
      const requests = [
        handle.request("slow_echo", { message: "first", delay: 100 }),
        handle.request("slow_echo", { message: "second", delay: 50 }),
        handle.request("slow_echo", { message: "third", delay: 10 }),
      ];

      const results = (await Promise.all(requests)) as Array<{ message: string }>;

      // Despite different completion times, correlation should be maintained
      expect(results[0]?.message).toBe("first");
      expect(results[1]?.message).toBe("second");
      expect(results[2]?.message).toBe("third");
    });

    it("should not block fast requests on slow requests", async () => {
      const handle = await spawnWorker(manager, "no-block-worker", "slow-worker.ts");

      const { elapsed } = await measureTime(async () => {
        await Promise.all([
          handle.request("slow_echo", { message: "slow", delay: 200 }),
          handle.request("delay", { ms: 10 }),
          handle.request("delay", { ms: 10 }),
        ]);
      });

      // Should complete in ~200ms (slowest request), not 200+10+10
      expect(elapsed).toBeLessThan(350);
    });
  });

  describe("concurrency tracking", () => {
    it("should process requests concurrently", async () => {
      const handle = await spawnWorker(manager, "track-concurrent", "compute-worker.ts");

      // Reset counter
      await handle.request("reset_concurrent");

      // Send concurrent requests
      const requests = Array.from({ length: 5 }, (_, i) =>
        handle.request("concurrent_test", { id: i, delay: 100 }),
      );

      await Promise.all(requests);

      // Check max concurrency was > 1
      const stats = (await handle.request("get_max_concurrent")) as { max: number };
      expect(stats.max).toBeGreaterThan(1);
    });

    it("should track all concurrent requests", async () => {
      const handle = await spawnWorker(manager, "track-all", "compute-worker.ts");

      // Reset counter
      await handle.request("reset_concurrent");

      // Send many concurrent requests
      const count = 20;
      const requests = Array.from({ length: count }, (_, i) =>
        handle.request("concurrent_test", { id: i, delay: 50 }),
      );

      const results = (await Promise.all(requests)) as Array<{
        id: number;
        max_concurrent: number;
      }>;

      // All requests should complete
      expect(results.length).toBe(count);

      // Each result should have correct id
      const ids = results.map((r) => r.id).sort((a, b) => a - b);
      expect(ids).toEqual(Array.from({ length: count }, (_, i) => i));
    });
  });

  describe("mixed concurrent operations", () => {
    it("should handle mixed request types concurrently", async () => {
      const handle = await spawnWorker(manager, "mixed-worker", "compute-worker.ts");

      const requests = [
        handle.request("add", { a: 1, b: 2 }),
        handle.request("echo", { test: true }),
        handle.request("slow_compute", { delay: 50, value: "slow" }),
        handle.request("add", { a: 10, b: 20 }),
        handle.request("fibonacci", { n: 10 }),
      ];

      const results = await Promise.all(requests);

      expect(results[0]).toEqual({ sum: 3 });
      expect(results[1]).toMatchObject({ test: true });
      expect(results[2]).toMatchObject({ value: "slow" });
      expect(results[3]).toEqual({ sum: 30 });
      expect((results[4] as { result: number }).result).toBe(55); // fib(10) = 55
    });

    it("should handle requests to multiple workers concurrently", async () => {
      const handle1 = await spawnWorker(manager, "multi-worker-1", "echo-worker.ts");
      const handle2 = await spawnWorker(manager, "multi-worker-2", "echo-worker.ts");
      const handle3 = await spawnWorker(manager, "multi-worker-3", "echo-worker.ts");

      const requests = [
        handle1.request("echo", { worker: 1 }),
        handle2.request("echo", { worker: 2 }),
        handle3.request("echo", { worker: 3 }),
        handle1.request("ping"),
        handle2.request("ping"),
        handle3.request("ping"),
      ];

      const results = await Promise.all(requests);

      expect(results[0]).toEqual({ worker: 1 });
      expect(results[1]).toEqual({ worker: 2 });
      expect(results[2]).toEqual({ worker: 3 });
      expect(results[3]).toMatchObject({ pong: true });
      expect(results[4]).toMatchObject({ pong: true });
      expect(results[5]).toMatchObject({ pong: true });
    });
  });

  describe("error handling in concurrent requests", () => {
    it("should isolate errors in concurrent requests", async () => {
      const handle = await spawnWorker(manager, "error-isolate", "error-worker.ts");

      const requests = [
        handle.request("echo", { id: 1 }),
        handle.request("throw_sync", {}),
        handle.request("echo", { id: 2 }),
      ];

      const results = await Promise.allSettled(requests);

      expect(results[0]?.status).toBe("fulfilled");
      expect(results[1]?.status).toBe("rejected");
      expect(results[2]?.status).toBe("fulfilled");

      if (results[0]?.status === "fulfilled") {
        expect(results[0].value).toEqual({ id: 1 });
      }
      if (results[2]?.status === "fulfilled") {
        expect(results[2].value).toEqual({ id: 2 });
      }
    });

    it("should handle multiple errors concurrently", async () => {
      const handle = await spawnWorker(manager, "multi-error", "error-worker.ts");

      const requests = [
        handle.request("throw_sync", {}),
        handle.request("throw_async", {}),
        handle.request("throw_sync", {}),
      ];

      const results = await Promise.allSettled(requests);

      expect(results.every((r) => r.status === "rejected")).toBe(true);
    });
  });
});
