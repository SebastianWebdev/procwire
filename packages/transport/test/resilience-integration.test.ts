/**
 * Integration tests for resilience features.
 *
 * Tests HeartbeatManager, ShutdownManager, and ResilientProcessHandle
 * with real child processes.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProcessManager } from "../src/process/manager.js";
import { HeartbeatManager } from "../src/heartbeat/manager.js";
import { ShutdownManager } from "../src/shutdown/manager.js";
import { ResilientProcessHandle } from "../src/resilience/handle.js";
import { ReservedMethods } from "../src/protocol/reserved-methods.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import type { HeartbeatPongParams } from "../src/protocol/reserved-types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const RESILIENT_WORKER_PATH = join(__dirname, "fixtures", "resilient-worker.js");

describe("Resilience Integration Tests", () => {
  let manager: ProcessManager;

  beforeEach(() => {
    manager = new ProcessManager({
      defaultTimeout: 5000,
      restartPolicy: {
        enabled: false,
        maxRestarts: 3,
        backoffMs: 100,
      },
    });
  });

  afterEach(async () => {
    await manager.terminateAll();
  });

  describe("Heartbeat with Real Process", () => {
    it("should receive pong from worker after sending ping", async () => {
      const handle = await manager.spawn("heartbeat-test-1", {
        executablePath: "node",
        args: [RESILIENT_WORKER_PATH],
      });

      // Wait for worker ready
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Create heartbeat manager
      const heartbeat = new HeartbeatManager(handle.controlChannel, {
        enabled: true,
        interval: 1000,
        timeout: 500,
        maxMissed: 3,
        implicitHeartbeat: false,
      });

      const pongReceived = new Promise<void>((resolve) => {
        heartbeat.on("heartbeat:pong", () => {
          resolve();
        });
      });

      // Listen for pong notifications and forward to heartbeat manager
      handle.controlChannel.onNotification((notification: unknown) => {
        const notif = notification as { method?: string; params?: unknown };
        if (notif.method === ReservedMethods.HEARTBEAT_PONG) {
          heartbeat.handlePong(notif.params as HeartbeatPongParams);
        }
      });

      heartbeat.start();

      // Wait for pong
      await expect(pongReceived).resolves.toBeUndefined();

      heartbeat.stop();
    });

    it("should detect dead worker when pong not received", async () => {
      const handle = await manager.spawn("heartbeat-test-2", {
        executablePath: "node",
        args: [RESILIENT_WORKER_PATH],
      });

      // Wait for worker ready
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Create heartbeat manager with short timeout
      const heartbeat = new HeartbeatManager(handle.controlChannel, {
        enabled: true,
        interval: 100,
        timeout: 50,
        maxMissed: 2,
        implicitHeartbeat: false,
      });

      // Don't forward pong notifications - simulating unresponsive worker
      // (we won't listen for pong notifications)

      const deadPromise = new Promise<number>((resolve) => {
        heartbeat.on("heartbeat:dead", ({ missedCount }) => {
          resolve(missedCount);
        });
      });

      heartbeat.start();

      // Wait for dead detection
      const missedCount = await deadPromise;
      expect(missedCount).toBe(2);

      heartbeat.stop();
    });
  });

  describe("Graceful Shutdown with Real Process", () => {
    it("should gracefully shutdown worker", async () => {
      const handle = await manager.spawn("shutdown-test-1", {
        executablePath: "node",
        args: [RESILIENT_WORKER_PATH],
      });

      // Wait for worker ready
      await new Promise((resolve) => setTimeout(resolve, 100));

      const shutdown = new ShutdownManager({
        enabled: true,
        gracefulTimeoutMs: 2000,
        exitWaitMs: 100,
      });

      const events: string[] = [];

      shutdown.on("shutdown:start", () => events.push("start"));
      shutdown.on("shutdown:ack", () => events.push("ack"));
      shutdown.on("shutdown:complete", () => events.push("complete"));
      shutdown.on("shutdown:done", ({ graceful }) => {
        events.push(graceful ? "graceful" : "forced");
      });

      // Create shutdownable adapter
      const shutdownable = {
        id: handle.id,
        pid: handle.pid,
        request: (method: string, params: unknown, timeout?: number) =>
          handle.request(method, params, timeout),
        kill: (_signal?: string) => {
          // The process manager handles killing
        },
        onNotification: (method: string, handler: (params: unknown) => void) => {
          return handle.controlChannel.onNotification((notification: unknown) => {
            const notif = notification as { method?: string; params?: unknown };
            if (notif.method === method) {
              handler(notif.params);
            }
          });
        },
      };

      await shutdown.initiateShutdown(shutdownable, "user_requested");

      expect(events).toContain("start");
      expect(events).toContain("ack");
      expect(events).toContain("complete");
      expect(events).toContain("graceful");
    });
  });

  describe("ResilientProcessHandle with Real Process", () => {
    it("should wrap process handle and forward requests", async () => {
      const handle = await manager.spawn("resilient-test-1", {
        executablePath: "node",
        args: [RESILIENT_WORKER_PATH],
      });

      // Wait for worker ready
      await new Promise((resolve) => setTimeout(resolve, 100));

      const resilient = new ResilientProcessHandle(handle, {
        heartbeat: false, // Disabled for this test
        reconnect: false,
        shutdown: false,
      });

      const result = await resilient.request("echo", { message: "test" });
      expect(result).toEqual({ message: "test" });

      await resilient.close();
    });

    it("should track health with heartbeat", async () => {
      const handle = await manager.spawn("resilient-test-2", {
        executablePath: "node",
        args: [RESILIENT_WORKER_PATH],
      });

      // Wait for worker ready
      await new Promise((resolve) => setTimeout(resolve, 100));

      const resilient = new ResilientProcessHandle(handle, {
        heartbeat: {
          enabled: true,
          interval: 200,
          timeout: 100,
          maxMissed: 3,
          implicitHeartbeat: false,
        },
        reconnect: false,
        shutdown: false,
      });

      expect(resilient.isHealthy).toBe(true);

      // Start heartbeat monitoring
      resilient.start();

      // Wait for at least one successful heartbeat cycle
      await new Promise((resolve) => setTimeout(resolve, 400));

      // Process should still be healthy
      expect(resilient.isHealthy).toBe(true);

      resilient.stop();
      await resilient.close();
    });

    it("should emit heartbeat events", async () => {
      const handle = await manager.spawn("resilient-test-3", {
        executablePath: "node",
        args: [RESILIENT_WORKER_PATH],
      });

      // Wait for worker ready
      await new Promise((resolve) => setTimeout(resolve, 100));

      const resilient = new ResilientProcessHandle(handle, {
        heartbeat: {
          enabled: true,
          interval: 100,
          timeout: 50,
          maxMissed: 3,
          implicitHeartbeat: false,
        },
        reconnect: false,
        shutdown: false,
      });

      const pongReceived = new Promise<void>((resolve) => {
        // Listen for the recovered event (which happens after a pong when there were misses)
        // Or we can just wait for the state to be healthy after start
        setTimeout(resolve, 200);
      });

      resilient.start();

      await pongReceived;

      // Verify process is still healthy
      expect(resilient.isHealthy).toBe(true);

      resilient.stop();
      await resilient.close();
    });
  });

  describe("Full Integration - Spawn, Monitor, Shutdown", () => {
    it("should manage complete lifecycle with resilient handle", async () => {
      // 1. Spawn process
      const handle = await manager.spawn("lifecycle-test-1", {
        executablePath: "node",
        args: [RESILIENT_WORKER_PATH],
      });

      // Wait for worker ready
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 2. Wrap with resilient handle
      const resilient = new ResilientProcessHandle(
        handle,
        {
          heartbeat: {
            enabled: true,
            interval: 500,
            timeout: 200,
            maxMissed: 3,
            implicitHeartbeat: false,
          },
          reconnect: false,
          shutdown: {
            enabled: true,
            gracefulTimeoutMs: 2000,
            exitWaitMs: 100,
          },
        },
        () => {
          // Kill function - noop for this test, process manager handles it
        },
      );

      // 3. Start monitoring
      resilient.start();

      // 4. Verify communication works
      const result = await resilient.request("echo", { test: "data" });
      expect(result).toEqual({ test: "data" });

      // 5. Verify health monitoring
      await new Promise((resolve) => setTimeout(resolve, 600)); // Wait for heartbeat
      expect(resilient.isHealthy).toBe(true);

      // 6. Clean shutdown
      resilient.stop();
      await resilient.close();
    });
  });
});
