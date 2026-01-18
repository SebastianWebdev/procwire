import { describe, it, expect, beforeEach } from "vitest";
import { LineDelimitedFraming } from "../../src/framing/line-delimited.js";
import { FramingError } from "../../src/utils/errors.js";

describe("LineDelimitedFraming", () => {
  let framing: LineDelimitedFraming;

  beforeEach(() => {
    framing = new LineDelimitedFraming();
  });

  describe("encode", () => {
    it("should add newline delimiter to payload", () => {
      const payload = Buffer.from("hello");
      const encoded = framing.encode(payload);
      expect(encoded.toString()).toBe("hello\n");
    });

    it("should not add delimiter if payload already ends with one", () => {
      const payload = Buffer.from("hello\n");
      const encoded = framing.encode(payload);
      expect(encoded.toString()).toBe("hello\n");
      expect(encoded.length).toBe(6); // Not 7
    });

    it("should handle empty payload", () => {
      const payload = Buffer.allocUnsafe(0);
      const encoded = framing.encode(payload);
      expect(encoded.toString()).toBe("\n");
    });
  });

  describe("decode", () => {
    it("should decode single complete frame", () => {
      const chunk = Buffer.from("hello\n");
      const frames = framing.decode(chunk);
      expect(frames).toHaveLength(1);
      expect(frames[0]!.toString()).toBe("hello");
    });

    it("should decode multiple frames in one chunk", () => {
      const chunk = Buffer.from("hello\nworld\nfoo\n");
      const frames = framing.decode(chunk);
      expect(frames).toHaveLength(3);
      expect(frames[0]!.toString()).toBe("hello");
      expect(frames[1]!.toString()).toBe("world");
      expect(frames[2]!.toString()).toBe("foo");
    });

    it("should buffer incomplete frame", () => {
      const chunk1 = Buffer.from("hel");
      const frames1 = framing.decode(chunk1);
      expect(frames1).toHaveLength(0);
      expect(framing.hasBufferedData()).toBe(true);
      expect(framing.getBufferSize()).toBe(3);

      const chunk2 = Buffer.from("lo\n");
      const frames2 = framing.decode(chunk2);
      expect(frames2).toHaveLength(1);
      expect(frames2[0]!.toString()).toBe("hello");
      expect(framing.hasBufferedData()).toBe(false);
    });

    it("should handle split delimiter across chunks", () => {
      const chunk1 = Buffer.from("hello");
      const frames1 = framing.decode(chunk1);
      expect(frames1).toHaveLength(0);

      const chunk2 = Buffer.from("\nworld");
      const frames2 = framing.decode(chunk2);
      expect(frames2).toHaveLength(1);
      expect(frames2[0]!.toString()).toBe("hello");
      expect(framing.getBufferSize()).toBe(5); // "world" buffered
    });

    it("should handle empty frames", () => {
      const chunk = Buffer.from("\n\n");
      const frames = framing.decode(chunk);
      expect(frames).toHaveLength(2);
      expect(frames[0]!.length).toBe(0);
      expect(frames[1]!.length).toBe(0);
    });

    it("should keep delimiter when stripDelimiter is false", () => {
      const framingWithDelim = new LineDelimitedFraming({ stripDelimiter: false });
      const chunk = Buffer.from("hello\n");
      const frames = framingWithDelim.decode(chunk);
      expect(frames).toHaveLength(1);
      expect(frames[0]!.toString()).toBe("hello\n");
    });

    it("should throw FramingError when buffer exceeds maxBufferSize", () => {
      const smallFraming = new LineDelimitedFraming({ maxBufferSize: 10 });
      const chunk = Buffer.from("a".repeat(15)); // No delimiter
      expect(() => smallFraming.decode(chunk)).toThrow(FramingError);
      expect(() => smallFraming.decode(chunk)).toThrow(/exceeds maximum/);
    });

    it("should reset buffer after exceeding maxBufferSize", () => {
      const smallFraming = new LineDelimitedFraming({ maxBufferSize: 10 });
      const chunk = Buffer.from("a".repeat(15));
      try {
        smallFraming.decode(chunk);
      } catch (_e) {
        // Expected
      }
      expect(smallFraming.hasBufferedData()).toBe(false);
      expect(smallFraming.getBufferSize()).toBe(0);
    });

    it("should work with custom delimiter", () => {
      const customFraming = new LineDelimitedFraming({ delimiter: 0x7c }); // '|'
      const chunk = Buffer.from("hello|world|");
      const frames = customFraming.decode(chunk);
      expect(frames).toHaveLength(2);
      expect(frames[0]!.toString()).toBe("hello");
      expect(frames[1]!.toString()).toBe("world");
    });
  });

  describe("reset", () => {
    it("should clear buffered data", () => {
      framing.decode(Buffer.from("partial"));
      expect(framing.hasBufferedData()).toBe(true);
      framing.reset();
      expect(framing.hasBufferedData()).toBe(false);
      expect(framing.getBufferSize()).toBe(0);
    });
  });
});
