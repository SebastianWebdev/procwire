/**
 * Codec tests: JSON (default)
 *
 * Tests that the default JSON codec works correctly for all data types.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProcessManager } from "@procwire/transport";
import { spawnWorker } from "../../utils/test-helpers.js";

describe("Codecs - JSON (Default)", () => {
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

  describe("primitive types", () => {
    it("should serialize/deserialize strings", async () => {
      const handle = await spawnWorker(manager, "json-string", "echo-worker.ts");

      const result = await handle.request("echo", { value: "hello world" });
      expect(result).toEqual({ value: "hello world" });
    });

    it("should serialize/deserialize numbers", async () => {
      const handle = await spawnWorker(manager, "json-number", "echo-worker.ts");

      const result = await handle.request("echo", {
        integer: 42,
        float: 3.14159,
        negative: -100,
        zero: 0,
      });

      expect(result).toEqual({
        integer: 42,
        float: 3.14159,
        negative: -100,
        zero: 0,
      });
    });

    it("should serialize/deserialize booleans", async () => {
      const handle = await spawnWorker(manager, "json-bool", "echo-worker.ts");

      const result = await handle.request("echo", { truthy: true, falsy: false });
      expect(result).toEqual({ truthy: true, falsy: false });
    });

    it("should serialize/deserialize null", async () => {
      const handle = await spawnWorker(manager, "json-null", "echo-worker.ts");

      const result = await handle.request("echo", { value: null });
      expect(result).toEqual({ value: null });
    });
  });

  describe("arrays", () => {
    it("should serialize/deserialize empty array", async () => {
      const handle = await spawnWorker(manager, "json-empty-arr", "echo-worker.ts");

      const result = await handle.request("echo", { items: [] });
      expect(result).toEqual({ items: [] });
    });

    it("should serialize/deserialize number array", async () => {
      const handle = await spawnWorker(manager, "json-num-arr", "echo-worker.ts");

      const result = await handle.request("echo", { values: [1, 2, 3, 4, 5] });
      expect(result).toEqual({ values: [1, 2, 3, 4, 5] });
    });

    it("should serialize/deserialize string array", async () => {
      const handle = await spawnWorker(manager, "json-str-arr", "echo-worker.ts");

      const result = await handle.request("echo", { words: ["hello", "world"] });
      expect(result).toEqual({ words: ["hello", "world"] });
    });

    it("should serialize/deserialize mixed array", async () => {
      const handle = await spawnWorker(manager, "json-mixed-arr", "echo-worker.ts");

      const result = await handle.request("echo", {
        mixed: [1, "two", true, null, { nested: "object" }],
      });
      expect(result).toEqual({
        mixed: [1, "two", true, null, { nested: "object" }],
      });
    });

    it("should serialize/deserialize nested arrays", async () => {
      const handle = await spawnWorker(manager, "json-nested-arr", "echo-worker.ts");

      const result = await handle.request("echo", {
        matrix: [
          [1, 2, 3],
          [4, 5, 6],
          [7, 8, 9],
        ],
      });
      expect(result).toEqual({
        matrix: [
          [1, 2, 3],
          [4, 5, 6],
          [7, 8, 9],
        ],
      });
    });
  });

  describe("objects", () => {
    it("should serialize/deserialize empty object", async () => {
      const handle = await spawnWorker(manager, "json-empty-obj", "echo-worker.ts");

      const result = await handle.request("echo", { data: {} });
      expect(result).toEqual({ data: {} });
    });

    it("should serialize/deserialize simple object", async () => {
      const handle = await spawnWorker(manager, "json-simple-obj", "echo-worker.ts");

      const result = await handle.request("echo", {
        user: { name: "Alice", age: 30 },
      });
      expect(result).toEqual({
        user: { name: "Alice", age: 30 },
      });
    });

    it("should serialize/deserialize deeply nested object", async () => {
      const handle = await spawnWorker(manager, "json-deep-obj", "echo-worker.ts");

      const nested = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: "deep",
              },
            },
          },
        },
      };

      const result = await handle.request("echo", nested);
      expect(result).toEqual(nested);
    });

    it("should preserve object key order", async () => {
      const handle = await spawnWorker(manager, "json-key-order", "echo-worker.ts");

      const obj = { z: 1, a: 2, m: 3 };
      const result = (await handle.request("echo", obj)) as { z: number; a: number; m: number };

      expect(Object.keys(result)).toEqual(["z", "a", "m"]);
    });
  });

  describe("special cases", () => {
    it("should handle unicode strings", async () => {
      const handle = await spawnWorker(manager, "json-unicode", "echo-worker.ts");

      const result = await handle.request("echo", {
        emoji: "👋🌍",
        chinese: "你好",
        arabic: "مرحبا",
        russian: "Привет",
      });

      expect(result).toEqual({
        emoji: "👋🌍",
        chinese: "你好",
        arabic: "مرحبا",
        russian: "Привет",
      });
    });

    it("should handle special characters in strings", async () => {
      const handle = await spawnWorker(manager, "json-special", "echo-worker.ts");

      const result = await handle.request("echo", {
        quotes: 'He said "hello"',
        backslash: "path\\to\\file",
        newline: "line1\nline2",
        tab: "col1\tcol2",
      });

      expect(result).toEqual({
        quotes: 'He said "hello"',
        backslash: "path\\to\\file",
        newline: "line1\nline2",
        tab: "col1\tcol2",
      });
    });

    it("should handle large integers", async () => {
      const handle = await spawnWorker(manager, "json-large-int", "echo-worker.ts");

      // JSON can handle integers up to Number.MAX_SAFE_INTEGER
      const result = await handle.request("echo", {
        large: 9007199254740991, // Number.MAX_SAFE_INTEGER
        negative: -9007199254740991,
      });

      expect(result).toEqual({
        large: 9007199254740991,
        negative: -9007199254740991,
      });
    });

    it("should handle floating point precision", async () => {
      const handle = await spawnWorker(manager, "json-float", "echo-worker.ts");

      const result = await handle.request("echo", {
        pi: 3.141592653589793,
        tiny: 0.0000001,
        scientific: 1.23e-10,
      });

      expect(result).toEqual({
        pi: 3.141592653589793,
        tiny: 0.0000001,
        scientific: 1.23e-10,
      });
    });
  });

  describe("JSON limitations", () => {
    it("should convert undefined to null in arrays", async () => {
      const handle = await spawnWorker(manager, "json-undefined-arr", "echo-worker.ts");

      // Note: JSON.stringify converts undefined in arrays to null
      const result = await handle.request("echo", { arr: [1, undefined, 3] });
      expect(result).toEqual({ arr: [1, null, 3] });
    });

    it("should omit undefined in objects", async () => {
      const handle = await spawnWorker(manager, "json-undefined-obj", "echo-worker.ts");

      // Note: JSON.stringify omits undefined properties
      const result = await handle.request("echo", { a: 1, b: undefined, c: 3 });
      // b is omitted
      expect(result).toEqual({ a: 1, c: 3 });
    });

    it("should handle Date as string (ISO format)", async () => {
      const handle = await spawnWorker(manager, "json-date", "echo-worker.ts");

      const date = new Date("2024-01-15T10:30:00.000Z");
      const result = (await handle.request("echo", { date })) as { date: string };

      // Date is serialized as ISO string
      expect(result.date).toBe("2024-01-15T10:30:00.000Z");
    });
  });
});
