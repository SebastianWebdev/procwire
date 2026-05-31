/**
 * Regression tests for production-readiness bug fixes (bun-core).
 *
 * Each `describe` targets ONE bug: written to FAIL against the buggy code and
 * PASS once the fix is applied. These mirror the @procwire/core fixes.
 */
import { describe, it, expect } from "bun:test";
import { Module } from "../src/index.js";

interface ModuleInternals {
  _onSocketError(err: Error): void;
}

// ═══════════════════════════════════════════════════════════════════════════
// Bug C5 (bun-core): _onSocketError forwarded socket errors via emit("error").
// Node's EventEmitter throws synchronously when "error" is emitted with no
// listener, so an unobserved socket error would crash the whole parent process.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug C5 (bun-core): unobserved socket error must not crash the process", () => {
  it("does not throw when a socket error fires with no 'error' listener", () => {
    const mod = new Module("worker").executable("bun", ["w.ts"]).method("foo");

    expect(() =>
      (mod as unknown as ModuleInternals)._onSocketError(new Error("ECONNRESET")),
    ).not.toThrow();
  });

  it("still forwards the error to a registered 'error' listener", () => {
    const mod = new Module("worker").executable("bun", ["w.ts"]).method("foo");

    let caught: Error | undefined;
    mod.on("error", (err: Error) => {
      caught = err;
    });

    const err = new Error("EPIPE");
    expect(() => (mod as unknown as ModuleInternals)._onSocketError(err)).not.toThrow();
    expect(caught).toBe(err);
  });
});
