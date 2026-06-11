import { describe, it, expect } from "vitest";
import {
  ProcwireError,
  ModuleErrors,
  ManagerErrors,
  ProcwireClientError,
  ClientErrors,
} from "../src/index.js";

describe("ModuleErrors", () => {
  it("should create ProcwireError instances with context in the message", () => {
    const err = ModuleErrors.notReady("worker", "created");
    expect(err).toBeInstanceOf(ProcwireError);
    expect(err.name).toBe("ProcwireError");
    expect(err.message).toContain("worker");
    expect(err.message).toContain("created");
  });

  it("remoteError should preserve the original payload on .data", () => {
    const payload = { message: "boom", code: 42 };
    const err = ModuleErrors.remoteError(payload);
    expect(err.message).toBe("boom");
    expect(err.data).toBe(payload);
  });

  it("remoteError should not collapse structured payloads to [object Object]", () => {
    const err = ModuleErrors.remoteError({ code: 42 });
    expect(err.message).not.toContain("[object Object]");
    expect(err.message).toContain("42");
  });
});

describe("ManagerErrors", () => {
  it("should create ProcwireError instances with context in the message", () => {
    const err = ManagerErrors.initTimeout("worker", 5000);
    expect(err).toBeInstanceOf(ProcwireError);
    expect(err.message).toContain("worker");
    expect(err.message).toContain("5000");
  });
});

describe("ClientErrors", () => {
  it("should create ProcwireClientError instances", () => {
    const err = ClientErrors.notConnected();
    expect(err).toBeInstanceOf(ProcwireClientError);
    expect(err.name).toBe("ProcwireClientError");
    expect(err.message).toContain("not connected");
  });
});
