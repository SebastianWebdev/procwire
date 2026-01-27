/**
 * Lifecycle tests: Spawn and Shutdown
 *
 * Tests the basic lifecycle of spawning workers and shutting them down gracefully.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProcessManager, ReservedMethods } from "@procwire/transport";
import { spawnWorker, delay, createDeferred } from "../../utils/test-helpers.js";

describe("Worker Lifecycle - Spawn and Shutdown", () => {
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

  describe("spawn", () => {
    it("should spawn worker and complete handshake", async () => {
      const handle = await spawnWorker(manager, "test-worker", "echo-worker.ts");

      expect(handle.state).toBe("running");
      expect(handle.pid).toBeTypeOf("number");
      expect(handle.id).toBe("test-worker");
    });

    it("should emit spawn event", async () => {
      const { promise, resolve } = createDeferred<{ id: string; pid: number }>();
      manager.on("spawn", resolve);

      const handle = await spawnWorker(manager, "spawn-event-worker", "echo-worker.ts");

      const event = await promise;
      expect(event.id).toBe("spawn-event-worker");
      expect(event.pid).toBe(handle.pid);
    });

    it("should reject duplicate worker IDs", async () => {
      await spawnWorker(manager, "duplicate-worker", "echo-worker.ts");

      await expect(
        spawnWorker(manager, "duplicate-worker", "echo-worker.ts"),
      ).rejects.toThrow(/already exists/i);
    });

    it("should spawn multiple workers with different IDs", async () => {
      const handle1 = await spawnWorker(manager, "worker-1", "echo-worker.ts");
      const handle2 = await spawnWorker(manager, "worker-2", "echo-worker.ts");
      const handle3 = await spawnWorker(manager, "worker-3", "echo-worker.ts");

      expect(handle1.state).toBe("running");
      expect(handle2.state).toBe("running");
      expect(handle3.state).toBe("running");

      expect(manager.isRunning("worker-1")).toBe(true);
      expect(manager.isRunning("worker-2")).toBe(true);
      expect(manager.isRunning("worker-3")).toBe(true);
    });

    it("should track spawned workers via getHandle", async () => {
      const handle = await spawnWorker(manager, "tracked-worker", "echo-worker.ts");

      const retrieved = manager.getHandle("tracked-worker");
      expect(retrieved).toBe(handle);
    });

    it("should return null for non-existent worker", () => {
      const handle = manager.getHandle("non-existent");
      expect(handle).toBeNull();
    });
  });

  describe("graceful shutdown", () => {
    it("should shutdown gracefully via __shutdown__ request", async () => {
      const handle = await spawnWorker(manager, "shutdown-worker", "echo-worker.ts");

      const shutdownResult = (await handle.request(ReservedMethods.SHUTDOWN, {
        reason: "user_requested",
        timeout_ms: 5000,
      })) as { status: string; pending_requests: number };

      // Wire Protocol Spec 6.4: shutdown response has "status: shutting_down"
      expect(shutdownResult.status).toBe("shutting_down");
      expect(shutdownResult.pending_requests).toBe(0);

      // Wait for process to exit
      await delay(500);
      expect(handle.state).not.toBe("running");
    });

    it("should complete pending requests before shutdown", async () => {
      const handle = await spawnWorker(manager, "drain-worker", "slow-worker.ts");

      // Start a slow request
      const slowRequestPromise = handle.request("slow_echo", {
        message: "drain-test",
        delay: 300,
      });

      // Give the request time to start
      await delay(50);

      // Initiate shutdown while request is in-flight
      const shutdownPromise = manager.terminate("drain-worker");

      // Both should complete successfully
      const [slowResult] = await Promise.all([slowRequestPromise, shutdownPromise]);
      expect((slowResult as { message: string }).message).toBe("drain-test");
    });

    it("should emit exit event on shutdown", async () => {
      const { promise, resolve } =
        createDeferred<{ id: string; code: number | null; signal: string | null }>();
      manager.on("exit", resolve);

      await spawnWorker(manager, "exit-event-worker", "echo-worker.ts");
      await manager.terminate("exit-event-worker");

      const event = await promise;
      expect(event.id).toBe("exit-event-worker");
    });
  });

  describe("terminate", () => {
    it("should terminate a running worker", async () => {
      await spawnWorker(manager, "terminate-worker", "echo-worker.ts");

      expect(manager.isRunning("terminate-worker")).toBe(true);

      await manager.terminate("terminate-worker");

      expect(manager.isRunning("terminate-worker")).toBe(false);
    });

    it("should terminate all workers", async () => {
      await spawnWorker(manager, "term-all-1", "echo-worker.ts");
      await spawnWorker(manager, "term-all-2", "echo-worker.ts");
      await spawnWorker(manager, "term-all-3", "echo-worker.ts");

      expect(manager.isRunning("term-all-1")).toBe(true);
      expect(manager.isRunning("term-all-2")).toBe(true);
      expect(manager.isRunning("term-all-3")).toBe(true);

      await manager.terminateAll();

      expect(manager.isRunning("term-all-1")).toBe(false);
      expect(manager.isRunning("term-all-2")).toBe(false);
      expect(manager.isRunning("term-all-3")).toBe(false);
    });

    it("should handle terminate of non-existent worker gracefully", async () => {
      // This might throw or be a no-op depending on implementation
      await expect(manager.terminate("non-existent-worker")).rejects.toThrow();
    });
  });

  describe("worker state transitions", () => {
    it("should transition through states correctly", async () => {
      const states: string[] = [];

      const handle = await spawnWorker(manager, "state-worker", "echo-worker.ts");
      handle.on("stateChange", ({ from, to }) => {
        states.push(`${from}->${to}`);
      });

      // Worker should be running after spawn
      expect(handle.state).toBe("running");

      // Terminate to observe state changes
      await manager.terminate("state-worker");

      // Should have transitioned to stopped/crashed
      expect(handle.state).not.toBe("running");
    });
  });
});
