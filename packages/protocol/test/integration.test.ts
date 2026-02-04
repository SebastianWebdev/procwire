/**
 * Protocol Integration Tests
 *
 * Tests that wire format (TASK-01) and frame buffer (TASK-02) work together correctly.
 * This does NOT add new functionality - only verifies existing code works end-to-end.
 */

import { describe, it, expect } from "vitest";
import {
  HEADER_SIZE,
  Flags,
  encodeHeader,
  decodeHeader,
  createFlags,
  hasFlag,
  FrameBuffer,
  Frame,
  buildFrame,
  buildFrameBuffers,
  DEFAULT_MAX_PAYLOAD_SIZE,
  ABSOLUTE_MAX_PAYLOAD_SIZE,
  validateHeader,
} from "../src/index.js";

describe("Protocol Integration", () => {
  describe("Round-trip: encode → transmit → decode", () => {
    it("should handle simple request", () => {
      // === SENDER SIDE ===
      const payload = Buffer.from('{"query":"test","topK":10}');
      // NOTE: We use JSON here only as EXAMPLE payload.
      // In real usage, this would be Arrow/MsgPack binary data.
      // The protocol itself does NOT care what's in payload.

      const frame = buildFrame(
        {
          methodId: 1,
          flags: createFlags({ toParent: false }), // to child
          requestId: 42,
        },
        payload,
      );

      // === SIMULATE TRANSMISSION ===
      // In real world, this goes through socket
      const received = Buffer.from(frame); // simulate network

      // === RECEIVER SIDE ===
      const buffer = new FrameBuffer();
      const frames = buffer.push(received);

      // === VERIFY ===
      expect(frames.length).toBe(1);
      expect(frames[0]!.header.methodId).toBe(1);
      expect(frames[0]!.header.requestId).toBe(42);
      expect(hasFlag(frames[0]!.header.flags, Flags.DIRECTION_TO_PARENT)).toBe(false);
    });

    it("should handle response", () => {
      // Response from child to parent
      const payload = Buffer.from("result data");

      const frame = buildFrame(
        {
          methodId: 1, // same method as request
          flags: createFlags({
            toParent: true,
            isResponse: true,
          }),
          requestId: 42, // same ID as request
        },
        payload,
      );

      const buffer = new FrameBuffer();
      const frames = buffer.push(frame);

      expect(frames.length).toBe(1);
      expect(hasFlag(frames[0]!.header.flags, Flags.DIRECTION_TO_PARENT)).toBe(true);
      expect(hasFlag(frames[0]!.header.flags, Flags.IS_RESPONSE)).toBe(true);
      expect(frames[0]!.header.requestId).toBe(42);
    });

    it("should handle error response", () => {
      const payload = Buffer.from("error message");

      const frame = buildFrame(
        {
          methodId: 1,
          flags: createFlags({
            toParent: true,
            isResponse: true,
            isError: true,
          }),
          requestId: 42,
        },
        payload,
      );

      const buffer = new FrameBuffer();
      const frames = buffer.push(frame);

      expect(frames.length).toBe(1);
      expect(hasFlag(frames[0]!.header.flags, Flags.IS_ERROR)).toBe(true);
    });

    it("should handle ACK response", () => {
      const payload = Buffer.from('{"accepted":true,"jobId":"abc123"}');

      const frame = buildFrame(
        {
          methodId: 2,
          flags: createFlags({
            toParent: true,
            isResponse: true,
            isAck: true,
          }),
          requestId: 100,
        },
        payload,
      );

      const buffer = new FrameBuffer();
      const frames = buffer.push(frame);

      expect(frames.length).toBe(1);
      expect(hasFlag(frames[0]!.header.flags, Flags.IS_ACK)).toBe(true);
      expect(hasFlag(frames[0]!.header.flags, Flags.IS_RESPONSE)).toBe(true);
    });
  });

  describe("Streaming", () => {
    it("should handle stream chunks", () => {
      const chunks = [Buffer.from("chunk1"), Buffer.from("chunk2"), Buffer.from("chunk3")];

      const frames = chunks.map((payload, i) =>
        buildFrame(
          {
            methodId: 5,
            flags: createFlags({
              toParent: true,
              isResponse: true,
              isStream: true,
              streamEnd: i === chunks.length - 1, // last chunk
            }),
            requestId: 999,
          },
          payload,
        ),
      );

      const buffer = new FrameBuffer();
      const received = buffer.push(Buffer.concat(frames));

      expect(received.length).toBe(3);

      // First two chunks: stream=true, end=false
      expect(hasFlag(received[0]!.header.flags, Flags.IS_STREAM)).toBe(true);
      expect(hasFlag(received[0]!.header.flags, Flags.STREAM_END)).toBe(false);
      expect(hasFlag(received[1]!.header.flags, Flags.IS_STREAM)).toBe(true);
      expect(hasFlag(received[1]!.header.flags, Flags.STREAM_END)).toBe(false);

      // Last chunk: stream=true, end=true
      expect(hasFlag(received[2]!.header.flags, Flags.IS_STREAM)).toBe(true);
      expect(hasFlag(received[2]!.header.flags, Flags.STREAM_END)).toBe(true);

      // All have same requestId
      expect(received[0]!.header.requestId).toBe(999);
      expect(received[1]!.header.requestId).toBe(999);
      expect(received[2]!.header.requestId).toBe(999);
    });
  });

  describe("Fire-and-forget events", () => {
    it("should handle event with requestId=0", () => {
      const payload = Buffer.from('{"percent":50}');

      const frame = buildFrame(
        {
          methodId: 10, // progress event
          flags: createFlags({ toParent: true }),
          requestId: 0, // no response expected
        },
        payload,
      );

      const buffer = new FrameBuffer();
      const frames = buffer.push(frame);

      expect(frames.length).toBe(1);
      expect(frames[0]!.header.requestId).toBe(0);
      expect(hasFlag(frames[0]!.header.flags, Flags.IS_RESPONSE)).toBe(false);
    });
  });

  describe("Abort signal", () => {
    it("should handle abort with reserved methodId 0xFFFF", () => {
      const payload = Buffer.from('{"reason":"user_cancelled"}');

      const frame = buildFrame(
        {
          methodId: 0xffff, // reserved for abort
          flags: createFlags({ toParent: false }), // to child
          requestId: 42, // abort this request
        },
        payload,
      );

      const buffer = new FrameBuffer();
      const frames = buffer.push(frame);

      expect(frames.length).toBe(1);
      expect(frames[0]!.header.methodId).toBe(0xffff);
      expect(frames[0]!.header.requestId).toBe(42);
    });
  });

  describe("Binary payload integrity", () => {
    it("should preserve binary data exactly", () => {
      // Create binary payload with all byte values
      const payload = Buffer.alloc(256);
      for (let i = 0; i < 256; i++) {
        payload[i] = i;
      }

      const frame = buildFrame(
        {
          methodId: 1,
          flags: 0,
          requestId: 1,
        },
        payload,
      );

      const buffer = new FrameBuffer();
      const frames = buffer.push(frame);

      expect(frames[0]!.payload.length).toBe(256);
      for (let i = 0; i < 256; i++) {
        expect(frames[0]!.payload[i]).toBe(i);
      }
    });

    it("should preserve Float32Array data", () => {
      const floats = new Float32Array([1.5, 2.5, 3.5, -4.5, 0.0]);
      const payload = Buffer.from(floats.buffer);

      const frame = buildFrame(
        {
          methodId: 1,
          flags: 0,
          requestId: 1,
        },
        payload,
      );

      const buffer = new FrameBuffer();
      const frames = buffer.push(frame);

      // Copy to aligned buffer (payload.byteOffset may not be multiple of 4)
      const alignedBuffer = new ArrayBuffer(frames[0]!.payload.byteLength);
      new Uint8Array(alignedBuffer).set(frames[0]!.payload);
      const received = new Float32Array(alignedBuffer);

      expect(Array.from(received)).toEqual([1.5, 2.5, 3.5, -4.5, 0.0]);
    });

    it("should handle null bytes in payload", () => {
      const payload = Buffer.from([0x00, 0x01, 0x00, 0x02, 0x00, 0x00, 0x03]);

      const frame = buildFrame(
        {
          methodId: 1,
          flags: 0,
          requestId: 1,
        },
        payload,
      );

      const buffer = new FrameBuffer();
      const frames = buffer.push(frame);

      expect(Buffer.compare(frames[0]!.payload, payload)).toBe(0);
    });
  });

  describe("Stress test: many frames", () => {
    it("should handle 1000 frames", () => {
      const allFrames: Buffer[] = [];

      for (let i = 0; i < 1000; i++) {
        const payload = Buffer.from(`message-${i}`);
        const frame = buildFrame(
          {
            methodId: (i % 100) + 1,
            flags: 0,
            requestId: i,
          },
          payload,
        );
        allFrames.push(frame);
      }

      // Send all at once
      const combined = Buffer.concat(allFrames);
      const buffer = new FrameBuffer();
      const received = buffer.push(combined);

      expect(received.length).toBe(1000);

      for (let i = 0; i < 1000; i++) {
        expect(received[i]!.header.requestId).toBe(i);
        expect(received[i]!.payload.toString()).toBe(`message-${i}`);
      }
    });

    it("should handle 1000 frames in random-sized chunks", () => {
      const allFrames: Buffer[] = [];

      for (let i = 0; i < 1000; i++) {
        const payload = Buffer.from(`msg-${i}`);
        const frame = buildFrame(
          {
            methodId: 1,
            flags: 0,
            requestId: i,
          },
          payload,
        );
        allFrames.push(frame);
      }

      const combined = Buffer.concat(allFrames);
      const buffer = new FrameBuffer();
      const received: Frame[] = [];

      // Split into random chunks (1-1000 bytes each)
      let offset = 0;
      while (offset < combined.length) {
        const chunkSize = Math.min(Math.floor(Math.random() * 1000) + 1, combined.length - offset);
        const chunk = combined.subarray(offset, offset + chunkSize);
        received.push(...buffer.push(chunk));
        offset += chunkSize;
      }

      expect(received.length).toBe(1000);

      // Verify order and content
      for (let i = 0; i < 1000; i++) {
        expect(received[i]!.header.requestId).toBe(i);
      }
    });
  });

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
});

describe("Protocol exports", () => {
  it("should export all public API from wire-format", () => {
    expect(typeof HEADER_SIZE).toBe("number");
    expect(HEADER_SIZE).toBe(11);

    expect(typeof DEFAULT_MAX_PAYLOAD_SIZE).toBe("number");
    expect(typeof ABSOLUTE_MAX_PAYLOAD_SIZE).toBe("number");

    expect(typeof Flags).toBe("object");
    expect(Flags.DIRECTION_TO_PARENT).toBe(0b00000001);
    expect(Flags.IS_RESPONSE).toBe(0b00000010);

    expect(typeof encodeHeader).toBe("function");
    expect(typeof decodeHeader).toBe("function");
    expect(typeof createFlags).toBe("function");
    expect(typeof hasFlag).toBe("function");
    expect(typeof validateHeader).toBe("function");
  });

  it("should export all public API from frame-buffer", () => {
    expect(typeof FrameBuffer).toBe("function");
    expect(typeof Frame).toBe("function");
    expect(typeof buildFrame).toBe("function");
    expect(typeof buildFrameBuffers).toBe("function");
  });
});

describe("buildFrameBuffers integration", () => {
  it("should produce same result as buildFrame when concatenated", () => {
    const payload = Buffer.from("test payload data");

    const combined = buildFrame(
      {
        methodId: 5,
        flags: createFlags({ toParent: true, isResponse: true }),
        requestId: 123,
      },
      payload,
    );

    const [header, payloadBuf] = buildFrameBuffers(
      {
        methodId: 5,
        flags: createFlags({ toParent: true, isResponse: true }),
        requestId: 123,
      },
      payload,
    );

    const separated = Buffer.concat([header, payloadBuf]);

    expect(Buffer.compare(combined, separated)).toBe(0);
  });
});
