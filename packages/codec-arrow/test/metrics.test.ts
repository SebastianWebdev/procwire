import { describe, expect, it } from "vitest";
import { tableFromArrays } from "apache-arrow";
import { ArrowCodec, createMonitoredArrowCodec } from "../src/index.js";

describe("ArrowCodec metrics", () => {
  describe("metrics collection", () => {
    it("returns null when collectMetrics=false", () => {
      const codec = new ArrowCodec({ collectMetrics: false });
      expect(codec.metrics).toBeNull();
    });

    it("returns null by default", () => {
      const codec = new ArrowCodec();
      expect(codec.metrics).toBeNull();
    });

    it("returns metrics object when collectMetrics=true", () => {
      const codec = new ArrowCodec({ collectMetrics: true });
      expect(codec.metrics).not.toBeNull();
      expect(codec.metrics).toHaveProperty("serializeCount");
      expect(codec.metrics).toHaveProperty("deserializeCount");
      expect(codec.metrics).toHaveProperty("bytesSerialised");
      expect(codec.metrics).toHaveProperty("bytesDeserialized");
      expect(codec.metrics).toHaveProperty("rowsSerialized");
      expect(codec.metrics).toHaveProperty("rowsDeserialized");
      expect(codec.metrics).toHaveProperty("serializeErrors");
      expect(codec.metrics).toHaveProperty("deserializeErrors");
    });

    it("starts with zero values", () => {
      const codec = new ArrowCodec({ collectMetrics: true });
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

    it("increments serializeCount on successful serialize", () => {
      const codec = new ArrowCodec({ collectMetrics: true });
      const table = tableFromArrays({ id: [1, 2, 3] });

      codec.serialize(table);
      expect(codec.metrics!.serializeCount).toBe(1);

      codec.serialize(table);
      expect(codec.metrics!.serializeCount).toBe(2);
    });

    it("increments deserializeCount on successful deserialize", () => {
      const codec = new ArrowCodec({ collectMetrics: true });
      const table = tableFromArrays({ id: [1, 2, 3] });
      const buffer = codec.serialize(table);

      codec.deserialize(buffer);
      expect(codec.metrics!.deserializeCount).toBe(1);

      codec.deserialize(buffer);
      expect(codec.metrics!.deserializeCount).toBe(2);
    });

    it("tracks bytesSerialised correctly", () => {
      const codec = new ArrowCodec({ collectMetrics: true });
      const table = tableFromArrays({ id: [1, 2, 3] });

      const buffer = codec.serialize(table);
      expect(codec.metrics!.bytesSerialised).toBe(buffer.length);

      codec.serialize(table);
      expect(codec.metrics!.bytesSerialised).toBe(buffer.length * 2);
    });

    it("tracks bytesDeserialized correctly", () => {
      const codec = new ArrowCodec({ collectMetrics: true });
      const table = tableFromArrays({ id: [1, 2, 3] });
      const buffer = codec.serialize(table);

      codec.deserialize(buffer);
      expect(codec.metrics!.bytesDeserialized).toBe(buffer.length);

      codec.deserialize(buffer);
      expect(codec.metrics!.bytesDeserialized).toBe(buffer.length * 2);
    });

    it("tracks rowsSerialized correctly", () => {
      const codec = new ArrowCodec({ collectMetrics: true });

      const table3 = tableFromArrays({ id: [1, 2, 3] });
      const table5 = tableFromArrays({ id: [1, 2, 3, 4, 5] });

      codec.serialize(table3);
      expect(codec.metrics!.rowsSerialized).toBe(3);

      codec.serialize(table5);
      expect(codec.metrics!.rowsSerialized).toBe(8);
    });

    it("tracks rowsDeserialized correctly", () => {
      const codec = new ArrowCodec({ collectMetrics: true });

      const table3 = tableFromArrays({ id: [1, 2, 3] });
      const table5 = tableFromArrays({ id: [1, 2, 3, 4, 5] });
      const buffer3 = codec.serialize(table3);
      const buffer5 = codec.serialize(table5);

      // Reset serialize metrics for cleaner test
      codec.resetMetrics();

      codec.deserialize(buffer3);
      expect(codec.metrics!.rowsDeserialized).toBe(3);

      codec.deserialize(buffer5);
      expect(codec.metrics!.rowsDeserialized).toBe(8);
    });

    it("increments serializeErrors on failed serialize", () => {
      const codec = new ArrowCodec({ collectMetrics: true });

      try {
        // @ts-expect-error - intentionally invalid
        codec.serialize(null);
      } catch {
        // Expected
      }

      expect(codec.metrics!.serializeErrors).toBe(1);
      expect(codec.metrics!.serializeCount).toBe(0);
    });

    it("increments deserializeErrors on failed deserialize", () => {
      const codec = new ArrowCodec({ collectMetrics: true });

      try {
        codec.deserialize(Buffer.alloc(0));
      } catch {
        // Expected
      }

      expect(codec.metrics!.deserializeErrors).toBe(1);
      expect(codec.metrics!.deserializeCount).toBe(0);
    });
  });

  describe("resetMetrics()", () => {
    it("resets all metrics to zero", () => {
      const codec = new ArrowCodec({ collectMetrics: true });
      const table = tableFromArrays({ id: [1, 2, 3] });

      // Generate some metrics
      const buffer = codec.serialize(table);
      codec.serialize(table);
      codec.deserialize(buffer);

      // Verify metrics are non-zero
      expect(codec.metrics!.serializeCount).toBe(2);
      expect(codec.metrics!.deserializeCount).toBe(1);

      // Reset
      codec.resetMetrics();

      // Verify all are zero
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

    it("does nothing when collectMetrics=false", () => {
      const codec = new ArrowCodec({ collectMetrics: false });

      // Should not throw
      expect(() => codec.resetMetrics()).not.toThrow();
      expect(codec.metrics).toBeNull();
    });

    it("allows continued metric collection after reset", () => {
      const codec = new ArrowCodec({ collectMetrics: true });
      const table = tableFromArrays({ id: [1, 2, 3] });

      codec.serialize(table);
      codec.resetMetrics();
      codec.serialize(table);

      expect(codec.metrics!.serializeCount).toBe(1);
    });
  });

  describe("metrics accuracy", () => {
    it("accurately counts multiple operations", () => {
      const codec = createMonitoredArrowCodec();
      const table = tableFromArrays({ id: [1, 2, 3] });

      // Perform operations
      const buf1 = codec.serialize(table);
      codec.serialize(table); // second serialize
      codec.deserialize(buf1);

      const metrics = codec.metrics!;
      expect(metrics.serializeCount).toBe(2);
      expect(metrics.deserializeCount).toBe(1);
      expect(metrics.rowsSerialized).toBe(6); // 3 + 3
      expect(metrics.rowsDeserialized).toBe(3);
    });

    it("tracks bytes accurately for different table sizes", () => {
      const codec = createMonitoredArrowCodec();

      const smallTable = tableFromArrays({ id: [1] });
      const largeTable = tableFromArrays({ id: Array.from({ length: 1000 }, (_, i) => i) });

      const smallBuffer = codec.serialize(smallTable);
      const largeBuffer = codec.serialize(largeTable);

      expect(codec.metrics!.bytesSerialised).toBe(smallBuffer.length + largeBuffer.length);
    });

    it("metrics are independent copies", () => {
      const codec = new ArrowCodec({ collectMetrics: true });
      const table = tableFromArrays({ id: [1, 2, 3] });

      codec.serialize(table);

      const metrics1 = codec.metrics;
      codec.serialize(table);
      const metrics2 = codec.metrics;

      // metrics1 should still have old value (it's a copy)
      expect(metrics1!.serializeCount).toBe(1);
      expect(metrics2!.serializeCount).toBe(2);
    });

    it("correctly counts errors separately from successes", () => {
      const codec = new ArrowCodec({ collectMetrics: true });
      const table = tableFromArrays({ id: [1, 2, 3] });

      // Successful operation
      codec.serialize(table);

      // Failed operation
      try {
        // @ts-expect-error - intentionally invalid
        codec.serialize(null);
      } catch {
        // Expected
      }

      // Another successful operation
      codec.serialize(table);

      expect(codec.metrics!.serializeCount).toBe(2);
      expect(codec.metrics!.serializeErrors).toBe(1);
    });
  });

  describe("createMonitoredArrowCodec helper", () => {
    it("creates codec with metrics enabled", () => {
      const codec = createMonitoredArrowCodec();
      expect(codec.metrics).not.toBeNull();
    });

    it("respects other options", () => {
      const codec = createMonitoredArrowCodec({ format: "file", validateInput: false });

      expect(codec.contentType).toBe("application/vnd.apache.arrow.file");
      expect(codec.metrics).not.toBeNull();
    });

    it("collects metrics correctly", () => {
      const codec = createMonitoredArrowCodec();
      const table = tableFromArrays({ id: [1, 2, 3, 4, 5] });

      codec.serialize(table);

      expect(codec.metrics!.serializeCount).toBe(1);
      expect(codec.metrics!.rowsSerialized).toBe(5);
    });
  });

  describe("metrics with different formats", () => {
    it("stream format metrics work correctly", () => {
      const codec = new ArrowCodec({ format: "stream", collectMetrics: true });
      const table = tableFromArrays({ id: [1, 2, 3] });

      const buffer = codec.serialize(table);
      codec.deserialize(buffer);

      expect(codec.metrics!.serializeCount).toBe(1);
      expect(codec.metrics!.deserializeCount).toBe(1);
    });

    it("file format metrics work correctly", () => {
      const codec = new ArrowCodec({ format: "file", collectMetrics: true });
      const table = tableFromArrays({ id: [1, 2, 3] });

      const buffer = codec.serialize(table);
      codec.deserialize(buffer);

      expect(codec.metrics!.serializeCount).toBe(1);
      expect(codec.metrics!.deserializeCount).toBe(1);
    });
  });
});
