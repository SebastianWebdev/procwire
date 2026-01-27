/**
 * Benchmark: Serialization Overhead Analysis
 *
 * This benchmark measures where time is spent:
 * 1. Pure serialization (JSON.stringify/parse)
 * 2. MessagePack serialization
 * 3. Full round-trip through transport
 *
 * Run with: pnpm benchmark:serialization
 */

import { MessagePackCodec } from "@procwire/codec-msgpack";

// ─────────────────────────────────────────────────────────────────────────────
// Codec Instance
// ─────────────────────────────────────────────────────────────────────────────

const msgpackCodec = new MessagePackCodec();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function generateStringPayload(sizeKB: number): { data: string } {
  return { data: "x".repeat(sizeKB * 1024) };
}

function generateBinaryPayload(sizeKB: number): { data: Uint8Array } {
  return { data: new Uint8Array(sizeKB * 1024).fill(120) }; // 'x' = 120
}

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
// Benchmarks
// ─────────────────────────────────────────────────────────────────────────────

async function benchmarkJsonSerialization(sizeKB: number, iterations: number): Promise<void> {
  const payload = generateStringPayload(sizeKB);

  // Warmup
  for (let i = 0; i < 5; i++) {
    const str = JSON.stringify(payload);
    JSON.parse(str);
  }

  // Serialize benchmark
  const serializeStart = performance.now();
  let serializedSize = 0;
  for (let i = 0; i < iterations; i++) {
    const str = JSON.stringify(payload);
    serializedSize = str.length;
  }
  const serializeTime = performance.now() - serializeStart;

  // Deserialize benchmark
  const serialized = JSON.stringify(payload);
  const deserializeStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    JSON.parse(serialized);
  }
  const deserializeTime = performance.now() - deserializeStart;

  const totalDataMB = (sizeKB * iterations) / 1024;
  const serializeSpeed = (totalDataMB * 1024 * 1024) / (serializeTime / 1000);
  const deserializeSpeed = (totalDataMB * 1024 * 1024) / (deserializeTime / 1000);

  console.log(`  JSON (${sizeKB >= 1024 ? `${sizeKB / 1024}MB` : `${sizeKB}KB`} string):`);
  console.log(`    Serialized size: ${formatSize(serializedSize)}`);
  console.log(`    Serialize:   ${serializeTime.toFixed(2)}ms (${formatSpeed(serializeSpeed)})`);
  console.log(
    `    Deserialize: ${deserializeTime.toFixed(2)}ms (${formatSpeed(deserializeSpeed)})`,
  );
  console.log(`    Round-trip:  ${(serializeTime + deserializeTime).toFixed(2)}ms`);
}

async function benchmarkMsgpackSerialization(sizeKB: number, iterations: number): Promise<void> {
  const stringPayload = generateStringPayload(sizeKB);
  const binaryPayload = generateBinaryPayload(sizeKB);

  // ─── String payload ───
  {
    // Warmup
    for (let i = 0; i < 5; i++) {
      const buf = msgpackCodec.serialize(stringPayload);
      msgpackCodec.deserialize(buf);
    }

    // Serialize benchmark
    const serializeStart = performance.now();
    let serializedSize = 0;
    for (let i = 0; i < iterations; i++) {
      const buf = msgpackCodec.serialize(stringPayload);
      serializedSize = buf.byteLength;
    }
    const serializeTime = performance.now() - serializeStart;

    // Deserialize benchmark
    const serialized = msgpackCodec.serialize(stringPayload);
    const deserializeStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      msgpackCodec.deserialize(serialized);
    }
    const deserializeTime = performance.now() - deserializeStart;

    const totalDataMB = (sizeKB * iterations) / 1024;
    const serializeSpeed = (totalDataMB * 1024 * 1024) / (serializeTime / 1000);
    const deserializeSpeed = (totalDataMB * 1024 * 1024) / (deserializeTime / 1000);

    console.log(
      `  MessagePack (@procwire/codec-msgpack) (${sizeKB >= 1024 ? `${sizeKB / 1024}MB` : `${sizeKB}KB`} string):`,
    );
    console.log(`    Serialized size: ${formatSize(serializedSize)}`);
    console.log(`    Serialize:   ${serializeTime.toFixed(2)}ms (${formatSpeed(serializeSpeed)})`);
    console.log(
      `    Deserialize: ${deserializeTime.toFixed(2)}ms (${formatSpeed(deserializeSpeed)})`,
    );
    console.log(`    Round-trip:  ${(serializeTime + deserializeTime).toFixed(2)}ms`);
  }

  // ─── Binary payload ───
  {
    // Warmup
    for (let i = 0; i < 5; i++) {
      const buf = msgpackCodec.serialize(binaryPayload);
      msgpackCodec.deserialize(buf);
    }

    // Serialize benchmark
    const serializeStart = performance.now();
    let serializedSize = 0;
    for (let i = 0; i < iterations; i++) {
      const buf = msgpackCodec.serialize(binaryPayload);
      serializedSize = buf.byteLength;
    }
    const serializeTime = performance.now() - serializeStart;

    // Deserialize benchmark
    const serialized = msgpackCodec.serialize(binaryPayload);
    const deserializeStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      msgpackCodec.deserialize(serialized);
    }
    const deserializeTime = performance.now() - deserializeStart;

    const totalDataMB = (sizeKB * iterations) / 1024;
    const serializeSpeed = (totalDataMB * 1024 * 1024) / (serializeTime / 1000);
    const deserializeSpeed = (totalDataMB * 1024 * 1024) / (deserializeTime / 1000);

    console.log(
      `  MessagePack (@procwire/codec-msgpack) (${sizeKB >= 1024 ? `${sizeKB / 1024}MB` : `${sizeKB}KB`} binary):`,
    );
    console.log(`    Serialized size: ${formatSize(serializedSize)}`);
    console.log(`    Serialize:   ${serializeTime.toFixed(2)}ms (${formatSpeed(serializeSpeed)})`);
    console.log(
      `    Deserialize: ${deserializeTime.toFixed(2)}ms (${formatSpeed(deserializeSpeed)})`,
    );
    console.log(`    Round-trip:  ${(serializeTime + deserializeTime).toFixed(2)}ms`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Serialization Overhead Analysis");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");

  const testSizes = [
    { sizeKB: 100, iterations: 100 },
    { sizeKB: 1024, iterations: 50 }, // 1 MB
    { sizeKB: 10240, iterations: 10 }, // 10 MB
    { sizeKB: 102400, iterations: 3 }, // 100 MB
  ];

  for (const { sizeKB, iterations } of testSizes) {
    const label = sizeKB >= 1024 ? `${sizeKB / 1024} MB` : `${sizeKB} KB`;
    console.log(`\n─── ${label} payload (${iterations} iterations) ───\n`);

    await benchmarkJsonSerialization(sizeKB, iterations);
    console.log("");
    await benchmarkMsgpackSerialization(sizeKB, iterations);
  }

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  Analysis Complete!");
  console.log("═══════════════════════════════════════════════════════════════");
}

main().catch(console.error);
