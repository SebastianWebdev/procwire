/**
 * Performance sanity checks for the protocol layer.
 *
 * These tests verify that performance hasn't regressed catastrophically.
 * They should NOT run in CI (shared runners have unpredictable performance).
 * Run locally or on dedicated hardware: `pnpm test` (includes perf tests).
 *
 * Convention: *.perf.test.ts files are excluded from `test:ci` script.
 */

import { describe, it, expect } from "vitest";
import { buildFrame, FrameBuffer } from "../src/index.js";

describe("Performance sanity check", () => {
  it("should parse 10000 frames in reasonable time", () => {
    const frames: Buffer[] = [];
    const payload = Buffer.alloc(1000); // 1KB payload

    for (let i = 0; i < 10000; i++) {
      frames.push(
        buildFrame(
          {
            methodId: 1,
            flags: 0,
            requestId: i,
          },
          payload,
        ),
      );
    }

    const combined = Buffer.concat(frames);
    const buffer = new FrameBuffer();

    const start = performance.now();
    const received = buffer.push(combined);
    const elapsed = performance.now() - start;

    expect(received.length).toBe(10000);

    // Should complete in < 100ms (10MB of data)
    expect(elapsed).toBeLessThan(100);

    console.log(`Parsed 10000 frames (10MB) in ${elapsed.toFixed(2)}ms`);
  });
});
