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
  _nextRequestId: number;
  _allocateRequestId(): number;
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

// ═══════════════════════════════════════════════════════════════════════════
// Bug C6 (bun-core): requestId is a uint32 on the wire but _nextRequestId++
// never wrapped. After 2^32 requests the encoder would overflow and every send
// would break. The id must wrap within the uint32 range and skip 0 (reserved).
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug C6 (bun-core): requestId must wrap at the uint32 boundary", () => {
  it("wraps to a non-zero id instead of overflowing past uint32", () => {
    const mod = new Module("worker").executable("bun", ["w.ts"]).method("foo");
    const internals = mod as unknown as ModuleInternals;

    internals._nextRequestId = 0xffffffff;
    expect(internals._allocateRequestId()).toBe(0xffffffff); // last valid uint32
    expect(internals._allocateRequestId()).toBe(1); // wrapped, skipping reserved 0
    expect(internals._allocateRequestId()).toBe(2);
  });
});
