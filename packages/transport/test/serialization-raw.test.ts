import { describe, it, expect } from "vitest";
import { RawCodec } from "../src/serialization/raw.js";

describe("RawCodec", () => {
  describe("passthrough behavior", () => {
    it("should return the exact same buffer instance on serialize", () => {
      const codec = new RawCodec();
      const buffer = Buffer.from([1, 2, 3, 4]);

      const result = codec.serialize(buffer);

      expect(result).toBe(buffer);
      expect(result === buffer).toBe(true);
    });

    it("should return the exact same buffer instance on deserialize", () => {
      const codec = new RawCodec();
      const buffer = Buffer.from([5, 6, 7, 8]);

      const result = codec.deserialize(buffer);

      expect(result).toBe(buffer);
      expect(result === buffer).toBe(true);
    });

    it("should perform roundtrip with same buffer instance", () => {
      const codec = new RawCodec();
      const original = Buffer.from("Hello, World!", "utf8");

      const serialized = codec.serialize(original);
      const deserialized = codec.deserialize(serialized);

      expect(deserialized).toBe(original);
      expect(serialized).toBe(original);
      expect(deserialized === original).toBe(true);
    });
  });

  describe("buffer content preservation", () => {
    it("should preserve buffer contents", () => {
      const codec = new RawCodec();
      const buffer = Buffer.from([0xff, 0x00, 0xaa, 0x55]);

      const result = codec.serialize(buffer);

      expect(result).toEqual(Buffer.from([0xff, 0x00, 0xaa, 0x55]));
      expect(Array.from(result)).toEqual([0xff, 0x00, 0xaa, 0x55]);
    });

    it("should handle empty buffers", () => {
      const codec = new RawCodec();
      const empty = Buffer.alloc(0);

      const result = codec.serialize(empty);

      expect(result).toBe(empty);
      expect(result.length).toBe(0);
    });

    it("should handle large buffers", () => {
      const codec = new RawCodec();
      const large = Buffer.alloc(1024 * 1024); // 1MB
      for (let i = 0; i < large.length; i++) {
        large[i] = i % 256;
      }

      const result = codec.serialize(large);

      expect(result).toBe(large);
      expect(result.length).toBe(1024 * 1024);
    });
  });

  describe("mutation visibility", () => {
    it("should reflect mutations in the original buffer (no copy)", () => {
      const codec = new RawCodec();
      const buffer = Buffer.from([1, 2, 3]);

      const serialized = codec.serialize(buffer);
      buffer[0] = 99;

      expect(serialized[0]).toBe(99);
      expect(buffer[0]).toBe(99);
    });

    it("should reflect mutations after deserialization (no copy)", () => {
      const codec = new RawCodec();
      const buffer = Buffer.from([1, 2, 3]);

      const deserialized = codec.deserialize(buffer);
      deserialized[1] = 88;

      expect(buffer[1]).toBe(88);
      expect(deserialized[1]).toBe(88);
    });
  });

  describe("codec metadata", () => {
    it("should have correct name and contentType", () => {
      const codec = new RawCodec();

      expect(codec.name).toBe("raw");
      expect(codec.contentType).toBe("application/octet-stream");
    });
  });

  describe("binary data handling", () => {
    it("should handle binary data correctly", () => {
      const codec = new RawCodec();
      const binary = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);

      const result = codec.serialize(binary);

      expect(result).toBe(binary);
      expect(result.toString("hex")).toBe("000102fffefd");
    });

    it("should handle buffers created from strings", () => {
      const codec = new RawCodec();
      const buffer = Buffer.from("test data", "utf8");

      const result = codec.deserialize(buffer);

      expect(result).toBe(buffer);
      expect(result.toString("utf8")).toBe("test data");
    });
  });
});
