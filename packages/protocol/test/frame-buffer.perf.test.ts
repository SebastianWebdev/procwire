/**
 * Performance sanity checks for FrameBuffer.
 *
 * These tests verify that performance hasn't regressed catastrophically.
 * They should NOT run in CI (shared runners have unpredictable performance).
 * Run locally or on dedicated hardware: `pnpm test` (includes perf tests).
 *
 * Convention: *.perf.test.ts files are excluded from `test:ci` script.
 */

import { describe, it, expect } from "vitest";
import { buildFrame, FrameBuffer, encodeHeader } from "../src/index.js";
import type { Frame } from "../src/index.js";

describe("FrameBuffer - Large Payload Performance", () => {
  it("should handle 10MB payload efficiently", () => {
    const buffer = new FrameBuffer();
    const payloadSize = 10 * 1024 * 1024; // 10MB
    const payload = Buffer.alloc(payloadSize, 0xab);

    const frame = buildFrame(
      {
        methodId: 1,
        flags: 0,
        requestId: 1,
      },
      payload,
    );

    const chunkSize = 64 * 1024;
    const startTime = performance.now();

    const frames: Frame[] = [];
    for (let i = 0; i < frame.length; i += chunkSize) {
      const chunk = frame.subarray(i, Math.min(i + chunkSize, frame.length));
      frames.push(...buffer.push(chunk));
    }

    const accumulateTime = performance.now() - startTime;

    expect(frames.length).toBe(1);
    expect(frames[0]!.payloadLength).toBe(payloadSize);
    expect(accumulateTime).toBeLessThan(100);

    console.log(`10MB accumulation time: ${accumulateTime.toFixed(2)}ms`);
  });
});

describe("FrameBuffer - Streaming Performance", () => {
  it("should stream 100MB with minimal memory", () => {
    const buffer = new FrameBuffer();
    const payloadSize = 100 * 1024 * 1024; // 100MB

    const header = encodeHeader({
      methodId: 1,
      flags: 0,
      requestId: 1,
      payloadLength: payloadSize,
    });

    let receivedBytes = 0;
    let chunkCount = 0;

    buffer.setStreamHandler({
      onFrameStart() {
        receivedBytes = 0;
        chunkCount = 0;
      },
      onPayloadChunk(chunk) {
        receivedBytes += chunk.length;
        chunkCount++;
      },
      onFrameEnd() {
        // Frame complete
      },
    });

    const chunkSize = 64 * 1024;
    const startTime = performance.now();

    // Push header first
    buffer.push(header);

    // Stream payload in chunks
    for (let offset = 0; offset < payloadSize; offset += chunkSize) {
      const size = Math.min(chunkSize, payloadSize - offset);
      const chunk = Buffer.alloc(size, 0xcd);
      buffer.push(chunk);
    }

    const elapsed = performance.now() - startTime;

    expect(receivedBytes).toBe(payloadSize);

    // Should be fast - we're not allocating 100MB
    expect(elapsed).toBeLessThan(1000);

    console.log(
      `100MB streamed in ${elapsed.toFixed(2)}ms (${(payloadSize / elapsed / 1000).toFixed(0)} MB/s)`,
    );
    console.log(`Chunk count: ${chunkCount}`);
  });
});
