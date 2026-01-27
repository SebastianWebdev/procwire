/**
 * Communication tests: Request/Response
 *
 * Tests basic request/response patterns between manager and worker.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProcessManager } from "@procwire/transport";
import { spawnWorker } from "../../utils/test-helpers.js";

describe("Communication - Request/Response", () => {
  let manager: ProcessManager;

  beforeEach(() => {
    manager = new ProcessManager({
      defaultTimeout: 10000,
      restartPolicy: { enabled: false, maxRestarts: 0, backoffMs: 100 },
      gracefulShutdownMs: 5000,
    });
  });

  afterEach(async () => {
    await manager.terminateAll();
  });

  describe("basic request/response", () => {
    it("should handle simple echo request", async () => {
      const handle = await spawnWorker(manager, "echo-worker", "echo-worker.ts");

      const result = await handle.request("echo", { message: "hello" });

      expect(result).toEqual({ message: "hello" });
    });

    it("should handle request with no params", async () => {
      const handle = await spawnWorker(manager, "ping-worker", "echo-worker.ts");

      const result = (await handle.request("ping")) as { pong: boolean };

      expect(result.pong).toBe(true);
    });

    it("should handle request returning complex object", async () => {
      const handle = await spawnWorker(manager, "info-worker", "echo-worker.ts");

      const result = (await handle.request("get_info")) as {
        pid: number;
        uptime: number;
        memoryUsage: NodeJS.MemoryUsage;
      };

      expect(result.pid).toBeTypeOf("number");
      expect(result.uptime).toBeTypeOf("number");
      expect(result.memoryUsage).toBeDefined();
    });

    it("should handle request with numeric params", async () => {
      const handle = await spawnWorker(manager, "add-worker", "echo-worker.ts");

      const result = (await handle.request("add", { a: 5, b: 3 })) as { sum: number };

      expect(result.sum).toBe(8);
    });

    it("should handle request with string params", async () => {
      const handle = await spawnWorker(manager, "string-worker", "echo-worker.ts");

      const result = await handle.request("echo", { name: "world", greeting: "hello" });

      expect(result).toEqual({ name: "world", greeting: "hello" });
    });

    it("should handle request with array params", async () => {
      const handle = await spawnWorker(manager, "array-worker", "echo-worker.ts");

      const result = await handle.request("echo", { items: [1, 2, 3, 4, 5] });

      expect(result).toEqual({ items: [1, 2, 3, 4, 5] });
    });

    it("should handle request with nested object params", async () => {
      const handle = await spawnWorker(manager, "nested-worker", "echo-worker.ts");

      const params = {
        user: {
          name: "Alice",
          profile: {
            age: 30,
            tags: ["developer", "tester"],
          },
        },
      };

      const result = await handle.request("echo", params);

      expect(result).toEqual(params);
    });

    it("should handle request with null and undefined", async () => {
      const handle = await spawnWorker(manager, "null-worker", "echo-worker.ts");

      const result = await handle.request("echo", { value: null, missing: undefined });

      // undefined is typically omitted in JSON serialization
      expect(result).toMatchObject({ value: null });
    });

    it("should handle request with boolean params", async () => {
      const handle = await spawnWorker(manager, "bool-worker", "echo-worker.ts");

      const result = await handle.request("echo", { enabled: true, disabled: false });

      expect(result).toEqual({ enabled: true, disabled: false });
    });
  });

  describe("multiple requests", () => {
    it("should handle sequential requests to same method", async () => {
      const handle = await spawnWorker(manager, "seq-worker", "echo-worker.ts");

      const result1 = await handle.request("echo", { seq: 1 });
      const result2 = await handle.request("echo", { seq: 2 });
      const result3 = await handle.request("echo", { seq: 3 });

      expect(result1).toEqual({ seq: 1 });
      expect(result2).toEqual({ seq: 2 });
      expect(result3).toEqual({ seq: 3 });
    });

    it("should handle sequential requests to different methods", async () => {
      const handle = await spawnWorker(manager, "multi-method-worker", "echo-worker.ts");

      const pingResult = await handle.request("ping");
      const addResult = await handle.request("add", { a: 10, b: 20 });
      const echoResult = await handle.request("echo", { test: true });

      expect(pingResult).toMatchObject({ pong: true });
      expect(addResult).toEqual({ sum: 30 });
      expect(echoResult).toEqual({ test: true });
    });

    it("should maintain order for sequential requests", async () => {
      const handle = await spawnWorker(manager, "order-worker", "slow-worker.ts");

      const results: number[] = [];

      const result1 = await handle.request("slow_echo", { message: "1", delay: 50 });
      results.push(1);

      const result2 = await handle.request("slow_echo", { message: "2", delay: 30 });
      results.push(2);

      const result3 = await handle.request("slow_echo", { message: "3", delay: 10 });
      results.push(3);

      expect(results).toEqual([1, 2, 3]);
      expect((result1 as { message: string }).message).toBe("1");
      expect((result2 as { message: string }).message).toBe("2");
      expect((result3 as { message: string }).message).toBe("3");
    });
  });

  describe("request to different workers", () => {
    it("should route requests to correct workers", async () => {
      const handle1 = await spawnWorker(manager, "worker-a", "echo-worker.ts");
      const handle2 = await spawnWorker(manager, "worker-b", "echo-worker.ts");

      const [result1, result2] = await Promise.all([
        handle1.request("echo", { worker: "a" }),
        handle2.request("echo", { worker: "b" }),
      ]);

      expect(result1).toEqual({ worker: "a" });
      expect(result2).toEqual({ worker: "b" });
    });

    it("should isolate state between workers", async () => {
      const handle1 = await spawnWorker(manager, "state-worker-1", "compute-worker.ts");
      const handle2 = await spawnWorker(manager, "state-worker-2", "compute-worker.ts");

      // Reset counters
      await handle1.request("reset_concurrent");
      await handle2.request("reset_concurrent");

      // Run concurrent tests on worker 1
      await Promise.all([
        handle1.request("concurrent_test", { id: 1, delay: 50 }),
        handle1.request("concurrent_test", { id: 2, delay: 50 }),
      ]);

      const stats1 = (await handle1.request("get_max_concurrent")) as { max: number };
      const stats2 = (await handle2.request("get_max_concurrent")) as { max: number };

      // Worker 1 should have seen concurrent requests, worker 2 shouldn't
      expect(stats1.max).toBeGreaterThanOrEqual(1);
      expect(stats2.max).toBe(0);
    });
  });
});
