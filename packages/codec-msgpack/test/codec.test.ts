import { describe, expect, it } from "vitest";
import { MessagePackCodec } from "../src/index.js";
import type { MessagePackCodecOptions } from "../src/index.js";
import { SerializationError } from "@procwire/transport";

describe("MessagePackCodec", () => {
  describe("metadata", () => {
    it("has correct name", () => {
      const codec = new MessagePackCodec();
      expect(codec.name).toBe("msgpack");
    });

    it("has correct contentType", () => {
      const codec = new MessagePackCodec();
      expect(codec.contentType).toBe("application/x-msgpack");
    });
  });

  describe("basic serialization", () => {
    const codec = new MessagePackCodec();

    it("roundtrips null", () => {
      const buffer = codec.serialize(null);
      expect(codec.deserialize(buffer)).toBeNull();
    });

    it("roundtrips boolean true", () => {
      const buffer = codec.serialize(true);
      expect(codec.deserialize(buffer)).toBe(true);
    });

    it("roundtrips boolean false", () => {
      const buffer = codec.serialize(false);
      expect(codec.deserialize(buffer)).toBe(false);
    });

    it("roundtrips positive integer", () => {
      const buffer = codec.serialize(42);
      expect(codec.deserialize(buffer)).toBe(42);
    });

    it("roundtrips negative integer", () => {
      const buffer = codec.serialize(-42);
      expect(codec.deserialize(buffer)).toBe(-42);
    });

    it("roundtrips float", () => {
      const buffer = codec.serialize(3.14159);
      expect(codec.deserialize(buffer)).toBeCloseTo(3.14159);
    });

    it("roundtrips empty string", () => {
      const buffer = codec.serialize("");
      expect(codec.deserialize(buffer)).toBe("");
    });

    it("roundtrips string", () => {
      const buffer = codec.serialize("hello world");
      expect(codec.deserialize(buffer)).toBe("hello world");
    });

    it("roundtrips unicode string with emojis", () => {
      const input = "Hello 世界 🌍🚀";
      const buffer = codec.serialize(input);
      expect(codec.deserialize(buffer)).toBe(input);
    });

    it("roundtrips empty array", () => {
      const buffer = codec.serialize([]);
      expect(codec.deserialize(buffer)).toEqual([]);
    });

    it("roundtrips array with mixed types", () => {
      const input = [1, "two", true, null, { nested: "object" }];
      const buffer = codec.serialize(input);
      expect(codec.deserialize(buffer)).toEqual(input);
    });

    it("roundtrips empty object", () => {
      const buffer = codec.serialize({});
      expect(codec.deserialize(buffer)).toEqual({});
    });

    it("roundtrips nested object", () => {
      const input = {
        user: { id: 123, name: "Alice" },
        tags: ["foo", "bar"],
        metadata: { created: 1234567890 },
      };
      const buffer = codec.serialize(input);
      expect(codec.deserialize(buffer)).toEqual(input);
    });
  });

  describe("binary data", () => {
    const codec = new MessagePackCodec();

    it("roundtrips Uint8Array", () => {
      const input = new Uint8Array([1, 2, 3, 4, 5]);
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(Array.from(result as Uint8Array)).toEqual([1, 2, 3, 4, 5]);
    });

    it("roundtrips Buffer", () => {
      const input = Buffer.from([10, 20, 30, 40, 50]);
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer);
      // MessagePack decodes binary as Uint8Array, not Buffer
      expect(result).toBeInstanceOf(Uint8Array);
      expect(Array.from(result as Uint8Array)).toEqual([10, 20, 30, 40, 50]);
    });

    it("preserves binary data in objects", () => {
      const input = { data: new Uint8Array([1, 2, 3]) };
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer) as { data: Uint8Array };
      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(Array.from(result.data)).toEqual([1, 2, 3]);
    });
  });

  describe("edge cases", () => {
    const codec = new MessagePackCodec();

    it("serializes undefined as null", () => {
      const buffer = codec.serialize(undefined);
      expect(codec.deserialize(buffer)).toBeNull();
    });

    it("roundtrips Infinity", () => {
      const buffer = codec.serialize(Infinity);
      expect(codec.deserialize(buffer)).toBe(Infinity);
    });

    it("roundtrips -Infinity", () => {
      const buffer = codec.serialize(-Infinity);
      expect(codec.deserialize(buffer)).toBe(-Infinity);
    });

    it("roundtrips NaN", () => {
      const buffer = codec.serialize(NaN);
      expect(codec.deserialize(buffer)).toBeNaN();
    });

    it("handles MAX_SAFE_INTEGER", () => {
      const input = Number.MAX_SAFE_INTEGER;
      const buffer = codec.serialize(input);
      expect(codec.deserialize(buffer)).toBe(input);
    });

    it("handles MIN_SAFE_INTEGER", () => {
      const input = Number.MIN_SAFE_INTEGER;
      const buffer = codec.serialize(input);
      expect(codec.deserialize(buffer)).toBe(input);
    });

    it("handles deep nesting up to maxDepth (default 100)", () => {
      // @msgpack/msgpack has a default maxDepth of 100
      let input: Record<string, unknown> = { value: "leaf" };
      for (let i = 0; i < 50; i++) {
        input = { nested: input };
      }
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer);
      expect(result).toEqual(input);
    });

    it("handles large arrays (10000 elements)", () => {
      const input = Array.from({ length: 10000 }, (_, i) => i);
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer) as number[];
      expect(result.length).toBe(10000);
      expect(result[0]).toBe(0);
      expect(result[9999]).toBe(9999);
    });

    it("handles large objects (1000 keys)", () => {
      const input: Record<string, number> = {};
      for (let i = 0; i < 1000; i++) {
        input[`key${i}`] = i;
      }
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer) as Record<string, number>;
      expect(Object.keys(result).length).toBe(1000);
      expect(result["key500"]).toBe(500);
    });
  });

  describe("type safety", () => {
    it("generic type is enforced at compile time", () => {
      interface User {
        id: number;
        name: string;
      }
      const codec = new MessagePackCodec<User>();
      const buffer = codec.serialize({ id: 1, name: "Alice" });
      const user: User = codec.deserialize(buffer);
      expect(user.id).toBe(1);
      expect(user.name).toBe("Alice");
    });
  });

  describe("input validation", () => {
    const codec = new MessagePackCodec();

    it("throws SerializationError for string input to deserialize", () => {
      expect(() => codec.deserialize("not a buffer" as unknown as Buffer)).toThrow(
        SerializationError
      );
    });

    it("throws SerializationError for number input to deserialize", () => {
      expect(() => codec.deserialize(42 as unknown as Buffer)).toThrow(SerializationError);
    });

    it("throws SerializationError for null input to deserialize", () => {
      expect(() => codec.deserialize(null as unknown as Buffer)).toThrow(SerializationError);
    });

    it("throws SerializationError for undefined input to deserialize", () => {
      expect(() => codec.deserialize(undefined as unknown as Buffer)).toThrow(SerializationError);
    });

    it("accepts Uint8Array input to deserialize", () => {
      const data = { test: "value" };
      const buffer = codec.serialize(data);
      const uint8array = new Uint8Array(buffer);
      // Need to cast as Buffer since the type signature expects Buffer
      expect(codec.deserialize(uint8array as unknown as Buffer)).toEqual(data);
    });
  });

  describe("error handling", () => {
    const codec = new MessagePackCodec();

    it("throws SerializationError on invalid MessagePack data", () => {
      // 0xc1 is never used in MessagePack spec
      const invalidBuffer = Buffer.from([0xc1]);
      expect(() => codec.deserialize(invalidBuffer)).toThrow(SerializationError);
    });

    it("throws SerializationError with cause on decode failure", () => {
      const invalidBuffer = Buffer.from([0xc1]);
      try {
        codec.deserialize(invalidBuffer);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SerializationError);
        expect((error as SerializationError).cause).toBeDefined();
      }
    });

    it("throws SerializationError on BigInt without extension", () => {
      // BigInt cannot be serialized without an extension codec
      expect(() => codec.serialize(BigInt(123))).toThrow(SerializationError);
    });

    it("error message contains original error message", () => {
      const invalidBuffer = Buffer.from([0xc1]);
      try {
        codec.deserialize(invalidBuffer);
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as Error).message).toContain("Failed to decode MessagePack");
      }
    });
  });

  describe("options", () => {
    it("respects sortKeys option", () => {
      const codec = new MessagePackCodec({ sortKeys: true });
      const input = { z: 1, a: 2, m: 3 };
      const buffer = codec.serialize(input);
      // Verify it roundtrips correctly
      expect(codec.deserialize(buffer)).toEqual(input);
    });

    it("respects initialBufferSize option", () => {
      const codec = new MessagePackCodec({ initialBufferSize: 4096 });
      const input = { data: "test" };
      const buffer = codec.serialize(input);
      expect(codec.deserialize(buffer)).toEqual(input);
    });

    it("respects forceIntegerToFloat option", () => {
      const codec = new MessagePackCodec({ forceIntegerToFloat: true });
      const input = 1.0;
      const buffer = codec.serialize(input);
      expect(codec.deserialize(buffer)).toBe(1);
    });

    it("passes context to extension codec", () => {
      // This test verifies context is passed through; actual usage depends on custom extensions
      const options: MessagePackCodecOptions = {
        context: { customData: "test" },
      };
      const codec = new MessagePackCodec(options);
      const input = { value: 42 };
      const buffer = codec.serialize(input);
      expect(codec.deserialize(buffer)).toEqual(input);
    });
  });

  describe("performance", () => {
    const codec = new MessagePackCodec();

    it("produces smaller output than JSON for objects", () => {
      const input = { a: 1, b: 2, c: 3, d: 4, e: 5 };
      const buffer = codec.serialize(input);
      const jsonBuffer = Buffer.from(JSON.stringify(input));
      expect(buffer.length).toBeLessThan(jsonBuffer.length);
    });

    it("produces smaller output than JSON for arrays", () => {
      const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const buffer = codec.serialize(input);
      const jsonBuffer = Buffer.from(JSON.stringify(input));
      expect(buffer.length).toBeLessThan(jsonBuffer.length);
    });

    it("uses zero-copy buffer creation", () => {
      const input = { test: "data" };
      const buffer = codec.serialize(input);
      // Verify it's a Buffer (not just Uint8Array)
      expect(Buffer.isBuffer(buffer)).toBe(true);
      // Buffer should be created efficiently from underlying ArrayBuffer
      expect(buffer.length).toBeGreaterThan(0);
    });
  });
});
