/**
 * Regression tests for production-readiness bug fixes (bun-client).
 *
 * Each `describe` targets ONE bug: written to FAIL against the buggy code and
 * PASS once the fix is applied. These mirror the @procwire/client fixes.
 */
import { describe, it, expect } from "bun:test";
import { Client } from "../src/index.js";

interface ClientInternals {
  _onSocketError(err: Error): void;
}

// ═══════════════════════════════════════════════════════════════════════════
// Bug C5 (bun-client): the socket error handler forwarded errors via
// emit("error"). Node's EventEmitter throws synchronously when "error" is
// emitted with no listener, so an unobserved socket error crashed the child.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug C5 (bun-client): unobserved socket error must not crash the child", () => {
  it("does not throw when a socket error fires with no 'error' listener", () => {
    const client = new Client();

    expect(() =>
      (client as unknown as ClientInternals)._onSocketError(new Error("ECONNRESET")),
    ).not.toThrow();
  });

  it("still forwards the error to a registered 'error' listener", () => {
    const client = new Client();

    let caught: Error | undefined;
    client.on("error", (err: Error) => {
      caught = err;
    });

    const err = new Error("EPIPE");
    expect(() => (client as unknown as ClientInternals)._onSocketError(err)).not.toThrow();
    expect(caught).toBe(err);
  });
});
