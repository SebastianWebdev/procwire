/**
 * Communication tests: Large Payloads
 *
 * Tests handling of large messages and data.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProcessManager } from "@procwire/transport";
import { spawnWorker, measureTime } from "../../utils/test-helpers.js";
import { generatePayload, generateItems, generateNestedObject } from "../../utils/fixtures.js";

describe("Communication - Large Payloads", () => {
  let manager: ProcessManager;

  beforeEach(() => {
    manager = new ProcessManager({
      defaultTimeout: 30000,
      restartPolicy: { enabled: false, maxRestarts: 0, backoffMs: 100 },
      gracefulShutdownMs: 5000,
    });
  });

  afterEach(async () => {
    await manager.terminateAll();
  });

  describe("large string payloads", () => {
    it("should handle 1KB payload", async () => {
      const handle = await spawnWorker(manager, "payload-1kb", "streaming-worker.ts");

      const payload = generatePayload(1024);
      const result = (await handle.request("echo_large", payload)) as {
        data: string;
        size: number;
      };

      expect(result.size).toBe(1024);
      expect(result.data).toBe(payload.data);
    });

    it("should handle 10KB payload", async () => {
      const handle = await spawnWorker(manager, "payload-10kb", "streaming-worker.ts");

      const payload = generatePayload(10 * 1024);
      const result = (await handle.request("echo_large", payload)) as {
        data: string;
        size: number;
      };

      expect(result.size).toBe(10 * 1024);
      expect(result.data).toBe(payload.data);
    });

    it("should handle 100KB payload", async () => {
      const handle = await spawnWorker(manager, "payload-100kb", "streaming-worker.ts");

      const payload = generatePayload(100 * 1024);
      const result = (await handle.request("echo_large", payload)) as {
        data: string;
        size: number;
      };

      expect(result.size).toBe(100 * 1024);
      expect(result.data).toBe(payload.data);
    });

    it("should handle 1MB payload", async () => {
      const handle = await spawnWorker(manager, "payload-1mb", "streaming-worker.ts");

      const payload = generatePayload(1024 * 1024);
      const result = (await handle.request("echo_large", payload)) as {
        data: string;
        size: number;
      };

      expect(result.size).toBe(1024 * 1024);
      expect(result.data).toBe(payload.data);
    });
  });

  describe("large array payloads", () => {
    it("should handle array with 100 items", async () => {
      const handle = await spawnWorker(manager, "array-100", "streaming-worker.ts");

      const items = generateItems(100);
      const result = (await handle.request("process_batch", { items })) as {
        processed: unknown[];
        count: number;
      };

      expect(result.count).toBe(100);
      expect(result.processed.length).toBe(100);
    });

    it("should handle array with 1000 items", async () => {
      const handle = await spawnWorker(manager, "array-1000", "streaming-worker.ts");

      const items = generateItems(1000);
      const result = (await handle.request("process_batch", { items })) as {
        processed: unknown[];
        count: number;
      };

      expect(result.count).toBe(1000);
      expect(result.processed.length).toBe(1000);
    });

    it("should handle array with 10000 items", async () => {
      const handle = await spawnWorker(manager, "array-10000", "streaming-worker.ts");

      const items = generateItems(10000);
      const result = (await handle.request("process_batch", { items })) as {
        processed: unknown[];
        count: number;
      };

      expect(result.count).toBe(10000);
      expect(result.processed.length).toBe(10000);
    });
  });

  describe("nested object payloads", () => {
    it("should handle deeply nested object (depth=5)", async () => {
      const handle = await spawnWorker(manager, "nested-5", "echo-worker.ts");

      const nested = generateNestedObject(5, 3);
      const result = await handle.request("echo", { nested });

      expect(result).toEqual({ nested });
    });

    it("should handle wide nested object (breadth=10)", async () => {
      const handle = await spawnWorker(manager, "wide-10", "echo-worker.ts");

      const nested = generateNestedObject(3, 10);
      const result = await handle.request("echo", { nested });

      expect(result).toEqual({ nested });
    });
  });

  describe("large response generation", () => {
    it("should generate 10KB response", async () => {
      const handle = await spawnWorker(manager, "gen-10kb", "streaming-worker.ts");

      const result = (await handle.request("generate_large", { size: 10 * 1024 })) as {
        data: string;
        size: number;
      };

      expect(result.size).toBe(10 * 1024);
      expect(result.data.length).toBe(10 * 1024);
    });

    it("should generate 100KB response", async () => {
      const handle = await spawnWorker(manager, "gen-100kb", "streaming-worker.ts");

      const result = (await handle.request("generate_large", { size: 100 * 1024 })) as {
        data: string;
        size: number;
      };

      expect(result.size).toBe(100 * 1024);
      expect(result.data.length).toBe(100 * 1024);
    });

    it("should generate sequence response", async () => {
      const handle = await spawnWorker(manager, "gen-seq", "streaming-worker.ts");

      const result = (await handle.request("generate_sequence", { count: 1000 })) as {
        sequence: number[];
        count: number;
      };

      expect(result.count).toBe(1000);
      expect(result.sequence.length).toBe(1000);
      expect(result.sequence[0]).toBe(0);
      expect(result.sequence[999]).toBe(999);
    });
  });

  describe("payload transformation", () => {
    it("should transform array items", async () => {
      const handle = await spawnWorker(manager, "transform", "streaming-worker.ts");

      const items = Array.from({ length: 100 }, (_, i) => ({ id: i, value: i * 10 }));
      const result = (await handle.request("transform_items", { items })) as {
        items: Array<{ id: number; value: number; transformed: boolean }>;
      };

      expect(result.items.length).toBe(100);
      expect(result.items[0]?.value).toBe(0); // 0 * 2 = 0
      expect(result.items[50]?.value).toBe(1000); // 500 * 2 = 1000
      expect(result.items.every((item) => item.transformed)).toBe(true);
    });

    it("should aggregate large value arrays", async () => {
      const handle = await spawnWorker(manager, "aggregate", "streaming-worker.ts");

      const values = Array.from({ length: 10000 }, (_, i) => i);
      const result = (await handle.request("aggregate", { values })) as {
        sum: number;
        avg: number;
        min: number;
        max: number;
        count: number;
      };

      expect(result.count).toBe(10000);
      expect(result.min).toBe(0);
      expect(result.max).toBe(9999);
      expect(result.sum).toBe((10000 * 9999) / 2); // Sum of 0..9999
    });
  });

  describe("performance with large payloads", () => {
    it("should process 1MB in reasonable time", async () => {
      const handle = await spawnWorker(manager, "perf-1mb", "streaming-worker.ts");

      const payload = generatePayload(1024 * 1024);
      const { elapsed } = await measureTime(() =>
        handle.request("echo_large", payload),
      );

      // Should complete within 5 seconds
      expect(elapsed).toBeLessThan(5000);
    });

    it("should handle multiple large payloads sequentially", async () => {
      const handle = await spawnWorker(manager, "perf-seq", "streaming-worker.ts");

      const { elapsed } = await measureTime(async () => {
        for (let i = 0; i < 5; i++) {
          const payload = generatePayload(100 * 1024);
          await handle.request("echo_large", payload);
        }
      });

      // 5 * 100KB should complete within 10 seconds
      expect(elapsed).toBeLessThan(10000);
    });
  });
});
