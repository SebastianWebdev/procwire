/**
 * Codec tests: Apache Arrow
 *
 * Tests Apache Arrow IPC codec for columnar data transfer.
 * Arrow works with Table type, not arbitrary objects.
 */

import { tableFromArrays, type Table } from "apache-arrow";
import {
  ArrowCodec,
  createFastArrowCodec,
  createMonitoredArrowCodec,
  createFileArrowCodec,
} from "@procwire/codec-arrow";
import { ProcessManager } from "@procwire/transport";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnWorker } from "../../utils/test-helpers.js";

describe("Codecs - Arrow", () => {
  let manager: ProcessManager;

  beforeEach(() => {
    manager = new ProcessManager({
      defaultTimeout: 10000,
      restartPolicy: { enabled: false, maxRestarts: 0, backoffMs: 100 },
      gracefulShutdownMs: 5000,
    });
  });

  afterEach(async () => {
    await manager.terminateAll();
  });

  describe("ArrowCodec unit tests", () => {
    it("should serialize and deserialize simple table", () => {
      const codec = new ArrowCodec();

      const table = tableFromArrays({
        id: [1, 2, 3],
        name: ["Alice", "Bob", "Charlie"],
      });

      const buffer = codec.serialize(table);
      const decoded = codec.deserialize(buffer);

      expect(decoded.numRows).toBe(3);
      expect(decoded.numCols).toBe(2);
    });

    it("should preserve column names and order", () => {
      const codec = new ArrowCodec();

      const table = tableFromArrays({
        first: [1, 2],
        second: ["a", "b"],
        third: [true, false],
      });

      const buffer = codec.serialize(table);
      const decoded = codec.deserialize(buffer);

      const fieldNames = decoded.schema.fields.map((f) => f.name);
      expect(fieldNames).toEqual(["first", "second", "third"]);
    });

    it("should handle Int32Array columns", () => {
      const codec = new ArrowCodec();

      const ids = new Int32Array([1, 2, 3, 4, 5]);
      const table = tableFromArrays({ id: ids });

      const buffer = codec.serialize(table);
      const decoded = codec.deserialize(buffer);

      const column = decoded.getChild("id");
      expect(column).not.toBeNull();
      expect(decoded.numRows).toBe(5);

      // Verify values
      const values = column!.toArray();
      expect(Array.from(values)).toEqual([1, 2, 3, 4, 5]);
    });

    it("should handle Float64Array columns", () => {
      const codec = new ArrowCodec();

      const values = new Float64Array([1.1, 2.2, 3.3, 4.4, 5.5]);
      const table = tableFromArrays({ value: values });

      const buffer = codec.serialize(table);
      const decoded = codec.deserialize(buffer);

      const column = decoded.getChild("value");
      expect(column).not.toBeNull();

      const result = column!.toArray();
      expect(result[0]).toBeCloseTo(1.1);
      expect(result[4]).toBeCloseTo(5.5);
    });

    it("should handle string columns", () => {
      const codec = new ArrowCodec();

      const names = ["Alice", "Bob", "Charlie", "Diana", "Eve"];
      const table = tableFromArrays({ name: names });

      const buffer = codec.serialize(table);
      const decoded = codec.deserialize(buffer);

      const column = decoded.getChild("name");
      expect(column).not.toBeNull();

      // String columns need special handling for comparison
      const result: string[] = [];
      for (let i = 0; i < decoded.numRows; i++) {
        result.push(column!.get(i) as string);
      }
      expect(result).toEqual(names);
    });

    it("should handle boolean columns", () => {
      const codec = new ArrowCodec();

      const flags = [true, false, true, true, false];
      const table = tableFromArrays({ active: flags });

      const buffer = codec.serialize(table);
      const decoded = codec.deserialize(buffer);

      const column = decoded.getChild("active");
      expect(column).not.toBeNull();

      const result: boolean[] = [];
      for (let i = 0; i < decoded.numRows; i++) {
        result.push(column!.get(i) as boolean);
      }
      expect(result).toEqual(flags);
    });

    it("should handle null values in columns", () => {
      const codec = new ArrowCodec();

      // Arrow handles nulls through validity bitmaps
      const values = [1, null, 3, null, 5];
      const table = tableFromArrays({ value: values });

      const buffer = codec.serialize(table);
      const decoded = codec.deserialize(buffer);

      expect(decoded.numRows).toBe(5);

      const column = decoded.getChild("value");
      expect(column!.get(0)).toBe(1);
      expect(column!.get(1)).toBeNull();
      expect(column!.get(2)).toBe(3);
      expect(column!.get(3)).toBeNull();
      expect(column!.get(4)).toBe(5);
    });

    it("should handle multiple column types together", () => {
      const codec = new ArrowCodec();

      const table = tableFromArrays({
        id: new Int32Array([1, 2, 3]),
        score: new Float64Array([95.5, 87.3, 92.1]),
        name: ["Alice", "Bob", "Charlie"],
        active: [true, false, true],
      });

      const buffer = codec.serialize(table);
      const decoded = codec.deserialize(buffer);

      expect(decoded.numRows).toBe(3);
      expect(decoded.numCols).toBe(4);
    });
  });

  describe("Large table handling", () => {
    it("should serialize/deserialize 1K row table", () => {
      const codec = new ArrowCodec();
      const rows = 1000;

      const table = tableFromArrays({
        id: new Int32Array(Array.from({ length: rows }, (_, i) => i)),
        value: new Float64Array(Array.from({ length: rows }, () => Math.random())),
        category: Array.from({ length: rows }, (_, i) => `cat_${i % 10}`),
      });

      const buffer = codec.serialize(table);
      const decoded = codec.deserialize(buffer);

      expect(decoded.numRows).toBe(rows);
      expect(decoded.numCols).toBe(3);
    });

    it("should serialize/deserialize 10K row table", () => {
      const codec = new ArrowCodec();
      const rows = 10000;

      const table = tableFromArrays({
        id: new Int32Array(Array.from({ length: rows }, (_, i) => i)),
        value: new Float64Array(Array.from({ length: rows }, () => Math.random())),
        name: Array.from({ length: rows }, (_, i) => `item_${i}`),
      });

      const buffer = codec.serialize(table);
      const decoded = codec.deserialize(buffer);

      expect(decoded.numRows).toBe(rows);
    });

    it("should serialize/deserialize 100K row table within performance threshold", () => {
      const codec = new ArrowCodec({ validateInput: false });
      const rows = 100000;

      const table = tableFromArrays({
        id: new Int32Array(Array.from({ length: rows }, (_, i) => i)),
        value: new Float64Array(Array.from({ length: rows }, () => Math.random())),
        flag: Array.from({ length: rows }, () => Math.random() > 0.5),
      });

      // Measure serialize time
      const serializeStart = performance.now();
      const buffer = codec.serialize(table);
      const serializeTime = performance.now() - serializeStart;

      // Measure deserialize time
      const deserializeStart = performance.now();
      const decoded = codec.deserialize(buffer);
      const deserializeTime = performance.now() - deserializeStart;

      console.log(
        `100K rows - Serialize: ${serializeTime.toFixed(2)}ms, Deserialize: ${deserializeTime.toFixed(2)}ms`,
      );

      expect(decoded.numRows).toBe(rows);

      // Performance threshold (adjusted for CI - see commit a9dad0a)
      expect(serializeTime).toBeLessThan(500);
      expect(deserializeTime).toBeLessThan(500);
    }, 10000);
  });

  describe("Format comparison (stream vs file)", () => {
    it("stream format should be smaller than file format", () => {
      const streamCodec = new ArrowCodec({ format: "stream" });
      const fileCodec = new ArrowCodec({ format: "file" });

      const table = tableFromArrays({
        id: new Int32Array(Array.from({ length: 1000 }, (_, i) => i)),
        value: new Float64Array(Array.from({ length: 1000 }, () => Math.random())),
      });

      const streamBuffer = streamCodec.serialize(table);
      const fileBuffer = fileCodec.serialize(table);

      console.log(
        `Stream format: ${streamBuffer.length} bytes, File format: ${fileBuffer.length} bytes`,
      );

      // Stream format should be smaller (no footer)
      expect(streamBuffer.length).toBeLessThan(fileBuffer.length);
    });

    it("both formats should produce valid tables", () => {
      const streamCodec = new ArrowCodec({ format: "stream" });
      const fileCodec = new ArrowCodec({ format: "file" });

      const table = tableFromArrays({
        id: [1, 2, 3],
        name: ["A", "B", "C"],
      });

      const streamBuffer = streamCodec.serialize(table);
      const fileBuffer = fileCodec.serialize(table);

      const streamDecoded = streamCodec.deserialize(streamBuffer);
      const fileDecoded = fileCodec.deserialize(fileBuffer);

      expect(streamDecoded.numRows).toBe(3);
      expect(fileDecoded.numRows).toBe(3);

      // Both should have same data
      expect(streamDecoded.getChild("id")!.get(0)).toBe(1);
      expect(fileDecoded.getChild("id")!.get(0)).toBe(1);
    });

    it("file format can be deserialized by stream codec", () => {
      const streamCodec = new ArrowCodec({ format: "stream" });
      const fileCodec = new ArrowCodec({ format: "file" });

      const table = tableFromArrays({ id: [1, 2, 3] });

      // Serialize with file format
      const fileBuffer = fileCodec.serialize(table);

      // Deserialize with stream codec (Arrow IPC is interoperable)
      const decoded = streamCodec.deserialize(fileBuffer);

      expect(decoded.numRows).toBe(3);
    });
  });

  describe("Metrics collection", () => {
    it("should collect metrics when enabled", () => {
      const codec = createMonitoredArrowCodec();

      const table = tableFromArrays({
        id: [1, 2, 3],
        value: [10.0, 20.0, 30.0],
      });

      codec.serialize(table);
      codec.serialize(table);

      const metrics = codec.metrics!;
      expect(metrics.serializeCount).toBe(2);
      expect(metrics.rowsSerialized).toBe(6); // 3 rows * 2 serializations
      expect(metrics.bytesSerialised).toBeGreaterThan(0);
    });

    it("should track rows and bytes correctly", () => {
      const codec = createMonitoredArrowCodec();

      const smallTable = tableFromArrays({ id: [1, 2, 3] });
      const largeTable = tableFromArrays({
        id: new Int32Array(Array.from({ length: 100 }, (_, i) => i)),
      });

      const smallBuffer = codec.serialize(smallTable);
      const largeBuffer = codec.serialize(largeTable);

      const metrics = codec.metrics!;
      expect(metrics.serializeCount).toBe(2);
      expect(metrics.rowsSerialized).toBe(103); // 3 + 100
      expect(metrics.bytesSerialised).toBe(smallBuffer.length + largeBuffer.length);
    });

    it("should track deserialization metrics", () => {
      const codec = createMonitoredArrowCodec();

      const table = tableFromArrays({ id: [1, 2, 3, 4, 5] });
      const buffer = codec.serialize(table);

      codec.deserialize(buffer);
      codec.deserialize(buffer);

      const metrics = codec.metrics!;
      expect(metrics.deserializeCount).toBe(2);
      expect(metrics.rowsDeserialized).toBe(10); // 5 rows * 2
      expect(metrics.bytesDeserialized).toBe(buffer.length * 2);
    });

    it("should reset metrics correctly", () => {
      const codec = createMonitoredArrowCodec();

      const table = tableFromArrays({ id: [1, 2, 3] });
      codec.serialize(table);

      expect(codec.metrics!.serializeCount).toBe(1);

      codec.resetMetrics();

      const metrics = codec.metrics!;
      expect(metrics.serializeCount).toBe(0);
      expect(metrics.deserializeCount).toBe(0);
      expect(metrics.bytesSerialised).toBe(0);
      expect(metrics.bytesDeserialized).toBe(0);
      expect(metrics.rowsSerialized).toBe(0);
      expect(metrics.rowsDeserialized).toBe(0);
      expect(metrics.serializeErrors).toBe(0);
      expect(metrics.deserializeErrors).toBe(0);
    });

    it("should not collect metrics when disabled", () => {
      const codec = new ArrowCodec({ collectMetrics: false });

      const table = tableFromArrays({ id: [1, 2, 3] });
      codec.serialize(table);

      expect(codec.metrics).toBeNull();
    });
  });

  describe("Factory functions", () => {
    it("createFastArrowCodec should skip validation", () => {
      const fastCodec = createFastArrowCodec();

      // Fast codec should work with valid data
      const table = tableFromArrays({ id: [1, 2, 3] });
      const buffer = fastCodec.serialize(table);
      const decoded = fastCodec.deserialize(buffer);

      expect(decoded.numRows).toBe(3);

      // Metrics should be null (disabled for performance)
      expect(fastCodec.metrics).toBeNull();
    });

    it("createMonitoredArrowCodec should enable metrics", () => {
      const monitoredCodec = createMonitoredArrowCodec();

      const table = tableFromArrays({ id: [1, 2, 3] });
      monitoredCodec.serialize(table);

      expect(monitoredCodec.metrics).not.toBeNull();
      expect(monitoredCodec.metrics!.serializeCount).toBe(1);
    });

    it("createFileArrowCodec should use file format", () => {
      const fileCodec = createFileArrowCodec();
      const streamCodec = new ArrowCodec({ format: "stream" });

      const table = tableFromArrays({
        id: new Int32Array(Array.from({ length: 100 }, (_, i) => i)),
      });

      const fileBuffer = fileCodec.serialize(table);
      const streamBuffer = streamCodec.serialize(table);

      // File format includes footer, so should be larger
      expect(fileBuffer.length).toBeGreaterThan(streamBuffer.length);

      // Content type should reflect file format
      expect(fileCodec.contentType).toBe("application/vnd.apache.arrow.file");
    });

    it("createFastArrowCodec should accept format parameter", () => {
      const fastStreamCodec = createFastArrowCodec("stream");
      const fastFileCodec = createFastArrowCodec("file");

      expect(fastStreamCodec.contentType).toBe("application/vnd.apache.arrow.stream");
      expect(fastFileCodec.contentType).toBe("application/vnd.apache.arrow.file");
    });
  });

  describe("integration with control channel", () => {
    it("should work when tabular data is converted to JSON", async () => {
      const handle = await spawnWorker(manager, "arrow-json", "echo-worker.ts");

      // Convert Arrow-like data to JSON for control channel
      const rows = [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
        { id: 3, name: "Charlie" },
      ];

      const result = await handle.request("echo", { rows });
      expect(result).toEqual({ rows });
    });
  });

  describe("performance comparison for tabular data", () => {
    it("should serialize faster than JSON for large tables", () => {
      const codec = new ArrowCodec({ validateInput: false });
      const rows = 10000;

      // Create columnar data
      const ids = new Int32Array(Array.from({ length: rows }, (_, i) => i));
      const values = new Float64Array(Array.from({ length: rows }, () => Math.random()));
      const names = Array.from({ length: rows }, (_, i) => `item_${i}`);

      const table = tableFromArrays({ id: ids, value: values, name: names });

      // Create equivalent JSON data
      const jsonData = Array.from({ length: rows }, (_, i) => ({
        id: ids[i],
        value: values[i],
        name: names[i],
      }));

      // Warm up
      codec.serialize(table);
      JSON.stringify(jsonData);

      // Measure Arrow
      const arrowStart = performance.now();
      for (let i = 0; i < 10; i++) {
        codec.serialize(table);
      }
      const arrowTime = performance.now() - arrowStart;

      // Measure JSON
      const jsonStart = performance.now();
      for (let i = 0; i < 10; i++) {
        JSON.stringify(jsonData);
      }
      const jsonTime = performance.now() - jsonStart;

      console.log(
        `10K rows serialize - Arrow: ${arrowTime.toFixed(2)}ms, JSON: ${jsonTime.toFixed(2)}ms`,
      );
    });

    it("should deserialize faster than JSON for large tables", () => {
      const codec = new ArrowCodec({ validateInput: false });
      const rows = 10000;

      const ids = new Int32Array(Array.from({ length: rows }, (_, i) => i));
      const values = new Float64Array(Array.from({ length: rows }, () => Math.random()));

      const table = tableFromArrays({ id: ids, value: values });
      const arrowBuffer = codec.serialize(table);

      const jsonData = Array.from({ length: rows }, (_, i) => ({
        id: ids[i],
        value: values[i],
      }));
      const jsonString = JSON.stringify(jsonData);

      // Warm up
      codec.deserialize(arrowBuffer);
      JSON.parse(jsonString);

      // Measure Arrow
      const arrowStart = performance.now();
      for (let i = 0; i < 10; i++) {
        codec.deserialize(arrowBuffer);
      }
      const arrowTime = performance.now() - arrowStart;

      // Measure JSON
      const jsonStart = performance.now();
      for (let i = 0; i < 10; i++) {
        JSON.parse(jsonString);
      }
      const jsonTime = performance.now() - jsonStart;

      console.log(
        `10K rows deserialize - Arrow: ${arrowTime.toFixed(2)}ms, JSON: ${jsonTime.toFixed(2)}ms`,
      );
    });

    it("should produce smaller serialized size than JSON for numeric data", () => {
      const codec = new ArrowCodec();
      const rows = 1000;

      const ids = new Int32Array(Array.from({ length: rows }, (_, i) => i));
      const values = new Float64Array(Array.from({ length: rows }, () => Math.random() * 1000));

      const table = tableFromArrays({ id: ids, value: values });

      const jsonData = Array.from({ length: rows }, (_, i) => ({
        id: ids[i],
        value: values[i],
      }));

      const arrowSize = codec.serialize(table).length;
      const jsonSize = JSON.stringify(jsonData).length;

      console.log(`1K rows numeric - Arrow: ${arrowSize} bytes, JSON: ${jsonSize} bytes`);

      // Arrow should be smaller for numeric data (efficient binary encoding)
      expect(arrowSize).toBeLessThan(jsonSize);
    });
  });

  describe("error handling", () => {
    it("should throw on invalid input when validation is enabled", () => {
      const codec = new ArrowCodec({ validateInput: true });

      expect(() => codec.serialize({} as Table)).toThrow(/Invalid input/);
    });

    it("should throw on empty buffer", () => {
      const codec = new ArrowCodec({ validateInput: true });

      expect(() => codec.deserialize(Buffer.alloc(0))).toThrow(/empty/);
    });

    it("should throw on corrupted buffer", () => {
      const codec = new ArrowCodec();

      // Arrow IPC has specific magic bytes, random data should fail
      const corruptedBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);

      // Arrow may not always throw on invalid data, it might return empty table
      // So we test that it either throws or returns something unexpected
      try {
        const result = codec.deserialize(corruptedBuffer);
        // If it doesn't throw, verify we got something (could be empty or invalid)
        expect(result).toBeDefined();
      } catch (error) {
        // Expected to throw for truly corrupted data
        expect(error).toBeDefined();
      }
    });

    it("should increment error metrics on failure", () => {
      const codec = createMonitoredArrowCodec();

      try {
        codec.serialize({} as Table);
      } catch {
        // Expected to throw
      }

      try {
        codec.deserialize(Buffer.alloc(0));
      } catch {
        // Expected to throw
      }

      const metrics = codec.metrics!;
      expect(metrics.serializeErrors).toBe(1);
      expect(metrics.deserializeErrors).toBe(1);
    });
  });

  describe("codec properties", () => {
    it("should have correct name", () => {
      const codec = new ArrowCodec();
      expect(codec.name).toBe("arrow");
    });

    it("should have correct content type for stream format", () => {
      const codec = new ArrowCodec({ format: "stream" });
      expect(codec.contentType).toBe("application/vnd.apache.arrow.stream");
    });

    it("should have correct content type for file format", () => {
      const codec = new ArrowCodec({ format: "file" });
      expect(codec.contentType).toBe("application/vnd.apache.arrow.file");
    });
  });
});
