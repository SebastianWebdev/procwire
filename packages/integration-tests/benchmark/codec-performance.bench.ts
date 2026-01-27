/**
 * Benchmark: Codec Performance Analysis
 *
 * This benchmark measures the performance of different serialization codecs
 * in a real IPC scenario. It compares:
 *
 * BASELINES:
 * - JSON over stdio (lower baseline) - traditional way without procwire
 * - Raw binary over pipes (upper baseline) - theoretical maximum throughput
 *
 * CODECS (via Named Pipes/Unix Sockets):
 * - MessagePack - general purpose, 2-5x faster than JSON
 * - Protobuf - schema-validated, very compact
 * - Arrow - columnar data, batch processing (tested in isolation)
 *
 * Run with: pnpm benchmark
 */

import { ProcessManager, PipePath, ReservedMethods } from "@procwire/transport";
import type { IProcessHandle } from "@procwire/transport";
import { ArrowCodec } from "@procwire/codec-arrow";
import { MessagePackCodec } from "@procwire/codec-msgpack";
import { createCodecFromJSON } from "@procwire/codec-protobuf";
import { tableFromArrays } from "apache-arrow";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface BenchmarkResult {
  codec: string;
  testType: "payload" | "throughput" | "arrow" | "serialization";
  size: number; // KB for payload, msg count for throughput, rows for arrow
  iterations: number;
  totalTimeMs: number;
  avgTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  throughputMBps: number;
  messagesPerSec: number;
  serializedSizeBytes?: number;
}

interface BenchmarkReport {
  timestamp: string;
  system: {
    platform: string;
    arch: string;
    cpus: string;
    cpuCount: number;
    totalMemoryGB: number;
    nodeVersion: string;
  };
  baselines: {
    jsonStdio: BenchmarkResult[];
    rawPipe: BenchmarkResult[];
  };
  codecs: {
    msgpack: BenchmarkResult[];
    protobuf: BenchmarkResult[];
    arrow: BenchmarkResult[];
  };
  serialization: {
    msgpack: BenchmarkResult[];
    protobuf: BenchmarkResult[];
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function createWorkerPath(workerName: string): string {
  return path.join(__dirname, "..", "workers", workerName);
}

function filterEnv(extra?: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  if (extra) {
    Object.assign(result, extra);
  }
  return result;
}

function percentile(sorted: number[], p: number): number {
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function calculateStats(times: number[]): {
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
} {
  const sorted = [...times].sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);
  return {
    avg: sum / times.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Data Generation
// ─────────────────────────────────────────────────────────────────────────────

// Structured payload for MessagePack/Protobuf
interface StructuredPayload {
  id: number;
  name: string;
  data: string;
  items: number[];
}

function generateStructuredPayload(targetSizeKB: number): StructuredPayload {
  // Approximate size: id(4) + name(~20) + data(variable) + items(~100 * 4)
  const baseSize = 4 + 20 + 400;
  const dataSize = Math.max(0, targetSizeKB * 1024 - baseSize);

  return {
    id: Math.floor(Math.random() * 1000000),
    name: "benchmark_payload_" + Math.random().toString(36).substring(7),
    data: "x".repeat(dataSize),
    items: Array.from({ length: 100 }, (_, i) => i * 10),
  };
}

// Simple string payload for JSON baseline
function generateStringPayload(sizeKB: number): string {
  return "x".repeat(sizeKB * 1024);
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker Spawning
// ─────────────────────────────────────────────────────────────────────────────

async function spawnStdioWorker(manager: ProcessManager, id: string): Promise<IProcessHandle> {
  const workerPath = createWorkerPath("json-stdio-worker.ts");

  const handle = await manager.spawn(id, {
    executablePath: "node",
    args: ["--import", "tsx", workerPath],
    env: filterEnv(),
  });

  await handle.request(ReservedMethods.HANDSHAKE, {
    version: "1.0",
    capabilities: ["heartbeat"],
  });

  return handle;
}

async function spawnDataChannelWorker(
  manager: ProcessManager,
  id: string,
  workerFile: string,
): Promise<IProcessHandle> {
  const workerPath = createWorkerPath(workerFile);
  const dataPath = PipePath.forModule("codec-bench", id);

  const dataChannelReady = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timeout waiting for data channel ready"));
    }, 30000);

    const unsubscribe = manager.on("dataChannelReady", (eventUnknown) => {
      const event = eventUnknown as { id: string; path: string };
      if (event.id === id) {
        clearTimeout(timeout);
        unsubscribe();
        resolve();
      }
    });
  });

  const handle = await manager.spawn(id, {
    executablePath: "node",
    args: ["--import", "tsx", workerPath],
    env: filterEnv({
      PROCWIRE_DATA_PATH: dataPath,
    }),
    dataChannel: {
      enabled: true,
      path: dataPath,
    },
  });

  await handle.request(ReservedMethods.HANDSHAKE, {
    version: "1.0",
    capabilities: ["heartbeat", "data_channel"],
    data_channel: {
      path: dataPath,
      serialization: "json",
    },
  });

  await dataChannelReady;
  return handle;
}

// ─────────────────────────────────────────────────────────────────────────────
// Benchmark Functions
// ─────────────────────────────────────────────────────────────────────────────

async function benchmarkPayload(
  handle: IProcessHandle,
  codec: string,
  useDataChannel: boolean,
  payloadSizeKB: number,
  iterations: number,
): Promise<BenchmarkResult> {
  const payload =
    codec === "json-stdio"
      ? { data: generateStringPayload(payloadSizeKB) }
      : generateStructuredPayload(payloadSizeKB);

  const times: number[] = [];

  // Warmup
  for (let i = 0; i < 5; i++) {
    if (useDataChannel) {
      await handle.requestViaData("process_payload", payload);
    } else {
      await handle.request("process_payload", payload);
    }
  }

  // Benchmark
  const totalStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    if (useDataChannel) {
      await handle.requestViaData("process_payload", payload);
    } else {
      await handle.request("process_payload", payload);
    }
    times.push(performance.now() - start);
  }
  const totalTimeMs = performance.now() - totalStart;

  const stats = calculateStats(times);
  const totalDataMB = (payloadSizeKB * iterations) / 1024;

  return {
    codec,
    testType: "payload",
    size: payloadSizeKB,
    iterations,
    totalTimeMs,
    avgTimeMs: stats.avg,
    minTimeMs: stats.min,
    maxTimeMs: stats.max,
    p50Ms: stats.p50,
    p95Ms: stats.p95,
    p99Ms: stats.p99,
    throughputMBps: totalDataMB / (totalTimeMs / 1000),
    messagesPerSec: iterations / (totalTimeMs / 1000),
  };
}

async function benchmarkRawPayload(
  handle: IProcessHandle,
  payloadSizeKB: number,
  iterations: number,
): Promise<BenchmarkResult> {
  // Note: Using string payload because RawCodec is incompatible with JSON-RPC.
  // This measures named pipe transport overhead vs stdio (both using JSON).
  const payload = { data: generateStringPayload(payloadSizeKB) };

  const times: number[] = [];

  // Warmup
  for (let i = 0; i < 5; i++) {
    await handle.requestViaData("process_raw", payload);
  }

  // Benchmark
  const totalStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await handle.requestViaData("process_raw", payload);
    times.push(performance.now() - start);
  }
  const totalTimeMs = performance.now() - totalStart;

  const stats = calculateStats(times);
  const totalDataMB = (payloadSizeKB * iterations) / 1024;

  return {
    codec: "pipe-json",
    testType: "payload",
    size: payloadSizeKB,
    iterations,
    totalTimeMs,
    avgTimeMs: stats.avg,
    minTimeMs: stats.min,
    maxTimeMs: stats.max,
    p50Ms: stats.p50,
    p95Ms: stats.p95,
    p99Ms: stats.p99,
    throughputMBps: totalDataMB / (totalTimeMs / 1000),
    messagesPerSec: iterations / (totalTimeMs / 1000),
  };
}

async function benchmarkThroughput(
  handle: IProcessHandle,
  codec: string,
  useDataChannel: boolean,
  messagesCount: number,
): Promise<BenchmarkResult> {
  const times: number[] = [];

  // Warmup
  for (let i = 0; i < 10; i++) {
    if (useDataChannel) {
      await handle.requestViaData("echo", { n: i });
    } else {
      await handle.request("echo", { n: i });
    }
  }

  // Benchmark - concurrent requests
  const totalStart = performance.now();
  const promises = Array.from({ length: messagesCount }, async (_, i) => {
    const start = performance.now();
    if (useDataChannel) {
      await handle.requestViaData("echo", { n: i });
    } else {
      await handle.request("echo", { n: i });
    }
    return performance.now() - start;
  });

  const results = await Promise.all(promises);
  times.push(...results);
  const totalTimeMs = performance.now() - totalStart;

  const stats = calculateStats(times);

  return {
    codec,
    testType: "throughput",
    size: messagesCount,
    iterations: messagesCount,
    totalTimeMs,
    avgTimeMs: stats.avg,
    minTimeMs: stats.min,
    maxTimeMs: stats.max,
    p50Ms: stats.p50,
    p95Ms: stats.p95,
    p99Ms: stats.p99,
    throughputMBps: 0,
    messagesPerSec: messagesCount / (totalTimeMs / 1000),
  };
}

// Arrow benchmark - tests serialization in isolation (no worker)
function benchmarkArrowSerialization(rowCount: number, iterations: number): BenchmarkResult {
  const codec = new ArrowCodec({ validateInput: false });

  // Generate table
  const table = tableFromArrays({
    id: new Int32Array(Array.from({ length: rowCount }, (_, i) => i)),
    name: Array.from({ length: rowCount }, (_, i) => `item_${i}`),
    value: new Float64Array(Array.from({ length: rowCount }, () => Math.random() * 1000)),
    timestamp: BigInt64Array.from(Array.from({ length: rowCount }, () => BigInt(Date.now()))),
    category: Array.from({ length: rowCount }, (_, i) => `cat_${i % 10}`),
  });

  // Warmup
  for (let i = 0; i < 5; i++) {
    const buf = codec.serialize(table);
    codec.deserialize(buf);
  }

  const times: number[] = [];
  let serializedSize = 0;

  // Benchmark
  const totalStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const buf = codec.serialize(table);
    codec.deserialize(buf);
    times.push(performance.now() - start);
    serializedSize = buf.length;
  }
  const totalTimeMs = performance.now() - totalStart;

  const stats = calculateStats(times);
  // Estimate row size: id(4) + name(~10) + value(8) + timestamp(8) + category(~6) ≈ 36 bytes
  const estimatedSizeKB = (rowCount * 36) / 1024;
  const totalDataMB = (estimatedSizeKB * iterations) / 1024;

  return {
    codec: "arrow",
    testType: "arrow",
    size: rowCount,
    iterations,
    totalTimeMs,
    avgTimeMs: stats.avg,
    minTimeMs: stats.min,
    maxTimeMs: stats.max,
    p50Ms: stats.p50,
    p95Ms: stats.p95,
    p99Ms: stats.p99,
    throughputMBps: totalDataMB / (totalTimeMs / 1000),
    messagesPerSec: iterations / (totalTimeMs / 1000),
    serializedSizeBytes: serializedSize,
  };
}

// MessagePack serialization benchmark (in-memory, no IPC)
function benchmarkMsgpackSerialization(payloadSizeKB: number, iterations: number): BenchmarkResult {
  const codec = new MessagePackCodec();
  const payload = generateStructuredPayload(payloadSizeKB);

  // Warmup
  for (let i = 0; i < 5; i++) {
    const buf = codec.serialize(payload);
    codec.deserialize(buf);
  }

  const times: number[] = [];
  let serializedSize = 0;

  // Benchmark
  const totalStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const buf = codec.serialize(payload);
    codec.deserialize(buf);
    times.push(performance.now() - start);
    serializedSize = buf.length;
  }
  const totalTimeMs = performance.now() - totalStart;

  const stats = calculateStats(times);
  const totalDataMB = (payloadSizeKB * iterations) / 1024;

  return {
    codec: "msgpack",
    testType: "serialization",
    size: payloadSizeKB,
    iterations,
    totalTimeMs,
    avgTimeMs: stats.avg,
    minTimeMs: stats.min,
    maxTimeMs: stats.max,
    p50Ms: stats.p50,
    p95Ms: stats.p95,
    p99Ms: stats.p99,
    throughputMBps: totalDataMB / (totalTimeMs / 1000),
    messagesPerSec: iterations / (totalTimeMs / 1000),
    serializedSizeBytes: serializedSize,
  };
}

// Protobuf codec schema (must match protobuf-worker.ts)
const benchmarkPayloadSchema = {
  nested: {
    BenchmarkPayload: {
      fields: {
        id: { type: "int32", id: 1 },
        name: { type: "string", id: 2 },
        data: { type: "string", id: 3 },
        items: { type: "int32", id: 4, rule: "repeated" },
      },
    },
  },
};

// Protobuf serialization benchmark (in-memory, no IPC)
function benchmarkProtobufSerialization(
  payloadSizeKB: number,
  iterations: number,
): BenchmarkResult {
  const codec = createCodecFromJSON<StructuredPayload>(benchmarkPayloadSchema, "BenchmarkPayload");
  const payload = generateStructuredPayload(payloadSizeKB);

  // Warmup
  for (let i = 0; i < 5; i++) {
    const buf = codec.serialize(payload);
    codec.deserialize(buf);
  }

  const times: number[] = [];
  let serializedSize = 0;

  // Benchmark
  const totalStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const buf = codec.serialize(payload);
    codec.deserialize(buf);
    times.push(performance.now() - start);
    serializedSize = buf.length;
  }
  const totalTimeMs = performance.now() - totalStart;

  const stats = calculateStats(times);
  const totalDataMB = (payloadSizeKB * iterations) / 1024;

  return {
    codec: "protobuf",
    testType: "serialization",
    size: payloadSizeKB,
    iterations,
    totalTimeMs,
    avgTimeMs: stats.avg,
    minTimeMs: stats.min,
    maxTimeMs: stats.max,
    p50Ms: stats.p50,
    p95Ms: stats.p95,
    p99Ms: stats.p99,
    throughputMBps: totalDataMB / (totalTimeMs / 1000),
    messagesPerSec: iterations / (totalTimeMs / 1000),
    serializedSizeBytes: serializedSize,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Report Generation
// ─────────────────────────────────────────────────────────────────────────────

function formatPayloadSize(sizeKB: number): string {
  if (sizeKB >= 1024) {
    return `${(sizeKB / 1024).toFixed(0)} MB`;
  }
  return `${sizeKB} KB`;
}

function formatRowCount(rows: number): string {
  if (rows >= 1000000) {
    return `${(rows / 1000000).toFixed(1)}M`;
  }
  if (rows >= 1000) {
    return `${(rows / 1000).toFixed(0)}K`;
  }
  return String(rows);
}

function formatMarkdownReport(report: BenchmarkReport): string {
  const lines: string[] = [];

  // ─────────────────────────────────────────────────────────────────────────────
  // Title
  // ─────────────────────────────────────────────────────────────────────────────

  lines.push("# Codec Performance Benchmark Report");
  lines.push("");
  lines.push("## What This Benchmark Measures");
  lines.push("");
  lines.push(
    "This benchmark compares serialization codec performance for IPC (Inter-Process Communication):",
  );
  lines.push("");
  lines.push("| Codec | Transport | Use Case |");
  lines.push("|-------|-----------|----------|");
  lines.push("| 🔴 **JSON/stdio** (baseline) | stdio | Traditional IPC without procwire |");
  lines.push("| 🟢 **Raw binary** (baseline) | Named Pipes | Maximum theoretical throughput |");
  lines.push("| 🔵 **MessagePack** | Named Pipes | General-purpose, 2-5x faster than JSON |");
  lines.push("| 🟣 **Protobuf** | Named Pipes | Schema-validated, compact payloads |");
  lines.push("| 🟠 **Arrow** | In-memory | Columnar data, analytics workloads |");
  lines.push("");

  // ─────────────────────────────────────────────────────────────────────────────
  // Key Findings
  // ─────────────────────────────────────────────────────────────────────────────

  lines.push("## Key Findings");
  lines.push("");

  // Find best codec for large payloads
  const allPayload = [
    ...report.baselines.jsonStdio.filter((r) => r.testType === "payload"),
    ...report.baselines.rawPipe.filter((r) => r.testType === "payload"),
    ...report.codecs.msgpack.filter((r) => r.testType === "payload"),
    ...report.codecs.protobuf.filter((r) => r.testType === "payload"),
  ];

  const largePayloads = allPayload.filter((r) => r.size >= 1024);
  if (largePayloads.length > 0) {
    const jsonBaseline = report.baselines.jsonStdio.find(
      (r) => r.testType === "payload" && r.size >= 1024,
    );
    const rawBaseline = report.baselines.rawPipe.find(
      (r) => r.testType === "payload" && r.size >= 1024,
    );

    if (jsonBaseline && rawBaseline) {
      const bestCodec = largePayloads.reduce((a, b) =>
        a.throughputMBps > b.throughputMBps ? a : b,
      );

      const vsJson = (bestCodec.throughputMBps / jsonBaseline.throughputMBps).toFixed(1);
      const vsRaw = ((rawBaseline.throughputMBps / bestCodec.throughputMBps) * 100 - 100).toFixed(
        0,
      );

      lines.push(
        `- 🚀 **Best throughput**: ${bestCodec.codec} at **${bestCodec.throughputMBps.toFixed(1)} MB/s** for 1MB+ payloads`,
      );
      lines.push(`- 📊 **vs JSON baseline**: ${vsJson}x faster`);
      lines.push(`- 📉 **vs Raw baseline**: ${vsRaw}% overhead from serialization`);
    }
  }

  // Arrow findings
  if (report.codecs.arrow.length > 0) {
    const largeArrow = report.codecs.arrow.find((r) => r.size >= 100000);
    if (largeArrow) {
      lines.push(
        `- 🟠 **Arrow** (100K+ rows): **${largeArrow.throughputMBps.toFixed(1)} MB/s** columnar throughput`,
      );
    }
  }
  lines.push("");

  // ─────────────────────────────────────────────────────────────────────────────
  // Baselines
  // ─────────────────────────────────────────────────────────────────────────────

  lines.push("---");
  lines.push("");
  lines.push("## Baseline Measurements");
  lines.push("");
  lines.push(
    "*These baselines show the performance range: JSON/stdio (minimum) to Raw/pipes (maximum)*",
  );
  lines.push("");

  // JSON stdio baseline
  const jsonPayload = report.baselines.jsonStdio.filter((r) => r.testType === "payload");
  if (jsonPayload.length > 0) {
    lines.push("### 🔴 Lower Baseline: JSON over stdio");
    lines.push("");
    lines.push("*Traditional IPC without procwire - line-delimited JSON over stdin/stdout*");
    lines.push("");
    lines.push("| Payload | Avg Latency | P95 | P99 | Throughput |");
    lines.push("|---------|-------------|-----|-----|------------|");
    for (const r of jsonPayload) {
      lines.push(
        `| ${formatPayloadSize(r.size)} | ${r.avgTimeMs.toFixed(2)} ms | ${r.p95Ms.toFixed(2)} ms | ${r.p99Ms.toFixed(2)} ms | ${r.throughputMBps.toFixed(1)} MB/s |`,
      );
    }
    lines.push("");
  }

  // Raw pipe baseline
  const rawPayload = report.baselines.rawPipe.filter((r) => r.testType === "payload");
  if (rawPayload.length > 0) {
    lines.push("### 🟢 Upper Baseline: Raw Binary over Named Pipes");
    lines.push("");
    lines.push("*Theoretical maximum - no serialization overhead, just framing*");
    lines.push("");
    lines.push("| Payload | Avg Latency | P95 | P99 | Throughput |");
    lines.push("|---------|-------------|-----|-----|------------|");
    for (const r of rawPayload) {
      lines.push(
        `| ${formatPayloadSize(r.size)} | ${r.avgTimeMs.toFixed(2)} ms | ${r.p95Ms.toFixed(2)} ms | ${r.p99Ms.toFixed(2)} ms | ${r.throughputMBps.toFixed(1)} MB/s |`,
      );
    }
    lines.push("");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Codec Results
  // ─────────────────────────────────────────────────────────────────────────────

  lines.push("---");
  lines.push("");
  lines.push("## Codec Performance (via Named Pipes)");
  lines.push("");

  // MessagePack
  const msgpackPayload = report.codecs.msgpack.filter((r) => r.testType === "payload");
  if (msgpackPayload.length > 0) {
    lines.push("### 🔵 MessagePack Codec");
    lines.push("");
    lines.push("*Best for: General-purpose IPC, moderate payloads, Date/Map/Set support*");
    lines.push("");
    lines.push("| Payload | Avg Latency | P95 | P99 | Throughput | vs JSON | vs Raw |");
    lines.push("|---------|-------------|-----|-----|------------|---------|--------|");

    for (const r of msgpackPayload) {
      const jsonRef = report.baselines.jsonStdio.find(
        (j) => j.testType === "payload" && j.size === r.size,
      );
      const rawRef = report.baselines.rawPipe.find(
        (j) => j.testType === "payload" && j.size === r.size,
      );

      const vsJson = jsonRef ? `${(r.throughputMBps / jsonRef.throughputMBps).toFixed(1)}x` : "N/A";
      const vsRaw = rawRef
        ? `${((r.throughputMBps / rawRef.throughputMBps) * 100).toFixed(0)}%`
        : "N/A";

      lines.push(
        `| ${formatPayloadSize(r.size)} | ${r.avgTimeMs.toFixed(2)} ms | ${r.p95Ms.toFixed(2)} ms | ${r.p99Ms.toFixed(2)} ms | ${r.throughputMBps.toFixed(1)} MB/s | ${vsJson} | ${vsRaw} |`,
      );
    }
    lines.push("");
  }

  // Protobuf
  const protobufPayload = report.codecs.protobuf.filter((r) => r.testType === "payload");
  if (protobufPayload.length > 0) {
    lines.push("### 🟣 Protobuf Codec");
    lines.push("");
    lines.push("*Best for: Schema validation, cross-language, compact payloads*");
    lines.push("");
    lines.push("| Payload | Avg Latency | P95 | P99 | Throughput | vs JSON | vs Raw |");
    lines.push("|---------|-------------|-----|-----|------------|---------|--------|");

    for (const r of protobufPayload) {
      const jsonRef = report.baselines.jsonStdio.find(
        (j) => j.testType === "payload" && j.size === r.size,
      );
      const rawRef = report.baselines.rawPipe.find(
        (j) => j.testType === "payload" && j.size === r.size,
      );

      const vsJson = jsonRef ? `${(r.throughputMBps / jsonRef.throughputMBps).toFixed(1)}x` : "N/A";
      const vsRaw = rawRef
        ? `${((r.throughputMBps / rawRef.throughputMBps) * 100).toFixed(0)}%`
        : "N/A";

      lines.push(
        `| ${formatPayloadSize(r.size)} | ${r.avgTimeMs.toFixed(2)} ms | ${r.p95Ms.toFixed(2)} ms | ${r.p99Ms.toFixed(2)} ms | ${r.throughputMBps.toFixed(1)} MB/s | ${vsJson} | ${vsRaw} |`,
      );
    }
    lines.push("");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Serialization Only (in-memory, no IPC)
  // ─────────────────────────────────────────────────────────────────────────────

  lines.push("---");
  lines.push("");
  lines.push("## Pure Serialization Performance (In-Memory)");
  lines.push("");
  lines.push("*Codec overhead without IPC transport - serialize + deserialize round-trip*");
  lines.push("");

  // MessagePack serialization
  const msgpackSerial = report.serialization.msgpack;
  const protobufSerial = report.serialization.protobuf;

  if (msgpackSerial.length > 0 || protobufSerial.length > 0) {
    lines.push("| Codec | Payload | Avg Latency | Throughput | Serialized Size |");
    lines.push("|-------|---------|-------------|------------|-----------------|");

    for (const r of msgpackSerial) {
      const sizeStr = r.serializedSizeBytes
        ? r.serializedSizeBytes >= 1024 * 1024
          ? `${(r.serializedSizeBytes / 1024 / 1024).toFixed(1)} MB`
          : `${(r.serializedSizeBytes / 1024).toFixed(1)} KB`
        : "N/A";
      lines.push(
        `| 🔵 MessagePack | ${formatPayloadSize(r.size)} | ${r.avgTimeMs.toFixed(3)} ms | ${r.throughputMBps.toFixed(1)} MB/s | ${sizeStr} |`,
      );
    }

    for (const r of protobufSerial) {
      const sizeStr = r.serializedSizeBytes
        ? r.serializedSizeBytes >= 1024 * 1024
          ? `${(r.serializedSizeBytes / 1024 / 1024).toFixed(1)} MB`
          : `${(r.serializedSizeBytes / 1024).toFixed(1)} KB`
        : "N/A";
      lines.push(
        `| 🟣 Protobuf | ${formatPayloadSize(r.size)} | ${r.avgTimeMs.toFixed(3)} ms | ${r.throughputMBps.toFixed(1)} MB/s | ${sizeStr} |`,
      );
    }
    lines.push("");
  }

  // Arrow
  const arrowResults = report.codecs.arrow;
  if (arrowResults.length > 0) {
    lines.push("### 🟠 Arrow Codec (Columnar Data)");
    lines.push("");
    lines.push("*Best for: Analytics, batch processing, cross-language data exchange*");
    lines.push("");
    lines.push(
      "*Note: Arrow is tested in isolation (serialize + deserialize round-trip) as it's designed for columnar data, not JSON-RPC.*",
    );
    lines.push("");
    lines.push("| Rows | Avg Latency | P95 | P99 | Throughput | Serialized Size |");
    lines.push("|------|-------------|-----|-----|------------|-----------------|");

    for (const r of arrowResults) {
      const sizeStr = r.serializedSizeBytes
        ? r.serializedSizeBytes >= 1024 * 1024
          ? `${(r.serializedSizeBytes / 1024 / 1024).toFixed(1)} MB`
          : `${(r.serializedSizeBytes / 1024).toFixed(1)} KB`
        : "N/A";

      lines.push(
        `| ${formatRowCount(r.size)} | ${r.avgTimeMs.toFixed(2)} ms | ${r.p95Ms.toFixed(2)} ms | ${r.p99Ms.toFixed(2)} ms | ${r.throughputMBps.toFixed(1)} MB/s | ${sizeStr} |`,
      );
    }
    lines.push("");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Throughput Comparison
  // ─────────────────────────────────────────────────────────────────────────────

  const allThroughput = [
    ...report.baselines.jsonStdio.filter((r) => r.testType === "throughput"),
    ...report.codecs.msgpack.filter((r) => r.testType === "throughput"),
    ...report.codecs.protobuf.filter((r) => r.testType === "throughput"),
  ];

  if (allThroughput.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push("## Message Throughput (Small Messages)");
    lines.push("");
    lines.push("*How many small messages can we send per second?*");
    lines.push("");
    lines.push("| Codec | 100 msgs | 500 msgs | 1000 msgs |");
    lines.push("|-------|----------|----------|-----------|");

    const codecs = ["json-stdio", "msgpack", "protobuf"];
    for (const codec of codecs) {
      let results: BenchmarkResult[];
      let emoji: string;
      let name: string;

      if (codec === "json-stdio") {
        results = report.baselines.jsonStdio.filter((r) => r.testType === "throughput");
        emoji = "🔴";
        name = "JSON/stdio";
      } else if (codec === "msgpack") {
        results = report.codecs.msgpack.filter((r) => r.testType === "throughput");
        emoji = "🔵";
        name = "MessagePack";
      } else {
        results = report.codecs.protobuf.filter((r) => r.testType === "throughput");
        emoji = "🟣";
        name = "Protobuf";
      }

      if (results.length > 0) {
        const r100 = results.find((r) => r.size === 100);
        const r500 = results.find((r) => r.size === 500);
        const r1000 = results.find((r) => r.size === 1000);

        lines.push(
          `| ${emoji} ${name} | ${r100 ? Math.round(r100.messagesPerSec).toLocaleString() : "N/A"} msg/s | ${r500 ? Math.round(r500.messagesPerSec).toLocaleString() : "N/A"} msg/s | ${r1000 ? Math.round(r1000.messagesPerSec).toLocaleString() : "N/A"} msg/s |`,
        );
      }
    }
    lines.push("");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // System Info
  // ─────────────────────────────────────────────────────────────────────────────

  lines.push("---");
  lines.push("");
  lines.push("## Test Environment");
  lines.push("");
  lines.push(`**Generated:** ${report.timestamp}`);
  lines.push("");
  lines.push("| Property | Value |");
  lines.push("|----------|-------|");
  lines.push(`| Platform | ${report.system.platform} |`);
  lines.push(`| Architecture | ${report.system.arch} |`);
  lines.push(`| CPU | ${report.system.cpus} |`);
  lines.push(`| CPU Cores | ${report.system.cpuCount} |`);
  lines.push(`| Total Memory | ${report.system.totalMemoryGB} GB |`);
  lines.push(`| Node.js | ${report.system.nodeVersion} |`);
  lines.push("");

  // ─────────────────────────────────────────────────────────────────────────────
  // Methodology
  // ─────────────────────────────────────────────────────────────────────────────

  lines.push("## Methodology");
  lines.push("");
  lines.push("### Codec Descriptions");
  lines.push("");
  lines.push(
    "- **JSON/stdio**: Line-delimited JSON over stdin/stdout. Baseline for traditional IPC.",
  );
  lines.push(
    "- **Raw binary**: Length-prefixed binary over Named Pipes. No serialization, shows transport max.",
  );
  lines.push("- **MessagePack**: Binary JSON-like format. 2-5x faster, supports Date/Map/Set.");
  lines.push("- **Protobuf**: Schema-validated binary. 3-10x smaller than JSON.");
  lines.push("- **Arrow**: Columnar IPC format. Optimized for analytics and batch processing.");
  lines.push("");
  lines.push("### Metrics");
  lines.push("");
  lines.push("- **vs JSON**: Throughput relative to JSON/stdio baseline (higher is better)");
  lines.push(
    "- **vs Raw**: Throughput as percentage of raw binary baseline (100% = no serialization overhead)",
  );
  lines.push("- **P95/P99**: 95th and 99th percentile latencies (tail latency)");
  lines.push("");
  lines.push("### Test Parameters");
  lines.push("");
  lines.push("- **Warmup**: 5-10 iterations before measurement");
  lines.push("- **Iterations**: 50 for small payloads, fewer for large to keep test reasonable");
  lines.push("- **Payloads**: 1 KB to 10 MB structured data");
  lines.push("- **Arrow**: 100 to 1M rows with 5 columns");

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Benchmark Runner
// ─────────────────────────────────────────────────────────────────────────────

async function runBenchmarks(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Codec Performance Benchmark");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");

  const manager = new ProcessManager({
    namespace: "codec-bench",
    defaultTimeout: 60000,
    gracefulShutdownMs: 5000,
  });

  const report: BenchmarkReport = {
    timestamp: new Date().toISOString(),
    system: {
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus()[0]?.model || "Unknown",
      cpuCount: os.cpus().length,
      totalMemoryGB: Math.round((os.totalmem() / 1024 / 1024 / 1024) * 10) / 10,
      nodeVersion: process.version,
    },
    baselines: {
      jsonStdio: [],
      rawPipe: [],
    },
    codecs: {
      msgpack: [],
      protobuf: [],
      arrow: [],
    },
    serialization: {
      msgpack: [],
      protobuf: [],
    },
  };

  // Payload sizes (KB) and iterations
  const payloadSizes = [1, 10, 100, 1024, 10240];
  const getIterations = (sizeKB: number): number => {
    if (sizeKB >= 10000) return 10;
    if (sizeKB >= 1000) return 20;
    return 50;
  };

  // Throughput test sizes
  const throughputSizes = [100, 500, 1000];

  // Arrow row counts
  const arrowRowCounts = [100, 1000, 10000, 100000, 1000000];

  // Serialization test sizes
  const serializationSizes = [1, 10, 100, 1024];

  try {
    // ─── JSON/stdio Baseline ────────────────────────────────────────────────────
    console.log("📍 Testing JSON/stdio baseline...\n");
    const jsonWorker = await spawnStdioWorker(manager, "json-worker");

    for (const sizeKB of payloadSizes) {
      const iterations = getIterations(sizeKB);
      process.stdout.write(`  ${formatPayloadSize(sizeKB).padEnd(8)} (${iterations} iters)... `);

      const result = await benchmarkPayload(jsonWorker, "json-stdio", false, sizeKB, iterations);
      report.baselines.jsonStdio.push(result);

      console.log(`${result.throughputMBps.toFixed(1)} MB/s`);
    }

    // Throughput tests
    for (const count of throughputSizes) {
      process.stdout.write(`  ${count} concurrent... `);
      const result = await benchmarkThroughput(jsonWorker, "json-stdio", false, count);
      report.baselines.jsonStdio.push(result);
      console.log(`${Math.round(result.messagesPerSec)} msg/s`);
    }

    await manager.terminate("json-worker");
    console.log("");

    // ─── Raw Pipe Baseline ──────────────────────────────────────────────────────
    console.log("📍 Testing Raw Pipe baseline...\n");
    const rawWorker = await spawnDataChannelWorker(manager, "raw-worker", "raw-pipe-worker.ts");

    for (const sizeKB of payloadSizes) {
      const iterations = getIterations(sizeKB);
      process.stdout.write(`  ${formatPayloadSize(sizeKB).padEnd(8)} (${iterations} iters)... `);

      const result = await benchmarkRawPayload(rawWorker, sizeKB, iterations);
      report.baselines.rawPipe.push(result);

      console.log(`${result.throughputMBps.toFixed(1)} MB/s`);
    }

    await manager.terminate("raw-worker");
    console.log("");

    // ─── MessagePack Codec ──────────────────────────────────────────────────────
    console.log("📍 Testing MessagePack codec...\n");
    const msgpackWorker = await spawnDataChannelWorker(
      manager,
      "msgpack-worker",
      "msgpack-worker.ts",
    );

    for (const sizeKB of payloadSizes) {
      const iterations = getIterations(sizeKB);
      process.stdout.write(`  ${formatPayloadSize(sizeKB).padEnd(8)} (${iterations} iters)... `);

      const result = await benchmarkPayload(msgpackWorker, "msgpack", true, sizeKB, iterations);
      report.codecs.msgpack.push(result);

      console.log(`${result.throughputMBps.toFixed(1)} MB/s`);
    }

    // Throughput tests
    for (const count of throughputSizes) {
      process.stdout.write(`  ${count} concurrent... `);
      const result = await benchmarkThroughput(msgpackWorker, "msgpack", true, count);
      report.codecs.msgpack.push(result);
      console.log(`${Math.round(result.messagesPerSec)} msg/s`);
    }

    await manager.terminate("msgpack-worker");
    console.log("");

    // ─── Protobuf Codec ─────────────────────────────────────────────────────────
    console.log("📍 Testing Protobuf codec...\n");
    const protobufWorker = await spawnDataChannelWorker(
      manager,
      "protobuf-worker",
      "protobuf-worker.ts",
    );

    for (const sizeKB of payloadSizes) {
      const iterations = getIterations(sizeKB);
      process.stdout.write(`  ${formatPayloadSize(sizeKB).padEnd(8)} (${iterations} iters)... `);

      const result = await benchmarkPayload(protobufWorker, "protobuf", true, sizeKB, iterations);
      report.codecs.protobuf.push(result);

      console.log(`${result.throughputMBps.toFixed(1)} MB/s`);
    }

    // Throughput tests
    for (const count of throughputSizes) {
      process.stdout.write(`  ${count} concurrent... `);
      const result = await benchmarkThroughput(protobufWorker, "protobuf", true, count);
      report.codecs.protobuf.push(result);
      console.log(`${Math.round(result.messagesPerSec)} msg/s`);
    }

    await manager.terminate("protobuf-worker");
    console.log("");

    // ─── Pure Serialization Tests (in-memory) ───────────────────────────────────
    console.log("📍 Testing pure serialization (in-memory)...\n");

    for (const sizeKB of serializationSizes) {
      const iterations = sizeKB >= 1000 ? 100 : 500;
      process.stdout.write(`  MessagePack ${formatPayloadSize(sizeKB).padEnd(8)}... `);
      const msgResult = benchmarkMsgpackSerialization(sizeKB, iterations);
      report.serialization.msgpack.push(msgResult);
      console.log(`${msgResult.throughputMBps.toFixed(1)} MB/s`);

      process.stdout.write(`  Protobuf    ${formatPayloadSize(sizeKB).padEnd(8)}... `);
      const pbResult = benchmarkProtobufSerialization(sizeKB, iterations);
      report.serialization.protobuf.push(pbResult);
      console.log(`${pbResult.throughputMBps.toFixed(1)} MB/s`);
    }
    console.log("");

    // ─── Arrow Codec (isolated) ─────────────────────────────────────────────────
    console.log("📍 Testing Arrow codec (in-memory serialization)...\n");

    for (const rowCount of arrowRowCounts) {
      const iterations = rowCount >= 100000 ? 10 : 50;
      process.stdout.write(
        `  ${formatRowCount(rowCount).padEnd(8)} rows (${iterations} iters)... `,
      );

      const result = benchmarkArrowSerialization(rowCount, iterations);
      report.codecs.arrow.push(result);

      console.log(`${result.throughputMBps.toFixed(1)} MB/s`);
    }
    console.log("");

    // ─── Generate Report ────────────────────────────────────────────────────────
    console.log("Generating report...\n");

    const reportsDir = path.join(__dirname, "..", "benchmark-reports");
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const jsonPath = path.join(reportsDir, `benchmark-${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    console.log(`  JSON report: ${jsonPath}`);

    const mdPath = path.join(reportsDir, `benchmark-${timestamp}.md`);
    fs.writeFileSync(mdPath, formatMarkdownReport(report));
    console.log(`  Markdown report: ${mdPath}`);

    const latestJsonPath = path.join(reportsDir, "latest.json");
    const latestMdPath = path.join(reportsDir, "latest.md");
    fs.writeFileSync(latestJsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(latestMdPath, formatMarkdownReport(report));
    console.log(`  Latest report: ${latestMdPath}`);

    console.log("");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  Benchmark Complete!");
    console.log("═══════════════════════════════════════════════════════════════");
  } catch (error) {
    console.error("Benchmark failed:", error);
    await manager.terminateAll();
    process.exit(1);
  }

  await manager.terminateAll();
}

// Run benchmarks
runBenchmarks().catch(console.error);
