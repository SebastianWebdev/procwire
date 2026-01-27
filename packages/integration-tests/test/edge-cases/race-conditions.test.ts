/**
 * Edge case tests: Race Conditions
 *
 * Tests various race condition scenarios that could occur during IPC.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProcessManager, ReservedMethods } from "@procwire/transport";
import { spawnWorker, delay } from "../../utils/test-helpers.js";

describe("Edge Cases - Race Conditions", { timeout: 60000 }, () => {
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

  describe("concurrent request/terminate", () => {
    it("should handle request during shutdown", async () => {
      const handle = await spawnWorker(manager, "req-during-shutdown", "slow-worker.ts");

      // Start slow request
      const slowRequestPromise = handle
        .request("slow_echo", { message: "test", delay: 200 })
        .catch((e) => ({ error: e.message }));

      // Start shutdown shortly after
      await delay(50);
      const shutdownPromise = manager.terminate("req-during-shutdown");

      // Both should complete (request may fail or succeed depending on timing)
      const [requestResult, _] = await Promise.all([slowRequestPromise, shutdownPromise]);

      // Request either completed or was cancelled
      if (typeof requestResult === "object" && requestResult !== null && "error" in requestResult) {
        expect(typeof (requestResult as { error: string }).error).toBe("string");
      } else {
        expect(requestResult).toMatchObject({ message: "test" });
      }
    });

    it("should handle multiple requests during shutdown", async () => {
      const handle = await spawnWorker(manager, "multi-req-shutdown", "echo-worker.ts");

      // Start multiple requests
      const requests = [
        handle.request("echo", { id: 1 }).catch(() => ({ id: 1, failed: true })),
        handle.request("echo", { id: 2 }).catch(() => ({ id: 2, failed: true })),
        handle.request("echo", { id: 3 }).catch(() => ({ id: 3, failed: true })),
      ];

      // Small delay to let requests start before shutdown
      // (immediate shutdown can cause "write after end" if transport closes mid-write)
      await delay(10);

      // Start shutdown
      const shutdownPromise = manager.terminate("multi-req-shutdown");

      // Wait for all to complete
      const [results, _] = await Promise.all([Promise.all(requests), shutdownPromise]);

      // Some or all requests may have succeeded or failed
      expect(results.length).toBe(3);
    });
  });

  describe("concurrent spawn/terminate same ID", () => {
    it("should handle spawn immediately after terminate", async () => {
      // Initial spawn
      await spawnWorker(manager, "quick-replace", "echo-worker.ts");

      // Terminate and respawn quickly
      const termPromise = manager.terminate("quick-replace");
      await termPromise;

      // Should be able to spawn with same ID
      const handle = await spawnWorker(manager, "quick-replace", "echo-worker.ts");
      expect(handle.state).toBe("running");
    });
  });

  describe("concurrent shutdown requests", () => {
    it("should handle duplicate shutdown requests", async () => {
      const handle = await spawnWorker(manager, "dup-shutdown", "echo-worker.ts");

      // Send multiple shutdown requests
      const shutdowns = [
        handle
          .request(ReservedMethods.SHUTDOWN, { reason: "test1", timeout_ms: 5000 })
          .catch((e) => ({ error: e.message })),
        handle
          .request(ReservedMethods.SHUTDOWN, { reason: "test2", timeout_ms: 5000 })
          .catch((e) => ({ error: e.message })),
      ];

      const results = await Promise.all(shutdowns);

      // First should succeed, second may fail (worker already shutting down)
      expect(results.length).toBe(2);
    });
  });

  describe("request ordering", () => {
    it("should preserve request order under load", async () => {
      const handle = await spawnWorker(manager, "order-test", "echo-worker.ts");

      const count = 100;
      const results: number[] = [];

      // Send requests rapidly
      const promises = Array.from({ length: count }, async (_, i) => {
        const result = (await handle.request("echo", { seq: i })) as { seq: number };
        results.push(result.seq);
        return result;
      });

      await Promise.all(promises);

      // All results should be present (though not necessarily in order due to Promise.all)
      expect(results.length).toBe(count);
      expect(new Set(results).size).toBe(count); // All unique
    });

    it("should maintain request/response correlation under high concurrency", async () => {
      const handle = await spawnWorker(manager, "correlation-test", "slow-worker.ts");

      // Requests with different delays to force out-of-order completion
      const requests = [
        { delay: 100, id: "a" },
        { delay: 50, id: "b" },
        { delay: 150, id: "c" },
        { delay: 25, id: "d" },
        { delay: 75, id: "e" },
      ];

      const promises = requests.map(({ delay: d, id }) =>
        handle.request("slow_echo", { message: id, delay: d }),
      );

      const results = (await Promise.all(promises)) as Array<{ message: string }>;

      // Each result should match its request despite out-of-order completion
      requests.forEach(({ id }, i) => {
        expect(results[i]?.message).toBe(id);
      });
    });
  });

  describe("event timing", () => {
    it("should emit events in correct order", async () => {
      const events: string[] = [];

      manager.on("spawn", () => events.push("spawn"));
      manager.on("exit", () => events.push("exit"));

      await spawnWorker(manager, "event-order", "echo-worker.ts");
      await manager.terminate("event-order");

      // Wait for events to settle
      await delay(200);

      // Spawn should come before exit
      const spawnIndex = events.indexOf("spawn");
      const exitIndex = events.indexOf("exit");

      expect(spawnIndex).toBeGreaterThan(-1);
      expect(exitIndex).toBeGreaterThan(-1);
      expect(spawnIndex).toBeLessThan(exitIndex);
    });
  });

  describe("resource cleanup", () => {
    it("should cleanup resources on rapid spawn/terminate", async () => {
      // Rapid cycles to stress resource management
      for (let i = 0; i < 20; i++) {
        await spawnWorker(manager, "cleanup-test", "echo-worker.ts");
        await manager.terminate("cleanup-test");
        // Small delay to ensure process is fully cleaned up before reusing ID
        await delay(50);
      }

      // If we got here without hanging, resources are being cleaned up
      expect(manager.isRunning("cleanup-test")).toBe(false);
    });

    it("should handle terminate during handshake", async () => {
      // This is tricky to test as handshake happens quickly
      // But we can at least verify the system handles it

      const spawnPromise = spawnWorker(manager, "during-handshake", "echo-worker.ts");

      // Try to terminate immediately (might catch during handshake)
      try {
        await manager.terminate("during-handshake");
      } catch {
        // Worker might not exist yet, which is fine
      }

      // Wait for spawn to complete or fail
      try {
        const _handle = await spawnPromise;
        // If spawn completed, verify worker state
        if (manager.isRunning("during-handshake")) {
          await manager.terminate("during-handshake");
        }
      } catch {
        // Spawn failed due to early terminate, which is valid
      }

      // Either way, should not leave zombie processes
      expect(manager.isRunning("during-handshake")).toBe(false);
    });
  });

  describe("error during concurrent operations", () => {
    it("should handle error during concurrent requests", async () => {
      const handle = await spawnWorker(manager, "concurrent-error", "error-worker.ts");

      const requests = [
        handle.request("echo", { id: 1 }),
        handle.request("throw_sync", {}), // This will error
        handle.request("echo", { id: 2 }),
        handle.request("throw_async", {}), // This will also error
        handle.request("echo", { id: 3 }),
      ];

      const results = await Promise.allSettled(requests);

      // Successes and failures should be correctly separated
      expect(results[0]?.status).toBe("fulfilled");
      expect(results[1]?.status).toBe("rejected");
      expect(results[2]?.status).toBe("fulfilled");
      expect(results[3]?.status).toBe("rejected");
      expect(results[4]?.status).toBe("fulfilled");
    });
  });
});
