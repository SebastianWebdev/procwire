/**
 * Integration tests: Worker ↔ ProcessManager
 *
 * These tests verify that workers communicate correctly
 * with @procwire/transport ProcessManager using the handshake protocol.
 *
 * Uses simple JavaScript worker fixtures to avoid TypeScript compilation overhead.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProcessManager, ReservedMethods } from "@procwire/transport";
import type { IProcessHandle } from "@procwire/transport";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "fixtures");

// Helper to get fixture path (JavaScript files)
const fixture = (name: string) => path.join(fixturesDir, `simple-${name}-worker.js`);

/**
 * Filter environment variables to remove undefined values.
 */
function filterEnv(extra?: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  if (extra) {
    Object.assign(result, extra);
  }
  return result;
}

/**
 * Helper to spawn a worker and complete the handshake.
 * Returns the handle after the worker is ready.
 */
async function spawnAndHandshake(
  manager: ProcessManager,
  id: string,
  workerType: string,
  env?: Record<string, string>,
): Promise<IProcessHandle> {
  const handle = await manager.spawn(id, {
    executablePath: "node",
    args: [fixture(workerType)],
    env: filterEnv(env),
  });

  // Send handshake to complete worker initialization
  const handshakeResult = await handle.request(ReservedMethods.HANDSHAKE, {
    protocol_version: "1.0",
    manager_capabilities: ["heartbeat"],
  });

  expect(handshakeResult).toMatchObject({
    protocol_version: "1.0",
    worker_name: expect.any(String),
    worker_capabilities: expect.any(Array),
  });

  return handle;
}

describe("Worker ↔ ProcessManager Integration", () => {
  let manager: ProcessManager;

  beforeEach(() => {
    manager = new ProcessManager({
      defaultTimeout: 10000,
      restartPolicy: {
        enabled: false,
        maxRestarts: 0,
        backoffMs: 100,
      },
      gracefulShutdownMs: 5000,
    });
  });

  afterEach(async () => {
    await manager.terminateAll();
  });

  describe("Basic Communication", () => {
    it("should spawn worker and complete handshake", async () => {
      const handle = await spawnAndHandshake(manager, "worker-1", "echo");

      expect(handle.state).toBe("running");
      expect(handle.pid).toBeTypeOf("number");
    });

    it("should handle simple request/response", async () => {
      const handle = await spawnAndHandshake(manager, "worker-2", "echo");

      const result = await handle.request("echo", { message: "hello" });

      expect(result).toEqual({ message: "hello" });
    });

    it("should handle multiple sequential requests", async () => {
      const handle = await spawnAndHandshake(manager, "worker-3", "echo");

      const result1 = await handle.request("echo", { value: 1 });
      const result2 = await handle.request("echo", { value: 2 });
      const result3 = await handle.request("echo", { value: 3 });

      expect(result1).toEqual({ value: 1 });
      expect(result2).toEqual({ value: 2 });
      expect(result3).toEqual({ value: 3 });
    });

    it("should handle concurrent requests", async () => {
      const handle = await spawnAndHandshake(manager, "worker-4", "echo");

      const promises = [
        handle.request("echo", { id: 1 }),
        handle.request("echo", { id: 2 }),
        handle.request("echo", { id: 3 }),
      ];

      const results = await Promise.all(promises);

      expect(results).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    });
  });

  describe("Handler Types", () => {
    it("should handle sync handlers", async () => {
      const handle = await spawnAndHandshake(manager, "worker-sync", "echo");

      const result = await handle.request("add", { a: 2, b: 3 });

      expect(result).toEqual({ sum: 5 });
    });

    it("should handle async handlers", async () => {
      const handle = await spawnAndHandshake(manager, "worker-async", "echo");

      const start = Date.now();
      const result = await handle.request("slow_echo", { message: "test", delay: 200 });
      const elapsed = Date.now() - start;

      expect(result).toEqual({ message: "test", delayed_by: 200 });
      expect(elapsed).toBeGreaterThanOrEqual(190);
    });
  });

  describe("Error Handling", () => {
    it("should return error for unknown method", async () => {
      const handle = await spawnAndHandshake(manager, "worker-unknown", "echo");

      // Error messages may be wrapped by the protocol layer
      await expect(handle.request("unknown_method", {})).rejects.toThrow();
    });

    it("should propagate sync handler errors", async () => {
      const handle = await spawnAndHandshake(manager, "worker-sync-err", "error");

      // Error messages may be wrapped by the protocol layer
      await expect(handle.request("throw_sync", {})).rejects.toThrow();
    });

    it("should propagate async handler errors", async () => {
      const handle = await spawnAndHandshake(manager, "worker-async-err", "error");

      // Error messages may be wrapped by the protocol layer
      await expect(handle.request("throw_async", {})).rejects.toThrow();
    });

    it("should return error result without throwing for error objects", async () => {
      const handle = await spawnAndHandshake(manager, "worker-err-obj", "error");

      const result = await handle.request("return_error", {});

      expect(result).toEqual({ error: "This is an error object, not a thrown error" });
    });
  });

  describe("Graceful Shutdown", () => {
    it("should shutdown gracefully via __shutdown__ request", async () => {
      const handle = await spawnAndHandshake(manager, "worker-shutdown", "echo");

      // Request shutdown via protocol
      const shutdownResult = await handle.request(ReservedMethods.SHUTDOWN, {
        reason: "user_requested",
        timeout_ms: 5000,
      });

      expect(shutdownResult).toMatchObject({
        acknowledged: true,
        pending_requests: 0,
      });

      // Wait for process to exit
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Worker should have exited
      expect(handle.state).not.toBe("running");
    });

    it("should acknowledge shutdown and report pending requests", async () => {
      const handle = await spawnAndHandshake(manager, "worker-drain", "echo");

      // Request shutdown (simple case - no pending requests)
      const shutdownResult = await handle.request(ReservedMethods.SHUTDOWN, {
        reason: "user_requested",
        timeout_ms: 5000,
      });

      // Should acknowledge shutdown
      expect(shutdownResult).toMatchObject({
        acknowledged: true,
        pending_requests: 0,
      });
    });
  });

  describe("Concurrency", () => {
    it("should handle many concurrent requests", async () => {
      const handle = await spawnAndHandshake(manager, "worker-conc", "async");

      // Reset counter
      await handle.request("reset_concurrent", {});

      // Send 10 concurrent requests
      const promises = Array.from({ length: 10 }, (_, i) =>
        handle.request("concurrent_test", { id: i, delay: 100 }),
      );

      const results = await Promise.all(promises);

      // All requests should complete
      expect(results.length).toBe(10);
      results.forEach((r, i) => {
        expect((r as { id: number }).id).toBe(i);
      });

      // Check max concurrency was > 1
      const stats = await handle.request("get_max_concurrent", {});
      expect((stats as { max: number }).max).toBeGreaterThan(1);
    });

    it("should handle long-running tasks", async () => {
      const handle = await spawnAndHandshake(manager, "worker-long", "async");

      const start = Date.now();
      const result = (await handle.request("long_task", {
        steps: 5,
        step_delay: 50,
      })) as { completed: boolean; results: number[] };
      const elapsed = Date.now() - start;

      expect(result.completed).toBe(true);
      expect(result.results).toEqual([0, 1, 2, 3, 4]);
      expect(elapsed).toBeGreaterThanOrEqual(240); // 5 steps * 50ms each, with some tolerance
    }, 15000);
  });

  describe("Multiple Workers", () => {
    it("should manage multiple workers independently", async () => {
      const handle1 = await spawnAndHandshake(manager, "worker-a", "echo");
      const handle2 = await spawnAndHandshake(manager, "worker-b", "echo");

      expect(manager.isRunning("worker-a")).toBe(true);
      expect(manager.isRunning("worker-b")).toBe(true);

      // Both should work independently
      const [result1, result2] = await Promise.all([
        handle1.request("echo", { from: "a" }),
        handle2.request("echo", { from: "b" }),
      ]);

      expect(result1).toEqual({ from: "a" });
      expect(result2).toEqual({ from: "b" });

      // Terminate one
      await manager.terminate("worker-a");

      expect(manager.isRunning("worker-a")).toBe(false);
      expect(manager.isRunning("worker-b")).toBe(true);

      // Other should still work
      const result3 = await handle2.request("echo", { still: "works" });
      expect(result3).toEqual({ still: "works" });
    });

    it("should terminate all workers", async () => {
      await spawnAndHandshake(manager, "worker-x", "echo");
      await spawnAndHandshake(manager, "worker-y", "echo");
      await spawnAndHandshake(manager, "worker-z", "echo");

      expect(manager.isRunning("worker-x")).toBe(true);
      expect(manager.isRunning("worker-y")).toBe(true);
      expect(manager.isRunning("worker-z")).toBe(true);

      await manager.terminateAll();

      expect(manager.isRunning("worker-x")).toBe(false);
      expect(manager.isRunning("worker-y")).toBe(false);
      expect(manager.isRunning("worker-z")).toBe(false);
    });
  });

  describe("Debug Mode", () => {
    it("should work with debug logging enabled", async () => {
      const handle = await spawnAndHandshake(manager, "worker-debug", "echo", {
        DEBUG: "true",
      });

      const result = await handle.request("echo", { debug: true });

      expect(result).toEqual({ debug: true });
    });
  });
});
