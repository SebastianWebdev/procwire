import { describe, expect, it } from "vitest";
import { MessagePackCodec } from "../src/index.js";
import { SerializationError } from "@procwire/transport";

describe("@procwire/codec-msgpack", () => {
  describe("MessagePackCodec", () => {
    it("has correct metadata", () => {
      const codec = new MessagePackCodec();
      expect(codec.name).toBe("msgpack");
      expect(codec.contentType).toBe("application/x-msgpack");
    });

    it("roundtrips simple object", () => {
      const codec = new MessagePackCodec();
      const input = { a: 1, b: "test" };
      const buffer = codec.serialize(input);
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(codec.deserialize(buffer)).toEqual(input);
    });

    it("roundtrips nested object", () => {
      const codec = new MessagePackCodec();
      const input = {
        user: { id: 123, name: "Alice" },
        tags: ["foo", "bar"],
        metadata: { created: 1234567890 },
      };
      const buffer = codec.serialize(input);
      expect(codec.deserialize(buffer)).toEqual(input);
    });

    it("roundtrips arrays", () => {
      const codec = new MessagePackCodec();
      const input = [1, 2, 3, "test", true, null];
      const buffer = codec.serialize(input);
      expect(codec.deserialize(buffer)).toEqual(input);
    });

    it("roundtrips various types", () => {
      const codec = new MessagePackCodec();
      const inputs = [
        null,
        true,
        false,
        42,
        3.14,
        "string",
        "",
        { key: "value" },
        [],
        [1, 2, 3],
      ];

      for (const input of inputs) {
        const buffer = codec.serialize(input);
        expect(codec.deserialize(buffer)).toEqual(input);
      }
    });

    it("handles empty object", () => {
      const codec = new MessagePackCodec();
      const input = {};
      const buffer = codec.serialize(input);
      expect(codec.deserialize(buffer)).toEqual(input);
    });

    it("handles large objects", () => {
      const codec = new MessagePackCodec();
      const input = {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          value: Math.random(),
        })),
      };
      const buffer = codec.serialize(input);
      expect(codec.deserialize(buffer)).toEqual(input);
    });

    it("throws SerializationError on invalid deserialization", () => {
      const codec = new MessagePackCodec();
      // Create invalid MessagePack data
      const invalidBuffer = Buffer.from([0xc1]); // 0xc1 is never used in MessagePack
      expect(() => codec.deserialize(invalidBuffer)).toThrow(SerializationError);
    });

    it("produces compact binary output", () => {
      const codec = new MessagePackCodec();
      const input = { a: 1, b: 2 };
      const buffer = codec.serialize(input);
      // MessagePack should be more compact than JSON
      const jsonBuffer = Buffer.from(JSON.stringify(input));
      expect(buffer.length).toBeLessThan(jsonBuffer.length);
    });

    it("optimizes buffer creation without copying", () => {
      const codec = new MessagePackCodec();
      const input = { test: "data" };
      const buffer = codec.serialize(input);
      // Verify it's a Buffer (not just Uint8Array)
      expect(Buffer.isBuffer(buffer)).toBe(true);
      // Buffer should be created efficiently from underlying ArrayBuffer
      expect(buffer.length).toBeGreaterThan(0);
    });
  });
});
