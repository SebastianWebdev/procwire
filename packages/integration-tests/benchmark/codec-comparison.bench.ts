/**
 * Benchmark: Codec Comparison for Large Data Transfer
 *
 * Compares performance of different serialization codecs:
 * 1. JSON (baseline/fallback)
 * 2. MessagePack (binary, schema-less)
 * 3. Protobuf (binary, schema-based)
 * 4. Arrow (columnar, for tabular data)
 *
 * Run with: pnpm benchmark:codecs
 */

import { encode as msgpackEncode, decode as msgpackDecode } from "@msgpack/msgpack";
import protobuf from "protobufjs";
import { tableFromArrays, tableToIPC, tableFromIPC } from "apache-arrow";

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
// Protobuf Schema
// ─────────────────────────────────────────────────────────────────────────────

const protoSchema = protobuf.Root.fromJSON({
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
    BinaryPayload: {
      fields: {
        data: { type: "bytes", id: 1 },
      },
    },
  },
});

const RecordListType = protoSchema.lookupType("RecordList");
const BinaryPayloadType = protoSchema.lookupType("BinaryPayload");

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
    msgpackDecode(msgpackEncode(data));
  }

  // Serialize
  const serializeStart = performance.now();
  let serialized: Uint8Array = new Uint8Array(0);
  for (let i = 0; i < 10; i++) {
    serialized = msgpackEncode(data);
  }
  const serializeTime = (performance.now() - serializeStart) / 10;

  // Deserialize
  const deserializeStart = performance.now();
  for (let i = 0; i < 10; i++) {
    msgpackDecode(serialized);
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

async function benchmarkProtobuf(
  data: { records: TestRecord[] } | { data: Uint8Array },
  dataType: string,
  type: protobuf.Type,
): Promise<BenchmarkResult> {
  const originalSize = JSON.stringify(data).length;

  // Warmup
  for (let i = 0; i < 5; i++) {
    const msg = type.create(data);
    const buf = type.encode(msg).finish();
    type.decode(buf);
  }

  // Serialize
  const serializeStart = performance.now();
  let serialized: Uint8Array = new Uint8Array(0);
  for (let i = 0; i < 10; i++) {
    const msg = type.create(data);
    serialized = type.encode(msg).finish();
  }
  const serializeTime = (performance.now() - serializeStart) / 10;

  // Deserialize
  const deserializeStart = performance.now();
  for (let i = 0; i < 10; i++) {
    type.decode(serialized);
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

  // Warmup
  for (let i = 0; i < 5; i++) {
    const table = tableFromArrays({ id: ids, name: names, value: values, active: actives });
    const buf = tableToIPC(table, "stream");
    tableFromIPC(buf);
  }

  // Serialize
  const serializeStart = performance.now();
  let serialized: Uint8Array = new Uint8Array(0);
  for (let i = 0; i < 10; i++) {
    const table = tableFromArrays({ id: ids, name: names, value: values, active: actives });
    serialized = tableToIPC(table, "stream");
  }
  const serializeTime = (performance.now() - serializeStart) / 10;

  // Deserialize
  const deserializeStart = performance.now();
  for (let i = 0; i < 10; i++) {
    tableFromIPC(serialized);
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
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");

  const results: BenchmarkResult[] = [];

  // ─── Test 1: Structured Records ─────────────────────────────────────────────

  const recordCounts = [1000, 10000, 100000];

  for (const count of recordCounts) {
    console.log(`\n─── ${count.toLocaleString()} Records ───\n`);

    const records = generateRecords(count);
    const recordsWrapper = { records };

    console.log("  JSON...");
    const jsonResult = await benchmarkJSON(records, `${count} records`);
    results.push(jsonResult);

    console.log("  MessagePack...");
    const msgpackResult = await benchmarkMessagePack(records, `${count} records`);
    results.push(msgpackResult);

    console.log("  Protobuf...");
    const protobufResult = await benchmarkProtobuf(recordsWrapper, `${count} records`, RecordListType);
    results.push(protobufResult);

    console.log("  Arrow...");
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

    console.log("  MessagePack...");
    const msgpackResult = await benchmarkMessagePack(binaryData, `${sizeLabel} binary`);
    results.push(msgpackResult);

    console.log("  Protobuf...");
    const protobufResult = await benchmarkProtobuf(binaryData, `${sizeLabel} binary`, BinaryPayloadType);
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

  // ─── Summary ────────────────────────────────────────────────────────────────

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  Summary");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("\nRecommendations:");
  console.log("  - JSON: Fallback only, human-readable debugging");
  console.log("  - MessagePack: General-purpose binary, schema-less, good balance");
  console.log("  - Protobuf: Best compression for structured data, requires schema");
  console.log("  - Arrow: Best for large tabular/columnar data, analytics workloads");
  console.log("\nFor high-throughput data channel transfers:");
  console.log("  - Small messages (<10KB): MessagePack or Protobuf");
  console.log("  - Large binary blobs: MessagePack (no base64 overhead)");
  console.log("  - Tabular data: Arrow (columnar format, zero-copy)");
}

main().catch(console.error);
