import { describe, it, expect } from "vitest";
import { FrameBuffer, buildFrame, type FrameStreamHandler } from "../src/frame-buffer.js";
import { HEADER_SIZE, type FrameHeader } from "../src/wire-format.js";
import { encodeHeader } from "../src/wire-format.js";

/**
 * Regression tests for streaming-mode FrameBuffer bugs (K-4 + related guards).
 *
 * The original streaming split-header test only counted callback invocations,
 * which let a corrupted (zero-padded) header pass unnoticed. These tests
 * assert the actual decoded header fields and reassembled payload BYTES.
 */

interface CollectedFrame {
  header: FrameHeader;
  payload: Buffer;
}

function makeCollector(): {
  handler: FrameStreamHandler;
  frames: CollectedFrame[];
  errors: Error[];
} {
  const frames: CollectedFrame[] = [];
  const errors: Error[] = [];
  let current: { header: FrameHeader; chunks: Buffer[] } | null = null;

  const handler: FrameStreamHandler = {
    onFrameStart(header) {
      current = { header, chunks: [] };
    },
    onPayloadChunk(chunk, _offset, _isLast) {
      // Copy: the chunk is a subarray view into the pushed buffer
      current!.chunks.push(Buffer.from(chunk));
    },
    onFrameEnd(header) {
      frames.push({ header, payload: Buffer.concat(current?.chunks ?? []) });
      current = null;
    },
    onError(error) {
      errors.push(error);
    },
  };

  return { handler, frames, errors };
}

describe("FrameBuffer streaming mode - split header regression (K-4)", () => {
  const splitPoints = Array.from({ length: HEADER_SIZE - 1 }, (_, i) => i + 1);

  it.each(splitPoints)(
    "decodes the correct header and payload when the header is split at byte %i",
    (splitAt) => {
      const buffer = new FrameBuffer();
      const { handler, frames, errors } = makeCollector();
      buffer.setStreamHandler(handler);

      const payloadA = Buffer.from("ALPHA-payload");
      const payloadB = Buffer.from("BRAVO");
      const frameA = buildFrame({ methodId: 7, flags: 0, requestId: 0xdeadbeef }, payloadA);
      const frameB = buildFrame({ methodId: 9, flags: 0, requestId: 0x12345678 }, payloadB);
      const wire = Buffer.concat([frameA, frameB]);

      buffer.push(wire.subarray(0, splitAt));
      buffer.push(wire.subarray(splitAt));

      expect(errors).toEqual([]);
      expect(frames).toHaveLength(2);

      expect(frames[0]!.header).toEqual({
        methodId: 7,
        flags: 0,
        requestId: 0xdeadbeef,
        payloadLength: payloadA.length,
      });
      expect(frames[0]!.payload.equals(payloadA)).toBe(true);

      // The second frame proves the stream did not desync after the split
      expect(frames[1]!.header).toEqual({
        methodId: 9,
        flags: 0,
        requestId: 0x12345678,
        payloadLength: payloadB.length,
      });
      expect(frames[1]!.payload.equals(payloadB)).toBe(true);
    },
  );

  it("decodes the correct header when split across three chunks", () => {
    const buffer = new FrameBuffer();
    const { handler, frames, errors } = makeCollector();
    buffer.setStreamHandler(handler);

    const payload = Buffer.from("three-way-split");
    const frame = buildFrame({ methodId: 21, flags: 0, requestId: 0xcafebabe }, payload);

    buffer.push(frame.subarray(0, 4)); // 4 header bytes
    buffer.push(frame.subarray(4, 7)); // 3 more header bytes
    buffer.push(frame.subarray(7)); // rest of header + payload

    expect(errors).toEqual([]);
    expect(frames).toHaveLength(1);
    expect(frames[0]!.header).toEqual({
      methodId: 21,
      flags: 0,
      requestId: 0xcafebabe,
      payloadLength: payload.length,
    });
    expect(frames[0]!.payload.equals(payload)).toBe(true);
  });

  it("handles an empty-payload frame whose header is split", () => {
    const buffer = new FrameBuffer();
    const { handler, frames, errors } = makeCollector();
    buffer.setStreamHandler(handler);

    const frame = buildFrame({ methodId: 3, flags: 0, requestId: 11 }, Buffer.alloc(0));
    buffer.push(frame.subarray(0, 6));
    buffer.push(frame.subarray(6));

    expect(errors).toEqual([]);
    expect(frames).toHaveLength(1);
    expect(frames[0]!.header.payloadLength).toBe(0);
    expect(frames[0]!.payload.length).toBe(0);
  });

  it("survives 500 frames delivered with random chunk boundaries (fuzz)", () => {
    const buffer = new FrameBuffer();
    const { handler, frames, errors } = makeCollector();
    buffer.setStreamHandler(handler);

    // Deterministic LCG so failures are reproducible
    let seed = 0xc0ffee;
    const rand = (max: number): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % max;
    };

    const expected: { header: Omit<FrameHeader, "flags">; payload: Buffer }[] = [];
    const parts: Buffer[] = [];

    for (let i = 0; i < 500; i++) {
      const size = rand(64); // includes empty payloads
      const payload = Buffer.alloc(size);
      for (let b = 0; b < size; b++) payload[b] = (i + b) % 256;

      const methodId = (i % 1000) + 1;
      const requestId = i + 1;
      expected.push({
        header: { methodId, requestId, payloadLength: size },
        payload,
      });
      parts.push(buildFrame({ methodId, flags: 0, requestId }, payload));
    }

    const wire = Buffer.concat(parts);
    let offset = 0;
    while (offset < wire.length) {
      // Chunk sizes 1..17 to hammer header boundaries
      const chunkSize = Math.min(1 + rand(17), wire.length - offset);
      buffer.push(wire.subarray(offset, offset + chunkSize));
      offset += chunkSize;
    }

    expect(errors).toEqual([]);
    expect(frames).toHaveLength(expected.length);
    for (let i = 0; i < expected.length; i++) {
      expect(frames[i]!.header.methodId).toBe(expected[i]!.header.methodId);
      expect(frames[i]!.header.requestId).toBe(expected[i]!.header.requestId);
      expect(frames[i]!.header.payloadLength).toBe(expected[i]!.header.payloadLength);
      expect(frames[i]!.payload.equals(expected[i]!.payload)).toBe(true);
    }
  });
});

describe("FrameBuffer streaming mode - state guards", () => {
  it("reports hasPartialFrame while a streamed payload is outstanding", () => {
    const buffer = new FrameBuffer();
    const { handler } = makeCollector();
    buffer.setStreamHandler(handler);

    const frame = buildFrame({ methodId: 1, flags: 0, requestId: 1 }, Buffer.alloc(10, 0xab));
    buffer.push(frame.subarray(0, HEADER_SIZE + 3)); // header + 3 of 10 payload bytes

    expect(buffer.hasPartialFrame).toBe(true);

    buffer.push(frame.subarray(HEADER_SIZE + 3));
    expect(buffer.hasPartialFrame).toBe(false);
  });

  it("reports hasPartialFrame while header bytes are outstanding", () => {
    const buffer = new FrameBuffer();
    const { handler } = makeCollector();
    buffer.setStreamHandler(handler);

    const frame = buildFrame({ methodId: 1, flags: 0, requestId: 1 }, Buffer.from("x"));
    buffer.push(frame.subarray(0, 5));

    expect(buffer.hasPartialFrame).toBe(true);
  });

  it("rejects disabling streaming mode mid-frame", () => {
    const buffer = new FrameBuffer();
    const { handler } = makeCollector();
    buffer.setStreamHandler(handler);

    const frame = buildFrame({ methodId: 1, flags: 0, requestId: 1 }, Buffer.alloc(20, 0x01));
    buffer.push(frame.subarray(0, HEADER_SIZE + 5)); // mid-payload

    expect(() => buffer.setStreamHandler(null)).toThrow(/mid-frame|partial|clear/i);

    // After clear() the switch is allowed again
    buffer.clear();
    expect(() => buffer.setStreamHandler(null)).not.toThrow();
  });

  it("rejects disabling streaming mode mid-header", () => {
    const buffer = new FrameBuffer();
    const { handler } = makeCollector();
    buffer.setStreamHandler(handler);

    const frame = buildFrame({ methodId: 1, flags: 0, requestId: 1 }, Buffer.from("x"));
    buffer.push(frame.subarray(0, 5)); // mid-header

    expect(() => buffer.setStreamHandler(null)).toThrow(/mid-frame|partial|clear/i);
  });

  it("quarantines the buffer after a streaming protocol error until clear()", () => {
    const buffer = new FrameBuffer({ maxPayloadSize: 1024 });
    const { handler, frames, errors } = makeCollector();
    buffer.setStreamHandler(handler);

    const badHeader = encodeHeader({
      methodId: 1,
      flags: 0,
      requestId: 1,
      payloadLength: 4096, // over the 1KB limit
    });
    buffer.push(badHeader);
    expect(errors).toHaveLength(1);

    // Until clear(), more data must be rejected instead of being parsed
    // against poisoned state.
    expect(() => buffer.push(Buffer.from("garbage"))).toThrow(/corrupt|clear/i);

    buffer.clear();

    const payload = Buffer.from("recovered");
    const frame = buildFrame({ methodId: 2, flags: 0, requestId: 2 }, payload);
    buffer.push(frame);

    expect(frames).toHaveLength(1);
    expect(frames[0]!.payload.equals(payload)).toBe(true);
  });
});
