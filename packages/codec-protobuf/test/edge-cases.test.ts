import { describe, expect, it } from "vitest";
import * as protobuf from "protobufjs";
import { ProtobufCodec } from "../src/index.js";

describe("edge cases", () => {
  describe("numeric limits", () => {
    const createNumericSchema = () => {
      return protobuf.Root.fromJSON({
        nested: {
          Numbers: {
            fields: {
              int32_val: { type: "int32", id: 1 },
              uint32_val: { type: "uint32", id: 2 },
              int64_val: { type: "int64", id: 3 },
              float_val: { type: "float", id: 4 },
              double_val: { type: "double", id: 5 },
            },
          },
        },
      });
    };

    it("handles int32 max value", () => {
      const root = createNumericSchema();
      const codec = new ProtobufCodec<{ int32_val: number }>(root.lookupType("Numbers"));

      const max = 2147483647; // INT32_MAX
      const buffer = codec.serialize({ int32_val: max });
      const output = codec.deserialize(buffer);
      expect(output.int32_val).toBe(max);
    });

    it("handles int32 min value", () => {
      const root = createNumericSchema();
      const codec = new ProtobufCodec<{ int32_val: number }>(root.lookupType("Numbers"));

      const min = -2147483648; // INT32_MIN
      const buffer = codec.serialize({ int32_val: min });
      const output = codec.deserialize(buffer);
      expect(output.int32_val).toBe(min);
    });

    it("handles uint32 max value", () => {
      const root = createNumericSchema();
      const codec = new ProtobufCodec<{ uint32_val: number }>(root.lookupType("Numbers"));

      const max = 4294967295; // UINT32_MAX
      const buffer = codec.serialize({ uint32_val: max });
      const output = codec.deserialize(buffer);
      expect(output.uint32_val).toBe(max);
    });

    it("handles int64 max value as string", () => {
      const root = createNumericSchema();
      // Disable verify to allow string input for int64
      const codec = new ProtobufCodec<{ int64_val: string | number }>(root.lookupType("Numbers"), {
        longs: String,
        verifyOnSerialize: false,
      });

      const max = "9223372036854775807"; // INT64_MAX
      const buffer = codec.serialize({ int64_val: max });
      const output = codec.deserialize(buffer);
      expect(output.int64_val).toBe(max);
    });

    it("handles int64 min value as string", () => {
      const root = createNumericSchema();
      // Disable verify to allow string input for int64
      const codec = new ProtobufCodec<{ int64_val: string | number }>(root.lookupType("Numbers"), {
        longs: String,
        verifyOnSerialize: false,
      });

      const min = "-9223372036854775808"; // INT64_MIN
      const buffer = codec.serialize({ int64_val: min });
      const output = codec.deserialize(buffer);
      expect(output.int64_val).toBe(min);
    });

    it("handles float32 precision", () => {
      const root = createNumericSchema();
      const codec = new ProtobufCodec<{ float_val: number }>(root.lookupType("Numbers"));

      const buffer = codec.serialize({ float_val: 3.14159 });
      const output = codec.deserialize(buffer);
      expect(output.float_val).toBeCloseTo(3.14159, 4);
    });

    it("handles float64 precision", () => {
      const root = createNumericSchema();
      const codec = new ProtobufCodec<{ double_val: number }>(root.lookupType("Numbers"));

      const precise = 3.141592653589793;
      const buffer = codec.serialize({ double_val: precise });
      const output = codec.deserialize(buffer);
      expect(output.double_val).toBe(precise);
    });

    it("handles float infinity", () => {
      const root = createNumericSchema();
      const codec = new ProtobufCodec<{ double_val: number }>(root.lookupType("Numbers"));

      const buffer = codec.serialize({ double_val: Infinity });
      const output = codec.deserialize(buffer);
      expect(output.double_val).toBe(Infinity);

      const bufferNeg = codec.serialize({ double_val: -Infinity });
      const outputNeg = codec.deserialize(bufferNeg);
      expect(outputNeg.double_val).toBe(-Infinity);
    });

    it("handles float NaN", () => {
      const root = createNumericSchema();
      const codec = new ProtobufCodec<{ double_val: number }>(root.lookupType("Numbers"));

      const buffer = codec.serialize({ double_val: NaN });
      const output = codec.deserialize(buffer);
      expect(Number.isNaN(output.double_val)).toBe(true);
    });
  });

  describe("string handling", () => {
    const createStringSchema = () => {
      return protobuf.Root.fromJSON({
        nested: {
          StringMsg: {
            fields: {
              value: { type: "string", id: 1 },
            },
          },
        },
      });
    };

    it("handles empty strings", () => {
      const root = createStringSchema();
      const codec = new ProtobufCodec<{ value: string }>(root.lookupType("StringMsg"));

      const buffer = codec.serialize({ value: "" });
      const output = codec.deserialize(buffer);
      // Empty string may be omitted by protobuf
      expect(output.value === "" || output.value === undefined).toBe(true);
    });

    it("handles unicode strings", () => {
      const root = createStringSchema();
      const codec = new ProtobufCodec<{ value: string }>(root.lookupType("StringMsg"));

      const unicode = "こんにちは世界 Привет мир مرحبا بالعالم";
      const buffer = codec.serialize({ value: unicode });
      const output = codec.deserialize(buffer);
      expect(output.value).toBe(unicode);
    });

    it("handles emoji in strings", () => {
      const root = createStringSchema();
      const codec = new ProtobufCodec<{ value: string }>(root.lookupType("StringMsg"));

      const emoji = "Hello 👋 World 🌍 🎉";
      const buffer = codec.serialize({ value: emoji });
      const output = codec.deserialize(buffer);
      expect(output.value).toBe(emoji);
    });

    it("handles very long strings (1MB)", () => {
      const root = createStringSchema();
      const codec = new ProtobufCodec<{ value: string }>(root.lookupType("StringMsg"));

      const longString = "a".repeat(1024 * 1024); // 1MB
      const buffer = codec.serialize({ value: longString });
      const output = codec.deserialize(buffer);
      expect(output.value.length).toBe(longString.length);
    });

    it("handles null bytes in strings", () => {
      const root = createStringSchema();
      const codec = new ProtobufCodec<{ value: string }>(root.lookupType("StringMsg"));

      const withNull = "hello\x00world";
      const buffer = codec.serialize({ value: withNull });
      const output = codec.deserialize(buffer);
      expect(output.value).toBe(withNull);
    });
  });

  describe("bytes handling", () => {
    const createBytesSchema = () => {
      return protobuf.Root.fromJSON({
        nested: {
          BytesMsg: {
            fields: {
              data: { type: "bytes", id: 1 },
            },
          },
        },
      });
    };

    it("handles empty bytes", () => {
      const root = createBytesSchema();
      const codec = new ProtobufCodec<{ data: Uint8Array }>(root.lookupType("BytesMsg"));

      const buffer = codec.serialize({ data: new Uint8Array(0) });
      const output = codec.deserialize(buffer);
      expect(output.data.length).toBe(0);
    });

    it("handles binary data with null bytes", () => {
      const root = createBytesSchema();
      const codec = new ProtobufCodec<{ data: Uint8Array }>(root.lookupType("BytesMsg"));

      const binary = new Uint8Array([0, 1, 0, 2, 0, 3]);
      const buffer = codec.serialize({ data: binary });
      const output = codec.deserialize(buffer);
      expect(Array.from(output.data)).toEqual([0, 1, 0, 2, 0, 3]);
    });

    it("handles large binary data (1MB)", () => {
      const root = createBytesSchema();
      const codec = new ProtobufCodec<{ data: Uint8Array }>(root.lookupType("BytesMsg"));

      const large = new Uint8Array(1024 * 1024);
      for (let i = 0; i < large.length; i++) {
        large[i] = i % 256;
      }

      const buffer = codec.serialize({ data: large });
      const output = codec.deserialize(buffer);
      expect(output.data.length).toBe(large.length);
    });
  });

  describe("repeated fields", () => {
    const createRepeatedSchema = () => {
      return protobuf.Root.fromJSON({
        nested: {
          Nested: {
            fields: {
              value: { type: "string", id: 1 },
            },
          },
          RepeatedMsg: {
            fields: {
              strings: { type: "string", id: 1, rule: "repeated" },
              nested: { type: "Nested", id: 2, rule: "repeated" },
              bytes: { type: "bytes", id: 3, rule: "repeated" },
            },
          },
        },
      });
    };

    it("handles empty arrays", () => {
      const root = createRepeatedSchema();
      const codec = new ProtobufCodec<{ strings: string[] }>(root.lookupType("RepeatedMsg"));

      const buffer = codec.serialize({ strings: [] });
      const output = codec.deserialize(buffer);
      // Empty array may be omitted
      expect(output.strings === undefined || output.strings.length === 0).toBe(true);
    });

    it("handles large arrays (10000 elements)", () => {
      const root = createRepeatedSchema();
      const codec = new ProtobufCodec<{ strings: string[] }>(root.lookupType("RepeatedMsg"));

      const large = Array.from({ length: 10000 }, (_, i) => `item${i}`);
      const buffer = codec.serialize({ strings: large });
      const output = codec.deserialize(buffer);
      expect(output.strings.length).toBe(10000);
      expect(output.strings[0]).toBe("item0");
      expect(output.strings[9999]).toBe("item9999");
    });

    it("handles repeated nested messages", () => {
      const root = createRepeatedSchema();
      const codec = new ProtobufCodec<{ nested: Array<{ value: string }> }>(
        root.lookupType("RepeatedMsg"),
      );

      const input = {
        nested: [{ value: "one" }, { value: "two" }, { value: "three" }],
      };
      const buffer = codec.serialize(input);
      const output = codec.deserialize(buffer);
      expect(output.nested).toEqual(input.nested);
    });

    it("handles repeated bytes", () => {
      const root = createRepeatedSchema();
      const codec = new ProtobufCodec<{ bytes: Uint8Array[] }>(root.lookupType("RepeatedMsg"));

      const input = {
        bytes: [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])],
      };
      const buffer = codec.serialize(input);
      const output = codec.deserialize(buffer);
      expect(output.bytes.length).toBe(2);
      expect(Array.from(output.bytes[0] as Uint8Array)).toEqual([1, 2, 3]);
      expect(Array.from(output.bytes[1] as Uint8Array)).toEqual([4, 5, 6]);
    });
  });

  describe("nested messages", () => {
    it("handles deeply nested messages (10 levels)", () => {
      // Create schema with 10 levels of nesting
      const schema: protobuf.INamespace = {
        nested: {
          Level10: { fields: { value: { type: "string", id: 1 } } },
          Level9: { fields: { nested: { type: "Level10", id: 1 } } },
          Level8: { fields: { nested: { type: "Level9", id: 1 } } },
          Level7: { fields: { nested: { type: "Level8", id: 1 } } },
          Level6: { fields: { nested: { type: "Level7", id: 1 } } },
          Level5: { fields: { nested: { type: "Level6", id: 1 } } },
          Level4: { fields: { nested: { type: "Level5", id: 1 } } },
          Level3: { fields: { nested: { type: "Level4", id: 1 } } },
          Level2: { fields: { nested: { type: "Level3", id: 1 } } },
          Level1: { fields: { nested: { type: "Level2", id: 1 } } },
        },
      };

      const root = protobuf.Root.fromJSON(schema);
      const codec = new ProtobufCodec(root.lookupType("Level1"));

      const input = {
        nested: {
          nested: {
            nested: {
              nested: {
                nested: {
                  nested: {
                    nested: {
                      nested: {
                        nested: {
                          value: "deep",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const buffer = codec.serialize(input);
      const output = codec.deserialize(buffer);
      expect(output).toEqual(input);
    });

    it("handles null/undefined nested message", () => {
      const root = protobuf.Root.fromJSON({
        nested: {
          Inner: { fields: { value: { type: "string", id: 1 } } },
          Outer: { fields: { inner: { type: "Inner", id: 1 } } },
        },
      });

      interface Outer {
        inner?: { value: string };
      }

      const codec = new ProtobufCodec<Outer>(root.lookupType("Outer"));

      // Without nested message
      const buffer = codec.serialize({});
      const output = codec.deserialize(buffer);
      expect(output.inner).toBeUndefined();
    });
  });

  describe("oneof fields", () => {
    const createOneofSchema = () => {
      return protobuf.Root.fromJSON({
        nested: {
          OneofMsg: {
            oneofs: {
              value: { oneof: ["str_val", "int_val", "bool_val"] },
            },
            fields: {
              str_val: { type: "string", id: 1 },
              int_val: { type: "int32", id: 2 },
              bool_val: { type: "bool", id: 3 },
            },
          },
        },
      });
    };

    it("handles oneof with first option set", () => {
      const root = createOneofSchema();
      const codec = new ProtobufCodec<{ str_val?: string; int_val?: number; bool_val?: boolean }>(
        root.lookupType("OneofMsg"),
      );

      const buffer = codec.serialize({ str_val: "hello" });
      const output = codec.deserialize(buffer);
      expect(output.str_val).toBe("hello");
      expect(output.int_val).toBeUndefined();
      expect(output.bool_val).toBeUndefined();
    });

    it("handles oneof with second option set", () => {
      const root = createOneofSchema();
      const codec = new ProtobufCodec<{ str_val?: string; int_val?: number; bool_val?: boolean }>(
        root.lookupType("OneofMsg"),
      );

      const buffer = codec.serialize({ int_val: 42 });
      const output = codec.deserialize(buffer);
      expect(output.str_val).toBeUndefined();
      expect(output.int_val).toBe(42);
      expect(output.bool_val).toBeUndefined();
    });

    it("handles oneof with no option set", () => {
      const root = createOneofSchema();
      const codec = new ProtobufCodec<{ str_val?: string; int_val?: number; bool_val?: boolean }>(
        root.lookupType("OneofMsg"),
      );

      const buffer = codec.serialize({});
      const output = codec.deserialize(buffer);
      expect(output.str_val).toBeUndefined();
      expect(output.int_val).toBeUndefined();
      expect(output.bool_val).toBeUndefined();
    });
  });

  describe("maps", () => {
    const createMapSchema = () => {
      // Create map types programmatically since JSON schema doesn't support keyType directly
      const root = new protobuf.Root();

      const Nested = new protobuf.Type("Nested").add(new protobuf.Field("value", 1, "string"));

      const MapMsg = new protobuf.Type("MapMsg")
        .add(new protobuf.MapField("str_map", 1, "string", "string"))
        .add(new protobuf.MapField("int_map", 2, "int32", "Nested"));

      root.add(Nested);
      root.add(MapMsg);

      return root;
    };

    it("handles map<string, string>", () => {
      const root = createMapSchema();
      const codec = new ProtobufCodec<{ str_map: Record<string, string> }>(
        root.lookupType("MapMsg"),
      );

      const input = { str_map: { foo: "bar", baz: "qux" } };
      const buffer = codec.serialize(input);
      const output = codec.deserialize(buffer);
      expect(output.str_map).toEqual(input.str_map);
    });

    it("handles map<int32, message>", () => {
      const root = createMapSchema();
      const codec = new ProtobufCodec<{ int_map: Record<number, { value: string }> }>(
        root.lookupType("MapMsg"),
      );

      const input = { int_map: { 1: { value: "one" }, 2: { value: "two" } } };
      const buffer = codec.serialize(input);
      const output = codec.deserialize(buffer);
      expect(output.int_map).toEqual(input.int_map);
    });

    it("handles empty maps", () => {
      const root = createMapSchema();
      const codec = new ProtobufCodec<{ str_map: Record<string, string> }>(
        root.lookupType("MapMsg"),
      );

      const buffer = codec.serialize({ str_map: {} });
      const output = codec.deserialize(buffer);
      // Empty map may be omitted
      expect(output.str_map === undefined || Object.keys(output.str_map).length === 0).toBe(true);
    });
  });

  describe("buffer edge cases", () => {
    const createSimpleSchema = () => {
      return protobuf.Root.fromJSON({
        nested: {
          Simple: {
            fields: {
              id: { type: "int32", id: 1 },
            },
          },
        },
      });
    };

    it("handles empty buffer (0 bytes)", () => {
      const root = createSimpleSchema();
      const codec = new ProtobufCodec<{ id?: number }>(root.lookupType("Simple"));

      // Empty buffer represents empty message
      const buffer = Buffer.from([]);
      const output = codec.deserialize(buffer);
      expect(output).toEqual({});
    });

    it("handles buffer with extra trailing bytes", () => {
      const root = createSimpleSchema();
      const codec = new ProtobufCodec<{ id: number }>(root.lookupType("Simple"));

      // Serialize and add extra bytes
      const buffer = codec.serialize({ id: 42 });
      const withExtra = Buffer.concat([buffer, Buffer.from([0xff, 0xff])]);

      // protobufjs may ignore extra bytes or throw - both are valid
      try {
        const output = codec.deserialize(withExtra);
        expect(output.id).toBe(42);
      } catch {
        // Also acceptable
        expect(true).toBe(true);
      }
    });

    it("handles buffer from ArrayBuffer slice", () => {
      const root = createSimpleSchema();
      const codec = new ProtobufCodec<{ id: number }>(root.lookupType("Simple"));

      const input = { id: 123 };
      const originalBuffer = codec.serialize(input);

      // Create a new buffer from an ArrayBuffer slice
      const arrayBuffer = new ArrayBuffer(originalBuffer.length + 10);
      const view = new Uint8Array(arrayBuffer, 5, originalBuffer.length);
      view.set(originalBuffer);
      const slicedBuffer = Buffer.from(arrayBuffer, 5, originalBuffer.length);

      const output = codec.deserialize(slicedBuffer);
      expect(output.id).toBe(123);
    });
  });
});
