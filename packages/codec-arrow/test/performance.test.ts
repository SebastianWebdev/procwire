import { describe, expect, it } from "vitest";
import { tableFromArrays, type Table } from "apache-arrow";
import { ArrowCodec, createFastArrowCodec } from "../src/index.js";

/**
 * Helper function to create a large table for performance testing.
 */
function createLargeTable(rows: number): Table {
  return tableFromArrays({
    id: new Int32Array(Array.from({ length: rows }, (_, i) => i)),
    value: new Float64Array(Array.from({ length: rows }, () => Math.random())),
    category: Array.from({ length: rows }, (_, i) => `cat_${i % 100}`),
    flag: Array.from({ length: rows }, () => Math.random() > 0.5),
  });
}

describe("ArrowCodec performance", () => {
  describe("serialization speed", () => {
    it("serializes 100K rows in under 500ms", () => {
      const codec = new ArrowCodec({ validateInput: false });
      const table = createLargeTable(100000);

      const start = performance.now();
      const buffer = codec.serialize(table);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(500);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it("deserializes 100K rows in under 500ms", () => {
      const codec = new ArrowCodec({ validateInput: false });
      const table = createLargeTable(100000);
      const buffer = codec.serialize(table);

      const start = performance.now();
      const decoded = codec.deserialize(buffer);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(500);
      expect(decoded.numRows).toBe(100000);
    });

    it("fast codec serializes valid data", () => {
      const fastCodec = createFastArrowCodec();
      const table = createLargeTable(50000);

      // Fast codec should work correctly
      const buffer = fastCodec.serialize(table);
      expect(buffer.length).toBeGreaterThan(0);

      const decoded = fastCodec.deserialize(buffer);
      expect(decoded.numRows).toBe(50000);
    });
  });

  describe("memory efficiency", () => {
    it("zero-copy serialization returns Buffer", () => {
      const codec = new ArrowCodec();
      const table = createLargeTable(10000);

      const buffer = codec.serialize(table);

      // Buffer should be valid
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it("serialized data is compact for numeric columns", () => {
      const codec = new ArrowCodec();

      // Create table with only numeric data
      const rows = 10000;
      const table = tableFromArrays({
        int32_col: new Int32Array(Array.from({ length: rows }, (_, i) => i)),
        float64_col: new Float64Array(Array.from({ length: rows }, () => Math.random())),
      });

      const buffer = codec.serialize(table);

      // Expected size: ~10000 * (4 + 8) bytes = 120000 bytes + metadata
      // Should be less than 2x the raw data size
      const rawDataSize = rows * (4 + 8);
      expect(buffer.length).toBeLessThan(rawDataSize * 2);
    });
  });

  describe("format comparison", () => {
    it("stream format produces smaller output than file format", () => {
      const streamCodec = new ArrowCodec({ format: "stream" });
      const fileCodec = new ArrowCodec({ format: "file" });
      const table = createLargeTable(1000);

      const streamBuffer = streamCodec.serialize(table);
      const fileBuffer = fileCodec.serialize(table);

      // File format has footer overhead (typically 100-200 bytes)
      expect(streamBuffer.length).toBeLessThan(fileBuffer.length);
    });

    it("both formats produce valid output", () => {
      const streamCodec = new ArrowCodec({ format: "stream" });
      const fileCodec = new ArrowCodec({ format: "file" });
      const table = createLargeTable(100);

      const streamBuffer = streamCodec.serialize(table);
      const fileBuffer = fileCodec.serialize(table);

      // Both should roundtrip correctly
      const streamDecoded = streamCodec.deserialize(streamBuffer);
      const fileDecoded = fileCodec.deserialize(fileBuffer);

      expect(streamDecoded.numRows).toBe(100);
      expect(fileDecoded.numRows).toBe(100);
    });
  });

  describe("throughput benchmark", () => {
    it("can process significant data volume", () => {
      const codec = new ArrowCodec({ validateInput: false, collectMetrics: true });
      const table = createLargeTable(10000);

      const iterations = 50;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        const buffer = codec.serialize(table);
        codec.deserialize(buffer);
      }

      const elapsed = performance.now() - start;
      const totalRows = 10000 * iterations * 2; // serialize + deserialize
      const rowsPerSecond = (totalRows / elapsed) * 1000;

      // Log throughput for informational purposes
      console.log(`Throughput: ${Math.round(rowsPerSecond).toLocaleString()} rows/second`);

      // Should process at least 100K rows/second
      expect(rowsPerSecond).toBeGreaterThan(100000);
    });

    it("maintains consistent performance across multiple calls", () => {
      const codec = new ArrowCodec({ validateInput: false });
      const table = createLargeTable(5000);

      const times: number[] = [];

      for (let i = 0; i < 20; i++) {
        const start = performance.now();
        const buffer = codec.serialize(table);
        codec.deserialize(buffer);
        times.push(performance.now() - start);
      }

      // Calculate average and max
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const max = Math.max(...times);

      // Max should not be more than 5x average (no major outliers)
      expect(max).toBeLessThan(avg * 5);
    });
  });

  describe("scaling characteristics", () => {
    it("serialization time scales roughly linearly with data size", () => {
      const codec = new ArrowCodec({ validateInput: false });

      // Measure time for 1K rows
      const table1k = createLargeTable(1000);
      const start1k = performance.now();
      codec.serialize(table1k);
      const time1k = performance.now() - start1k;

      // Measure time for 10K rows
      const table10k = createLargeTable(10000);
      const start10k = performance.now();
      codec.serialize(table10k);
      const time10k = performance.now() - start10k;

      // 10K should take roughly 10x as long as 1K (with some overhead tolerance)
      // Allow up to 20x ratio due to fixed overhead and JIT effects
      expect(time10k / time1k).toBeLessThan(20);
    });

    it("handles empty tables efficiently", () => {
      const codec = new ArrowCodec();
      const emptyTable = tableFromArrays({
        id: new Int32Array([]),
        value: new Float64Array([]),
      });

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        const buffer = codec.serialize(emptyTable);
        codec.deserialize(buffer);
      }
      const elapsed = performance.now() - start;

      // 1000 empty roundtrips should complete quickly
      expect(elapsed).toBeLessThan(1000);
    });
  });

  describe("column type performance", () => {
    it("numeric columns serialize efficiently", () => {
      const codec = new ArrowCodec();
      const rows = 10000;

      const table = tableFromArrays({
        int8: new Int8Array(Array.from({ length: rows }, (_, i) => i % 128)),
        int16: new Int16Array(Array.from({ length: rows }, (_, i) => i)),
        int32: new Int32Array(Array.from({ length: rows }, (_, i) => i)),
        float32: new Float32Array(Array.from({ length: rows }, () => Math.random())),
        float64: new Float64Array(Array.from({ length: rows }, () => Math.random())),
      });

      const start = performance.now();
      const buffer = codec.serialize(table);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it("string columns serialize reasonably", () => {
      const codec = new ArrowCodec();
      const rows = 10000;

      const table = tableFromArrays({
        short_string: Array.from({ length: rows }, (_, i) => `row_${i}`),
        longer_string: Array.from(
          { length: rows },
          (_, i) => `This is a longer string for row number ${i}`,
        ),
      });

      const start = performance.now();
      const buffer = codec.serialize(table);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(200);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });
});
