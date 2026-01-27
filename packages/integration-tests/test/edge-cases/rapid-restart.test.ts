/**
 * Edge case tests: Rapid Restart
 *
 * Tests rapid spawn/terminate cycles and restart scenarios.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProcessManager } from "@procwire/transport";
import { spawnWorker, delay } from "../../utils/test-helpers.js";

describe("Edge Cases - Rapid Restart", { timeout: 60000 }, () => {
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

  describe("rapid spawn/terminate cycles", () => {
    it("should handle 5 rapid spawn/terminate cycles", async () => {
      for (let i = 0; i < 5; i++) {
        const handle = await spawnWorker(manager, "rapid-worker", "echo-worker.ts");
        expect(handle.state).toBe("running");

        // Make a request to ensure worker is functional
        const result = await handle.request("echo", { cycle: i });
        expect(result).toEqual({ cycle: i });

        // Terminate
        await manager.terminate("rapid-worker");
        expect(manager.isRunning("rapid-worker")).toBe(false);

        // Small delay to ensure process is fully cleaned up before reusing ID
        await delay(50);
      }
    });

    it("should handle 10 rapid spawn/terminate cycles with different IDs", async () => {
      for (let i = 0; i < 10; i++) {
        const id = `rapid-${i}`;
        const handle = await spawnWorker(manager, id, "echo-worker.ts");

        const result = await handle.request("ping");
        expect(result).toMatchObject({ pong: true });

        await manager.terminate(id);
      }

      // All workers should be terminated
      for (let i = 0; i < 10; i++) {
        expect(manager.isRunning(`rapid-${i}`)).toBe(false);
      }
    });

    it("should handle rapid cycles with minimal delay", async () => {
      const cycles = 10;
      const times: number[] = [];

      for (let i = 0; i < cycles; i++) {
        const start = Date.now();
        const handle = await spawnWorker(manager, "fast-cycle", "echo-worker.ts");
        await handle.request("ping");
        await manager.terminate("fast-cycle");
        times.push(Date.now() - start);

        // Small delay to ensure process is fully cleaned up before reusing ID
        await delay(50);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      console.log(`Rapid cycle avg: ${avgTime.toFixed(1)}ms per cycle`);

      // All cycles should complete
      expect(times.length).toBe(cycles);
    });
  });

  describe("reuse of worker ID", () => {
    it("should allow reusing worker ID after termination", async () => {
      // First spawn
      const handle1 = await spawnWorker(manager, "reuse-id", "echo-worker.ts");
      const pid1 = handle1.pid;

      await manager.terminate("reuse-id");

      // Small delay to ensure process is fully cleaned up
      await delay(50);

      // Second spawn with same ID
      const handle2 = await spawnWorker(manager, "reuse-id", "echo-worker.ts");
      const pid2 = handle2.pid;

      // Should be a new process
      expect(pid2).not.toBe(pid1);
      expect(handle2.state).toBe("running");
    });

    it("should handle multiple reuses of same ID", async () => {
      const pids: (number | null)[] = [];

      for (let i = 0; i < 5; i++) {
        const handle = await spawnWorker(manager, "multi-reuse", "echo-worker.ts");
        pids.push(handle.pid);
        await manager.terminate("multi-reuse");

        // Small delay to ensure process is fully cleaned up before reusing ID
        await delay(50);
      }

      // Each spawn should create a new process (different PIDs)
      const uniquePids = new Set(pids.filter((p) => p !== null));
      expect(uniquePids.size).toBe(5);
    });
  });

  describe("parallel spawn/terminate", () => {
    it("should handle parallel spawns of different workers", async () => {
      const spawns = Array.from({ length: 5 }, (_, i) =>
        spawnWorker(manager, `parallel-spawn-${i}`, "echo-worker.ts"),
      );

      const handles = await Promise.all(spawns);

      expect(handles.length).toBe(5);
      handles.forEach((h) => expect(h.state).toBe("running"));

      // Parallel terminates
      await Promise.all(handles.map((_, i) => manager.terminate(`parallel-spawn-${i}`)));

      handles.forEach((_, i) => {
        expect(manager.isRunning(`parallel-spawn-${i}`)).toBe(false);
      });
    });

    it("should handle interleaved spawn and terminate", async () => {
      const ops: Promise<unknown>[] = [];

      // Spawn first batch
      for (let i = 0; i < 3; i++) {
        ops.push(spawnWorker(manager, `interleave-${i}`, "echo-worker.ts"));
      }

      await Promise.all(ops);

      // Interleave: terminate some, spawn others
      const termPromise = manager.terminate("interleave-0");
      const spawnPromise = spawnWorker(manager, "interleave-3", "echo-worker.ts");

      await Promise.all([termPromise, spawnPromise]);

      expect(manager.isRunning("interleave-0")).toBe(false);
      expect(manager.isRunning("interleave-1")).toBe(true);
      expect(manager.isRunning("interleave-3")).toBe(true);
    });
  });

  describe("crash and respawn", () => {
    it("should respawn after worker crash", async () => {
      // First spawn
      const handle1 = await spawnWorker(manager, "crash-respawn", "crash-worker.ts");

      // Cause crash
      handle1.request("exit", { code: 1 }).catch(() => {
        // Expected
      });

      // Wait for crash
      await delay(500);
      expect(manager.isRunning("crash-respawn")).toBe(false);

      // Respawn
      const handle2 = await spawnWorker(manager, "crash-respawn", "crash-worker.ts");
      expect(handle2.state).toBe("running");

      // New worker should be functional
      const result = await handle2.request("echo", { respawned: true });
      expect(result).toEqual({ respawned: true });
    });

    it("should handle rapid crash and respawn cycles", async () => {
      for (let i = 0; i < 3; i++) {
        const handle = await spawnWorker(manager, "rapid-crash", "crash-worker.ts");

        // Verify functional
        const result = await handle.request("echo", { cycle: i });
        expect(result).toEqual({ cycle: i });

        // Cause crash
        handle.request("exit", { code: 1 }).catch(() => {});

        // Wait for exit
        await delay(300);
      }
    });
  });

  describe("stress recovery", () => {
    it("should recover from multiple terminated workers", async () => {
      // Spawn 10 workers
      const handles = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          spawnWorker(manager, `stress-${i}`, "echo-worker.ts"),
        ),
      );

      // Terminate all
      await manager.terminateAll();

      // Respawn all
      const newHandles = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          spawnWorker(manager, `stress-${i}`, "echo-worker.ts"),
        ),
      );

      // All should be functional
      const results = await Promise.all(
        newHandles.map((h, i) => h.request("echo", { recovered: i })),
      );

      results.forEach((r, i) => {
        expect(r).toEqual({ recovered: i });
      });
    });
  });
});
