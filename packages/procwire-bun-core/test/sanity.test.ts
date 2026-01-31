/**
 * Sanity tests for @procwire-bun/core
 *
 * These tests verify that the package exports correctly and basic
 * type checking works. Full integration tests will be added in TASK-43.
 */

import { describe, it, expect } from "bun:test";
import {
  Module,
  ModuleManager,
  SpawnError,
  ProcwireError,
  ModuleErrors,
  ManagerErrors,
  ManagerEvents,
  ModuleEvents,
  BunDrainWaiter,
} from "../src/index.js";

describe("@procwire-bun/core exports", () => {
  it("should export Module class", () => {
    expect(Module).toBeDefined();
    expect(typeof Module).toBe("function");
  });

  it("should export ModuleManager class", () => {
    expect(ModuleManager).toBeDefined();
    expect(typeof ModuleManager).toBe("function");
  });

  it("should export SpawnError class", () => {
    expect(SpawnError).toBeDefined();
    expect(typeof SpawnError).toBe("function");
  });

  it("should export ProcwireError class", () => {
    expect(ProcwireError).toBeDefined();
    expect(typeof ProcwireError).toBe("function");
  });

  it("should export ModuleErrors factory", () => {
    expect(ModuleErrors).toBeDefined();
    expect(typeof ModuleErrors.notReady).toBe("function");
    expect(typeof ModuleErrors.unknownMethod).toBe("function");
  });

  it("should export ManagerErrors factory", () => {
    expect(ManagerErrors).toBeDefined();
    expect(typeof ManagerErrors.alreadyRegistered).toBe("function");
    expect(typeof ManagerErrors.notRegistered).toBe("function");
  });

  it("should export ManagerEvents constants", () => {
    expect(ManagerEvents).toBeDefined();
    expect(ManagerEvents.READY).toBe("module:ready");
    expect(ManagerEvents.ERROR).toBe("module:error");
    expect(ManagerEvents.CLOSED).toBe("module:closed");
  });

  it("should export ModuleEvents constants", () => {
    expect(ModuleEvents).toBeDefined();
    expect(ModuleEvents.STATE).toBe("state");
    expect(ModuleEvents.ERROR).toBe("error");
    expect(ModuleEvents.DISCONNECTED).toBe("disconnected");
  });

  it("should export BunDrainWaiter class", () => {
    expect(BunDrainWaiter).toBeDefined();
    expect(typeof BunDrainWaiter).toBe("function");
  });
});

describe("Module", () => {
  it("should create a new Module instance", () => {
    const module = new Module("test");
    expect(module.name).toBe("test");
    expect(module.state).toBe("created");
  });

  it("should support builder API", () => {
    const module = new Module("worker")
      .executable("bun", ["worker.ts"])
      .method("process")
      .method("batch", { response: "stream" })
      .event("progress")
      .spawnPolicy({ initTimeout: 5000 });

    expect(module.executableConfig).toEqual({
      command: "bun",
      args: ["worker.ts"],
      cwd: undefined,
      env: undefined,
    });

    expect(module.methods.size).toBe(2);
    expect(module.methods.has("process")).toBe(true);
    expect(module.methods.has("batch")).toBe(true);

    expect(module.events.size).toBe(1);
    expect(module.events.has("progress")).toBe(true);

    expect(module.spawnPolicyConfig.initTimeout).toBe(5000);
  });

  it("should throw when executable not configured", () => {
    const module = new Module("test").method("test");

    expect(() => module._validate()).toThrow("executable not configured");
  });

  it("should throw when no methods registered", () => {
    const module = new Module("test").executable("bun", ["test.ts"]);

    expect(() => module._validate()).toThrow("no methods registered");
  });

  it("should throw when module not ready", async () => {
    const module = new Module("test").executable("bun", ["test.ts"]).method("test");

    await expect(module.send("test", {})).rejects.toThrow("not ready");
  });

  it("should throw for unknown method", async () => {
    const module = new Module("test").executable("bun", ["test.ts"]).method("known");

    module._setState("ready");

    await expect(module.send("unknown", {})).rejects.toThrow("Unknown method");
  });

  it("should throw for unknown event", () => {
    const module = new Module("test").executable("bun", ["test.ts"]).method("test");

    expect(() => module.onEvent("unknown", () => {})).toThrow("Unknown event");
  });
});

describe("ModuleManager", () => {
  it("should create a new ModuleManager instance", () => {
    const manager = new ModuleManager();
    expect(manager.moduleNames).toEqual([]);
  });

  it("should register a module", () => {
    const manager = new ModuleManager();
    const module = new Module("worker").executable("bun", ["worker.ts"]).method("test");

    manager.register(module);

    expect(manager.has("worker")).toBe(true);
    expect(manager.get("worker")).toBe(module);
    expect(manager.moduleNames).toEqual(["worker"]);
  });

  it("should throw when registering duplicate module", () => {
    const manager = new ModuleManager();
    const module1 = new Module("worker").executable("bun", ["worker.ts"]).method("test");
    const module2 = new Module("worker").executable("bun", ["other.ts"]).method("test");

    manager.register(module1);

    expect(() => manager.register(module2)).toThrow("already registered");
  });

  it("should throw when spawning unregistered module", async () => {
    const manager = new ModuleManager();

    await expect(manager.spawn("unknown")).rejects.toThrow("not registered");
  });
});

describe("BunDrainWaiter", () => {
  it("should create a new instance", () => {
    const waiter = new BunDrainWaiter();
    expect(waiter.needsDrain).toBe(false);
  });

  it("should track drain state", () => {
    const waiter = new BunDrainWaiter();

    waiter.markNeedsDrain();
    expect(waiter.needsDrain).toBe(true);

    waiter.onDrain();
    expect(waiter.needsDrain).toBe(false);
  });

  it("should resolve waiters on drain", async () => {
    const waiter = new BunDrainWaiter();
    waiter.markNeedsDrain();

    let resolved = false;
    const waitPromise = waiter.waitForDrain().then(() => {
      resolved = true;
    });

    // Simulate drain event
    waiter.onDrain();

    await waitPromise;
    expect(resolved).toBe(true);
  });

  it("should return immediately if no drain needed", async () => {
    const waiter = new BunDrainWaiter();

    // Should resolve immediately since needsDrain is false
    await waiter.waitForDrain();
    expect(waiter.needsDrain).toBe(false);
  });

  it("should clear state on clear()", () => {
    const waiter = new BunDrainWaiter();
    waiter.markNeedsDrain();

    waiter.clear();
    expect(waiter.needsDrain).toBe(false);
  });
});

describe("Error factories", () => {
  it("ModuleErrors should create proper errors", () => {
    const err1 = ModuleErrors.notReady("test", "created");
    expect(err1).toBeInstanceOf(ProcwireError);
    expect(err1.message).toContain("test");
    expect(err1.message).toContain("created");

    const err2 = ModuleErrors.timeout("method");
    expect(err2.message).toContain("Timeout");
    expect(err2.message).toContain("method");
  });

  it("ManagerErrors should create proper errors", () => {
    const err1 = ManagerErrors.alreadyRegistered("test");
    expect(err1).toBeInstanceOf(ProcwireError);
    expect(err1.message).toContain("test");
    expect(err1.message).toContain("already registered");

    const err2 = ManagerErrors.initTimeout("mod", 5000);
    expect(err2.message).toContain("mod");
    expect(err2.message).toContain("5000");
  });
});
