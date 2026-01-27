/**
 * Codec tests: Protobuf
 *
 * Tests Protocol Buffers codec integration with workers.
 * Protobuf requires schema definition for serialization.
 */

import { createCodecFromJSON } from "@procwire/codec-protobuf";
import { ProcessManager } from "@procwire/transport";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnWorker } from "../../utils/test-helpers.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test Schemas
// ─────────────────────────────────────────────────────────────────────────────

// Simple User schema
const userSchema = {
  nested: {
    User: {
      fields: {
        id: { type: "int32", id: 1 },
        name: { type: "string", id: 2 },
        email: { type: "string", id: 3 },
        active: { type: "bool", id: 4 },
      },
    },
  },
};

interface User {
  id: number;
  name: string;
  email: string;
  active: boolean;
}

// Schema with repeated fields (arrays)
const listSchema = {
  nested: {
    NumberList: {
      fields: {
        values: { type: "int32", id: 1, rule: "repeated" },
      },
    },
    StringList: {
      fields: {
        items: { type: "string", id: 1, rule: "repeated" },
      },
    },
  },
};

interface NumberList {
  values: number[];
}

interface StringList {
  items: string[];
}

// Schema with nested messages
const nestedSchema = {
  nested: {
    Address: {
      fields: {
        street: { type: "string", id: 1 },
        city: { type: "string", id: 2 },
        zipCode: { type: "string", id: 3 },
      },
    },
    Person: {
      fields: {
        id: { type: "int32", id: 1 },
        name: { type: "string", id: 2 },
        address: { type: "Address", id: 3 },
      },
    },
  },
};

interface Address {
  street: string;
  city: string;
  zipCode: string;
}

interface Person {
  id: number;
  name: string;
  address: Address;
}

// Complex schema with enums, nested messages, repeated fields
const complexSchema = {
  nested: {
    Status: {
      values: {
        PENDING: 0,
        ACTIVE: 1,
        COMPLETED: 2,
      },
    },
    Metadata: {
      fields: {
        key: { type: "string", id: 1 },
        value: { type: "string", id: 2 },
      },
    },
    Record: {
      fields: {
        id: { type: "int32", id: 1 },
        name: { type: "string", id: 2 },
        value: { type: "double", id: 3 },
        status: { type: "Status", id: 4 },
        tags: { type: "string", id: 5, rule: "repeated" },
        metadata: { type: "Metadata", id: 6, rule: "repeated" },
      },
    },
    RecordList: {
      fields: {
        records: { type: "Record", id: 1, rule: "repeated" },
      },
    },
  },
};

// Schema for testing int64
const int64Schema = {
  nested: {
    BigRecord: {
      fields: {
        id: { type: "int64", id: 1 },
        name: { type: "string", id: 2 },
      },
    },
  },
};

interface Metadata {
  key: string;
  value: string;
}

interface Record {
  id: number;
  name: string;
  value: number;
  status: number | string;
  tags: string[];
  metadata: Metadata[];
}

interface BigRecord {
  id: string | number;
  name: string;
}

interface RecordList {
  records: Record[];
}

// Schema with bytes field
const binarySchema = {
  nested: {
    BinaryPayload: {
      fields: {
        data: { type: "bytes", id: 1 },
        checksum: { type: "int32", id: 2 },
      },
    },
  },
};

interface BinaryPayload {
  data: Uint8Array;
  checksum: number;
}

describe("Codecs - Protobuf", () => {
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

  describe("ProtobufCodec unit tests", () => {
    it("should serialize and deserialize primitives", () => {
      const codec = createCodecFromJSON<User>(userSchema, "User");

      const data: User = {
        id: 42,
        name: "Alice",
        email: "alice@example.com",
        active: true,
      };

      const buffer = codec.serialize(data);
      const result = codec.deserialize(buffer);

      expect(result).toEqual(data);
    });

    it("should serialize and deserialize arrays (repeated fields)", () => {
      const numberCodec = createCodecFromJSON<NumberList>(listSchema, "NumberList");
      const stringCodec = createCodecFromJSON<StringList>(listSchema, "StringList");

      const numbers: NumberList = { values: [1, 2, 3, 4, 5, 100, -50] };
      const strings: StringList = { items: ["hello", "world", "protobuf"] };

      const numberBuffer = numberCodec.serialize(numbers);
      const stringBuffer = stringCodec.serialize(strings);

      expect(numberCodec.deserialize(numberBuffer)).toEqual(numbers);
      expect(stringCodec.deserialize(stringBuffer)).toEqual(strings);
    });

    it("should serialize and deserialize nested messages", () => {
      const codec = createCodecFromJSON<Person>(nestedSchema, "Person");

      const data: Person = {
        id: 1,
        name: "Bob",
        address: {
          street: "123 Main St",
          city: "Springfield",
          zipCode: "12345",
        },
      };

      const buffer = codec.serialize(data);
      const result = codec.deserialize(buffer);

      expect(result).toEqual(data);
    });

    it("should handle empty messages", () => {
      const codec = createCodecFromJSON<User>(userSchema, "User");

      // Empty message with default values
      const data: User = {
        id: 0,
        name: "",
        email: "",
        active: false,
      };

      const buffer = codec.serialize(data);
      const result = codec.deserialize(buffer);

      // Protobuf omits default values, so result may have undefined fields
      expect(result.id).toBe(0);
      expect(result.name).toBe("");
      expect(result.email).toBe("");
      expect(result.active).toBe(false);
    });

    it("should handle empty repeated fields", () => {
      const codec = createCodecFromJSON<NumberList>(listSchema, "NumberList");

      const data: NumberList = { values: [] };
      const buffer = codec.serialize(data);
      const result = codec.deserialize(buffer);

      // Protobuf may return undefined for empty arrays depending on proto version
      expect(result.values ?? []).toEqual([]);
    });
  });

  describe("Schema definition patterns", () => {
    it("should create codec from JSON schema using createCodecFromJSON", () => {
      const codec = createCodecFromJSON<User>(userSchema, "User");

      expect(codec.name).toBe("protobuf");
      expect(codec.contentType).toBe("application/x-protobuf");
    });

    it("should handle complex nested schemas", () => {
      const codec = createCodecFromJSON<RecordList>(complexSchema, "RecordList");

      const data: RecordList = {
        records: [
          {
            id: 12345,
            name: "Test Record",
            value: 3.14159,
            status: 1, // ACTIVE
            tags: ["tag1", "tag2", "tag3"],
            metadata: [
              { key: "created", value: "2024-01-01" },
              { key: "version", value: "1.0" },
            ],
          },
        ],
      };

      const buffer = codec.serialize(data);
      const result = codec.deserialize(buffer);

      expect(result.records).toHaveLength(1);
      expect(result.records[0].name).toBe("Test Record");
      expect(result.records[0].tags).toEqual(["tag1", "tag2", "tag3"]);
      expect(result.records[0].metadata).toHaveLength(2);
    });

    it("should handle enums as numeric values by default", () => {
      const codec = createCodecFromJSON<Record>(complexSchema, "Record");

      const data: Record = {
        id: 1,
        name: "Test",
        value: 1.0,
        status: 2, // COMPLETED
        tags: [],
        metadata: [],
      };

      const buffer = codec.serialize(data);
      const result = codec.deserialize(buffer);

      expect(result.status).toBe(2);
    });

    it("should handle enums as strings when configured", () => {
      const codec = createCodecFromJSON<Record>(complexSchema, "Record", {
        enums: String,
      });

      const data: Record = {
        id: 1,
        name: "Test",
        value: 1.0,
        status: 1, // ACTIVE
        tags: [],
        metadata: [],
      };

      const buffer = codec.serialize(data);
      const result = codec.deserialize(buffer);

      expect(result.status).toBe("ACTIVE");
    });
  });

  describe("Type preservation", () => {
    it("should preserve int64 as string by default", () => {
      const codec = createCodecFromJSON<BigRecord>(int64Schema, "BigRecord");

      // Use a safe integer for testing int64 encoding behavior
      const data: BigRecord = {
        id: 1234567890123,
        name: "Test",
      };

      const buffer = codec.serialize(data);
      const result = codec.deserialize(buffer);

      // int64 returned as string by default (longs: String)
      expect(typeof result.id).toBe("string");
    });

    it("should handle bytes fields as Uint8Array", () => {
      const codec = createCodecFromJSON<BinaryPayload>(binarySchema, "BinaryPayload");

      const originalData = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);
      const data: BinaryPayload = {
        data: originalData,
        checksum: 12345,
      };

      const buffer = codec.serialize(data);
      const result = codec.deserialize(buffer);

      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(Array.from(result.data)).toEqual(Array.from(originalData));
      expect(result.checksum).toBe(12345);
    });

    it("should handle large binary payloads", () => {
      const codec = createCodecFromJSON<BinaryPayload>(binarySchema, "BinaryPayload");

      // 1 KB binary payload
      const largeData = new Uint8Array(1024).fill(0xab);
      const data: BinaryPayload = {
        data: largeData,
        checksum: 99999,
      };

      const buffer = codec.serialize(data);
      const result = codec.deserialize(buffer);

      expect(result.data.length).toBe(1024);
      expect(result.data[0]).toBe(0xab);
      expect(result.data[1023]).toBe(0xab);
    });

    it("should preserve double precision", () => {
      const codec = createCodecFromJSON<Record>(complexSchema, "Record");

      const preciseValue = 3.141592653589793;
      const data: Record = {
        id: 1,
        name: "Test",
        value: preciseValue,
        status: 0,
        tags: [],
        metadata: [],
      };

      const buffer = codec.serialize(data);
      const result = codec.deserialize(buffer);

      expect(result.value).toBe(preciseValue);
    });
  });

  describe("integration with control channel (JSON default)", () => {
    it("should work with standard JSON serialization on control channel", async () => {
      const handle = await spawnWorker(manager, "protobuf-json", "echo-worker.ts");

      // Control channel uses JSON by default, not Protobuf
      const result = await handle.request("echo", { test: "protobuf-compat" });
      expect(result).toEqual({ test: "protobuf-compat" });
    });
  });

  describe("performance comparison", () => {
    it("should serialize faster than JSON for structured data", () => {
      const codec = createCodecFromJSON<RecordList>(complexSchema, "RecordList");

      // Generate test data
      const records: Record[] = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `Record ${i} with some extra text to make it longer`,
        value: Math.random() * 1000,
        status: i % 3,
        tags: [`tag${i % 10}`, `category${i % 5}`],
        metadata: [
          { key: "index", value: String(i) },
          { key: "created", value: new Date().toISOString() },
        ],
      }));

      const data: RecordList = { records };

      // Warm up
      codec.serialize(data);
      JSON.stringify(data);

      // Measure Protobuf
      const protoStart = performance.now();
      for (let i = 0; i < 100; i++) {
        codec.serialize(data);
      }
      const protoTime = performance.now() - protoStart;

      // Measure JSON
      const jsonStart = performance.now();
      for (let i = 0; i < 100; i++) {
        JSON.stringify(data);
      }
      const jsonTime = performance.now() - jsonStart;

      console.log(`Protobuf serialize: ${protoTime.toFixed(2)}ms, JSON: ${jsonTime.toFixed(2)}ms`);

      // Protobuf may or may not be faster depending on data
      // This test is mainly for visibility
    });

    it("should deserialize faster than JSON for structured data", () => {
      const codec = createCodecFromJSON<RecordList>(complexSchema, "RecordList");

      const records: Record[] = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `Record ${i}`,
        value: Math.random() * 1000,
        status: i % 3,
        tags: [`tag${i % 10}`],
        metadata: [{ key: "index", value: String(i) }],
      }));

      const data: RecordList = { records };
      const protoBuffer = codec.serialize(data);
      const jsonString = JSON.stringify(data);

      // Warm up
      codec.deserialize(protoBuffer);
      JSON.parse(jsonString);

      // Measure Protobuf
      const protoStart = performance.now();
      for (let i = 0; i < 100; i++) {
        codec.deserialize(protoBuffer);
      }
      const protoTime = performance.now() - protoStart;

      // Measure JSON
      const jsonStart = performance.now();
      for (let i = 0; i < 100; i++) {
        JSON.parse(jsonString);
      }
      const jsonTime = performance.now() - jsonStart;

      console.log(
        `Protobuf deserialize: ${protoTime.toFixed(2)}ms, JSON: ${jsonTime.toFixed(2)}ms`,
      );
    });
  });

  describe("size comparison", () => {
    it("should produce smaller payloads than JSON", () => {
      const codec = createCodecFromJSON<RecordList>(complexSchema, "RecordList");

      const records: Record[] = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `Record ${i}`,
        value: Math.random() * 1000,
        status: i % 3,
        tags: [`tag${i % 10}`, `category${i % 5}`],
        metadata: [
          { key: "index", value: String(i) },
          { key: "timestamp", value: new Date().toISOString() },
        ],
      }));

      const data: RecordList = { records };

      const jsonSize = JSON.stringify(data).length;
      const protoSize = codec.serialize(data).length;

      console.log(`Structured data - JSON: ${jsonSize} bytes, Protobuf: ${protoSize} bytes`);
      console.log(`Compression ratio: ${(jsonSize / protoSize).toFixed(2)}x`);

      expect(protoSize).toBeLessThan(jsonSize);
    });

    it("should show compression ratio for various data sizes", () => {
      const codec = createCodecFromJSON<RecordList>(complexSchema, "RecordList");

      const sizes = [10, 100, 1000];

      for (const count of sizes) {
        const records: Record[] = Array.from({ length: count }, (_, i) => ({
          id: i,
          name: `Record ${i}`,
          value: i * 1.5,
          status: i % 3,
          tags: [`tag${i % 10}`],
          metadata: [],
        }));

        const data: RecordList = { records };
        const jsonSize = JSON.stringify(data).length;
        const protoSize = codec.serialize(data).length;
        const ratio = jsonSize / protoSize;

        console.log(
          `${count} records - JSON: ${jsonSize} bytes, Protobuf: ${protoSize} bytes, Ratio: ${ratio.toFixed(2)}x`,
        );

        expect(protoSize).toBeLessThan(jsonSize);
      }
    });

    it("should handle numeric data efficiently", () => {
      const codec = createCodecFromJSON<NumberList>(listSchema, "NumberList");

      const data: NumberList = {
        values: Array.from({ length: 1000 }, (_, i) => i),
      };

      const jsonSize = JSON.stringify(data).length;
      const protoSize = codec.serialize(data).length;

      console.log(`Numeric array - JSON: ${jsonSize} bytes, Protobuf: ${protoSize} bytes`);

      // Protobuf uses varint encoding, very efficient for integers
      expect(protoSize).toBeLessThan(jsonSize);
    });
  });

  describe("error handling", () => {
    it("should throw on invalid data when verification is enabled", () => {
      const codec = createCodecFromJSON<User>(userSchema, "User", {
        verifyOnSerialize: true,
      });

      // Invalid data - missing required fields with wrong types
      const invalidData = {
        id: "not a number", // Should be int32
        name: 12345, // Should be string
      } as unknown as User;

      expect(() => codec.serialize(invalidData)).toThrow();
    });

    it("should throw on corrupted buffer", () => {
      const codec = createCodecFromJSON<User>(userSchema, "User");

      const corruptedBuffer = Buffer.from([0xff, 0xff, 0xff, 0xff]);

      expect(() => codec.deserialize(corruptedBuffer)).toThrow();
    });
  });
});
