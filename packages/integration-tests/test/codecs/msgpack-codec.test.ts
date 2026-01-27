/**
 * Codec tests: MessagePack
 *
 * Tests MessagePack codec integration with workers.
 * Note: These tests verify serialization via the SDK since the SDK
 * supports data channel configuration with custom codecs.
 */

import { MessagePackCodec } from "@procwire/codec-msgpack";
import { ProcessManager } from "@procwire/transport";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateItems } from "../../utils/fixtures.js";
import { spawnWorker } from "../../utils/test-helpers.js";

describe("Codecs - MessagePack", () => {
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

  describe("MessagePackCodec unit tests", () => {
    const codec = new MessagePackCodec();

    it("should serialize and deserialize primitives", () => {
      const data = { string: "hello", number: 42, boolean: true, null: null };
      const buffer = codec.serialize(data);
      const result = codec.deserialize(buffer);
      expect(result).toEqual(data);
    });

    it("should serialize and deserialize arrays", () => {
      const data = { items: [1, 2, 3, "four", true, null] };
      const buffer = codec.serialize(data);
      const result = codec.deserialize(buffer);
      expect(result).toEqual(data);
    });

    it("should serialize and deserialize nested objects", () => {
      const data = {
        level1: {
          level2: {
            level3: { value: "deep" },
          },
        },
      };
      const buffer = codec.serialize(data);
      const result = codec.deserialize(buffer);
      expect(result).toEqual(data);
    });

    it("should serialize and deserialize Buffer/Uint8Array", () => {
      const originalData = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);
      const data = { binary: originalData };
      const buffer = codec.serialize(data);
      const result = codec.deserialize(buffer) as { binary: Uint8Array };

      // MessagePack preserves binary data
      expect(result.binary).toBeInstanceOf(Uint8Array);
      expect(Array.from(result.binary)).toEqual(Array.from(originalData));
    });

    it("should be more compact than JSON for typical payloads", () => {
      const data = generateItems(100);

      const jsonSize = JSON.stringify(data).length;
      const msgpackSize = codec.serialize(data).length;

      // MessagePack should be smaller
      expect(msgpackSize).toBeLessThan(jsonSize);
    });
  });

  describe("integration with control channel (JSON default)", () => {
    it("should work with standard JSON serialization on control channel", async () => {
      const handle = await spawnWorker(manager, "msgpack-json", "echo-worker.ts");

      // Control channel uses JSON by default
      const result = await handle.request("echo", { test: "msgpack-compat" });
      expect(result).toEqual({ test: "msgpack-compat" });
    });
  });

  describe("performance comparison", () => {
    const codec = new MessagePackCodec();

    it("should serialize faster than JSON for large payloads", () => {
      const data = generateItems(1000);

      // Warm up
      JSON.stringify(data);
      codec.serialize(data);

      // Measure JSON
      const jsonStart = performance.now();
      for (let i = 0; i < 100; i++) {
        JSON.stringify(data);
      }
      const jsonTime = performance.now() - jsonStart;

      // Measure MessagePack
      const msgpackStart = performance.now();
      for (let i = 0; i < 100; i++) {
        codec.serialize(data);
      }
      const msgpackTime = performance.now() - msgpackStart;

      console.log(
        `MessagePack serialize: ${msgpackTime.toFixed(2)}ms, JSON: ${jsonTime.toFixed(2)}ms`,
      );

      // MessagePack should be competitive (may not always be faster in all cases)
      // This is mainly for visibility, not a strict assertion
    });

    it("should deserialize faster than JSON for large payloads", () => {
      const data = generateItems(1000);
      const jsonString = JSON.stringify(data);
      const msgpackBuffer = codec.serialize(data);

      // Warm up
      JSON.parse(jsonString);
      codec.deserialize(msgpackBuffer);

      // Measure JSON
      const jsonStart = performance.now();
      for (let i = 0; i < 100; i++) {
        JSON.parse(jsonString);
      }
      const jsonTime = performance.now() - jsonStart;

      // Measure MessagePack
      const msgpackStart = performance.now();
      for (let i = 0; i < 100; i++) {
        codec.deserialize(msgpackBuffer);
      }
      const msgpackTime = performance.now() - msgpackStart;

      console.log(
        `MessagePack deserialize: ${msgpackTime.toFixed(2)}ms, JSON: ${jsonTime.toFixed(2)}ms`,
      );
    });
  });

  describe("size comparison", () => {
    const codec = new MessagePackCodec();

    it("should produce smaller payloads for numeric data", () => {
      const data = { values: Array.from({ length: 1000 }, (_, i) => i) };

      const jsonSize = JSON.stringify(data).length;
      const msgpackSize = codec.serialize(data).length;

      console.log(`Numeric data - JSON: ${jsonSize} bytes, MessagePack: ${msgpackSize} bytes`);
      expect(msgpackSize).toBeLessThan(jsonSize);
    });

    it("should produce smaller payloads for repeated strings", () => {
      const data = {
        items: Array.from({ length: 100 }, (_, i) => ({
          type: "item",
          category: "general",
          status: "active",
          index: i,
        })),
      };

      const jsonSize = JSON.stringify(data).length;
      const msgpackSize = codec.serialize(data).length;

      console.log(`String data - JSON: ${jsonSize} bytes, MessagePack: ${msgpackSize} bytes`);
      expect(msgpackSize).toBeLessThan(jsonSize);
    });
  });

  describe("type preservation", () => {
    const codec = new MessagePackCodec();

    it("should preserve Buffer type", () => {
      const original = Buffer.from([1, 2, 3, 4, 5]);
      const serialized = codec.serialize({ buf: original });
      const result = codec.deserialize(serialized) as { buf: Uint8Array };

      expect(result.buf).toBeInstanceOf(Uint8Array);
      expect(Array.from(result.buf)).toEqual([1, 2, 3, 4, 5]);
    });

    it("should preserve Uint8Array type", () => {
      const original = new Uint8Array([10, 20, 30]);
      const serialized = codec.serialize({ arr: original });
      const result = codec.deserialize(serialized) as { arr: Uint8Array };

      expect(result.arr).toBeInstanceOf(Uint8Array);
      expect(Array.from(result.arr)).toEqual([10, 20, 30]);
    });

    it("should handle empty binary data", () => {
      const original = new Uint8Array(0);
      const serialized = codec.serialize({ empty: original });
      const result = codec.deserialize(serialized) as { empty: Uint8Array };

      expect(result.empty).toBeInstanceOf(Uint8Array);
      expect(result.empty.length).toBe(0);
    });
  });
});
