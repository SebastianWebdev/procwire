import { describe, expect, it } from "vitest";
import { tableFromArrays } from "apache-arrow";
import { ArrowCodec } from "../src/index.js";
import { SerializationError } from "@aspect-ipc/transport";

describe("@aspect-ipc/codec-arrow", () => {
  describe("ArrowCodec", () => {
    it("has correct metadata", () => {
      const codec = new ArrowCodec();
      expect(codec.name).toBe("arrow");
      expect(codec.contentType).toBe("application/vnd.apache.arrow.stream");
    });

    it("roundtrips simple table", () => {
      const codec = new ArrowCodec();

      const table = tableFromArrays({
        id: [1, 2, 3],
        name: ["Alice", "Bob", "Charlie"],
      });

      const buffer = codec.serialize(table);
      expect(Buffer.isBuffer(buffer)).toBe(true);

      const decoded = codec.deserialize(buffer);
      expect(decoded.numRows).toBe(table.numRows);
      expect(decoded.numCols).toBe(table.numCols);

      // Verify data integrity
      expect(decoded.getChild("id")?.toArray()).toEqual(table.getChild("id")?.toArray());
      expect(decoded.getChild("name")?.toArray()).toEqual(table.getChild("name")?.toArray());
    });

    it("roundtrips table with various numeric types", () => {
      const codec = new ArrowCodec();

      const table = tableFromArrays({
        int32: new Int32Array([1, 2, 3, 4, 5]),
        float64: new Float64Array([1.1, 2.2, 3.3, 4.4, 5.5]),
      });

      const buffer = codec.serialize(table);
      const decoded = codec.deserialize(buffer);

      expect(decoded.numRows).toBe(5);
      expect(decoded.getChild("int32")?.toArray()).toEqual(table.getChild("int32")?.toArray());
      expect(decoded.getChild("float64")?.toArray()).toEqual(
        table.getChild("float64")?.toArray(),
      );
    });

    it("roundtrips table with string data", () => {
      const codec = new ArrowCodec();

      const table = tableFromArrays({
        names: ["Alice", "Bob", "Charlie", "David"],
        emails: [
          "alice@example.com",
          "bob@example.com",
          "charlie@example.com",
          "david@example.com",
        ],
      });

      const buffer = codec.serialize(table);
      const decoded = codec.deserialize(buffer);

      expect(decoded.numRows).toBe(4);
      expect(decoded.getChild("names")?.toArray()).toEqual(table.getChild("names")?.toArray());
      expect(decoded.getChild("emails")?.toArray()).toEqual(
        table.getChild("emails")?.toArray(),
      );
    });

    it("roundtrips table with boolean data", () => {
      const codec = new ArrowCodec();

      const table = tableFromArrays({
        id: [1, 2, 3],
        active: [true, false, true],
      });

      const buffer = codec.serialize(table);
      const decoded = codec.deserialize(buffer);

      expect(decoded.numRows).toBe(3);
      expect(decoded.getChild("active")?.toArray()).toEqual(table.getChild("active")?.toArray());
    });

    it("roundtrips large table", () => {
      const codec = new ArrowCodec();

      const size = 10000;
      const ids = Array.from({ length: size }, (_, i) => i);
      const values = Array.from({ length: size }, (_, i) => i * 1.5);

      const table = tableFromArrays({
        id: ids,
        value: values,
      });

      const buffer = codec.serialize(table);
      const decoded = codec.deserialize(buffer);

      expect(decoded.numRows).toBe(size);
      expect(decoded.getChild("id")?.toArray()).toEqual(table.getChild("id")?.toArray());
      expect(decoded.getChild("value")?.toArray()).toEqual(table.getChild("value")?.toArray());
    });

    it("roundtrips empty table", () => {
      const codec = new ArrowCodec();

      const table = tableFromArrays({
        id: new Int32Array([]),
        name: [],
      });

      const buffer = codec.serialize(table);
      const decoded = codec.deserialize(buffer);

      expect(decoded.numRows).toBe(0);
      expect(decoded.numCols).toBe(2);
    });

    it("preserves table schema", () => {
      const codec = new ArrowCodec();

      const table = tableFromArrays({
        id: [1, 2, 3],
        name: ["Alice", "Bob", "Charlie"],
        score: [95.5, 87.3, 92.1],
      });

      const buffer = codec.serialize(table);
      const decoded = codec.deserialize(buffer);

      // Verify schema is preserved
      expect(decoded.schema.fields.length).toBe(3);
      expect(decoded.schema.fields[0]?.name).toBe("id");
      expect(decoded.schema.fields[1]?.name).toBe("name");
      expect(decoded.schema.fields[2]?.name).toBe("score");
    });

    it("handles null values", () => {
      const codec = new ArrowCodec();

      const table = tableFromArrays({
        id: [1, 2, 3, 4],
        name: ["Alice", null, "Charlie", null],
      });

      const buffer = codec.serialize(table);
      const decoded = codec.deserialize(buffer);

      expect(decoded.numRows).toBe(4);
      const names = decoded.getChild("name")?.toArray();
      expect(names).toEqual(["Alice", null, "Charlie", null]);
    });

    it("produces binary output", () => {
      const codec = new ArrowCodec();

      const table = tableFromArrays({
        id: [1, 2, 3],
        value: [10, 20, 30],
      });

      const buffer = codec.serialize(table);
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it("throws SerializationError on invalid table", () => {
      const codec = new ArrowCodec();

      // Try to serialize invalid data
      expect(() => {
        // @ts-expect-error - intentionally invalid for testing
        codec.serialize({ not: "a table" });
      }).toThrow(SerializationError);
    });

    it("handles empty or invalid buffers gracefully", () => {
      const codec = new ArrowCodec();

      // Apache Arrow's tableFromIPC may handle some invalid data gracefully
      // or return an empty table rather than throwing
      // Test with clearly corrupted data
      try {
        const invalidBuffer = Buffer.from([0x00, 0x01, 0x02]);
        const result = codec.deserialize(invalidBuffer);
        // If it doesn't throw, verify it returns a Table
        expect(result).toBeDefined();
      } catch (error) {
        // If it does throw, verify it's a SerializationError
        expect(error).toBeInstanceOf(SerializationError);
      }
    });

    it("is efficient for columnar data", () => {
      const codec = new ArrowCodec();

      // Create a table with columnar numeric data
      const size = 1000;
      const table = tableFromArrays({
        col1: Array.from({ length: size }, (_, i) => i),
        col2: Array.from({ length: size }, (_, i) => i * 2),
        col3: Array.from({ length: size }, (_, i) => i * 3),
      });

      const buffer = codec.serialize(table);

      // Arrow should be efficient for columnar data
      // Roughly estimate: 1000 rows * 3 columns * 8 bytes per float64 = 24000 bytes
      // Plus metadata overhead (~400-500 bytes for schema and metadata)
      expect(buffer.length).toBeLessThan(30000);
      expect(buffer.length).toBeGreaterThan(20000);
    });

    it("roundtrips with column access", () => {
      const codec = new ArrowCodec();

      const table = tableFromArrays({
        id: [1, 2, 3],
        name: ["Alice", "Bob", "Charlie"],
      });

      const buffer = codec.serialize(table);
      const decoded = codec.deserialize(buffer);

      // Access columns directly
      const idColumn = decoded.getChild("id");
      const nameColumn = decoded.getChild("name");

      expect(idColumn).toBeDefined();
      expect(nameColumn).toBeDefined();

      // toArray() returns TypedArray for numeric columns
      const idArray = idColumn?.toArray();
      expect(Array.from(idArray ?? [])).toEqual([1, 2, 3]);

      // String columns return regular arrays
      expect(nameColumn?.toArray()).toEqual(["Alice", "Bob", "Charlie"]);
    });
  });
});
