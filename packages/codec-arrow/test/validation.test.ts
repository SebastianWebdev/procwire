import { describe, expect, it } from "vitest";
import { tableFromArrays } from "apache-arrow";
import { ArrowCodec } from "../src/index.js";
import { SerializationError } from "@procwire/transport";

describe("ArrowCodec input validation", () => {
  describe("serialize() validation", () => {
    it("throws SerializationError for null input", () => {
      const codec = new ArrowCodec();

      expect(() => {
        // @ts-expect-error - intentionally invalid
        codec.serialize(null);
      }).toThrow(SerializationError);
    });

    it("throws SerializationError for undefined input", () => {
      const codec = new ArrowCodec();

      expect(() => {
        // @ts-expect-error - intentionally invalid
        codec.serialize(undefined);
      }).toThrow(SerializationError);
    });

    it("throws SerializationError for plain object", () => {
      const codec = new ArrowCodec();

      expect(() => {
        // @ts-expect-error - intentionally invalid
        codec.serialize({ not: "a table" });
      }).toThrow(SerializationError);
    });

    it("throws SerializationError for array", () => {
      const codec = new ArrowCodec();

      expect(() => {
        // @ts-expect-error - intentionally invalid
        codec.serialize([1, 2, 3]);
      }).toThrow(SerializationError);
    });

    it("throws SerializationError for string", () => {
      const codec = new ArrowCodec();

      expect(() => {
        // @ts-expect-error - intentionally invalid
        codec.serialize("not a table");
      }).toThrow(SerializationError);
    });

    it("throws SerializationError for number", () => {
      const codec = new ArrowCodec();

      expect(() => {
        // @ts-expect-error - intentionally invalid
        codec.serialize(42);
      }).toThrow(SerializationError);
    });

    it("error message indicates expected type", () => {
      const codec = new ArrowCodec();

      try {
        // @ts-expect-error - intentionally invalid
        codec.serialize({ not: "a table" });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SerializationError);
        expect((error as Error).message).toContain("Apache Arrow Table");
      }
    });

    it("error includes original cause", () => {
      const codec = new ArrowCodec();

      try {
        // @ts-expect-error - intentionally invalid
        codec.serialize(null);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SerializationError);
        expect((error as SerializationError).cause).toBeInstanceOf(TypeError);
      }
    });
  });

  describe("deserialize() validation", () => {
    it("throws SerializationError for null input", () => {
      const codec = new ArrowCodec();

      expect(() => {
        // @ts-expect-error - intentionally invalid
        codec.deserialize(null);
      }).toThrow(SerializationError);
    });

    it("throws SerializationError for undefined input", () => {
      const codec = new ArrowCodec();

      expect(() => {
        // @ts-expect-error - intentionally invalid
        codec.deserialize(undefined);
      }).toThrow(SerializationError);
    });

    it("throws SerializationError for string input", () => {
      const codec = new ArrowCodec();

      expect(() => {
        // @ts-expect-error - intentionally invalid
        codec.deserialize("not a buffer");
      }).toThrow(SerializationError);
    });

    it("throws SerializationError for number input", () => {
      const codec = new ArrowCodec();

      expect(() => {
        // @ts-expect-error - intentionally invalid
        codec.deserialize(42);
      }).toThrow(SerializationError);
    });

    it("throws SerializationError for plain object input", () => {
      const codec = new ArrowCodec();

      expect(() => {
        // @ts-expect-error - intentionally invalid
        codec.deserialize({ not: "a buffer" });
      }).toThrow(SerializationError);
    });

    it("throws SerializationError for empty buffer", () => {
      const codec = new ArrowCodec();

      expect(() => {
        codec.deserialize(Buffer.alloc(0));
      }).toThrow(SerializationError);
    });

    it("handles corrupted buffer gracefully", () => {
      const codec = new ArrowCodec();

      // Random bytes that are not valid Arrow IPC
      // Note: Apache Arrow may or may not throw for some invalid buffers
      // depending on the content. We test that it either throws SerializationError
      // or returns something (handles gracefully).
      const invalidBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);

      try {
        const result = codec.deserialize(invalidBuffer);
        // If it doesn't throw, it should return a Table-like object
        expect(result).toBeDefined();
      } catch (error) {
        // If it throws, it should be a SerializationError
        expect(error).toBeInstanceOf(SerializationError);
      }
    });

    it("accepts Uint8Array input", () => {
      const codec = new ArrowCodec();
      const table = tableFromArrays({ id: [1, 2, 3] });
      const buffer = codec.serialize(table);

      // Convert to Uint8Array
      const uint8Array = new Uint8Array(buffer);

      // Should accept Uint8Array (since Buffer extends Uint8Array)
      const decoded = codec.deserialize(Buffer.from(uint8Array));
      expect(decoded.numRows).toBe(3);
    });

    it("error message includes input type for null", () => {
      const codec = new ArrowCodec();

      try {
        // @ts-expect-error - intentionally invalid
        codec.deserialize(null);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SerializationError);
        expect((error as Error).message).toContain("null");
      }
    });

    it("error message includes input type for undefined", () => {
      const codec = new ArrowCodec();

      try {
        // @ts-expect-error - intentionally invalid
        codec.deserialize(undefined);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SerializationError);
        expect((error as Error).message).toContain("undefined");
      }
    });

    it("error message indicates empty buffer", () => {
      const codec = new ArrowCodec();

      try {
        codec.deserialize(Buffer.alloc(0));
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SerializationError);
        expect((error as Error).message).toContain("empty");
      }
    });
  });

  describe("validateInput=false", () => {
    it("skips validation for serialize with invalid input", () => {
      const codec = new ArrowCodec({ validateInput: false });

      // Without validation, it will pass the check but fail during actual encoding
      // The encoding itself will throw an error
      expect(() => {
        // @ts-expect-error - intentionally invalid
        codec.serialize({ not: "a table" });
      }).toThrow(SerializationError);
    });

    it("skips validation for deserialize with null", () => {
      const codec = new ArrowCodec({ validateInput: false });

      // Without validation, null will reach tableFromIPC and fail there
      expect(() => {
        // @ts-expect-error - intentionally invalid
        codec.deserialize(null);
      }).toThrow(); // Will throw, but might be different error
    });

    it("may throw or produce result on encoding edge cases", () => {
      const codec = new ArrowCodec({ validateInput: false });

      // Without validation, tableToIPC may handle some invalid inputs
      // in unexpected ways. We verify the behavior is consistent.
      try {
        // @ts-expect-error - intentionally invalid
        const result = codec.serialize("not a table");
        // If it doesn't throw, result should be a Buffer
        expect(Buffer.isBuffer(result)).toBe(true);
      } catch (error) {
        // If it throws, it should be a SerializationError
        expect(error).toBeInstanceOf(SerializationError);
      }
    });

    it("may throw or produce result on decoding edge cases", () => {
      const codec = new ArrowCodec({ validateInput: false });

      // Apache Arrow may handle some invalid buffers gracefully
      const invalidBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);

      try {
        const result = codec.deserialize(invalidBuffer);
        // If it doesn't throw, result should be defined
        expect(result).toBeDefined();
      } catch (error) {
        // If it throws, it should be a SerializationError
        expect(error).toBeInstanceOf(SerializationError);
      }
    });

    it("works with valid input when validation is disabled", () => {
      const codec = new ArrowCodec({ validateInput: false });
      const table = tableFromArrays({ id: [1, 2, 3] });

      const buffer = codec.serialize(table);
      const decoded = codec.deserialize(buffer);

      expect(decoded.numRows).toBe(3);
    });
  });

  describe("duck-typing validation", () => {
    it("rejects object with only some Table properties", () => {
      const codec = new ArrowCodec();

      // Object that partially looks like a Table
      const fakeTable = {
        numRows: 5,
        numCols: 2,
        // Missing schema and getChild
      };

      expect(() => {
        // @ts-expect-error - intentionally invalid
        codec.serialize(fakeTable);
      }).toThrow(SerializationError);
    });

    it("rejects object with wrong property types", () => {
      const codec = new ArrowCodec();

      const fakeTable = {
        numRows: "five", // Should be number
        numCols: 2,
        schema: {},
        getChild: () => {},
      };

      expect(() => {
        // @ts-expect-error - intentionally invalid
        codec.serialize(fakeTable);
      }).toThrow(SerializationError);
    });

    it("rejects object with null schema", () => {
      const codec = new ArrowCodec();

      const fakeTable = {
        numRows: 5,
        numCols: 2,
        schema: null,
        getChild: () => {},
      };

      expect(() => {
        // @ts-expect-error - intentionally invalid
        codec.serialize(fakeTable);
      }).toThrow(SerializationError);
    });
  });
});
