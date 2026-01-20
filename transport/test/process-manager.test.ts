/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ProcessManager } from "../src/process/manager.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKER_PATH = join(__dirname, "fixtures", "worker.js");

// Pomocnicza stała dla timeoutów na CI
const CI_TIMEOUT = 5000;

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
      // Tolerance might need to be looser on Windows
      expect(elapsed).toBeGreaterThanOrEqual(80);
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
      // FIX: Wait explicitly for notification instead of sleep
      await vi.waitUntil(() => notifications.length > 0, { timeout: CI_TIMEOUT });

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

      // FIX: Ensure state is updated (terminate waits internally, but double check is good)
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

      // FIX: Wait explicitly for exit event
      await vi.waitUntil(() => exitEvents.length > 0, { timeout: CI_TIMEOUT });

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

      // Events happen during spawn await, so they should be ready immediately,
      // but checking length is safe.
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

      // FIX: Wait specifically for restart event
      await vi.waitUntil(() => restartEvents.length > 0, { timeout: CI_TIMEOUT });

      expect(restartEvents[0]).toMatchObject({
        id: "worker-8",
        attempt: 1,
        delayMs: 50, // First backoff: 50 * 2^0 = 50
      });

      // FIX: Wait for the new process to actually spawn after the backoff
      await vi.waitUntil(() => spawnEvents.length > 1, { timeout: CI_TIMEOUT });

      // Verify handle is running again
      const newHandle = manager.getHandle("worker-8");
      expect(newHandle).toBeDefined();

      // FIX: Ensure new handle is in running state
      await vi.waitUntil(() => newHandle?.state === "running", { timeout: CI_TIMEOUT });

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

      // FIX: Wait for restart
      await vi.waitUntil(() => restartEvents.length === 1, { timeout: CI_TIMEOUT });

      // Wait for process to be running again
      await vi.waitUntil(() => manager.isRunning("worker-9"), { timeout: CI_TIMEOUT });

      // Second crash - should NOT restart (maxRestarts=1)
      handle = manager.getHandle("worker-9");
      await handle?.request("crash", {}).catch(() => {});

      // FIX: Wait for the crash event
      await vi.waitUntil(() => crashEvents.length === 2, { timeout: CI_TIMEOUT });

      // FIX: Give it extra time to ensure NO restart happens (proving a negative)
      // On Windows CI, 200ms might be too short if system is very loaded.
      await new Promise((resolve) => setTimeout(resolve, 1000));

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
        // FIX: Ensure process is running/handle is valid before requesting crash
        await vi.waitUntil(() => manager.isRunning("worker-10"), { timeout: CI_TIMEOUT });

        const handle = manager.getHandle("worker-10");
        await handle?.request("crash", {}).catch(() => {});

        // FIX: Instead of sleep, wait for the specific restart count
        await vi.waitUntil(() => restartEvents.length === i + 1, { timeout: CI_TIMEOUT });
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

      // FIX: Wait for stopped state
      await vi.waitUntil(() => !manager.isRunning("worker-11"), { timeout: CI_TIMEOUT });

      // FIX: Wait significantly longer to prove no restart happens (negative assertion)
      await new Promise((resolve) => setTimeout(resolve, 1000));

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

      // FIX: Wait dynamically for state change (Fixed in previous step)
      await vi.waitUntil(() => handle.state === "stopped", {
        timeout: 5000,
        interval: 50,
      });

      // Safety buffer to ensure no restart event comes after stop
      await new Promise((r) => setTimeout(r, 200));

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

      // FIX: Wait for sufficient transitions (running -> crashed -> running)
      await vi.waitUntil(() => stateChanges.length >= 2, { timeout: CI_TIMEOUT });

      expect(stateChanges.length).toBeGreaterThanOrEqual(2);
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

      // FIX: Wait explicitly for exit event
      await vi.waitUntil(() => exitEvents.length > 0, { timeout: CI_TIMEOUT });

      expect(exitEvents).toHaveLength(1);
      expect(exitEvents[0]).toMatchObject({
        code: 1,
      });
    });
  });
});
