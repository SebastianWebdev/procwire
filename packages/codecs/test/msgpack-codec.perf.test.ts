/**
 * Performance sanity checks for MsgPack codec.
 *
 * These tests verify that performance hasn't regressed catastrophically.
 * They should NOT run in CI (shared runners have unpredictable performance).
 * Run locally or on dedicated hardware: `pnpm test` (includes perf tests).
 *
 * Convention: *.perf.test.ts files are excluded from `test:ci` script.
 */

import { describe, it, expect } from "vitest";
import { MsgPackCodec } from "../src/msgpack-codec.js";

describe("MsgPackCodec performance", () => {
  it("should handle 10000 messages quickly", () => {
    const codec = new MsgPackCodec<{ id: number; value: string }>();
    const messages = Array.from({ length: 10000 }, (_, i) => ({
      id: i,
      value: `message-${i}`,
    }));

    const start = performance.now();
    const buffers = messages.map((m) => codec.serialize(m));
    const serializeTime = performance.now() - start;

    const deserializeStart = performance.now();
    const results = buffers.map((b) => codec.deserialize(b));
    const deserializeTime = performance.now() - deserializeStart;

    expect(results).toHaveLength(10000);
    expect(results[0]).toEqual({ id: 0, value: "message-0" });
    expect(results[9999]).toEqual({ id: 9999, value: "message-9999" });

    // Performance: should be under 200ms for 10000 messages
    expect(serializeTime).toBeLessThan(200);
    expect(deserializeTime).toBeLessThan(200);
  });
});
