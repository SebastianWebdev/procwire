import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CodecRegistry } from "../src/serialization/registry.js";
import { JsonCodec } from "../src/serialization/json.js";
import { RawCodec } from "../src/serialization/raw.js";
import { SerializationError } from "../src/utils/errors.js";
import type { SerializationCodec } from "../src/serialization/types.js";

describe("CodecRegistry", () => {
  // Clean up registry before and after each test to ensure isolation
  beforeEach(() => {
    CodecRegistry.resetForTests();
  });

  afterEach(() => {
    CodecRegistry.resetForTests();
  });

  describe("register and get", () => {
    it("should register and retrieve a codec by name", () => {
      const codec = new JsonCodec();
      CodecRegistry.register(codec);

      const retrieved = CodecRegistry.get("json");

      expect(retrieved).toBe(codec);
    });

    it("should register multiple codecs", () => {
      const jsonCodec = new JsonCodec();
      const rawCodec = new RawCodec();

      CodecRegistry.register(jsonCodec);
      CodecRegistry.register(rawCodec);

      expect(CodecRegistry.get("json")).toBe(jsonCodec);
      expect(CodecRegistry.get("raw")).toBe(rawCodec);
    });

    it("should return undefined for unregistered codec", () => {
      const result = CodecRegistry.get("nonexistent");

      expect(result).toBeUndefined();
    });
  });

  describe("getByContentType", () => {
    it("should retrieve codec by content type", () => {
      const codec = new JsonCodec();
      CodecRegistry.register(codec);

      const retrieved = CodecRegistry.getByContentType("application/json");

      expect(retrieved).toBe(codec);
    });

    it("should return undefined for unregistered content type", () => {
      const result = CodecRegistry.getByContentType("application/msgpack");

      expect(result).toBeUndefined();
    });

    it("should handle multiple codecs with different content types", () => {
      const jsonCodec = new JsonCodec();
      const rawCodec = new RawCodec();

      CodecRegistry.register(jsonCodec);
      CodecRegistry.register(rawCodec);

      expect(CodecRegistry.getByContentType("application/json")).toBe(jsonCodec);
      expect(CodecRegistry.getByContentType("application/octet-stream")).toBe(rawCodec);
    });
  });

  describe("list", () => {
    it("should return empty array when no codecs registered", () => {
      const names = CodecRegistry.list();

      expect(names).toEqual([]);
    });

    it("should list all registered codec names", () => {
      CodecRegistry.register(new JsonCodec());
      CodecRegistry.register(new RawCodec());

      const names = CodecRegistry.list();

      expect(names).toHaveLength(2);
      expect(names).toContain("json");
      expect(names).toContain("raw");
    });

    it("should return a new array on each call", () => {
      CodecRegistry.register(new JsonCodec());

      const list1 = CodecRegistry.list();
      const list2 = CodecRegistry.list();

      expect(list1).toEqual(list2);
      expect(list1).not.toBe(list2);
    });
  });

  describe("unregister", () => {
    it("should unregister codec by name", () => {
      const codec = new JsonCodec();
      CodecRegistry.register(codec);

      const result = CodecRegistry.unregister("json");

      expect(result).toBe(true);
      expect(CodecRegistry.get("json")).toBeUndefined();
      expect(CodecRegistry.getByContentType("application/json")).toBeUndefined();
    });

    it("should return false when unregistering non-existent codec", () => {
      const result = CodecRegistry.unregister("nonexistent");

      expect(result).toBe(false);
    });

    it("should remove codec from both name and content type maps", () => {
      const codec = new JsonCodec();
      CodecRegistry.register(codec);

      CodecRegistry.unregister("json");

      expect(CodecRegistry.get("json")).toBeUndefined();
      expect(CodecRegistry.getByContentType("application/json")).toBeUndefined();
    });

    it("should allow re-registration after unregister", () => {
      const codec1 = new JsonCodec();
      CodecRegistry.register(codec1);
      CodecRegistry.unregister("json");

      const codec2 = new JsonCodec();
      CodecRegistry.register(codec2);

      expect(CodecRegistry.get("json")).toBe(codec2);
    });
  });

  describe("error handling - name conflicts", () => {
    it("should throw when registering codec with duplicate name", () => {
      const codec1 = new JsonCodec();
      const codec2 = new JsonCodec();

      CodecRegistry.register(codec1);

      expect(() => CodecRegistry.register(codec2)).toThrow(SerializationError);
      expect(() => CodecRegistry.register(codec2)).toThrow(/already registered/);
      expect(() => CodecRegistry.register(codec2)).toThrow(/name 'json'/);
    });

    it("should include existing content type in error message", () => {
      const codec1 = new JsonCodec();
      const codec2 = new JsonCodec();

      CodecRegistry.register(codec1);

      try {
        CodecRegistry.register(codec2);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SerializationError);
        expect((error as Error).message).toContain("application/json");
      }
    });
  });

  describe("error handling - content type conflicts", () => {
    it("should throw when registering codec with duplicate content type", () => {
      const codec1: SerializationCodec = {
        name: "custom1",
        contentType: "application/custom",
        serialize: (data: unknown) => Buffer.from(JSON.stringify(data)),
        deserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
      };

      const codec2: SerializationCodec = {
        name: "custom2",
        contentType: "application/custom",
        serialize: (data: unknown) => Buffer.from(JSON.stringify(data)),
        deserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
      };

      CodecRegistry.register(codec1);

      expect(() => CodecRegistry.register(codec2)).toThrow(SerializationError);
      expect(() => CodecRegistry.register(codec2)).toThrow(/already registered/);
      expect(() => CodecRegistry.register(codec2)).toThrow(/content type 'application\/custom'/);
    });

    it("should include existing name in error message", () => {
      const codec1: SerializationCodec = {
        name: "custom1",
        contentType: "application/custom",
        serialize: (data: unknown) => Buffer.from(JSON.stringify(data)),
        deserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
      };

      const codec2: SerializationCodec = {
        name: "custom2",
        contentType: "application/custom",
        serialize: (data: unknown) => Buffer.from(JSON.stringify(data)),
        deserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
      };

      CodecRegistry.register(codec1);

      try {
        CodecRegistry.register(codec2);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SerializationError);
        expect((error as Error).message).toContain("custom1");
      }
    });
  });

  describe("resetForTests", () => {
    it("should clear all registered codecs", () => {
      CodecRegistry.register(new JsonCodec());
      CodecRegistry.register(new RawCodec());

      CodecRegistry.resetForTests();

      expect(CodecRegistry.list()).toEqual([]);
      expect(CodecRegistry.get("json")).toBeUndefined();
      expect(CodecRegistry.get("raw")).toBeUndefined();
    });
  });

  describe("integration with real codecs", () => {
    it("should work with JsonCodec for full roundtrip", () => {
      const codec = new JsonCodec();
      CodecRegistry.register(codec);

      const retrieved = CodecRegistry.get("json");
      expect(retrieved).toBeDefined();

      const data = { test: "data", number: 123 };
      const buffer = retrieved!.serialize(data);
      const result = retrieved!.deserialize(buffer);

      expect(result).toEqual(data);
    });

    it("should work with RawCodec for passthrough", () => {
      const codec = new RawCodec();
      CodecRegistry.register(codec);

      const retrieved = CodecRegistry.get("raw");
      expect(retrieved).toBeDefined();

      const buffer = Buffer.from([1, 2, 3]);
      const serialized = retrieved!.serialize(buffer);
      const deserialized = retrieved!.deserialize(serialized);

      expect(deserialized).toBe(buffer);
    });
  });
});
