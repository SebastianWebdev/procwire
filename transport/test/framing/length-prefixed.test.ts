import { describe, it, expect, beforeEach } from "vitest";
import { LengthPrefixedFraming } from "../../src/framing/length-prefixed.js";
import { FramingError } from "../../src/utils/errors.js";

describe("LengthPrefixedFraming", () => {
  let framing: LengthPrefixedFraming;

  beforeEach(() => {
    framing = new LengthPrefixedFraming();
  });

  describe("encode", () => {
    it("should encode payload with length prefix", () => {
      const payload = Buffer.from("hello");
      const encoded = framing.encode(payload);
      expect(encoded.length).toBe(4 + 5); // header + payload
      expect(encoded.readUInt32BE(0)).toBe(5);
      expect(encoded.subarray(4).toString()).toBe("hello");
    });

    it("should handle empty payload", () => {
      const payload = Buffer.allocUnsafe(0);
      const encoded = framing.encode(payload);
      expect(encoded.length).toBe(4);
      expect(encoded.readUInt32BE(0)).toBe(0);
    });

    it("should handle large payload", () => {
      const payload = Buffer.alloc(1024 * 1024, "x"); // 1MB
      const encoded = framing.encode(payload);
      expect(encoded.readUInt32BE(0)).toBe(1024 * 1024);
    });
  });

  describe("decode", () => {
    it("should decode single complete frame", () => {
      const payload = Buffer.from("hello");
      const encoded = framing.encode(payload);
      const frames = framing.decode(encoded);
      expect(frames).toHaveLength(1);
      expect(frames[0]!.toString()).toBe("hello");
    });

    it("should decode multiple frames in one chunk", () => {
      const frame1 = framing.encode(Buffer.from("hello"));
      const frame2 = framing.encode(Buffer.from("world"));
      const chunk = Buffer.concat([frame1, frame2]);
      const frames = framing.decode(chunk);
      expect(frames).toHaveLength(2);
      expect(frames[0]!.toString()).toBe("hello");
      expect(frames[1]!.toString()).toBe("world");
    });

    it("should buffer partial header", () => {
      const encoded = framing.encode(Buffer.from("hello"));
      const chunk1 = encoded.subarray(0, 2); // Only 2 bytes of header
      const frames1 = framing.decode(chunk1);
      expect(frames1).toHaveLength(0);
      expect(framing.hasBufferedData()).toBe(true);

      const chunk2 = encoded.subarray(2); // Rest of header + payload
      const frames2 = framing.decode(chunk2);
      expect(frames2).toHaveLength(1);
      expect(frames2[0]!.toString()).toBe("hello");
    });

    it("should buffer partial payload", () => {
      const encoded = framing.encode(Buffer.from("hello"));
      const chunk1 = encoded.subarray(0, 6); // Header + "he"
      const frames1 = framing.decode(chunk1);
      expect(frames1).toHaveLength(0);
      expect(framing.hasBufferedData()).toBe(true);

      const chunk2 = encoded.subarray(6); // "llo"
      const frames2 = framing.decode(chunk2);
      expect(frames2).toHaveLength(1);
      expect(frames2[0]!.toString()).toBe("hello");
    });

    it("should handle split header across chunks", () => {
      const encoded = framing.encode(Buffer.from("test"));
      const chunk1 = encoded.subarray(0, 1); // 1 byte of header
      const chunk2 = encoded.subarray(1, 3); // 2 more bytes
      const chunk3 = encoded.subarray(3); // Last byte + payload

      expect(framing.decode(chunk1)).toHaveLength(0);
      expect(framing.decode(chunk2)).toHaveLength(0);
      const frames = framing.decode(chunk3);
      expect(frames).toHaveLength(1);
      expect(frames[0]!.toString()).toBe("test");
    });

    it("should handle zero-length frame", () => {
      const encoded = framing.encode(Buffer.allocUnsafe(0));
      const frames = framing.decode(encoded);
      expect(frames).toHaveLength(1);
      expect(frames[0]!.length).toBe(0);
    });

    it("should throw FramingError for length exceeding maxMessageSize", () => {
      const smallFraming = new LengthPrefixedFraming({ maxMessageSize: 100 });
      const header = Buffer.allocUnsafe(4);
      header.writeUInt32BE(200, 0); // Length > maxMessageSize
      expect(() => smallFraming.decode(header)).toThrow(FramingError);
      expect(() => smallFraming.decode(header)).toThrow(/exceeds maximum/);
    });

    it("should reset after length error", () => {
      const smallFraming = new LengthPrefixedFraming({ maxMessageSize: 100 });
      const header = Buffer.allocUnsafe(4);
      header.writeUInt32BE(200, 0);
      try {
        smallFraming.decode(header);
      } catch (_e) {
        // Expected
      }
      expect(smallFraming.hasBufferedData()).toBe(false);
    });

    it("should handle multiple frames with partial data", () => {
      const frame1 = framing.encode(Buffer.from("abc"));
      const frame2 = framing.encode(Buffer.from("defgh"));
      const allData = Buffer.concat([frame1, frame2]);

      // Send in weird chunks
      const chunk1 = allData.subarray(0, 5); // Partial frame1
      const chunk2 = allData.subarray(5, 10); // Rest of frame1 + partial frame2
      const chunk3 = allData.subarray(10); // Rest of frame2

      const frames1 = framing.decode(chunk1);
      expect(frames1).toHaveLength(0);

      const frames2 = framing.decode(chunk2);
      expect(frames2).toHaveLength(1);
      expect(frames2[0]!.toString()).toBe("abc");

      const frames3 = framing.decode(chunk3);
      expect(frames3).toHaveLength(1);
      expect(frames3[0]!.toString()).toBe("defgh");
    });

    it("should throw if buffer grows unbounded", () => {
      const framing = new LengthPrefixedFraming({ maxMessageSize: 1000 });
      // Valid header indicating 500 bytes
      const header = Buffer.allocUnsafe(4);
      header.writeUInt32BE(500, 0);
      framing.decode(header);

      // Send more data than header + maxMessageSize
      const oversized = Buffer.alloc(2000, "x");
      expect(() => framing.decode(oversized)).toThrow(FramingError);
    });
  });

  describe("reset", () => {
    it("should clear buffered data and expected length", () => {
      const encoded = framing.encode(Buffer.from("test"));
      framing.decode(encoded.subarray(0, 3)); // Partial header
      expect(framing.hasBufferedData()).toBe(true);
      framing.reset();
      expect(framing.hasBufferedData()).toBe(false);
      expect(framing.getBufferSize()).toBe(0);
    });
  });
});
