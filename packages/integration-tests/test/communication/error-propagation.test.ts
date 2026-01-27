/**
 * Communication tests: Error Propagation
 *
 * Tests that errors from workers are properly propagated to the manager.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProcessManager } from "@procwire/transport";
import { spawnWorker } from "../../utils/test-helpers.js";

describe("Communication - Error Propagation", () => {
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

  describe("synchronous errors", () => {
    it("should propagate sync thrown error", async () => {
      const handle = await spawnWorker(manager, "sync-error", "error-worker.ts");

      await expect(handle.request("throw_sync", {})).rejects.toThrow();
    });

    it("should include error message", async () => {
      const handle = await spawnWorker(manager, "sync-msg", "error-worker.ts");

      try {
        await handle.request("throw_sync", {});
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("Sync error");
      }
    });

    it("should propagate custom error messages", async () => {
      const handle = await spawnWorker(manager, "custom-error", "error-worker.ts");

      try {
        await handle.request("throw_custom", {
          code: "CUSTOM_ERROR",
          message: "Custom error message",
        });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("Custom error message");
      }
    });
  });

  describe("asynchronous errors", () => {
    it("should propagate async thrown error", async () => {
      const handle = await spawnWorker(manager, "async-error", "error-worker.ts");

      await expect(handle.request("throw_async", {})).rejects.toThrow();
    });

    it("should propagate rejected promise", async () => {
      const handle = await spawnWorker(manager, "reject-error", "error-worker.ts");

      await expect(handle.request("reject_promise", {})).rejects.toThrow();
    });

    it("should propagate delayed error", async () => {
      const handle = await spawnWorker(manager, "delayed-error", "error-worker.ts");

      await expect(
        handle.request("throw_delayed", { message: "Delayed error", delay: 100 }),
      ).rejects.toThrow(/Delayed error/);
    });
  });

  describe("conditional errors", () => {
    it("should throw when condition is true", async () => {
      const handle = await spawnWorker(manager, "conditional-true", "error-worker.ts");

      await expect(
        handle.request("maybe_error", { should_error: true, value: "test" }),
      ).rejects.toThrow();
    });

    it("should not throw when condition is false", async () => {
      const handle = await spawnWorker(manager, "conditional-false", "error-worker.ts");

      const result = await handle.request("maybe_error", {
        should_error: false,
        value: { test: 123 },
      });

      expect(result).toEqual({ test: 123 });
    });
  });

  describe("unknown method errors", () => {
    it("should error on unknown method", async () => {
      const handle = await spawnWorker(manager, "unknown-method", "error-worker.ts");

      await expect(handle.request("nonexistent_method", {})).rejects.toThrow();
    });
  });

  describe("error recovery", () => {
    it("should continue working after error", async () => {
      const handle = await spawnWorker(manager, "recovery", "error-worker.ts");

      // First request throws
      await expect(handle.request("throw_sync", {})).rejects.toThrow();

      // Subsequent request should work
      const result = await handle.request("echo", { recovered: true });
      expect(result).toEqual({ recovered: true });
    });

    it("should handle multiple errors then recover", async () => {
      const handle = await spawnWorker(manager, "multi-recovery", "error-worker.ts");

      // Multiple errors
      await expect(handle.request("throw_sync", {})).rejects.toThrow();
      await expect(handle.request("throw_async", {})).rejects.toThrow();
      await expect(handle.request("reject_promise", {})).rejects.toThrow();

      // Should still work
      const result = await handle.request("echo", { still: "working" });
      expect(result).toEqual({ still: "working" });
    });

    it("should interleave errors and successful requests", async () => {
      const handle = await spawnWorker(manager, "interleave", "error-worker.ts");

      const results: Array<"success" | "error"> = [];

      for (let i = 0; i < 6; i++) {
        if (i % 2 === 0) {
          const result = await handle.request("echo", { i });
          expect(result).toEqual({ i });
          results.push("success");
        } else {
          await expect(handle.request("throw_sync", {})).rejects.toThrow();
          results.push("error");
        }
      }

      expect(results).toEqual(["success", "error", "success", "error", "success", "error"]);
    });
  });

  describe("error objects vs thrown errors", () => {
    it("should return error object without throwing", async () => {
      const handle = await spawnWorker(manager, "error-obj", "error-worker.ts");

      // This returns an error object, doesn't throw
      const result = await handle.request("return_error", {});

      expect(result).toEqual({ error: "This is an error object, not a thrown error" });
    });

    it("should handle null return value", async () => {
      const handle = await spawnWorker(manager, "null-return", "error-worker.ts");

      const result = await handle.request("return_null", {});

      expect(result).toBeNull();
    });

    it("should handle undefined return value", async () => {
      const handle = await spawnWorker(manager, "undefined-return", "error-worker.ts");

      const result = await handle.request("return_undefined", {});

      // undefined becomes null in JSON serialization (JSON doesn't support undefined)
      expect(result).toBeNull();
    });
  });

  describe("nested errors", () => {
    it("should propagate nested error message", async () => {
      const handle = await spawnWorker(manager, "nested-error", "error-worker.ts");

      try {
        await handle.request("nested_error", {});
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("Outer error");
      }
    });
  });
});
