/**
 * Lifecycle tests: Crash and Recovery
 *
 * Tests worker crash scenarios and automatic restart behavior.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProcessManager } from "@procwire/transport";
import { spawnWorker, delay, createDeferred } from "../../utils/test-helpers.js";

describe("Worker Lifecycle - Crash and Recovery", () => {
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

  describe("crash detection", () => {
    it("should detect worker exit", async () => {
      const { promise, resolve } = createDeferred<{
        id: string;
        code: number | null;
        signal: string | null;
      }>();
      manager.on("exit", resolve);

      const handle = await spawnWorker(manager, "crash-exit-worker", "crash-worker.ts");

      // Tell worker to exit
      await handle.request("exit", { code: 0 }).catch(() => {
        // Expected to fail as worker exits
      });

      const event = await promise;
      expect(event.id).toBe("crash-exit-worker");
    });

    it("should detect worker crash with non-zero exit code", async () => {
      const { promise, resolve } = createDeferred<{
        id: string;
        code: number | null;
        signal: string | null;
      }>();
      manager.on("exit", resolve);

      const handle = await spawnWorker(manager, "crash-code-worker", "crash-worker.ts");

      // Tell worker to exit with error code
      await handle.request("exit", { code: 1 }).catch(() => {
        // Expected to fail
      });

      const event = await promise;
      expect(event.id).toBe("crash-code-worker");
      expect(event.code).toBe(1);
    });

    it("should handle delayed worker exit", async () => {
      const { promise, resolve } = createDeferred<{
        id: string;
        code: number | null;
        signal: string | null;
      }>();
      manager.on("exit", resolve);

      const handle = await spawnWorker(manager, "crash-delayed-worker", "crash-worker.ts");

      // Tell worker to exit after delay
      handle.request("exit_delayed", { code: 0, delay: 200 }).catch(() => {
        // Expected to fail
      });

      const event = await promise;
      expect(event.id).toBe("crash-delayed-worker");
    });
  });

  describe("restart policy", () => {
    it("should restart worker when restart policy is enabled", async () => {
      const restartManager = new ProcessManager({
        defaultTimeout: 10000,
        restartPolicy: { enabled: true, maxRestarts: 3, backoffMs: 100 },
        gracefulShutdownMs: 5000,
      });

      try {
        const restartEvents: { id: string; attempt: number }[] = [];
        restartManager.on("restart", (event) => {
          restartEvents.push(event);
        });

        const handle = await spawnWorker(restartManager, "restart-worker", "crash-worker.ts");

        // Tell worker to exit
        handle.request("exit", { code: 1 }).catch(() => {
          // Expected
        });

        // Wait for restart attempt
        await delay(500);

        // Should have attempted restart
        expect(restartEvents.length).toBeGreaterThanOrEqual(1);
        expect(restartEvents[0]?.id).toBe("restart-worker");
      } finally {
        await restartManager.terminateAll();
      }
    });

    it("should not restart when restart policy is disabled", async () => {
      const restartEvents: { id: string; attempt: number }[] = [];
      manager.on("restart", (event) => {
        restartEvents.push(event);
      });

      const handle = await spawnWorker(manager, "no-restart-worker", "crash-worker.ts");

      // Tell worker to exit
      handle.request("exit", { code: 1 }).catch(() => {
        // Expected
      });

      // Wait a bit
      await delay(500);

      // Should not have restarted
      expect(restartEvents.length).toBe(0);
      expect(manager.isRunning("no-restart-worker")).toBe(false);
    });

    it("should respect maxRestarts limit", async () => {
      const maxRestarts = 2;
      const restartManager = new ProcessManager({
        defaultTimeout: 10000,
        restartPolicy: { enabled: true, maxRestarts, backoffMs: 50 },
        gracefulShutdownMs: 5000,
      });

      try {
        const restartEvents: { id: string; attempt: number }[] = [];
        restartManager.on("restart", (event) => {
          restartEvents.push(event);
        });

        const _handle = await spawnWorker(
          restartManager,
          "limited-restart-worker",
          "crash-worker.ts",
        );

        // Keep crashing the worker
        for (let i = 0; i < maxRestarts + 2; i++) {
          if (restartManager.isRunning("limited-restart-worker")) {
            const currentHandle = restartManager.getHandle("limited-restart-worker");
            if (currentHandle) {
              currentHandle.request("exit", { code: 1 }).catch(() => {
                // Expected
              });
            }
          }
          await delay(200);
        }

        // Wait for all restarts to complete
        await delay(500);

        // Should not exceed maxRestarts
        expect(restartEvents.length).toBeLessThanOrEqual(maxRestarts);
      } finally {
        await restartManager.terminateAll();
      }
    });
  });

  describe("error handling", () => {
    it("should emit error event on crash", async () => {
      const errors: { id: string; error: Error }[] = [];
      manager.on("error", (event) => {
        errors.push(event);
      });
      manager.on("crash", (event) => {
        errors.push(event);
      });

      const handle = await spawnWorker(manager, "error-emit-worker", "crash-worker.ts");

      // Cause crash
      handle.request("exit", { code: 1 }).catch(() => {
        // Expected
      });

      // Wait for error to be emitted
      await delay(500);

      // Worker should not be running
      expect(manager.isRunning("error-emit-worker")).toBe(false);
    });

    it("should handle communication failure after crash", async () => {
      const handle = await spawnWorker(manager, "comm-fail-worker", "crash-worker.ts");

      // Crash the worker
      handle.request("exit", { code: 1 }).catch(() => {
        // Expected
      });

      // Wait for crash
      await delay(200);

      // Subsequent requests should fail
      await expect(handle.request("echo", { test: true })).rejects.toThrow();
    });
  });
});
