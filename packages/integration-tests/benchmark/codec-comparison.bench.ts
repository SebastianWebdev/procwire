/**
 * Benchmark: Codec Comparison for Large Data Transfer
 *
 * Compares performance of different serialization codecs:
 * 1. JSON (baseline/fallback)
 * 2. MessagePack (@procwire/codec-msgpack)
 * 3. Protobuf (@procwire/codec-protobuf)
 * 4. Arrow (@procwire/codec-arrow)
 *
 * Run with: pnpm benchmark:codecs
 */

import { MessagePackCodec } from "@procwire/codec-msgpack";
import { ArrowCodec } from "@procwire/codec-arrow";
import { tableFromArrays } from "apache-arrow";
import { createCodecFromJSON } from "@procwire/codec-protobuf";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 * 1024 * 1024)
    return `${(bytesPerSec / 1024 / 1024 / 1024).toFixed(2)} GB/s`;
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / 1024 / 1024).toFixed(2)} MB/s`;
  if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(2)} KB/s`;
  return `${bytesPerSec.toFixed(2)} B/s`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Data Generators
// ─────────────────────────────────────────────────────────────────────────────

interface TestRecord {
  id: number;
  name: string;
  value: number;
  active: boolean;
  tags: string[];
  metadata: { key: string; value: string }[];
}

function generateRecords(count: number): TestRecord[] {
  const records: TestRecord[] = [];
  for (let i = 0; i < count; i++) {
    records.push({
      id: i,
      name: `record_${i}_${"x".repeat(50)}`, // ~60 chars per name
      value: Math.random() * 1000000,
      active: i % 2 === 0,
      tags: [`tag${i % 10}`, `category${i % 5}`, `type${i % 3}`],
      metadata: [
        { key: "created", value: new Date().toISOString() },
        { key: "version", value: "1.0.0" },
      ],
    });
  }
  return records;
}

function generateBinaryPayload(sizeKB: number): { data: Uint8Array } {
  return { data: new Uint8Array(sizeKB * 1024).fill(120) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Protobuf Schemas (using @procwire/codec-protobuf)
// ─────────────────────────────────────────────────────────────────────────────

const recordListSchema = {
  nested: {
    Metadata: {
      fields: {
        key: { type: "string", id: 1 },
        value: { type: "string", id: 2 },
      },
    },
    TestRecord: {
      fields: {
        id: { type: "int32", id: 1 },
        name: { type: "string", id: 2 },
        value: { type: "double", id: 3 },
        active: { type: "bool", id: 4 },
        tags: { type: "string", id: 5, rule: "repeated" },
        metadata: { type: "Metadata", id: 6, rule: "repeated" },
      },
    },
    RecordList: {
      fields: {
        records: { type: "TestRecord", id: 1, rule: "repeated" },
      },
    },
  },
};

const binaryPayloadSchema = {
  nested: {
    BinaryPayload: {
      fields: {
        data: { type: "bytes", id: 1 },
      },
    },
  },
};

interface RecordList {
  records: TestRecord[];
}

interface BinaryPayload {
  data: Uint8Array;
}

// Create protobuf codecs using @procwire/codec-protobuf
const recordListCodec = createCodecFromJSON<RecordList>(recordListSchema, "RecordList");
const binaryPayloadCodec = createCodecFromJSON<BinaryPayload>(binaryPayloadSchema, "BinaryPayload");

// ─────────────────────────────────────────────────────────────────────────────
// Codec Instances
// ─────────────────────────────────────────────────────────────────────────────

const msgpackCodec = new MessagePackCodec();
const arrowCodec = new ArrowCodec();

// ─────────────────────────────────────────────────────────────────────────────
// Benchmark Functions
// ─────────────────────────────────────────────────────────────────────────────

interface BenchmarkResult {
  codec: string;
  dataType: string;
  originalSize: number;
  serializedSize: number;
  compressionRatio: number;
  serializeTimeMs: number;
  deserializeTimeMs: number;
  roundTripTimeMs: number;
  serializeThroughput: number;
  deserializeThroughput: number;
}

async function benchmarkJSON(data: unknown, dataType: string): Promise<BenchmarkResult> {
  const originalSize = JSON.stringify(data).length;

  // Warmup
  for (let i = 0; i < 5; i++) {
    JSON.parse(JSON.stringify(data));
  }

  // Serialize
  const serializeStart = performance.now();
  let serialized = "";
  for (let i = 0; i < 10; i++) {
    serialized = JSON.stringify(data);
  }
  const serializeTime = (performance.now() - serializeStart) / 10;

  // Deserialize
  const deserializeStart = performance.now();
  for (let i = 0; i < 10; i++) {
    JSON.parse(serialized);
  }
  const deserializeTime = (performance.now() - deserializeStart) / 10;

  return {
    codec: "JSON",
    dataType,
    originalSize,
    serializedSize: serialized.length,
    compressionRatio: 1.0,
    serializeTimeMs: serializeTime,
    deserializeTimeMs: deserializeTime,
    roundTripTimeMs: serializeTime + deserializeTime,
    serializeThroughput: originalSize / (serializeTime / 1000),
    deserializeThroughput: serialized.length / (deserializeTime / 1000),
  };
}

async function benchmarkMessagePack(data: unknown, dataType: string): Promise<BenchmarkResult> {
  const originalSize = JSON.stringify(data).length;

  // Warmup
  for (let i = 0; i < 5; i++) {
    msgpackCodec.deserialize(msgpackCodec.serialize(data));
  }

  // Serialize
  const serializeStart = performance.now();
  let serialized: Buffer = Buffer.alloc(0);
  for (let i = 0; i < 10; i++) {
    serialized = msgpackCodec.serialize(data);
  }
  const serializeTime = (performance.now() - serializeStart) / 10;

  // Deserialize
  const deserializeStart = performance.now();
  for (let i = 0; i < 10; i++) {
    msgpackCodec.deserialize(serialized);
  }
  const deserializeTime = (performance.now() - deserializeStart) / 10;

  return {
    codec: "MessagePack",
    dataType,
    originalSize,
    serializedSize: serialized.length,
    compressionRatio: originalSize / serialized.length,
    serializeTimeMs: serializeTime,
    deserializeTimeMs: deserializeTime,
    roundTripTimeMs: serializeTime + deserializeTime,
    serializeThroughput: originalSize / (serializeTime / 1000),
    deserializeThroughput: serialized.length / (deserializeTime / 1000),
  };
}

async function benchmarkProtobufRecords(
  data: RecordList,
  dataType: string,
): Promise<BenchmarkResult> {
  const originalSize = JSON.stringify(data).length;

  // Warmup
  for (let i = 0; i < 5; i++) {
    recordListCodec.deserialize(recordListCodec.serialize(data));
  }

  // Serialize
  const serializeStart = performance.now();
  let serialized: Buffer = Buffer.alloc(0);
  for (let i = 0; i < 10; i++) {
    serialized = recordListCodec.serialize(data);
  }
  const serializeTime = (performance.now() - serializeStart) / 10;

  // Deserialize
  const deserializeStart = performance.now();
  for (let i = 0; i < 10; i++) {
    recordListCodec.deserialize(serialized);
  }
  const deserializeTime = (performance.now() - deserializeStart) / 10;

  return {
    codec: "Protobuf",
    dataType,
    originalSize,
    serializedSize: serialized.length,
    compressionRatio: originalSize / serialized.length,
    serializeTimeMs: serializeTime,
    deserializeTimeMs: deserializeTime,
    roundTripTimeMs: serializeTime + deserializeTime,
    serializeThroughput: originalSize / (serializeTime / 1000),
    deserializeThroughput: serialized.length / (deserializeTime / 1000),
  };
}

async function benchmarkProtobufBinary(
  data: BinaryPayload,
  dataType: string,
): Promise<BenchmarkResult> {
  const originalSize = data.data.length;

  // Warmup
  for (let i = 0; i < 5; i++) {
    binaryPayloadCodec.deserialize(binaryPayloadCodec.serialize(data));
  }

  // Serialize
  const serializeStart = performance.now();
  let serialized: Buffer = Buffer.alloc(0);
  for (let i = 0; i < 10; i++) {
    serialized = binaryPayloadCodec.serialize(data);
  }
  const serializeTime = (performance.now() - serializeStart) / 10;

  // Deserialize
  const deserializeStart = performance.now();
  for (let i = 0; i < 10; i++) {
    binaryPayloadCodec.deserialize(serialized);
  }
  const deserializeTime = (performance.now() - deserializeStart) / 10;

  return {
    codec: "Protobuf",
    dataType,
    originalSize,
    serializedSize: serialized.length,
    compressionRatio: originalSize / serialized.length,
    serializeTimeMs: serializeTime,
    deserializeTimeMs: deserializeTime,
    roundTripTimeMs: serializeTime + deserializeTime,
    serializeThroughput: originalSize / (serializeTime / 1000),
    deserializeThroughput: serialized.length / (deserializeTime / 1000),
  };
}

async function benchmarkArrow(records: TestRecord[]): Promise<BenchmarkResult> {
  const originalSize = JSON.stringify(records).length;

  // Convert to columnar format for Arrow
  const ids = Int32Array.from(records.map((r) => r.id));
  const names = records.map((r) => r.name);
  const values = Float64Array.from(records.map((r) => r.value));
  const actives = records.map((r) => r.active);

  // Create table once for serialization tests
  const table = tableFromArrays({ id: ids, name: names, value: values, active: actives });

  // Warmup
  for (let i = 0; i < 5; i++) {
    arrowCodec.deserialize(arrowCodec.serialize(table));
  }

  // Serialize
  const serializeStart = performance.now();
  let serialized: Buffer = Buffer.alloc(0);
  for (let i = 0; i < 10; i++) {
    serialized = arrowCodec.serialize(table);
  }
  const serializeTime = (performance.now() - serializeStart) / 10;

  // Deserialize
  const deserializeStart = performance.now();
  for (let i = 0; i < 10; i++) {
    arrowCodec.deserialize(serialized);
  }
  const deserializeTime = (performance.now() - deserializeStart) / 10;

  return {
    codec: "Arrow",
    dataType: "records (columnar)",
    originalSize,
    serializedSize: serialized.length,
    compressionRatio: originalSize / serialized.length,
    serializeTimeMs: serializeTime,
    deserializeTimeMs: deserializeTime,
    roundTripTimeMs: serializeTime + deserializeTime,
    serializeThroughput: originalSize / (serializeTime / 1000),
    deserializeThroughput: serialized.length / (deserializeTime / 1000),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Codec Comparison Benchmark");
  console.log("  Using @procwire codecs: codec-msgpack, codec-protobuf, codec-arrow");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");

  const results: BenchmarkResult[] = [];

  // ─── Test 1: Structured Records ─────────────────────────────────────────────

  const recordCounts = [1000, 10000, 100000];

  for (const count of recordCounts) {
    console.log(`\n─── ${count.toLocaleString()} Records ───\n`);

    const records = generateRecords(count);
    const recordsWrapper: RecordList = { records };

    console.log("  JSON...");
    const jsonResult = await benchmarkJSON(records, `${count} records`);
    results.push(jsonResult);

    console.log("  MessagePack (@procwire/codec-msgpack)...");
    const msgpackResult = await benchmarkMessagePack(records, `${count} records`);
    results.push(msgpackResult);

    console.log("  Protobuf (@procwire/codec-protobuf)...");
    const protobufResult = await benchmarkProtobufRecords(recordsWrapper, `${count} records`);
    results.push(protobufResult);

    console.log("  Arrow (@procwire/codec-arrow)...");
    const arrowResult = await benchmarkArrow(records);
    results.push(arrowResult);

    // Print comparison
    console.log("\n  Results:");
    console.log(`    Original size: ${formatSize(jsonResult.originalSize)}`);
    console.log("");
    console.log("    | Codec      | Serialized | Ratio | Serialize | Deserialize | Round-trip |");
    console.log("    |------------|------------|-------|-----------|-------------|------------|");
    for (const r of [jsonResult, msgpackResult, protobufResult, arrowResult]) {
      console.log(
        `    | ${r.codec.padEnd(10)} | ${formatSize(r.serializedSize).padEnd(10)} | ${r.compressionRatio.toFixed(2)}x | ${formatSpeed(r.serializeThroughput).padEnd(9)} | ${formatSpeed(r.deserializeThroughput).padEnd(11)} | ${r.roundTripTimeMs.toFixed(2).padStart(7)}ms |`,
      );
    }
  }

  // ─── Test 2: Binary Data ────────────────────────────────────────────────────

  const binarySizes = [1024, 10240, 102400]; // 1MB, 10MB, 100MB

  for (const sizeKB of binarySizes) {
    const sizeLabel = sizeKB >= 1024 ? `${sizeKB / 1024} MB` : `${sizeKB} KB`;
    console.log(`\n─── Binary Payload: ${sizeLabel} ───\n`);

    const binaryData = generateBinaryPayload(sizeKB);

    console.log("  JSON (base64)...");
    const jsonBinaryData = { data: Buffer.from(binaryData.data).toString("base64") };
    const jsonResult = await benchmarkJSON(jsonBinaryData, `${sizeLabel} binary`);
    results.push(jsonResult);

    console.log("  MessagePack (@procwire/codec-msgpack)...");
    const msgpackResult = await benchmarkMessagePack(binaryData, `${sizeLabel} binary`);
    results.push(msgpackResult);

    console.log("  Protobuf (@procwire/codec-protobuf)...");
    const protobufResult = await benchmarkProtobufBinary(binaryData, `${sizeLabel} binary`);
    results.push(protobufResult);

    // Print comparison
    console.log("\n  Results:");
    console.log(`    Original size: ${formatSize(sizeKB * 1024)}`);
    console.log("");
    console.log("    | Codec      | Serialized | Ratio | Serialize | Deserialize | Round-trip |");
    console.log("    |------------|------------|-------|-----------|-------------|------------|");
    for (const r of [jsonResult, msgpackResult, protobufResult]) {
      console.log(
        `    | ${r.codec.padEnd(10)} | ${formatSize(r.serializedSize).padEnd(10)} | ${r.compressionRatio.toFixed(2)}x | ${formatSpeed(r.serializeThroughput).padEnd(9)} | ${formatSpeed(r.deserializeThroughput).padEnd(11)} | ${r.roundTripTimeMs.toFixed(2).padStart(7)}ms |`,
      );
    }
  }

  // ─── Per-Codec Summary ─────────────────────────────────────────────────────

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  Per-Codec Summary");
  console.log("═══════════════════════════════════════════════════════════════");

  // Group results by codec
  const byCodec = results.reduce(
    (acc, r) => {
      if (!acc[r.codec]) acc[r.codec] = [];
      acc[r.codec].push(r);
      return acc;
    },
    {} as Record<string, BenchmarkResult[]>,
  );

  for (const [codecName, codecResults] of Object.entries(byCodec)) {
    const avgCompression =
      codecResults.reduce((s, r) => s + r.compressionRatio, 0) / codecResults.length;
    const avgRoundTrip =
      codecResults.reduce((s, r) => s + r.roundTripTimeMs, 0) / codecResults.length;
    const totalBytes = codecResults.reduce((s, r) => s + r.serializedSize, 0);
    const avgSerializeSpeed =
      codecResults.reduce((s, r) => s + r.serializeThroughput, 0) / codecResults.length;

    console.log(`\n  ┌─────────────────────────────────────────┐`);
    console.log(`  │  CODEC: ${codecName.padEnd(31)}│`);
    console.log(`  ├─────────────────────────────────────────┤`);
    console.log(`  │  Tests run:           ${String(codecResults.length).padStart(16)} │`);
    console.log(`  │  Avg compression:     ${avgCompression.toFixed(2).padStart(14)}x │`);
    console.log(`  │  Avg round-trip:      ${avgRoundTrip.toFixed(2).padStart(13)}ms │`);
    console.log(`  │  Avg serialize speed: ${formatSpeed(avgSerializeSpeed).padStart(16)} │`);
    console.log(`  │  Total bytes output:  ${formatSize(totalBytes).padStart(16)} │`);
    console.log(`  └─────────────────────────────────────────┘`);
  }

  // ─── Recommendations ──────────────────────────────────────────────────────

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  Recommendations");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("\nCodec selection guide:");
  console.log("  - JSON:        Fallback only, human-readable debugging");
  console.log("  - MessagePack: General-purpose binary, schema-less, good balance");
  console.log("  - Protobuf:    Best compression for structured data, requires schema");
  console.log("  - Arrow:       Best for large tabular/columnar data, analytics workloads");
  console.log("\nFor high-throughput data channel transfers:");
  console.log("  - Small messages (<10KB): MessagePack or Protobuf");
  console.log("  - Large binary blobs:     MessagePack (no base64 overhead)");
  console.log("  - Tabular data:           Arrow (columnar format, zero-copy)");
}

main().catch(console.error);
