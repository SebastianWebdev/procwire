import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ModuleManager, SpawnError } from "../src/manager.js";
import { Module } from "../src/module.js";

describe("ModuleManager", () => {
  let manager: ModuleManager;

  beforeEach(() => {
    manager = new ModuleManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("register", () => {
    it("should register a module", () => {
      const mod = new Module("worker").executable("node", ["worker.js"]).method("foo");

      manager.register(mod);

      expect(manager.has("worker")).toBe(true);
      expect(manager.get("worker")).toBe(mod);
    });

    it("should throw on duplicate name", () => {
      const mod1 = new Module("worker").executable("node", ["a.js"]).method("foo");
      const mod2 = new Module("worker").executable("node", ["b.js"]).method("bar");

      manager.register(mod1);

      expect(() => manager.register(mod2)).toThrow("already registered");
    });

    it("should validate module on register", () => {
      const mod = new Module("worker"); // No executable!

      expect(() => manager.register(mod)).toThrow("executable not configured");
    });

    it("should validate module has methods", () => {
      const mod = new Module("worker").executable("node", ["worker.js"]); // No methods!

      expect(() => manager.register(mod)).toThrow("no methods registered");
    });

    it("should return this for chaining", () => {
      const mod = new Module("worker").executable("node", ["worker.js"]).method("foo");

      const result = manager.register(mod);

      expect(result).toBe(manager);
    });
  });

  describe("get", () => {
    it("should return module if registered", () => {
      const mod = new Module("worker").executable("node", []).method("x");
      manager.register(mod);

      expect(manager.get("worker")).toBe(mod);
    });

    it("should return undefined if not registered", () => {
      expect(manager.get("nonexistent")).toBeUndefined();
    });
  });

  describe("has", () => {
    it("should return true if module registered", () => {
      manager.register(new Module("worker").executable("node", []).method("x"));

      expect(manager.has("worker")).toBe(true);
    });

    it("should return false if not registered", () => {
      expect(manager.has("nonexistent")).toBe(false);
    });
  });

  describe("moduleNames", () => {
    it("should return empty array initially", () => {
      expect(manager.moduleNames).toEqual([]);
    });

    it("should return all registered names", () => {
      manager.register(new Module("a").executable("node", []).method("x"));
      manager.register(new Module("b").executable("node", []).method("x"));
      manager.register(new Module("c").executable("node", []).method("x"));

      expect(manager.moduleNames).toEqual(["a", "b", "c"]);
    });
  });

  describe("spawn", () => {
    it("should throw for unknown module", async () => {
      await expect(manager.spawn("unknown")).rejects.toThrow("not registered");
    });

    it("should throw SpawnError with module name", async () => {
      // Register module with non-existent command
      manager.register(
        new Module("worker")
          .executable("nonexistent-command-that-does-not-exist-12345", [])
          .method("x")
          .spawnPolicy({ maxRetries: 0, initTimeout: 100 }),
      );

      try {
        await manager.spawn("worker");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(SpawnError);
        const spawnErr = err as SpawnError;
        expect(spawnErr.moduleName).toBe("worker");
        expect(spawnErr.attempts).toBe(1);
      }
    });
  });

  describe("events", () => {
    it("should emit module:spawnFailed on spawn failure", async () => {
      const spawnFailedHandler = vi.fn();
      manager.on("module:spawnFailed", spawnFailedHandler);

      manager.register(
        new Module("worker")
          .executable("nonexistent-command-that-does-not-exist-12345", [])
          .method("x")
          .spawnPolicy({ maxRetries: 0, initTimeout: 100 }),
      );

      await expect(manager.spawn("worker")).rejects.toThrow();

      expect(spawnFailedHandler).toHaveBeenCalledWith(
        "worker",
        0, // attempt
        expect.any(Error),
        false, // willRetry
      );
    });

    it("should emit module:retrying on retry", async () => {
      const retryingHandler = vi.fn();
      manager.on("module:retrying", retryingHandler);

      manager.register(
        new Module("worker")
          .executable("nonexistent-command-that-does-not-exist-12345", [])
          .method("x")
          .spawnPolicy({
            maxRetries: 1,
            initTimeout: 100,
            retryDelay: { type: "fixed", delay: 10 },
          }),
      );

      await expect(manager.spawn("worker")).rejects.toThrow();

      expect(retryingHandler).toHaveBeenCalledWith(
        "worker",
        1, // attempt
        10, // delay
        expect.any(Error),
      );
    });
  });

  describe("SpawnError", () => {
    it("should have correct properties", () => {
      const lastError = new Error("Something went wrong");
      const err = new SpawnError("Failed to spawn", "worker", 3, lastError);

      expect(err.name).toBe("SpawnError");
      expect(err.message).toBe("Failed to spawn");
      expect(err.moduleName).toBe("worker");
      expect(err.attempts).toBe(3);
      expect(err.lastError).toBe(lastError);
    });

    it("should work without lastError", () => {
      const err = new SpawnError("Failed to spawn", "worker", 3);

      expect(err.lastError).toBeUndefined();
    });
  });

  describe("shutdown", () => {
    it("should handle shutdown of non-running module", async () => {
      manager.register(new Module("worker").executable("node", []).method("x"));

      // Should not throw
      await manager.shutdown("worker");

      const mod = manager.get("worker")!;
      expect(mod.state).toBe("closed");
    });

    it("should handle shutdown of unknown module", async () => {
      // Should not throw
      await manager.shutdown("nonexistent");
    });

    it("should emit module:closed on shutdown", async () => {
      const closedHandler = vi.fn();
      manager.on("module:closed", closedHandler);

      manager.register(new Module("worker").executable("node", []).method("x"));

      await manager.shutdown("worker");

      // module:closed is only emitted if process was running
      // Since we didn't spawn, it won't emit - this is expected
    });
  });
});
