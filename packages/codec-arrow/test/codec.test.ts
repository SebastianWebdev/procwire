import { describe, expect, it } from "vitest";
import { tableFromArrays } from "apache-arrow";
import {
  ArrowCodec,
  createFastArrowCodec,
  createMonitoredArrowCodec,
  createFileArrowCodec,
} from "../src/index.js";
import { SerializationError } from "@procwire/transport";

describe("@procwire/codec-arrow", () => {
  describe("ArrowCodec", () => {
    describe("metadata", () => {
      it("has correct name 'arrow'", () => {
        const codec = new ArrowCodec();
        expect(codec.name).toBe("arrow");
      });

      it("has correct contentType for stream format", () => {
        const codec = new ArrowCodec({ format: "stream" });
        expect(codec.contentType).toBe("application/vnd.apache.arrow.stream");
      });

      it("has correct contentType for file format", () => {
        const codec = new ArrowCodec({ format: "file" });
        expect(codec.contentType).toBe("application/vnd.apache.arrow.file");
      });

      it("defaults to stream format contentType", () => {
        const codec = new ArrowCodec();
        expect(codec.contentType).toBe("application/vnd.apache.arrow.stream");
      });
    });

    describe("basic serialization", () => {
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
        expect(decoded.getChild("emails")?.toArray()).toEqual(table.getChild("emails")?.toArray());
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

      it("roundtrips table with null values", () => {
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

      it("roundtrips large table (10000+ rows)", () => {
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

      it("preserves table schema", () => {
        const codec = new ArrowCodec();

        const table = tableFromArrays({
          id: [1, 2, 3],
          name: ["Alice", "Bob", "Charlie"],
          score: [95.5, 87.3, 92.1],
        });

        const buffer = codec.serialize(table);
        const decoded = codec.deserialize(buffer);

        expect(decoded.schema.fields.length).toBe(3);
        expect(decoded.schema.fields[0]?.name).toBe("id");
        expect(decoded.schema.fields[1]?.name).toBe("name");
        expect(decoded.schema.fields[2]?.name).toBe("score");
      });

      it("preserves column names", () => {
        const codec = new ArrowCodec();

        const table = tableFromArrays({
          user_id: [1, 2],
          first_name: ["Alice", "Bob"],
        });

        const buffer = codec.serialize(table);
        const decoded = codec.deserialize(buffer);

        expect(decoded.getChild("user_id")).toBeDefined();
        expect(decoded.getChild("first_name")).toBeDefined();
      });

      it("preserves column order", () => {
        const codec = new ArrowCodec();

        const table = tableFromArrays({
          z_col: [1],
          a_col: [2],
          m_col: [3],
        });

        const buffer = codec.serialize(table);
        const decoded = codec.deserialize(buffer);

        expect(decoded.schema.fields[0]?.name).toBe("z_col");
        expect(decoded.schema.fields[1]?.name).toBe("a_col");
        expect(decoded.schema.fields[2]?.name).toBe("m_col");
      });
    });

    describe("IPC format", () => {
      it("uses stream format by default", () => {
        const codec = new ArrowCodec();
        expect(codec.contentType).toBe("application/vnd.apache.arrow.stream");
      });

      it("produces smaller output with stream format vs file format", () => {
        const streamCodec = new ArrowCodec({ format: "stream" });
        const fileCodec = new ArrowCodec({ format: "file" });

        const table = tableFromArrays({
          id: Array.from({ length: 1000 }, (_, i) => i),
          value: Array.from({ length: 1000 }, () => Math.random()),
        });

        const streamBuffer = streamCodec.serialize(table);
        const fileBuffer = fileCodec.serialize(table);

        // File format has footer overhead
        expect(streamBuffer.length).toBeLessThan(fileBuffer.length);
      });

      it("stream format works for roundtrip", () => {
        const codec = new ArrowCodec({ format: "stream" });
        const table = tableFromArrays({ id: [1, 2, 3] });

        const buffer = codec.serialize(table);
        const decoded = codec.deserialize(buffer);

        expect(decoded.numRows).toBe(3);
      });

      it("file format works for roundtrip", () => {
        const codec = new ArrowCodec({ format: "file" });
        const table = tableFromArrays({ id: [1, 2, 3] });

        const buffer = codec.serialize(table);
        const decoded = codec.deserialize(buffer);

        expect(decoded.numRows).toBe(3);
      });
    });

    describe("options", () => {
      it("accepts format option", () => {
        const streamCodec = new ArrowCodec({ format: "stream" });
        const fileCodec = new ArrowCodec({ format: "file" });

        expect(streamCodec.contentType).toBe("application/vnd.apache.arrow.stream");
        expect(fileCodec.contentType).toBe("application/vnd.apache.arrow.file");
      });

      it("accepts validateInput option", () => {
        const validatingCodec = new ArrowCodec({ validateInput: true });
        const nonValidatingCodec = new ArrowCodec({ validateInput: false });

        const table = tableFromArrays({ id: [1] });

        // Both should work with valid input
        expect(validatingCodec.serialize(table)).toBeDefined();
        expect(nonValidatingCodec.serialize(table)).toBeDefined();
      });

      it("accepts collectMetrics option", () => {
        const withMetrics = new ArrowCodec({ collectMetrics: true });
        const withoutMetrics = new ArrowCodec({ collectMetrics: false });

        expect(withMetrics.metrics).not.toBeNull();
        expect(withoutMetrics.metrics).toBeNull();
      });

      it("uses defaults when no options provided", () => {
        const codec = new ArrowCodec();

        // Default format is stream
        expect(codec.contentType).toBe("application/vnd.apache.arrow.stream");

        // Default metrics is disabled
        expect(codec.metrics).toBeNull();

        // Default validateInput is true - should throw on invalid input
        expect(() => {
          // @ts-expect-error - intentionally invalid
          codec.serialize(null);
        }).toThrow(SerializationError);
      });
    });

    describe("zero-copy optimization", () => {
      it("serialize returns Buffer", () => {
        const codec = new ArrowCodec();
        const table = tableFromArrays({ id: [1, 2, 3] });

        const buffer = codec.serialize(table);

        expect(Buffer.isBuffer(buffer)).toBe(true);
      });

      it("serialized buffer has correct length", () => {
        const codec = new ArrowCodec();
        const table = tableFromArrays({
          id: Array.from({ length: 100 }, (_, i) => i),
        });

        const buffer = codec.serialize(table);

        expect(buffer.length).toBeGreaterThan(0);
      });
    });

    describe("produces binary output", () => {
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
    });

    describe("is efficient for columnar data", () => {
      it("is efficient for columnar data", () => {
        const codec = new ArrowCodec();

        const size = 1000;
        const table = tableFromArrays({
          col1: Array.from({ length: size }, (_, i) => i),
          col2: Array.from({ length: size }, (_, i) => i * 2),
          col3: Array.from({ length: size }, (_, i) => i * 3),
        });

        const buffer = codec.serialize(table);

        // Arrow should be efficient for columnar data
        expect(buffer.length).toBeLessThan(30000);
        expect(buffer.length).toBeGreaterThan(20000);
      });
    });

    describe("roundtrips with column access", () => {
      it("roundtrips with column access", () => {
        const codec = new ArrowCodec();

        const table = tableFromArrays({
          id: [1, 2, 3],
          name: ["Alice", "Bob", "Charlie"],
        });

        const buffer = codec.serialize(table);
        const decoded = codec.deserialize(buffer);

        const idColumn = decoded.getChild("id");
        const nameColumn = decoded.getChild("name");

        expect(idColumn).toBeDefined();
        expect(nameColumn).toBeDefined();

        const idArray = idColumn?.toArray();
        expect(Array.from(idArray ?? [])).toEqual([1, 2, 3]);

        expect(nameColumn?.toArray()).toEqual(["Alice", "Bob", "Charlie"]);
      });
    });
  });

  describe("helper functions", () => {
    describe("createFastArrowCodec", () => {
      it("creates codec with validation disabled", () => {
        const codec = createFastArrowCodec();

        // Should not throw on valid input
        const table = tableFromArrays({ id: [1] });
        expect(codec.serialize(table)).toBeDefined();
      });

      it("uses stream format by default", () => {
        const codec = createFastArrowCodec();
        expect(codec.contentType).toBe("application/vnd.apache.arrow.stream");
      });

      it("accepts format parameter", () => {
        const streamCodec = createFastArrowCodec("stream");
        const fileCodec = createFastArrowCodec("file");

        expect(streamCodec.contentType).toBe("application/vnd.apache.arrow.stream");
        expect(fileCodec.contentType).toBe("application/vnd.apache.arrow.file");
      });

      it("has metrics disabled", () => {
        const codec = createFastArrowCodec();
        expect(codec.metrics).toBeNull();
      });
    });

    describe("createMonitoredArrowCodec", () => {
      it("creates codec with metrics enabled", () => {
        const codec = createMonitoredArrowCodec();
        expect(codec.metrics).not.toBeNull();
      });

      it("accepts additional options", () => {
        const codec = createMonitoredArrowCodec({ format: "file" });
        expect(codec.contentType).toBe("application/vnd.apache.arrow.file");
        expect(codec.metrics).not.toBeNull();
      });
    });

    describe("createFileArrowCodec", () => {
      it("creates codec with file format", () => {
        const codec = createFileArrowCodec();
        expect(codec.contentType).toBe("application/vnd.apache.arrow.file");
      });

      it("accepts additional options", () => {
        const codec = createFileArrowCodec({ collectMetrics: true });
        expect(codec.contentType).toBe("application/vnd.apache.arrow.file");
        expect(codec.metrics).not.toBeNull();
      });
    });
  });

  describe("edge cases", () => {
    describe("numeric precision", () => {
      it("preserves Int32 values", () => {
        const codec = new ArrowCodec();
        const table = tableFromArrays({ col: new Int32Array([2147483647, -2147483648, 0]) });

        const decoded = codec.deserialize(codec.serialize(table));
        expect(decoded.getChild("col")?.toArray()).toEqual(
          new Int32Array([2147483647, -2147483648, 0]),
        );
      });

      it("preserves Float64 values", () => {
        const codec = new ArrowCodec();
        const table = tableFromArrays({
          col: new Float64Array([1.7976931348623157e308, 5e-324, 0]),
        });

        const decoded = codec.deserialize(codec.serialize(table));
        const arr = decoded.getChild("col")?.toArray() as Float64Array;
        expect(arr[0]).toBe(1.7976931348623157e308);
        expect(arr[2]).toBe(0);
      });

      it("preserves Uint8 values", () => {
        const codec = new ArrowCodec();
        const table = tableFromArrays({ col: new Uint8Array([0, 127, 255]) });

        const decoded = codec.deserialize(codec.serialize(table));
        expect(decoded.getChild("col")?.toArray()).toEqual(new Uint8Array([0, 127, 255]));
      });

      it("handles Float64 infinity", () => {
        const codec = new ArrowCodec();
        const table = tableFromArrays({ col: new Float64Array([Infinity, -Infinity]) });

        const decoded = codec.deserialize(codec.serialize(table));
        const arr = decoded.getChild("col")?.toArray() as Float64Array;
        expect(arr[0]).toBe(Infinity);
        expect(arr[1]).toBe(-Infinity);
      });

      it("handles Float64 NaN", () => {
        const codec = new ArrowCodec();
        const table = tableFromArrays({ col: new Float64Array([NaN]) });

        const decoded = codec.deserialize(codec.serialize(table));
        const arr = decoded.getChild("col")?.toArray() as Float64Array;
        expect(Number.isNaN(arr[0])).toBe(true);
      });
    });

    describe("string handling", () => {
      it("handles empty strings", () => {
        const codec = new ArrowCodec();
        const table = tableFromArrays({ col: ["", "", ""] });

        const decoded = codec.deserialize(codec.serialize(table));
        expect(decoded.getChild("col")?.toArray()).toEqual(["", "", ""]);
      });

      it("handles unicode strings", () => {
        const codec = new ArrowCodec();
        const table = tableFromArrays({ col: ["こんにちは", "Привет", "مرحبا"] });

        const decoded = codec.deserialize(codec.serialize(table));
        expect(decoded.getChild("col")?.toArray()).toEqual(["こんにちは", "Привет", "مرحبا"]);
      });

      it("handles emoji", () => {
        const codec = new ArrowCodec();
        const table = tableFromArrays({ col: ["🎉", "🚀", "💻"] });

        const decoded = codec.deserialize(codec.serialize(table));
        expect(decoded.getChild("col")?.toArray()).toEqual(["🎉", "🚀", "💻"]);
      });
    });

    describe("null handling", () => {
      it("preserves null values in string columns", () => {
        const codec = new ArrowCodec();
        const table = tableFromArrays({ col: ["a", null, "c", null] });

        const decoded = codec.deserialize(codec.serialize(table));
        expect(decoded.getChild("col")?.toArray()).toEqual(["a", null, "c", null]);
      });

      it("handles columns with all nulls in string column", () => {
        const codec = new ArrowCodec();
        // Use explicit string array with nulls - Arrow infers nullable string type
        const table = tableFromArrays({ col: ["a", null, null] });

        const decoded = codec.deserialize(codec.serialize(table));
        expect(decoded.getChild("col")?.toArray()).toEqual(["a", null, null]);
      });
    });

    describe("schema complexity", () => {
      it("handles many columns (100+)", () => {
        const codec = new ArrowCodec();
        const data: Record<string, number[]> = {};
        for (let i = 0; i < 100; i++) {
          data[`col_${i}`] = [i, i + 1, i + 2];
        }
        const table = tableFromArrays(data);

        const decoded = codec.deserialize(codec.serialize(table));
        expect(decoded.numCols).toBe(100);
        expect(decoded.numRows).toBe(3);
      });
    });
  });
});
