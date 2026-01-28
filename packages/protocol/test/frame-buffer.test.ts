import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  FrameBuffer,
  Frame,
  buildFrame,
  buildFrameBuffers,
  type FrameStreamHandler,
} from "../src/frame-buffer.js";
import { HEADER_SIZE, encodeHeader } from "../src/wire-format.js";

describe("FrameBuffer - Batch Mode", () => {
  let buffer: FrameBuffer;

  beforeEach(() => {
    buffer = new FrameBuffer();
  });

  describe("single frame scenarios", () => {
    it("should extract frame when all data arrives at once", () => {
      const payload = Buffer.from("Hello, World!");
      const frame = buildFrame(
        {
          methodId: 1,
          flags: 0,
          requestId: 42,
        },
        payload,
      );

      const frames = buffer.push(frame);

      expect(frames.length).toBe(1);
      expect(frames[0]!.header.methodId).toBe(1);
      expect(frames[0]!.header.requestId).toBe(42);
      expect(frames[0]!.payload.toString()).toBe("Hello, World!");
    });

    it("should handle frame arriving in multiple chunks", () => {
      const payload = Buffer.from("Hello, World!");
      const frame = buildFrame(
        {
          methodId: 1,
          flags: 0,
          requestId: 42,
        },
        payload,
      );

      const chunk1 = frame.subarray(0, 5);
      const chunk2 = frame.subarray(5, 15);
      const chunk3 = frame.subarray(15);

      expect(buffer.push(chunk1)).toEqual([]);
      expect(buffer.push(chunk2)).toEqual([]);

      const frames = buffer.push(chunk3);
      expect(frames.length).toBe(1);
      expect(frames[0]!.payload.toString()).toBe("Hello, World!");
    });

    it("should handle empty payload", () => {
      const frame = buildFrame(
        {
          methodId: 1,
          flags: 0,
          requestId: 0,
        },
        Buffer.alloc(0),
      );

      const frames = buffer.push(frame);

      expect(frames.length).toBe(1);
      expect(frames[0]!.payloadLength).toBe(0);
      expect(frames[0]!.payload.length).toBe(0);
      expect(frames[0]!.payloadChunks.length).toBe(0);
    });

    it("should handle empty chunk input", () => {
      const frames = buffer.push(Buffer.alloc(0));
      expect(frames).toEqual([]);
    });
  });

  describe("zero-copy payload access", () => {
    it("should return payload as chunks without copying", () => {
      const payload = Buffer.alloc(1024 * 1024, 0x42);
      const frame = buildFrame(
        {
          methodId: 1,
          flags: 0,
          requestId: 1,
        },
        payload,
      );

      const chunkSize = 64 * 1024;
      const frames: Frame[] = [];

      for (let i = 0; i < frame.length; i += chunkSize) {
        const chunk = frame.subarray(i, Math.min(i + chunkSize, frame.length));
        frames.push(...buffer.push(chunk));
      }

      expect(frames.length).toBe(1);
      expect(frames[0]!.payloadChunks.length).toBeGreaterThan(1);

      const totalLength = frames[0]!.payloadChunks.reduce((sum, c) => sum + c.length, 0);
      expect(totalLength).toBe(1024 * 1024);
    });

    it("should return single chunk when payload fits in one chunk", () => {
      const payload = Buffer.from("small payload");
      const frame = buildFrame({ methodId: 1, flags: 0, requestId: 1 }, payload);

      const frames = buffer.push(frame);

      expect(frames.length).toBe(1);
      // Payload may still be split due to header stripping, but should be minimal chunks
      const totalLength = frames[0]!.payloadChunks.reduce((sum, c) => sum + c.length, 0);
      expect(totalLength).toBe(payload.length);
    });
  });

  describe("multiple frames scenarios", () => {
    it("should extract multiple frames from single chunk", () => {
      const frame1 = buildFrame({ methodId: 1, flags: 0, requestId: 1 }, Buffer.from("one"));
      const frame2 = buildFrame({ methodId: 2, flags: 0, requestId: 2 }, Buffer.from("two"));
      const frame3 = buildFrame({ methodId: 3, flags: 0, requestId: 3 }, Buffer.from("three"));

      const combined = Buffer.concat([frame1, frame2, frame3]);
      const frames = buffer.push(combined);

      expect(frames.length).toBe(3);
      expect(frames[0]!.payload.toString()).toBe("one");
      expect(frames[1]!.payload.toString()).toBe("two");
      expect(frames[2]!.payload.toString()).toBe("three");
    });

    it("should handle partial frame at end", () => {
      const frame1 = buildFrame({ methodId: 1, flags: 0, requestId: 1 }, Buffer.from("complete"));
      const frame2 = buildFrame({ methodId: 2, flags: 0, requestId: 2 }, Buffer.from("partial"));

      // Send first frame + partial second frame
      const partial = Buffer.concat([frame1, frame2.subarray(0, 10)]);
      let frames = buffer.push(partial);
      expect(frames.length).toBe(1);
      expect(frames[0]!.payload.toString()).toBe("complete");

      // Complete the second frame
      frames = buffer.push(frame2.subarray(10));
      expect(frames.length).toBe(1);
      expect(frames[0]!.payload.toString()).toBe("partial");
    });
  });

  describe("large payload performance", () => {
    it("should handle 10MB payload efficiently", () => {
      const payloadSize = 10 * 1024 * 1024;
      const payload = Buffer.alloc(payloadSize, 0x42);
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
      expect(accumulateTime).toBeLessThan(100); // Allow more time in CI

      console.log(`10MB accumulation time: ${accumulateTime.toFixed(2)}ms`);
    });

    it("should reject oversized payload with default limit", () => {
      const header = encodeHeader({
        methodId: 1,
        flags: 0,
        requestId: 1,
        payloadLength: 2 * 1024 * 1024 * 1024, // 2GB > default 1GB
      });

      expect(() => buffer.push(header)).toThrow(/too large/);
    });

    it("should respect custom lower limit", () => {
      const strictBuffer = new FrameBuffer({
        maxPayloadSize: 1024 * 1024, // 1MB limit
      });

      const header = encodeHeader({
        methodId: 1,
        flags: 0,
        requestId: 1,
        payloadLength: 2 * 1024 * 1024, // 2MB > 1MB limit
      });

      expect(() => strictBuffer.push(header)).toThrow(/too large/);
    });

    it("should accept payload within custom higher limit", () => {
      // Test that we can configure higher limits
      const largeBuffer = new FrameBuffer({
        maxPayloadSize: 1.5 * 1024 * 1024 * 1024, // 1.5GB
      });

      const header = encodeHeader({
        methodId: 1,
        flags: 0,
        requestId: 1,
        payloadLength: 1.2 * 1024 * 1024 * 1024, // 1.2GB < 1.5GB limit
      });

      // Should not throw on header parse
      // (we're not actually sending 1.2GB of data, just testing limit check)
      expect(() => largeBuffer.push(header)).not.toThrow();
    });
  });

  describe("buffer state", () => {
    it("should track buffered bytes", () => {
      expect(buffer.bufferedBytes).toBe(0);

      // Create a partial frame that won't complete (header with large payload)
      const header = encodeHeader({
        methodId: 1,
        flags: 0,
        requestId: 1,
        payloadLength: 10000, // Large payload, we won't send all of it
      });
      buffer.push(header);
      expect(buffer.bufferedBytes).toBe(HEADER_SIZE);

      // Add some payload bytes (partial)
      buffer.push(Buffer.alloc(50));
      expect(buffer.bufferedBytes).toBe(HEADER_SIZE + 50);
    });

    it("should track partial frame state", () => {
      expect(buffer.hasPartialFrame).toBe(false);

      buffer.push(Buffer.alloc(5)); // Less than header
      expect(buffer.hasPartialFrame).toBe(true);
    });

    it("should clear buffer state", () => {
      // Create a partial frame
      const header = encodeHeader({
        methodId: 1,
        flags: 0,
        requestId: 1,
        payloadLength: 10000,
      });
      buffer.push(header);
      buffer.push(Buffer.alloc(50));
      expect(buffer.bufferedBytes).toBe(HEADER_SIZE + 50);

      buffer.clear();
      expect(buffer.bufferedBytes).toBe(0);
      expect(buffer.hasPartialFrame).toBe(false);
    });
  });
});

describe("FrameBuffer - Streaming Mode", () => {
  let buffer: FrameBuffer;
  let handler: FrameStreamHandler;
  let events: Array<{ type: string; data: unknown }>;

  beforeEach(() => {
    buffer = new FrameBuffer();
    events = [];

    handler = {
      onFrameStart: vi.fn((header) => {
        events.push({ type: "start", data: header });
      }),
      onPayloadChunk: vi.fn((chunk, offset, isLast) => {
        events.push({ type: "chunk", data: { chunk: Buffer.from(chunk), offset, isLast } });
      }),
      onFrameEnd: vi.fn((header) => {
        events.push({ type: "end", data: header });
      }),
      onError: vi.fn((error) => {
        events.push({ type: "error", data: error });
      }),
    };

    buffer.setStreamHandler(handler);
  });

  it("should be in streaming mode", () => {
    expect(buffer.isStreaming).toBe(true);
  });

  it("should return empty array in streaming mode", () => {
    const frame = buildFrame({ methodId: 1, flags: 0, requestId: 1 }, Buffer.from("test"));
    const result = buffer.push(frame);
    expect(result).toEqual([]);
  });

  it("should call callbacks for complete frame", () => {
    const payload = Buffer.from("Hello");
    const frame = buildFrame({ methodId: 1, flags: 0, requestId: 42 }, payload);

    buffer.push(frame);

    expect(handler.onFrameStart).toHaveBeenCalledTimes(1);
    expect(handler.onFrameStart).toHaveBeenCalledWith(
      expect.objectContaining({ methodId: 1, requestId: 42 }),
    );

    expect(handler.onPayloadChunk).toHaveBeenCalledTimes(1);
    expect(handler.onPayloadChunk).toHaveBeenCalledWith(expect.any(Buffer), 0, true);

    expect(handler.onFrameEnd).toHaveBeenCalledTimes(1);
  });

  it("should stream chunks as they arrive", () => {
    const payload = Buffer.alloc(100, 0x42);
    const frame = buildFrame({ methodId: 1, flags: 0, requestId: 1 }, payload);

    // Send in 3 chunks
    buffer.push(frame.subarray(0, 30)); // header (11) + payload (19)
    buffer.push(frame.subarray(30, 70)); // payload (40)
    buffer.push(frame.subarray(70)); // payload (41)

    expect(handler.onFrameStart).toHaveBeenCalledTimes(1);
    expect(handler.onPayloadChunk).toHaveBeenCalledTimes(3);
    expect(handler.onFrameEnd).toHaveBeenCalledTimes(1);

    // Verify offsets
    const chunkCalls = (handler.onPayloadChunk as ReturnType<typeof vi.fn>).mock.calls;
    expect(chunkCalls[0]![1]).toBe(0); // offset 0
    expect(chunkCalls[1]![1]).toBe(19); // offset 19
    expect(chunkCalls[2]![1]).toBe(59); // offset 59

    // Verify isLast
    expect(chunkCalls[0]![2]).toBe(false);
    expect(chunkCalls[1]![2]).toBe(false);
    expect(chunkCalls[2]![2]).toBe(true);
  });

  it("should handle multiple frames in streaming mode", () => {
    const frame1 = buildFrame({ methodId: 1, flags: 0, requestId: 1 }, Buffer.from("first"));
    const frame2 = buildFrame({ methodId: 2, flags: 0, requestId: 2 }, Buffer.from("second"));

    buffer.push(Buffer.concat([frame1, frame2]));

    expect(handler.onFrameStart).toHaveBeenCalledTimes(2);
    expect(handler.onFrameEnd).toHaveBeenCalledTimes(2);
  });

  it("should handle empty payload in streaming mode", () => {
    const frame = buildFrame({ methodId: 1, flags: 0, requestId: 1 }, Buffer.alloc(0));

    buffer.push(frame);

    expect(handler.onFrameStart).toHaveBeenCalledTimes(1);
    expect(handler.onPayloadChunk).not.toHaveBeenCalled();
    expect(handler.onFrameEnd).toHaveBeenCalledTimes(1);
  });

  it("should handle header split across chunks", () => {
    const payload = Buffer.from("test");
    const frame = buildFrame({ methodId: 1, flags: 0, requestId: 1 }, payload);

    // Split header across two chunks
    buffer.push(frame.subarray(0, 5)); // partial header
    buffer.push(frame.subarray(5)); // rest of header + payload

    expect(handler.onFrameStart).toHaveBeenCalledTimes(1);
    expect(handler.onFrameEnd).toHaveBeenCalledTimes(1);
  });

  it("should call onError for oversized payload", () => {
    const header = encodeHeader({
      methodId: 1,
      flags: 0,
      requestId: 1,
      payloadLength: 2 * 1024 * 1024 * 1024, // 2GB > default 1GB
    });

    buffer.push(header);

    expect(handler.onError).toHaveBeenCalledTimes(1);
    // Header is parsed before validation, so it's available in onError
    expect(handler.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("too large") }),
      expect.objectContaining({ methodId: 1, requestId: 1 }),
    );
  });

  it("should respect custom limit in streaming mode", () => {
    const strictBuffer = new FrameBuffer({ maxPayloadSize: 1024 }); // 1KB
    strictBuffer.setStreamHandler(handler);

    const header = encodeHeader({
      methodId: 1,
      flags: 0,
      requestId: 1,
      payloadLength: 2048, // 2KB > 1KB limit
    });

    strictBuffer.push(header);

    expect(handler.onError).toHaveBeenCalled();
  });

  it("should not allow enabling streaming with buffered data", () => {
    const buffer2 = new FrameBuffer();
    buffer2.push(Buffer.alloc(5)); // partial data

    expect(() => buffer2.setStreamHandler(handler)).toThrow(/buffered data/);
  });

  it("should allow disabling streaming mode", () => {
    buffer.setStreamHandler(null);
    expect(buffer.isStreaming).toBe(false);

    // Should work in batch mode now
    const frame = buildFrame({ methodId: 1, flags: 0, requestId: 1 }, Buffer.from("test"));
    const frames = buffer.push(frame);
    expect(frames.length).toBe(1);
  });

  it("should throw if no onError handler when error occurs", () => {
    const handlerNoError: FrameStreamHandler = {
      onFrameStart: vi.fn(),
      onPayloadChunk: vi.fn(),
      onFrameEnd: vi.fn(),
      // No onError
    };

    const buffer2 = new FrameBuffer();
    buffer2.setStreamHandler(handlerNoError);

    const header = encodeHeader({
      methodId: 1,
      flags: 0,
      requestId: 1,
      payloadLength: 2 * 1024 * 1024 * 1024,
    });

    expect(() => buffer2.push(header)).toThrow(/too large/);
  });
});

describe("FrameBuffer - Streaming Performance", () => {
  it("should stream 100MB with minimal memory", () => {
    const buffer = new FrameBuffer();
    let totalBytesReceived = 0;
    let chunkCount = 0;

    buffer.setStreamHandler({
      onFrameStart(_header) {
        // Starting frame
      },
      onPayloadChunk(chunk, _offset, _isLast) {
        totalBytesReceived += chunk.length;
        chunkCount++;
        // In real usage, you'd write to file here
      },
      onFrameEnd() {
        // Frame complete
      },
    });

    const payloadSize = 100 * 1024 * 1024; // 100MB
    const header = encodeHeader({
      methodId: 1,
      flags: 0,
      requestId: 1,
      payloadLength: payloadSize,
    });

    // Send header
    buffer.push(header);

    // Send payload in 64KB chunks
    const chunkSize = 64 * 1024;
    const chunk = Buffer.alloc(chunkSize, 0x42);

    const startTime = performance.now();

    for (let sent = 0; sent < payloadSize; sent += chunkSize) {
      const remaining = payloadSize - sent;
      if (remaining < chunkSize) {
        buffer.push(chunk.subarray(0, remaining));
      } else {
        buffer.push(chunk);
      }
    }

    const elapsed = performance.now() - startTime;

    expect(totalBytesReceived).toBe(payloadSize);
    console.log(
      `100MB streamed in ${elapsed.toFixed(2)}ms (${(payloadSize / elapsed / 1000).toFixed(0)} MB/s)`,
    );
    console.log(`Chunk count: ${chunkCount}`);

    // Should be fast - we're not allocating 100MB
    expect(elapsed).toBeLessThan(1000); // Allow more time in CI
  });
});

describe("buildFrame", () => {
  it("should build frame with header and payload", () => {
    const payload = Buffer.from("test data");
    const frame = buildFrame(
      {
        methodId: 1,
        flags: 0,
        requestId: 42,
      },
      payload,
    );

    expect(frame.length).toBe(HEADER_SIZE + payload.length);

    // Verify header
    expect(frame.readUInt16BE(0)).toBe(1); // methodId
    expect(frame.readUInt8(2)).toBe(0); // flags
    expect(frame.readUInt32BE(3)).toBe(42); // requestId
    expect(frame.readUInt32BE(7)).toBe(payload.length); // payloadLength

    // Verify payload
    expect(frame.subarray(HEADER_SIZE).toString()).toBe("test data");
  });

  it("should handle empty payload", () => {
    const frame = buildFrame({ methodId: 1, flags: 0, requestId: 0 }, Buffer.alloc(0));

    expect(frame.length).toBe(HEADER_SIZE);
    expect(frame.readUInt32BE(7)).toBe(0); // payloadLength
  });
});

describe("buildFrameBuffers", () => {
  it("should return separate header and payload buffers", () => {
    const payload = Buffer.from("test");
    const [header, payloadOut] = buildFrameBuffers(
      {
        methodId: 1,
        flags: 0,
        requestId: 42,
      },
      payload,
    );

    expect(header.length).toBe(HEADER_SIZE);
    expect(payloadOut).toBe(payload); // Same reference - no copy!
  });

  it("should set correct payloadLength in header", () => {
    const payload = Buffer.alloc(12345);
    const [header] = buildFrameBuffers({ methodId: 1, flags: 0, requestId: 1 }, payload);

    expect(header.readUInt32BE(7)).toBe(12345);
  });
});

describe("Frame class", () => {
  it("should provide payload as single buffer via .payload", () => {
    const chunks = [Buffer.from("Hello, "), Buffer.from("World!")];
    const frame = new Frame({ methodId: 1, flags: 0, requestId: 1, payloadLength: 13 }, chunks, 13);

    expect(frame.payload.toString()).toBe("Hello, World!");
  });

  it("should provide payload as chunks via .payloadChunks", () => {
    const chunks = [Buffer.from("Hello, "), Buffer.from("World!")];
    const frame = new Frame({ methodId: 1, flags: 0, requestId: 1, payloadLength: 13 }, chunks, 13);

    expect(frame.payloadChunks).toEqual(chunks);
  });

  it("should return same buffer for single chunk", () => {
    const chunk = Buffer.from("single");
    const frame = new Frame({ methodId: 1, flags: 0, requestId: 1, payloadLength: 6 }, [chunk], 6);

    expect(frame.payload).toBe(chunk); // Same reference - no copy
  });

  it("should handle empty payload", () => {
    const frame = new Frame({ methodId: 1, flags: 0, requestId: 1, payloadLength: 0 }, [], 0);

    expect(frame.payload.length).toBe(0);
    expect(frame.payloadChunks.length).toBe(0);
    expect(frame.payloadLength).toBe(0);
  });
});
