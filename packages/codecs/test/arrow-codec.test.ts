import { describe, it, expect } from "vitest";
import { ArrowCodec, arrowCodec } from "../src/arrow-codec.js";
import { Table, makeVector } from "apache-arrow";

describe("ArrowCodec", () => {
  describe("interface", () => {
    it("should have name 'arrow'", () => {
      expect(new ArrowCodec().name).toBe("arrow");
    });

    it("should export singleton", () => {
      expect(arrowCodec).toBeInstanceOf(ArrowCodec);
      expect(arrowCodec.name).toBe("arrow");
    });
  });

  describe("simple object input", () => {
    it("should serialize/deserialize number arrays", () => {
      const codec = new ArrowCodec();
      const original = { ids: [1, 2, 3], scores: [0.9, 0.8, 0.7] };

      const buffer = codec.serialize(original);
      const table = codec.deserialize(buffer);

      expect(table).toBeInstanceOf(Table);
      expect(Array.from(table.getChild("ids")!.toArray())).toEqual([1, 2, 3]);
      expect(Array.from(table.getChild("scores")!.toArray())).toEqual([0.9, 0.8, 0.7]);
    });

    it("should serialize/deserialize Float32Array", () => {
      const codec = new ArrowCodec();
      const embeddings = new Float32Array([1.5, 2.5, 3.5]);
      const original = { embeddings };

      const buffer = codec.serialize(original);
      const table = codec.deserialize(buffer);

      const result = table.getChild("embeddings")?.toArray();
      expect(result).toBeInstanceOf(Float32Array);
      expect(Array.from(result as Float32Array)).toEqual([1.5, 2.5, 3.5]);
    });

    it("should serialize/deserialize Float64Array", () => {
      const codec = new ArrowCodec();
      const values = new Float64Array([1.1, 2.2, 3.3]);
      const original = { values };

      const buffer = codec.serialize(original);
      const table = codec.deserialize(buffer);

      const result = table.getChild("values")?.toArray();
      expect(result).toBeInstanceOf(Float64Array);
      expect(Array.from(result as Float64Array)).toEqual([1.1, 2.2, 3.3]);
    });

    it("should serialize/deserialize Int32Array", () => {
      const codec = new ArrowCodec();
      const ids = new Int32Array([100, 200, 300]);
      const original = { ids };

      const buffer = codec.serialize(original);
      const table = codec.deserialize(buffer);

      const result = table.getChild("ids")?.toArray();
      expect(result).toBeInstanceOf(Int32Array);
      expect(Array.from(result as Int32Array)).toEqual([100, 200, 300]);
    });

    it("should serialize/deserialize string arrays", () => {
      const codec = new ArrowCodec();
      const original = { names: ["Alice", "Bob", "Charlie"] };

      const buffer = codec.serialize(original);
      const table = codec.deserialize(buffer);

      expect(table.getChild("names")?.toArray()).toEqual(["Alice", "Bob", "Charlie"]);
    });

    it("should handle empty arrays", () => {
      const codec = new ArrowCodec();
      const original = { empty: [] };

      const buffer = codec.serialize(original);
      const table = codec.deserialize(buffer);

      expect(table.getChild("empty")?.length).toBe(0);
    });

    it("should handle multiple columns", () => {
      const codec = new ArrowCodec();
      const original = {
        ids: [1, 2, 3],
        names: ["a", "b", "c"],
        scores: new Float32Array([0.1, 0.2, 0.3]),
      };

      const buffer = codec.serialize(original);
      const table = codec.deserialize(buffer);

      expect(table.numCols).toBe(3);
      expect(Array.from(table.getChild("ids")!.toArray())).toEqual([1, 2, 3]);
      expect(table.getChild("names")!.toArray()).toEqual(["a", "b", "c"]);
      expect(Array.from(table.getChild("scores")!.toArray() as Float32Array)).toEqual([
        expect.closeTo(0.1, 5),
        expect.closeTo(0.2, 5),
        expect.closeTo(0.3, 5),
      ]);
    });
  });

  describe("Table input", () => {
    it("should serialize/deserialize Arrow Table directly", () => {
      const codec = new ArrowCodec();
      const vector = makeVector(new Float32Array([1, 2, 3]));
      const original = new Table({ values: vector });

      const buffer = codec.serialize(original);
      const table = codec.deserialize(buffer);

      expect(table).toBeInstanceOf(Table);
      expect(table.numRows).toBe(3);
    });
  });

  describe("RecordBatch input", () => {
    it("should serialize/deserialize RecordBatch from Table", () => {
      const codec = new ArrowCodec();
      // Create a table, get its first batch, and serialize it
      const originalTable = new Table({ data: makeVector(new Float32Array([4, 5, 6])) });
      const batch = originalTable.batches[0]!;

      const buffer = codec.serialize(batch);
      const table = codec.deserialize(buffer);

      expect(table).toBeInstanceOf(Table);
      expect(table.numRows).toBe(3);
    });
  });

  describe("zero-copy", () => {
    it("should use Buffer view in serialize", () => {
      const codec = new ArrowCodec();
      const data = { values: [1, 2, 3] };

      const buffer = codec.serialize(data);

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it("should produce valid IPC format", () => {
      const codec = new ArrowCodec();
      const data = { values: [1, 2, 3] };

      const buffer = codec.serialize(data);

      // Arrow IPC stream format starts with schema message
      // The magic bytes are ARROW1 or the schema metadata
      expect(buffer.length).toBeGreaterThan(10);

      // Should deserialize correctly
      const table = codec.deserialize(buffer);
      expect(table.numRows).toBe(3);
    });
  });

  describe("performance", () => {
    it("should handle 1M floats", () => {
      const codec = new ArrowCodec();
      const vectors = new Float32Array(1_000_000);
      for (let i = 0; i < vectors.length; i++) {
        vectors[i] = Math.random();
      }

      const start = performance.now();
      const buffer = codec.serialize({ vectors });
      const serializeTime = performance.now() - start;

      const deserializeStart = performance.now();
      const table = codec.deserialize(buffer);
      const deserializeTime = performance.now() - deserializeStart;

      expect(table.getChild("vectors")?.length).toBe(1_000_000);

      // Performance expectations - should be fast
      // Arrow is designed for large data, these should complete quickly
      expect(serializeTime).toBeLessThan(500); // 500ms for 1M floats
      expect(deserializeTime).toBeLessThan(500);
    });

    it("should handle multiple large columns", () => {
      const codec = new ArrowCodec();
      const size = 100_000;
      const data = {
        ids: new Int32Array(size),
        scores: new Float32Array(size),
        values: new Float64Array(size),
      };

      for (let i = 0; i < size; i++) {
        data.ids[i] = i;
        data.scores[i] = Math.random();
        data.values[i] = Math.random() * 1000;
      }

      const buffer = codec.serialize(data);
      const table = codec.deserialize(buffer);

      expect(table.numRows).toBe(size);
      expect(table.numCols).toBe(3);
    });

    it("should be efficient for columnar access patterns", () => {
      const codec = new ArrowCodec();
      const data = {
        ids: Array.from({ length: 10000 }, (_, i) => i),
        values: Array.from({ length: 10000 }, () => Math.random()),
      };

      const buffer = codec.serialize(data);
      const table = codec.deserialize(buffer);

      // Arrow's columnar format allows efficient column access
      const idsColumn = table.getChild("ids");
      const valuesColumn = table.getChild("values");

      expect(idsColumn?.length).toBe(10000);
      expect(valuesColumn?.length).toBe(10000);

      // Verify data integrity
      expect(idsColumn?.get(0)).toBe(0);
      expect(idsColumn?.get(9999)).toBe(9999);
    });
  });

  describe("edge cases", () => {
    it("should handle single row", () => {
      const codec = new ArrowCodec();
      const data = { id: [1], name: ["single"] };

      const buffer = codec.serialize(data);
      const table = codec.deserialize(buffer);

      expect(table.numRows).toBe(1);
    });

    it("should handle special float values", () => {
      const codec = new ArrowCodec();
      const data = {
        values: new Float64Array([0, -0, Infinity, -Infinity, NaN]),
      };

      const buffer = codec.serialize(data);
      const table = codec.deserialize(buffer);

      const result = table.getChild("values")?.toArray() as Float64Array;
      expect(result[0]).toBe(0);
      expect(result[2]).toBe(Infinity);
      expect(result[3]).toBe(-Infinity);
      expect(Number.isNaN(result[4])).toBe(true);
    });

    it("should handle unicode strings", () => {
      const codec = new ArrowCodec();
      const data = { names: ["Hello", "世界", "🚀", "Привет"] };

      const buffer = codec.serialize(data);
      const table = codec.deserialize(buffer);

      expect(table.getChild("names")?.toArray()).toEqual(["Hello", "世界", "🚀", "Привет"]);
    });
  });
});
