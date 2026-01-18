import { describe, it, expect } from "vitest";
import { JsonCodec } from "../src/serialization/json.js";
import { SerializationError } from "../src/utils/errors.js";

describe("JsonCodec", () => {
  describe("basic serialization", () => {
    it("should serialize and deserialize a simple object", () => {
      const codec = new JsonCodec();
      const input = { foo: "bar", num: 42, nested: { arr: [1, 2, 3] } };

      const buffer = codec.serialize(input);
      const output = codec.deserialize(buffer);

      expect(output).toEqual(input);
    });

    it("should handle null values", () => {
      const codec = new JsonCodec();
      const input = { value: null };

      const buffer = codec.serialize(input);
      const output = codec.deserialize(buffer);

      expect(output).toEqual(input);
    });

    it("should handle arrays", () => {
      const codec = new JsonCodec();
      const input = [1, "two", { three: 3 }, null, true];

      const buffer = codec.serialize(input);
      const output = codec.deserialize(buffer);

      expect(output).toEqual(input);
    });

    it("should handle primitives", () => {
      const codec = new JsonCodec();

      expect(codec.deserialize(codec.serialize(42))).toBe(42);
      expect(codec.deserialize(codec.serialize("hello"))).toBe("hello");
      expect(codec.deserialize(codec.serialize(true))).toBe(true);
      expect(codec.deserialize(codec.serialize(null))).toBe(null);
    });
  });

  describe("replacer option", () => {
    it("should use replacer to filter properties", () => {
      const codec = new JsonCodec({
        replacer: (key, value) => (key === "password" ? undefined : value),
      });

      const input = { username: "alice", password: "secret123" };
      const buffer = codec.serialize(input);
      const output = codec.deserialize(buffer);

      expect(output).toEqual({ username: "alice" });
      expect(output).not.toHaveProperty("password");
    });

    it("should use replacer to transform values", () => {
      const codec = new JsonCodec({
        replacer: (key, value) => (typeof value === "string" ? value.toUpperCase() : value),
      });

      const input = { name: "alice", count: 5 };
      const buffer = codec.serialize(input);
      const output = codec.deserialize(buffer);

      expect(output).toEqual({ name: "ALICE", count: 5 });
    });
  });

  describe("reviver option", () => {
    it("should use reviver to transform values during deserialization", () => {
      const codec = new JsonCodec({
        reviver: (key, value) => {
          if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return new Date(value);
          }
          return value;
        },
      });

      const input = { event: "meeting", date: "2024-01-15" };
      const buffer = codec.serialize(input);
      const output = codec.deserialize(buffer) as { event: string; date: Date };

      expect(output.event).toBe("meeting");
      expect(output.date).toBeInstanceOf(Date);
      expect(output.date.toISOString()).toContain("2024-01-15");
    });
  });

  describe("space option", () => {
    it("should format JSON with space for debugging", () => {
      const codec = new JsonCodec({ space: 2 });
      const input = { foo: "bar", num: 42 };

      const buffer = codec.serialize(input);
      const json = buffer.toString("utf8");

      expect(json).toContain("\n");
      expect(json).toContain("  ");
      expect(json).toMatch(/"foo": "bar"/);
    });

    it("should use compact format when space is undefined", () => {
      const codec = new JsonCodec();
      const input = { foo: "bar", num: 42 };

      const buffer = codec.serialize(input);
      const json = buffer.toString("utf8");

      expect(json).not.toContain("\n");
      expect(json).toBe('{"foo":"bar","num":42}');
    });
  });

  describe("error handling", () => {
    it("should throw SerializationError for circular references", () => {
      const codec = new JsonCodec();
      const circular: Record<string, unknown> = { foo: "bar" };
      circular.self = circular;

      expect(() => codec.serialize(circular)).toThrow(SerializationError);
      expect(() => codec.serialize(circular)).toThrow(/Failed to serialize/);
    });

    it("should throw SerializationError for invalid JSON during deserialization", () => {
      const codec = new JsonCodec();
      const invalidJson = Buffer.from("{invalid json}", "utf8");

      expect(() => codec.deserialize(invalidJson)).toThrow(SerializationError);
      expect(() => codec.deserialize(invalidJson)).toThrow(/Failed to deserialize/);
    });

    it("should preserve error cause for serialization errors", () => {
      const codec = new JsonCodec();
      const circular: Record<string, unknown> = { foo: "bar" };
      circular.self = circular;

      try {
        codec.serialize(circular);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SerializationError);
        expect((error as SerializationError).cause).toBeDefined();
      }
    });

    it("should preserve error cause for deserialization errors", () => {
      const codec = new JsonCodec();
      const invalidJson = Buffer.from("{invalid", "utf8");

      try {
        codec.deserialize(invalidJson);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SerializationError);
        expect((error as SerializationError).cause).toBeDefined();
      }
    });
  });

  describe("codec metadata", () => {
    it("should have correct name and contentType", () => {
      const codec = new JsonCodec();

      expect(codec.name).toBe("json");
      expect(codec.contentType).toBe("application/json");
    });
  });

  describe("UTF-8 encoding", () => {
    it("should correctly handle unicode characters", () => {
      const codec = new JsonCodec();
      const input = { emoji: "🚀", chinese: "你好", russian: "Привет" };

      const buffer = codec.serialize(input);
      const output = codec.deserialize(buffer);

      expect(output).toEqual(input);
    });
  });
});
