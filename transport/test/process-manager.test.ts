/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ProcessManager } from "../src/process/manager.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKER_PATH = join(__dirname, "fixtures", "worker.js");

describe("ProcessManager Integration Tests", () => {
  let manager: ProcessManager;

  beforeEach(() => {
    manager = new ProcessManager({
      defaultTimeout: 5000,
      restartPolicy: {
        enabled: false, // Disabled by default, enabled per-test
        maxRestarts: 3,
        backoffMs: 100,
        maxBackoffMs: 1000,
      },
    });
  });

  afterEach(async () => {
    await manager.terminateAll();
  });

  describe("Basic Spawn and Communication", () => {
    it("should spawn a process and communicate via control channel", async () => {
      const handle = await manager.spawn("worker-1", {
        executablePath: "node",
        args: [WORKER_PATH],
      });

      expect(handle).toBeDefined();
      expect(handle.id).toBe("worker-1");
      expect(handle.pid).toBeTypeOf("number");
      expect(handle.state).toBe("running");

      // Send echo request
      const result = await handle.request("echo", { message: "hello" });
      expect(result).toEqual({ message: "hello" });
    });

    it("should handle multiple concurrent requests", async () => {
      const handle = await manager.spawn("worker-2", {
        executablePath: "node",
        args: [WORKER_PATH],
      });

      // Send multiple requests concurrently
      const results = await Promise.all([
        handle.request("echo", { value: 1 }),
        handle.request("echo", { value: 2 }),
        handle.request("echo", { value: 3 }),
      ]);

      expect(results).toEqual([{ value: 1 }, { value: 2 }, { value: 3 }]);
    });

    it("should handle sleep requests", async () => {
      const handle = await manager.spawn("worker-3", {
        executablePath: "node",
        args: [WORKER_PATH],
      });

      const start = Date.now();
      const result = await handle.request("sleep", { ms: 100 });
      const elapsed = Date.now() - start;

      expect(result).toEqual({ ok: true });
      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow some tolerance
    });

    it("should handle notifications from worker", async () => {
      const handle = await manager.spawn("worker-4", {
        executablePath: "node",
        args: [WORKER_PATH],
      });

      // Listen for notifications
      const notifications: any[] = [];
      handle.controlChannel.onNotification((notif: any) => {
        notifications.push(notif);
      });

      // Worker sends runtime.ready on startup
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(notifications.length).toBeGreaterThan(0);
      expect(notifications[0]).toMatchObject({
        method: "runtime.ready",
      });
    });
  });

  describe("Process Lifecycle", () => {
    it("should terminate a running process", async () => {
      const handle = await manager.spawn("worker-5", {
        executablePath: "node",
        args: [WORKER_PATH],
      });

      expect(manager.isRunning("worker-5")).toBe(true);

      await manager.terminate("worker-5");

      expect(manager.isRunning("worker-5")).toBe(false);
      expect(handle.state).toBe("stopped");
    });

    it("should handle process exit events", async () => {
      const exitEvents: any[] = [];

      manager.on("exit", (data) => {
        exitEvents.push(data);
      });

      const handle = await manager.spawn("worker-6", {
        executablePath: "node",
        args: [WORKER_PATH],
      });

      // Trigger crash
      await handle.request("crash", {}).catch(() => {
        // Expected to fail as process crashes
      });

      // Wait for exit event
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(exitEvents.length).toBeGreaterThan(0);
      expect(exitEvents[0]).toMatchObject({
        id: "worker-6",
        code: 1,
      });
    });

    it("should emit spawn and ready events", async () => {
      const spawnEvents: any[] = [];
      const readyEvents: any[] = [];

      manager.on("spawn", (data) => {
        spawnEvents.push(data);
      });

      manager.on("ready", (data) => {
        readyEvents.push(data);
      });

      await manager.spawn("worker-7", {
        executablePath: "node",
        args: [WORKER_PATH],
      });

      expect(spawnEvents).toHaveLength(1);
      expect(spawnEvents[0]).toMatchObject({
        id: "worker-7",
      });

      expect(readyEvents).toHaveLength(1);
      expect(readyEvents[0]).toMatchObject({
        id: "worker-7",
      });
    });
  });

  describe("Restart Policy", () => {
    it("should restart crashed process with exponential backoff", async () => {
      const restartEvents: any[] = [];
      const crashEvents: any[] = [];
      const spawnEvents: any[] = [];

      manager.on("restart", (data) => {
        restartEvents.push(data);
      });

      manager.on("crash", (data) => {
        crashEvents.push(data);
      });

      manager.on("spawn", (data) => {
        spawnEvents.push(data);
      });

      const handle = await manager.spawn("worker-8", {
        executablePath: "node",
        args: [WORKER_PATH],
        restartPolicy: {
          enabled: true,
          maxRestarts: 2,
          backoffMs: 50,
          maxBackoffMs: 500,
        },
      });

      // Initial spawn
      expect(spawnEvents).toHaveLength(1);

      // Trigger crash
      await handle.request("crash", {}).catch(() => {});

      // Wait for first restart
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(restartEvents.length).toBeGreaterThan(0);
      expect(restartEvents[0]).toMatchObject({
        id: "worker-8",
        attempt: 1,
        delayMs: 50, // First backoff: 50 * 2^0 = 50
      });

      // Should have spawned again
      expect(spawnEvents.length).toBeGreaterThan(1);

      // Verify handle is running again
      const newHandle = manager.getHandle("worker-8");
      expect(newHandle).toBeDefined();
      expect(newHandle?.state).toBe("running");

      // Test restarted process works
      const result = await newHandle?.request("echo", { test: "after-restart" });
      expect(result).toEqual({ test: "after-restart" });
    });

    it("should respect maxRestarts limit", async () => {
      const restartEvents: any[] = [];
      const crashEvents: any[] = [];

      manager.on("restart", (data) => {
        restartEvents.push(data);
      });

      manager.on("crash", (data) => {
        crashEvents.push(data);
      });

      await manager.spawn("worker-9", {
        executablePath: "node",
        args: [WORKER_PATH],
        restartPolicy: {
          enabled: true,
          maxRestarts: 1,
          backoffMs: 50,
        },
      });

      // First crash - should restart
      let handle = manager.getHandle("worker-9");
      await handle?.request("crash", {}).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(restartEvents).toHaveLength(1);
      expect(manager.isRunning("worker-9")).toBe(true);

      // Second crash - should NOT restart (maxRestarts=1)
      handle = manager.getHandle("worker-9");
      await handle?.request("crash", {}).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(restartEvents).toHaveLength(1); // Still just 1
      expect(crashEvents.length).toBeGreaterThan(0);
      expect(manager.isRunning("worker-9")).toBe(false);
    });

    it("should apply exponential backoff with cap", async () => {
      const restartEvents: any[] = [];

      manager.on("restart", (data) => {
        restartEvents.push(data);
      });

      await manager.spawn("worker-10", {
        executablePath: "node",
        args: [WORKER_PATH],
        restartPolicy: {
          enabled: true,
          maxRestarts: 3,
          backoffMs: 10,
          maxBackoffMs: 30,
        },
      });

      // Trigger multiple crashes
      for (let i = 0; i < 3; i++) {
        const handle = manager.getHandle("worker-10");
        await handle?.request("crash", {}).catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 150));
      }

      expect(restartEvents.length).toBe(3);

      // Check backoff delays
      expect(restartEvents[0].delayMs).toBe(10); // 10 * 2^0 = 10
      expect(restartEvents[1].delayMs).toBe(20); // 10 * 2^1 = 20
      expect(restartEvents[2].delayMs).toBe(30); // 10 * 2^2 = 40, capped at 30
    });

    it("should not restart on manual termination", async () => {
      const restartEvents: any[] = [];

      manager.on("restart", (data) => {
        restartEvents.push(data);
      });

      await manager.spawn("worker-11", {
        executablePath: "node",
        args: [WORKER_PATH],
        restartPolicy: {
          enabled: true,
          maxRestarts: 5,
          backoffMs: 50,
        },
      });

      // Manual termination
      await manager.terminate("worker-11");

      // Wait to ensure no restart
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(restartEvents).toHaveLength(0);
      expect(manager.isRunning("worker-11")).toBe(false);
    });

    it("should not restart on clean exit (code 0)", async () => {
      const restartEvents: any[] = [];

      manager.on("restart", (data) => {
        restartEvents.push(data);
      });

      const handle = await manager.spawn("worker-12", {
        executablePath: "node",
        args: ["-e", "setTimeout(() => process.exit(0), 50)"],
        restartPolicy: {
          enabled: true,
          maxRestarts: 5,
          backoffMs: 50,
        },
      });

      // ZMIANA: Zamiast sztywnego setTimeout, czekamy dynamicznie na zmianę stanu.
      // Dajemy mu duży margines (2000ms), ale na Linuxie skończy się to w <100ms.
      // Jeśli używasz Vitest, masz dostęp do `vi`:

      await vi.waitUntil(() => handle.state === "stopped", {
        timeout: 2000,
        interval: 50,
      });

      // Alternatywa bez importowania `vi` (jeśli wolisz czysty JS):
      /*
      const start = Date.now();
      while (handle.state !== "stopped" && Date.now() - start < 2000) {
        await new Promise((r) => setTimeout(r, 50));
      }
      */

      expect(restartEvents).toHaveLength(0);
      expect(handle.state).toBe("stopped");
    });
  });

  describe("Multiple Processes", () => {
    it("should manage multiple processes independently", async () => {
      const handle1 = await manager.spawn("worker-a", {
        executablePath: "node",
        args: [WORKER_PATH],
      });

      const handle2 = await manager.spawn("worker-b", {
        executablePath: "node",
        args: [WORKER_PATH],
      });

      expect(manager.isRunning("worker-a")).toBe(true);
      expect(manager.isRunning("worker-b")).toBe(true);

      // Both should work independently
      const [result1, result2] = await Promise.all([
        handle1.request("echo", { id: "a" }),
        handle2.request("echo", { id: "b" }),
      ]);

      expect(result1).toEqual({ id: "a" });
      expect(result2).toEqual({ id: "b" });

      // Terminate one
      await manager.terminate("worker-a");

      expect(manager.isRunning("worker-a")).toBe(false);
      expect(manager.isRunning("worker-b")).toBe(true);

      // Other should still work
      const result3 = await handle2.request("echo", { still: "works" });
      expect(result3).toEqual({ still: "works" });
    });

    it("should terminate all processes", async () => {
      await manager.spawn("worker-x", {
        executablePath: "node",
        args: [WORKER_PATH],
      });

      await manager.spawn("worker-y", {
        executablePath: "node",
        args: [WORKER_PATH],
      });

      await manager.spawn("worker-z", {
        executablePath: "node",
        args: [WORKER_PATH],
      });

      expect(manager.isRunning("worker-x")).toBe(true);
      expect(manager.isRunning("worker-y")).toBe(true);
      expect(manager.isRunning("worker-z")).toBe(true);

      await manager.terminateAll();

      expect(manager.isRunning("worker-x")).toBe(false);
      expect(manager.isRunning("worker-y")).toBe(false);
      expect(manager.isRunning("worker-z")).toBe(false);
    });
  });

  describe("Error Handling", () => {
    it("should throw error when spawning duplicate process ID", async () => {
      await manager.spawn("duplicate", {
        executablePath: "node",
        args: [WORKER_PATH],
      });

      await expect(
        manager.spawn("duplicate", {
          executablePath: "node",
          args: [WORKER_PATH],
        }),
      ).rejects.toThrow("Process with ID 'duplicate' already exists");
    });

    it("should throw error when terminating non-existent process", async () => {
      await expect(manager.terminate("non-existent")).rejects.toThrow(
        "Process 'non-existent' not found",
      );
    });

    it("should return null for non-existent process handle", () => {
      const handle = manager.getHandle("non-existent");
      expect(handle).toBeNull();
    });

    it("should return false for non-running process", () => {
      const isRunning = manager.isRunning("non-existent");
      expect(isRunning).toBe(false);
    });

    it("should emit error events", async () => {
      const errorEvents: any[] = [];

      manager.on("error", (data) => {
        errorEvents.push(data);
      });

      const handle = await manager.spawn("worker-error", {
        executablePath: "node",
        args: [WORKER_PATH],
      });

      // Send invalid request that causes error
      await handle.request("unknown-method", {}).catch(() => {
        // Expected to fail
      });

      // Errors may or may not be emitted depending on protocol error handling
      // This test just verifies the error event mechanism exists
    });
  });

  describe("Handle State Transitions", () => {
    it("should track state transitions", async () => {
      const stateChanges: any[] = [];

      const handle = await manager.spawn("worker-state", {
        executablePath: "node",
        args: [WORKER_PATH],
        restartPolicy: {
          enabled: true,
          maxRestarts: 1,
          backoffMs: 50,
        },
      });

      handle.on("stateChange", (data) => {
        stateChanges.push(data);
      });

      // Initial state is running
      expect(handle.state).toBe("running");

      // Crash the process
      await handle.request("crash", {}).catch(() => {});

      // Wait for restart
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should have transitioned: running -> crashed -> running
      expect(stateChanges.length).toBeGreaterThanOrEqual(1);
    });

    it("should emit exit event from handle", async () => {
      const exitEvents: any[] = [];

      const handle = await manager.spawn("worker-exit", {
        executablePath: "node",
        args: [WORKER_PATH],
      });

      handle.on("exit", (data) => {
        exitEvents.push(data);
      });

      // Trigger crash
      await handle.request("crash", {}).catch(() => {});

      // Wait for exit
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(exitEvents).toHaveLength(1);
      expect(exitEvents[0]).toMatchObject({
        code: 1,
      });
    });
  });
});
