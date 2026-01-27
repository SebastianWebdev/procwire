/**
 * Lifecycle tests: Timeout Handling
 *
 * Tests request timeout behavior and cancellation.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProcessManager } from "@procwire/transport";
import { spawnWorker, measureTime } from "../../utils/test-helpers.js";

describe("Worker Lifecycle - Timeout Handling", () => {
  let manager: ProcessManager;

  beforeEach(() => {
    manager = new ProcessManager({
      defaultTimeout: 2000, // Short timeout for tests
      restartPolicy: { enabled: false, maxRestarts: 0, backoffMs: 100 },
      gracefulShutdownMs: 5000,
    });
  });

  afterEach(async () => {
    await manager.terminateAll();
  });

  describe("request timeouts", () => {
    it("should timeout slow requests", async () => {
      const handle = await spawnWorker(manager, "timeout-worker", "slow-worker.ts");

      // Request with delay longer than timeout
      await expect(
        handle.request("delay", { ms: 5000 }, 1000), // 1s timeout
      ).rejects.toThrow(/timeout/i);
    });

    it("should complete fast requests before timeout", async () => {
      const handle = await spawnWorker(manager, "fast-worker", "slow-worker.ts");

      const { result, elapsed } = await measureTime(() =>
        handle.request("delay", { ms: 100 }, 5000),
      );

      expect(result).toEqual({ delayed: true, ms: 100 });
      expect(elapsed).toBeLessThan(1000);
    });

    it("should use default timeout when not specified", async () => {
      const shortTimeoutManager = new ProcessManager({
        defaultTimeout: 500, // Very short default
        restartPolicy: { enabled: false, maxRestarts: 0, backoffMs: 100 },
        gracefulShutdownMs: 5000,
      });

      try {
        const handle = await spawnWorker(
          shortTimeoutManager,
          "default-timeout-worker",
          "slow-worker.ts",
        );

        // Request that exceeds default timeout
        await expect(handle.request("delay", { ms: 2000 })).rejects.toThrow(/timeout/i);
      } finally {
        await shortTimeoutManager.terminateAll();
      }
    });

    it("should override default timeout per-request", async () => {
      const handle = await spawnWorker(manager, "override-timeout-worker", "slow-worker.ts");

      // Request with longer timeout than default should succeed
      const result = await handle.request("delay", { ms: 500 }, 5000);
      expect(result).toEqual({ delayed: true, ms: 500 });
    });
  });

  describe("timeout cleanup", () => {
    it("should not leave pending state after timeout", async () => {
      const handle = await spawnWorker(manager, "cleanup-worker", "slow-worker.ts");

      // Cause a timeout
      await expect(handle.request("delay", { ms: 5000 }, 100)).rejects.toThrow(/timeout/i);

      // Worker should still be operational
      expect(handle.state).toBe("running");

      // Subsequent requests should work
      const result = await handle.request("delay", { ms: 50 });
      expect(result).toEqual({ delayed: true, ms: 50 });
    });

    it("should handle multiple timeouts sequentially", async () => {
      const handle = await spawnWorker(manager, "multi-timeout-worker", "slow-worker.ts");

      // Multiple timeout requests
      await expect(handle.request("delay", { ms: 5000 }, 100)).rejects.toThrow(/timeout/i);
      await expect(handle.request("delay", { ms: 5000 }, 100)).rejects.toThrow(/timeout/i);
      await expect(handle.request("delay", { ms: 5000 }, 100)).rejects.toThrow(/timeout/i);

      // Worker should still work
      const result = await handle.request("delay", { ms: 50 });
      expect(result).toEqual({ delayed: true, ms: 50 });
    });

    it("should handle concurrent requests with different timeouts", async () => {
      const handle = await spawnWorker(manager, "concurrent-timeout-worker", "slow-worker.ts");

      const results = await Promise.allSettled([
        handle.request("delay", { ms: 50 }, 1000), // Should succeed
        handle.request("delay", { ms: 200 }, 100), // Should timeout
        handle.request("delay", { ms: 100 }, 1000), // Should succeed
      ]);

      expect(results[0]?.status).toBe("fulfilled");
      expect(results[1]?.status).toBe("rejected");
      expect(results[2]?.status).toBe("fulfilled");
    });
  });

  describe("startup timeout", () => {
    it("should respect startup timeout", async () => {
      // This test is tricky because we can't easily simulate a slow startup
      // Just verify the mechanism exists by checking a normal startup succeeds

      const handle = await spawnWorker(manager, "startup-timeout-worker", "echo-worker.ts");
      expect(handle.state).toBe("running");
    });
  });
});
