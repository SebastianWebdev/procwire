import { describe, it, expect } from "vitest";
import { MsgPackCodec, msgpackCodec } from "../src/msgpack-codec.js";

describe("MsgPackCodec", () => {
  describe("interface", () => {
    it("should have name 'msgpack'", () => {
      expect(new MsgPackCodec().name).toBe("msgpack");
    });

    it("should export singleton", () => {
      expect(msgpackCodec).toBeInstanceOf(MsgPackCodec);
      expect(msgpackCodec.name).toBe("msgpack");
    });
  });

  describe("round-trip", () => {
    it("should serialize/deserialize simple object", () => {
      const codec = new MsgPackCodec<{ name: string; count: number }>();
      const original = { name: "test", count: 42 };

      const buffer = codec.serialize(original);
      const result = codec.deserialize(buffer);

      expect(result).toEqual(original);
    });

    it("should handle nested objects", () => {
      const codec = new MsgPackCodec<{ user: { name: string }; tags: string[] }>();
      const original = { user: { name: "Alice" }, tags: ["a", "b"] };

      expect(codec.deserialize(codec.serialize(original))).toEqual(original);
    });

    it("should handle arrays", () => {
      const codec = new MsgPackCodec<number[]>();
      const original = [1, 2, 3, 4, 5];

      expect(codec.deserialize(codec.serialize(original))).toEqual(original);
    });

    it("should handle null values", () => {
      const codec = new MsgPackCodec<{ a: null; b: null }>();
      const original = { a: null, b: null };

      const result = codec.deserialize(codec.serialize(original));

      expect(result.a).toBeNull();
      expect(result.b).toBeNull();
    });

    it("should convert undefined to null (msgpack behavior)", () => {
      const codec = new MsgPackCodec<{ a: undefined }>();
      const original = { a: undefined };

      const result = codec.deserialize(codec.serialize(original));

      // msgpack serializes undefined as nil, which deserializes as null
      expect(result.a).toBeNull();
    });

    it("should handle numbers (int and float)", () => {
      const codec = new MsgPackCodec<{ int: number; float: number; negative: number }>();
      const original = { int: 42, float: 3.14159, negative: -100 };

      expect(codec.deserialize(codec.serialize(original))).toEqual(original);
    });

    it("should handle boolean values", () => {
      const codec = new MsgPackCodec<{ yes: boolean; no: boolean }>();
      const original = { yes: true, no: false };

      expect(codec.deserialize(codec.serialize(original))).toEqual(original);
    });

    it("should handle empty objects and arrays", () => {
      const codec = new MsgPackCodec<{ obj: object; arr: unknown[] }>();
      const original = { obj: {}, arr: [] };

      expect(codec.deserialize(codec.serialize(original))).toEqual(original);
    });
  });

  describe("Date extension", () => {
    it("should handle Date objects", () => {
      const codec = new MsgPackCodec<{ created: Date }>();
      const original = { created: new Date("2024-01-15T10:30:00Z") };

      const result = codec.deserialize(codec.serialize(original));

      expect(result.created).toBeInstanceOf(Date);
      expect(result.created.getTime()).toBe(original.created.getTime());
    });

    it("should handle Date at epoch", () => {
      const codec = new MsgPackCodec<Date>();
      const original = new Date(0);

      const result = codec.deserialize(codec.serialize(original));

      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBe(0);
    });

    it("should handle Date with milliseconds", () => {
      const codec = new MsgPackCodec<Date>();
      const original = new Date("2024-06-15T12:30:45.123Z");

      const result = codec.deserialize(codec.serialize(original));

      expect(result.getTime()).toBe(original.getTime());
    });

    it("should handle nested Date objects", () => {
      const codec = new MsgPackCodec<{ dates: { start: Date; end: Date } }>();
      const original = {
        dates: {
          start: new Date("2024-01-01"),
          end: new Date("2024-12-31"),
        },
      };

      const result = codec.deserialize(codec.serialize(original));

      expect(result.dates.start).toBeInstanceOf(Date);
      expect(result.dates.end).toBeInstanceOf(Date);
      expect(result.dates.start.getTime()).toBe(original.dates.start.getTime());
      expect(result.dates.end.getTime()).toBe(original.dates.end.getTime());
    });
  });

  describe("Buffer extension", () => {
    it("should handle Buffer objects", () => {
      const codec = new MsgPackCodec<{ data: Buffer }>();
      const original = { data: Buffer.from([1, 2, 3, 4]) };

      const result = codec.deserialize(codec.serialize(original));

      expect(Buffer.isBuffer(result.data)).toBe(true);
      expect(Buffer.compare(result.data, original.data)).toBe(0);
    });

    it("should handle empty Buffer", () => {
      const codec = new MsgPackCodec<Buffer>();
      const original = Buffer.alloc(0);

      const result = codec.deserialize(codec.serialize(original));

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it("should handle Buffer from string", () => {
      const codec = new MsgPackCodec<Buffer>();
      const original = Buffer.from("hello world", "utf8");

      const result = codec.deserialize(codec.serialize(original));

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.toString("utf8")).toBe("hello world");
    });

    it("should handle large Buffer", () => {
      const codec = new MsgPackCodec<Buffer>();
      const original = Buffer.alloc(10000);
      for (let i = 0; i < original.length; i++) {
        original[i] = i % 256;
      }

      const result = codec.deserialize(codec.serialize(original));

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(Buffer.compare(result, original)).toBe(0);
    });

    it("should handle Buffer with binary data", () => {
      const codec = new MsgPackCodec<{ binary: Buffer }>();
      const original = { binary: Buffer.from([0x00, 0xff, 0x7f, 0x80]) };

      const result = codec.deserialize(codec.serialize(original));

      expect(Buffer.compare(result.binary, original.binary)).toBe(0);
    });
  });

  describe("mixed extensions", () => {
    it("should handle objects with both Date and Buffer", () => {
      const codec = new MsgPackCodec<{
        timestamp: Date;
        payload: Buffer;
        name: string;
      }>();
      const original = {
        timestamp: new Date("2024-06-15T12:00:00Z"),
        payload: Buffer.from([1, 2, 3]),
        name: "test",
      };

      const result = codec.deserialize(codec.serialize(original));

      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.timestamp.getTime()).toBe(original.timestamp.getTime());
      expect(Buffer.isBuffer(result.payload)).toBe(true);
      expect(Buffer.compare(result.payload, original.payload)).toBe(0);
      expect(result.name).toBe("test");
    });

    it("should handle array of objects with extensions", () => {
      const codec = new MsgPackCodec<Array<{ date: Date; data: Buffer }>>();
      const original = [
        { date: new Date("2024-01-01"), data: Buffer.from([1]) },
        { date: new Date("2024-02-01"), data: Buffer.from([2]) },
      ];

      const result = codec.deserialize(codec.serialize(original));

      expect(result).toHaveLength(2);
      expect(result[0]!.date).toBeInstanceOf(Date);
      expect(result[1]!.date).toBeInstanceOf(Date);
      expect(Buffer.isBuffer(result[0]!.data)).toBe(true);
      expect(Buffer.isBuffer(result[1]!.data)).toBe(true);
    });
  });

  describe("performance", () => {
    it("should be compact for typical payloads", () => {
      const codec = new MsgPackCodec();
      // MsgPack is more compact for integer-heavy payloads
      const data = {
        method: "query",
        params: { ids: Array.from({ length: 100 }, (_, i) => i), topK: 10 },
      };

      const msgpackSize = codec.serialize(data).length;
      const jsonSize = Buffer.from(JSON.stringify(data)).length;

      // MsgPack should be smaller for integer arrays
      expect(msgpackSize).toBeLessThan(jsonSize);
    });

    it("should use Buffer view (zero-copy check)", () => {
      const codec = new MsgPackCodec();
      const data = { test: "data" };

      const buffer = codec.serialize(data);

      // Buffer should be created from ArrayBuffer view
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });

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

      // Performance: should be under 100ms for 10000 messages
      expect(serializeTime).toBeLessThan(100);
      expect(deserializeTime).toBeLessThan(100);
    });
  });
});
