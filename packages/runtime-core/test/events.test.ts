import { describe, it, expect } from "vitest";
import { ManagerEvents, ModuleEvents } from "../src/index.js";

describe("ManagerEvents", () => {
  it("should pin the public event-name strings", () => {
    expect(ManagerEvents).toEqual({
      RETRYING: "module:retrying",
      SPAWN_FAILED: "module:spawnFailed",
      READY: "module:ready",
      ERROR: "module:error",
      RESTARTING: "module:restarting",
      CLOSED: "module:closed",
    });
  });
});

describe("ModuleEvents", () => {
  it("should pin the public event-name strings", () => {
    expect(ModuleEvents).toEqual({
      STATE: "state",
      ERROR: "error",
      DISCONNECTED: "disconnected",
    });
  });
});
