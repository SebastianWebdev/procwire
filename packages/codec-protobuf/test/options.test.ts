import { describe, expect, it } from "vitest";
import * as protobuf from "protobufjs";
import { ProtobufCodec } from "../src/index.js";

describe("ProtobufCodecOptions", () => {
  describe("longs option", () => {
    const createInt64Schema = () => {
      return protobuf.Root.fromJSON({
        nested: {
          Message: {
            fields: {
              value: { type: "int64", id: 1 },
              unsigned: { type: "uint64", id: 2 },
            },
          },
        },
      });
    };

    it("converts int64 to String by default", () => {
      const root = createInt64Schema();
      const codec = new ProtobufCodec<{ value: string | number }>(root.lookupType("Message"));

      // Use a number for serialization (protobuf requires integer|Long)
      const buffer = codec.serialize({ value: 123 });
      const output = codec.deserialize(buffer);
      // Output should be string due to longs: String default
      expect(typeof output.value).toBe("string");
      expect(output.value).toBe("123");
    });

    it("converts int64 to Number when longs=Number", () => {
      const root = createInt64Schema();
      const codec = new ProtobufCodec<{ value: number }>(root.lookupType("Message"), {
        longs: Number,
      });

      const buffer = codec.serialize({ value: 123 });
      const output = codec.deserialize(buffer);
      expect(typeof output.value).toBe("number");
      expect(output.value).toBe(123);
    });

    it("handles MAX_SAFE_INTEGER correctly", () => {
      const root = createInt64Schema();
      const codec = new ProtobufCodec<{ value: number }>(root.lookupType("Message"), {
        longs: Number,
      });

      const maxSafe = Number.MAX_SAFE_INTEGER;
      const buffer = codec.serialize({ value: maxSafe });
      const output = codec.deserialize(buffer);
      expect(output.value).toBe(maxSafe);
    });

    it("handles values larger than MAX_SAFE_INTEGER with longs=String", () => {
      const root = createInt64Schema();
      // Disable verification to test string input (which protobufjs will convert)
      const codec = new ProtobufCodec<{ value: string | number }>(root.lookupType("Message"), {
        longs: String,
        verifyOnSerialize: false,
      });

      // protobufjs can handle string representation of large numbers when verify is off
      const largeValue = "9007199254740993";
      const buffer = codec.serialize({ value: largeValue });
      const output = codec.deserialize(buffer);
      expect(output.value).toBe(largeValue);
    });

    it("handles negative int64 values", () => {
      const root = createInt64Schema();
      // Disable verification to test string input
      const codec = new ProtobufCodec<{ value: string | number }>(root.lookupType("Message"), {
        longs: String,
        verifyOnSerialize: false,
      });

      const buffer = codec.serialize({ value: "-9007199254740993" });
      const output = codec.deserialize(buffer);
      expect(output.value).toBe("-9007199254740993");
    });

    it("handles uint64 fields", () => {
      const root = createInt64Schema();
      // Disable verification to test string input
      const codec = new ProtobufCodec<{ unsigned: string | number }>(root.lookupType("Message"), {
        longs: String,
        verifyOnSerialize: false,
      });

      const buffer = codec.serialize({ unsigned: "18446744073709551615" }); // max uint64
      const output = codec.deserialize(buffer);
      expect(output.unsigned).toBe("18446744073709551615");
    });
  });

  describe("enums option", () => {
    const createEnumSchema = () => {
      return protobuf.Root.fromJSON({
        nested: {
          Status: {
            values: {
              UNKNOWN: 0,
              ACTIVE: 1,
              INACTIVE: 2,
            },
          },
          Message: {
            fields: {
              status: { type: "Status", id: 1 },
            },
          },
        },
      });
    };

    it("returns numeric values by default", () => {
      const root = createEnumSchema();
      const codec = new ProtobufCodec<{ status: number }>(root.lookupType("Message"));

      const buffer = codec.serialize({ status: 1 });
      const output = codec.deserialize(buffer);
      expect(typeof output.status).toBe("number");
      expect(output.status).toBe(1);
    });

    it("returns string names when enums=String", () => {
      const root = createEnumSchema();
      const codec = new ProtobufCodec<{ status: string | number }>(root.lookupType("Message"), {
        enums: String,
      });

      const buffer = codec.serialize({ status: 1 });
      const output = codec.deserialize(buffer);
      expect(typeof output.status).toBe("string");
      expect(output.status).toBe("ACTIVE");
    });

    it("handles unknown enum values", () => {
      const root = createEnumSchema();
      // Disable verification to allow unknown enum values
      const codec = new ProtobufCodec<{ status: number }>(root.lookupType("Message"), {
        verifyOnSerialize: false,
      });

      // Unknown enum value (not defined in schema)
      const buffer = codec.serialize({ status: 99 });
      const output = codec.deserialize(buffer);
      expect(output.status).toBe(99);
    });
  });

  describe("bytes option", () => {
    const createBytesSchema = () => {
      return protobuf.Root.fromJSON({
        nested: {
          Message: {
            fields: {
              data: { type: "bytes", id: 1 },
            },
          },
        },
      });
    };

    it("returns Uint8Array by default", () => {
      const root = createBytesSchema();
      const codec = new ProtobufCodec<{ data: Uint8Array }>(root.lookupType("Message"));

      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const buffer = codec.serialize({ data });
      const output = codec.deserialize(buffer);
      expect(output.data).toBeInstanceOf(Uint8Array);
      expect(Array.from(output.data)).toEqual([1, 2, 3, 4, 5]);
    });

    it("returns base64 string when bytes=String", () => {
      const root = createBytesSchema();
      const codec = new ProtobufCodec<{ data: string | Uint8Array }>(root.lookupType("Message"), {
        bytes: String,
      });

      const data = new Uint8Array(Buffer.from("hello"));
      const buffer = codec.serialize({ data });
      const output = codec.deserialize(buffer);
      expect(typeof output.data).toBe("string");
      // Base64 of "hello"
      expect(output.data).toBe("aGVsbG8=");
    });

    it("returns number array when bytes=Array", () => {
      const root = createBytesSchema();
      const codec = new ProtobufCodec<{ data: number[] | Uint8Array }>(root.lookupType("Message"), {
        bytes: Array,
      });

      const data = new Uint8Array([1, 2, 3]);
      const buffer = codec.serialize({ data });
      const output = codec.deserialize(buffer);
      expect(Array.isArray(output.data)).toBe(true);
      expect(output.data).toEqual([1, 2, 3]);
    });

    it("handles empty bytes field", () => {
      const root = createBytesSchema();
      const codec = new ProtobufCodec<{ data: Uint8Array }>(root.lookupType("Message"));

      const buffer = codec.serialize({ data: new Uint8Array(0) });
      const output = codec.deserialize(buffer);
      expect(output.data).toBeInstanceOf(Uint8Array);
      expect(output.data.length).toBe(0);
    });

    it("handles large bytes field", () => {
      const root = createBytesSchema();
      const codec = new ProtobufCodec<{ data: Uint8Array }>(root.lookupType("Message"));

      const largeData = new Uint8Array(1024 * 100); // 100KB
      for (let i = 0; i < largeData.length; i++) {
        largeData[i] = i % 256;
      }

      const buffer = codec.serialize({ data: largeData });
      const output = codec.deserialize(buffer);
      expect(output.data.length).toBe(largeData.length);
      expect(output.data[0]).toBe(0);
      expect(output.data[255]).toBe(255);
    });
  });

  describe("defaults option", () => {
    const createDefaultsSchema = () => {
      return protobuf.Root.fromJSON({
        nested: {
          Message: {
            fields: {
              number_field: { type: "int32", id: 1 },
              string_field: { type: "string", id: 2 },
              bool_field: { type: "bool", id: 3 },
            },
          },
        },
      });
    };

    it("omits default values when defaults=false", () => {
      const root = createDefaultsSchema();
      const codec = new ProtobufCodec<Record<string, unknown>>(root.lookupType("Message"), {
        defaults: false,
      });

      const buffer = codec.serialize({});
      const output = codec.deserialize(buffer);

      // Fields with default values should be omitted
      expect(output.number_field).toBeUndefined();
      expect(output.string_field).toBeUndefined();
      expect(output.bool_field).toBeUndefined();
    });

    it("includes default values when defaults=true", () => {
      const root = createDefaultsSchema();
      const codec = new ProtobufCodec<Record<string, unknown>>(root.lookupType("Message"), {
        defaults: true,
      });

      const buffer = codec.serialize({});
      const output = codec.deserialize(buffer);

      expect(output.number_field).toBe(0);
      expect(output.string_field).toBe("");
      expect(output.bool_field).toBe(false);
    });

    it("includes zero for numbers when defaults=true", () => {
      const root = createDefaultsSchema();
      const codec = new ProtobufCodec<Record<string, unknown>>(root.lookupType("Message"), {
        defaults: true,
      });

      const buffer = codec.serialize({});
      const output = codec.deserialize(buffer);
      expect(output.number_field).toBe(0);
    });

    it("includes empty string when defaults=true", () => {
      const root = createDefaultsSchema();
      const codec = new ProtobufCodec<Record<string, unknown>>(root.lookupType("Message"), {
        defaults: true,
      });

      const buffer = codec.serialize({});
      const output = codec.deserialize(buffer);
      expect(output.string_field).toBe("");
    });

    it("includes false for bools when defaults=true", () => {
      const root = createDefaultsSchema();
      const codec = new ProtobufCodec<Record<string, unknown>>(root.lookupType("Message"), {
        defaults: true,
      });

      const buffer = codec.serialize({});
      const output = codec.deserialize(buffer);
      expect(output.bool_field).toBe(false);
    });
  });

  describe("oneofs option", () => {
    const createOneofSchema = () => {
      return protobuf.Root.fromJSON({
        nested: {
          Message: {
            oneofs: {
              value: {
                oneof: ["string_value", "int_value"],
              },
            },
            fields: {
              string_value: { type: "string", id: 1 },
              int_value: { type: "int32", id: 2 },
            },
          },
        },
      });
    };

    it("omits oneof field names when oneofs=false", () => {
      const root = createOneofSchema();
      const codec = new ProtobufCodec<Record<string, unknown>>(root.lookupType("Message"), {
        oneofs: false,
      });

      const buffer = codec.serialize({ string_value: "test" });
      const output = codec.deserialize(buffer);

      expect(output.string_value).toBe("test");
      expect(output.value).toBeUndefined();
    });

    it("includes oneof field names when oneofs=true", () => {
      const root = createOneofSchema();
      const codec = new ProtobufCodec<Record<string, unknown>>(root.lookupType("Message"), {
        oneofs: true,
      });

      const buffer = codec.serialize({ string_value: "test" });
      const output = codec.deserialize(buffer);

      expect(output.string_value).toBe("test");
      expect(output.value).toBe("string_value");
    });
  });

  describe("verifyOnSerialize option", () => {
    it("verifies by default (true)", () => {
      const root = protobuf.Root.fromJSON({
        nested: {
          Message: {
            fields: {
              id: { type: "int32", id: 1 },
            },
          },
        },
      });

      const codec = new ProtobufCodec(root.lookupType("Message"));

      // Default should verify
      expect(() => codec.serialize({ id: "invalid" })).toThrow();
    });

    it("skips verification when false", () => {
      const root = protobuf.Root.fromJSON({
        nested: {
          Message: {
            fields: {
              id: { type: "int32", id: 1 },
            },
          },
        },
      });

      const codec = new ProtobufCodec(root.lookupType("Message"), {
        verifyOnSerialize: false,
      });

      // Should not throw on verification (may still fail on encode)
      const buffer = codec.serialize({ id: 0 });
      expect(Buffer.isBuffer(buffer)).toBe(true);
    });

    it("catches type mismatches when enabled", () => {
      const root = protobuf.Root.fromJSON({
        nested: {
          Message: {
            fields: {
              value: { type: "bytes", id: 1 },
            },
          },
        },
      });

      const codec = new ProtobufCodec(root.lookupType("Message"), {
        verifyOnSerialize: true,
      });

      // bytes should be Uint8Array, Buffer, or array-like
      expect(() => codec.serialize({ value: 12345 })).toThrow();
    });
  });
});
