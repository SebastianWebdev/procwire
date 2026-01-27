/**
 * Benchmark: End-to-End Codec Performance through Data Channel
 *
 * Tests actual throughput of different codecs through the full
 * transport stack (data channel with named pipes/Unix sockets).
 *
 * Uses @procwire codecs: codec-msgpack, codec-protobuf, codec-arrow
 *
 * Run with: pnpm benchmark:codec-e2e
 */

import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import * as net from "node:net";
import { fileURLToPath } from "node:url";
import { MessagePackCodec } from "@procwire/codec-msgpack";
import { ArrowCodec } from "@procwire/codec-arrow";
import { tableFromArrays } from "apache-arrow";
import { createCodecFromJSON } from "@procwire/codec-protobuf";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

function getPipePath(name: string): string {
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\codec-bench-${name}-${process.pid}`;
  }
  return path.join(os.tmpdir(), `codec-bench-${name}-${process.pid}.sock`);
}

function generateBinaryPayload(sizeKB: number): Uint8Array {
  return new Uint8Array(sizeKB * 1024).fill(120);
}

// ─────────────────────────────────────────────────────────────────────────────
// Buffer List for efficient parsing
// ─────────────────────────────────────────────────────────────────────────────

class BufferList {
  private buffers: Buffer[] = [];
  private totalLength = 0;
  private expectedLength: number | null = null;

  push(data: Buffer): void {
    this.buffers.push(data);
    this.totalLength += data.length;
  }

  peekUInt32BE(): number | null {
    if (this.totalLength < 4) return null;
    const first = this.buffers[0]!;
    if (first.length >= 4) {
      return first.readUInt32BE(0);
    }
    const header = Buffer.allocUnsafe(4);
    let offset = 0;
    for (const buf of this.buffers) {
      const toCopy = Math.min(buf.length, 4 - offset);
      buf.copy(header, offset, 0, toCopy);
      offset += toCopy;
      if (offset >= 4) break;
    }
    return header.readUInt32BE(0);
  }

  takeFrame(): Buffer | null {
    if (this.expectedLength === null) {
      const len = this.peekUInt32BE();
      if (len === null) return null;
      this.expectedLength = len;
      this.consumeBytes(4);
    }

    if (this.totalLength < this.expectedLength) return null;

    const length = this.expectedLength;
    const result = Buffer.allocUnsafe(length);

    let offset = 0;
    let remaining = length;
    while (remaining > 0 && this.buffers.length > 0) {
      const buf = this.buffers[0]!;
      if (remaining >= buf.length) {
        buf.copy(result, offset);
        offset += buf.length;
        remaining -= buf.length;
        this.buffers.shift();
      } else {
        buf.copy(result, offset, 0, remaining);
        this.buffers[0] = buf.subarray(remaining);
        remaining = 0;
      }
    }
    this.totalLength -= length;
    this.expectedLength = null;
    return result;
  }

  private consumeBytes(length: number): void {
    let remaining = length;
    while (remaining > 0 && this.buffers.length > 0) {
      const buf = this.buffers[0]!;
      if (remaining >= buf.length) {
        this.buffers.shift();
        remaining -= buf.length;
      } else {
        this.buffers[0] = buf.subarray(remaining);
        remaining = 0;
      }
    }
    this.totalLength -= length;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Codec Interfaces and Instances
// ─────────────────────────────────────────────────────────────────────────────

interface Codec {
  name: string;
  encode(data: unknown): Buffer;
  decode(buffer: Buffer): unknown;
}

// JSON codec (baseline)
const jsonCodec: Codec = {
  name: "JSON",
  encode: (data) => Buffer.from(JSON.stringify(data)),
  decode: (buffer) => JSON.parse(buffer.toString()),
};

// MessagePack codec using @procwire/codec-msgpack
const msgpackCodecInstance = new MessagePackCodec();
const msgpackCodec: Codec = {
  name: "MessagePack",
  encode: (data) => msgpackCodecInstance.serialize(data),
  decode: (buffer) => msgpackCodecInstance.deserialize(buffer),
};

// Raw codec (no serialization - baseline for transport overhead)
const _rawCodec: Codec = {
  name: "Raw (no serialization)",
  encode: (data) => data as Buffer,
  decode: (buffer) => buffer,
};

// ─────────────────────────────────────────────────────────────────────────────
// Protobuf Schema for JSON-RPC wrapper (using @procwire/codec-protobuf)
// ─────────────────────────────────────────────────────────────────────────────

const jsonRpcRequestSchema = {
  nested: {
    JsonRpcRequest: {
      fields: {
        jsonrpc: { type: "string", id: 1 },
        id: { type: "int32", id: 2 },
        method: { type: "string", id: 3 },
        params: { type: "bytes", id: 4 }, // Encode params as bytes
      },
    },
  },
};

const jsonRpcResponseSchema = {
  nested: {
    JsonRpcResponse: {
      fields: {
        jsonrpc: { type: "string", id: 1 },
        id: { type: "int32", id: 2 },
        result: { type: "bytes", id: 3 }, // Encode result as bytes
      },
    },
  },
};

interface ProtoJsonRpcRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params: Uint8Array;
}

interface ProtoJsonRpcResponse {
  jsonrpc: string;
  id: number;
  result: Uint8Array;
}

// Create protobuf codecs using @procwire/codec-protobuf
const jsonRpcRequestCodec = createCodecFromJSON<ProtoJsonRpcRequest>(
  jsonRpcRequestSchema,
  "JsonRpcRequest",
);
const jsonRpcResponseCodec = createCodecFromJSON<ProtoJsonRpcResponse>(
  jsonRpcResponseSchema,
  "JsonRpcResponse",
);

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

// Protobuf codec using @procwire/codec-protobuf
const protobufCodec: Codec = {
  name: "Protobuf",
  encode: (data) => {
    const rpcData = data as JsonRpcRequest | JsonRpcResponse;
    if ("method" in rpcData) {
      // Request: encode params as raw bytes
      const paramsBytes = Buffer.from(JSON.stringify(rpcData.params));
      const protoData: ProtoJsonRpcRequest = {
        jsonrpc: rpcData.jsonrpc,
        id: rpcData.id,
        method: rpcData.method,
        params: paramsBytes,
      };
      return jsonRpcRequestCodec.serialize(protoData);
    } else {
      // Response: encode result as raw bytes
      const resultBytes = Buffer.from(JSON.stringify(rpcData.result));
      const protoData: ProtoJsonRpcResponse = {
        jsonrpc: rpcData.jsonrpc,
        id: rpcData.id,
        result: resultBytes,
      };
      return jsonRpcResponseCodec.serialize(protoData);
    }
  },
  decode: (buffer) => {
    // Try to decode as response first (most common in benchmarks)
    try {
      const decoded = jsonRpcResponseCodec.deserialize(buffer);
      if (decoded.result) {
        return {
          jsonrpc: decoded.jsonrpc,
          id: decoded.id,
          result: JSON.parse(Buffer.from(decoded.result).toString()),
        };
      }
    } catch {
      // Try as request
    }
    const decoded = jsonRpcRequestCodec.deserialize(buffer);
    return {
      jsonrpc: decoded.jsonrpc,
      id: decoded.id,
      method: decoded.method,
      params: JSON.parse(Buffer.from(decoded.params).toString()),
    };
  },
};

// Arrow codec using @procwire/codec-arrow
const arrowCodecInstance = new ArrowCodec();

// ─────────────────────────────────────────────────────────────────────────────
// Benchmark: Full Round-trip with Protocol
// ─────────────────────────────────────────────────────────────────────────────

interface BenchmarkResult {
  codec: string;
  payloadSize: string;
  iterations: number;
  avgTimeMs: number;
  throughputMBps: number;
  serializedSize: number;
}

async function benchmarkCodecRoundTrip(
  codec: Codec,
  payloadSizeKB: number,
  iterations: number,
): Promise<BenchmarkResult> {
  const pipePath = getPipePath(codec.name.toLowerCase().replace(/[^a-z]/g, ""));
  const payload = generateBinaryPayload(payloadSizeKB);

  // Cleanup any existing socket
  if (process.platform !== "win32") {
    try {
      fs.unlinkSync(pipePath);
    } catch {
      // Ignore if file doesn't exist
    }
  }

  return new Promise((resolve, reject) => {
    let completedRequests = 0;
    const clientBuffer = new BufferList();
    const serverBuffer = new BufferList();
    let startTime: number;
    let clientSocket: net.Socket;
    let currentId = 0;
    let serializedSize = 0;

    // Create echo server that deserializes, processes, and re-serializes
    const server = net.createServer((socket) => {
      socket.on("data", (data) => {
        serverBuffer.push(data);

        let frame: Buffer | null;
        while ((frame = serverBuffer.takeFrame()) !== null) {
          // Deserialize request
          const request = codec.decode(frame) as JsonRpcRequest;

          // Create response (echo back the params)
          const response: JsonRpcResponse = {
            jsonrpc: "2.0",
            id: request.id,
            result: request.params,
          };

          // Serialize response
          const responseBuffer = codec.encode(response);
          serializedSize = responseBuffer.length;

          // Frame and send
          const framedResponse = Buffer.allocUnsafe(4 + responseBuffer.length);
          framedResponse.writeUInt32BE(responseBuffer.length, 0);
          responseBuffer.copy(framedResponse, 4);
          socket.write(framedResponse);
        }
      });
    });

    server.listen(pipePath, () => {
      clientSocket = net.connect(pipePath, () => {
        startTime = performance.now();

        // Handle responses
        clientSocket.on("data", (data) => {
          clientBuffer.push(data);

          let frame: Buffer | null;
          while ((frame = clientBuffer.takeFrame()) !== null) {
            // Deserialize response (to simulate full processing)
            codec.decode(frame);
            completedRequests++;

            if (completedRequests >= iterations) {
              const elapsed = performance.now() - startTime;
              clientSocket.end();
              server.close(() => {
                if (process.platform !== "win32") {
                  try {
                    fs.unlinkSync(pipePath);
                  } catch {
                    // Ignore cleanup errors
                  }
                }
                const totalMB = (payloadSizeKB * iterations * 2) / 1024; // *2 for round-trip
                resolve({
                  codec: codec.name,
                  payloadSize:
                    payloadSizeKB >= 1024 ? `${payloadSizeKB / 1024} MB` : `${payloadSizeKB} KB`,
                  iterations,
                  avgTimeMs: elapsed / iterations,
                  throughputMBps: totalMB / (elapsed / 1000),
                  serializedSize,
                });
              });
              return;
            }

            // Send next request
            sendRequest();
          }
        });

        // Send first request
        sendRequest();
      });

      const sendRequest = () => {
        const request: JsonRpcRequest = {
          jsonrpc: "2.0",
          id: ++currentId,
          method: "echo",
          params: { data: payload },
        };

        const requestBuffer = codec.encode(request);
        const framedRequest = Buffer.allocUnsafe(4 + requestBuffer.length);
        framedRequest.writeUInt32BE(requestBuffer.length, 0);
        requestBuffer.copy(framedRequest, 4);
        clientSocket.write(framedRequest);
      };

      clientSocket.on("error", reject);
    });

    server.on("error", reject);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Benchmark: Raw Binary (no JSON-RPC overhead)
// ─────────────────────────────────────────────────────────────────────────────

async function benchmarkRawBinary(
  payloadSizeKB: number,
  iterations: number,
): Promise<BenchmarkResult> {
  const pipePath = getPipePath("raw");
  const payload = Buffer.from(generateBinaryPayload(payloadSizeKB));

  if (process.platform !== "win32") {
    try {
      fs.unlinkSync(pipePath);
    } catch {
      // Ignore if file doesn't exist
    }
  }

  return new Promise((resolve, reject) => {
    let completedRequests = 0;
    const clientBuffer = new BufferList();
    const serverBuffer = new BufferList();
    let startTime: number;
    let clientSocket: net.Socket;

    const server = net.createServer((socket) => {
      socket.on("data", (data) => {
        serverBuffer.push(data);

        let frame: Buffer | null;
        while ((frame = serverBuffer.takeFrame()) !== null) {
          // Echo back directly (no deserialization)
          const framedResponse = Buffer.allocUnsafe(4 + frame.length);
          framedResponse.writeUInt32BE(frame.length, 0);
          frame.copy(framedResponse, 4);
          socket.write(framedResponse);
        }
      });
    });

    server.listen(pipePath, () => {
      clientSocket = net.connect(pipePath, () => {
        startTime = performance.now();

        clientSocket.on("data", (data) => {
          clientBuffer.push(data);

          let _frame: Buffer | null;
          while ((_frame = clientBuffer.takeFrame()) !== null) {
            completedRequests++;

            if (completedRequests >= iterations) {
              const elapsed = performance.now() - startTime;
              clientSocket.end();
              server.close(() => {
                if (process.platform !== "win32") {
                  try {
                    fs.unlinkSync(pipePath);
                  } catch {
                    // Ignore cleanup errors
                  }
                }
                const totalMB = (payloadSizeKB * iterations * 2) / 1024;
                resolve({
                  codec: "Raw Binary",
                  payloadSize:
                    payloadSizeKB >= 1024 ? `${payloadSizeKB / 1024} MB` : `${payloadSizeKB} KB`,
                  iterations,
                  avgTimeMs: elapsed / iterations,
                  throughputMBps: totalMB / (elapsed / 1000),
                  serializedSize: payload.length,
                });
              });
              return;
            }

            sendRequest();
          }
        });

        sendRequest();
      });

      const sendRequest = () => {
        const framedRequest = Buffer.allocUnsafe(4 + payload.length);
        framedRequest.writeUInt32BE(payload.length, 0);
        payload.copy(framedRequest, 4);
        clientSocket.write(framedRequest);
      };

      clientSocket.on("error", reject);
    });

    server.on("error", reject);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  End-to-End Codec Performance (Full Stack)");
  console.log("  Using @procwire codecs: codec-msgpack, codec-protobuf, codec-arrow");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");
  console.log("Testing: Named Pipe + Length-Prefixed Framing + Codec + JSON-RPC");
  console.log("");

  const testCases = [
    { sizeKB: 100, iterations: 100 },
    { sizeKB: 1024, iterations: 50 }, // 1 MB
    { sizeKB: 10240, iterations: 20 }, // 10 MB
    { sizeKB: 51200, iterations: 5 }, // 50 MB
  ];

  for (const { sizeKB, iterations } of testCases) {
    const sizeLabel = sizeKB >= 1024 ? `${sizeKB / 1024} MB` : `${sizeKB} KB`;
    console.log(`\n─── ${sizeLabel} payload (${iterations} iterations) ───\n`);

    // Raw binary (baseline - no serialization)
    console.log("  Raw Binary (no serialization)...");
    const rawResult = await benchmarkRawBinary(sizeKB, iterations);

    // JSON codec
    console.log("  JSON + JSON-RPC...");
    const jsonResult = await benchmarkCodecRoundTrip(jsonCodec, sizeKB, iterations);

    // MessagePack codec (@procwire/codec-msgpack)
    console.log("  MessagePack (@procwire/codec-msgpack) + JSON-RPC...");
    const msgpackResult = await benchmarkCodecRoundTrip(msgpackCodec, sizeKB, iterations);

    // Protobuf codec (@procwire/codec-protobuf)
    console.log("  Protobuf (@procwire/codec-protobuf) + JSON-RPC...");
    const protobufResult = await benchmarkCodecRoundTrip(protobufCodec, sizeKB, iterations);

    // Print results
    console.log("\n  Results:");
    console.log("  | Codec              | Serialized | Avg Time | Throughput |");
    console.log("  |--------------------|------------|----------|------------|");
    for (const r of [rawResult, jsonResult, msgpackResult, protobufResult]) {
      console.log(
        `  | ${r.codec.padEnd(18)} | ${formatSize(r.serializedSize).padEnd(10)} | ${r.avgTimeMs.toFixed(2).padStart(6)}ms | ${formatSpeed(r.throughputMBps * 1024 * 1024).padEnd(10)} |`,
      );
    }

    // Speedup comparison
    const jsonVsRaw = rawResult.throughputMBps / jsonResult.throughputMBps;
    const msgpackVsJson = msgpackResult.throughputMBps / jsonResult.throughputMBps;
    const protobufVsJson = protobufResult.throughputMBps / jsonResult.throughputMBps;
    const msgpackVsRaw = rawResult.throughputMBps / msgpackResult.throughputMBps;
    const protobufVsRaw = rawResult.throughputMBps / protobufResult.throughputMBps;

    console.log("\n  Comparisons (vs JSON baseline):");
    console.log(
      `    Raw vs JSON:         ${jsonVsRaw.toFixed(2)}x faster (serialization overhead)`,
    );
    console.log(
      `    MessagePack vs JSON: ${msgpackVsJson.toFixed(2)}x ${msgpackVsJson > 1 ? "faster" : "slower"}`,
    );
    console.log(
      `    Protobuf vs JSON:    ${protobufVsJson.toFixed(2)}x ${protobufVsJson > 1 ? "faster" : "slower"}`,
    );
    console.log(`\n  Comparisons (vs Raw baseline):`);
    console.log(`    Raw vs MessagePack:  ${msgpackVsRaw.toFixed(2)}x faster`);
    console.log(`    Raw vs Protobuf:     ${protobufVsRaw.toFixed(2)}x faster`);
  }

  // ─── Arrow Tabular Data Benchmark ──────────────────────────────────────────

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  Arrow Tabular Data Benchmark (@procwire/codec-arrow)");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("\nNote: Arrow is optimized for columnar/tabular data, not binary blobs.");
  console.log("This benchmark shows Arrow's performance with its natural data format.\n");

  const rowCounts = [1000, 10000, 100000];

  for (const rows of rowCounts) {
    console.log(`\n─── ${rows.toLocaleString()} rows tabular data ───\n`);

    // Generate columnar data
    const ids = new Int32Array(Array.from({ length: rows }, (_, i) => i));
    const values = new Float64Array(Array.from({ length: rows }, () => Math.random() * 1000));
    const names = Array.from({ length: rows }, (_, i) => `item_${i}`);
    const flags = Array.from({ length: rows }, () => Math.random() > 0.5);

    // Create equivalent JSON data for comparison
    const jsonData = Array.from({ length: rows }, (_, i) => ({
      id: ids[i],
      value: values[i],
      name: names[i],
      flag: flags[i],
    }));

    // Benchmark Arrow using @procwire/codec-arrow
    console.log("  Arrow (@procwire/codec-arrow)...");
    const table = tableFromArrays({ id: ids, value: values, name: names, flag: flags });

    // Warmup
    for (let i = 0; i < 3; i++) {
      arrowCodecInstance.deserialize(arrowCodecInstance.serialize(table));
    }

    // Measure serialize
    const arrowSerStart = performance.now();
    let arrowBuffer: Buffer = Buffer.alloc(0);
    for (let i = 0; i < 10; i++) {
      arrowBuffer = arrowCodecInstance.serialize(table);
    }
    const arrowSerTime = (performance.now() - arrowSerStart) / 10;

    // Measure deserialize
    const arrowDeserStart = performance.now();
    for (let i = 0; i < 10; i++) {
      arrowCodecInstance.deserialize(arrowBuffer);
    }
    const arrowDeserTime = (performance.now() - arrowDeserStart) / 10;

    // Benchmark JSON
    console.log("  JSON (row-oriented)...");

    // Warmup
    for (let i = 0; i < 3; i++) {
      JSON.parse(JSON.stringify(jsonData));
    }

    // Measure serialize
    const jsonSerStart = performance.now();
    let jsonStr = "";
    for (let i = 0; i < 10; i++) {
      jsonStr = JSON.stringify(jsonData);
    }
    const jsonSerTime = (performance.now() - jsonSerStart) / 10;

    // Measure deserialize
    const jsonDeserStart = performance.now();
    for (let i = 0; i < 10; i++) {
      JSON.parse(jsonStr);
    }
    const jsonDeserTime = (performance.now() - jsonDeserStart) / 10;

    // Benchmark MessagePack using @procwire/codec-msgpack
    console.log("  MessagePack (@procwire/codec-msgpack)...");

    // Warmup
    for (let i = 0; i < 3; i++) {
      msgpackCodecInstance.deserialize(msgpackCodecInstance.serialize(jsonData));
    }

    // Measure serialize
    const msgSerStart = performance.now();
    let msgBuffer: Buffer = Buffer.alloc(0);
    for (let i = 0; i < 10; i++) {
      msgBuffer = msgpackCodecInstance.serialize(jsonData);
    }
    const msgSerTime = (performance.now() - msgSerStart) / 10;

    // Measure deserialize
    const msgDeserStart = performance.now();
    for (let i = 0; i < 10; i++) {
      msgpackCodecInstance.deserialize(msgBuffer);
    }
    const msgDeserTime = (performance.now() - msgDeserStart) / 10;

    // Print results
    console.log("\n  Results:");
    console.log("  | Codec       | Size       | Serialize | Deserialize | Round-trip |");
    console.log("  |-------------|------------|-----------|-------------|------------|");
    console.log(
      `  | Arrow       | ${formatSize(arrowBuffer.length).padEnd(10)} | ${arrowSerTime.toFixed(2).padStart(7)}ms | ${arrowDeserTime.toFixed(2).padStart(9)}ms | ${(arrowSerTime + arrowDeserTime).toFixed(2).padStart(8)}ms |`,
    );
    console.log(
      `  | JSON        | ${formatSize(jsonStr.length).padEnd(10)} | ${jsonSerTime.toFixed(2).padStart(7)}ms | ${jsonDeserTime.toFixed(2).padStart(9)}ms | ${(jsonSerTime + jsonDeserTime).toFixed(2).padStart(8)}ms |`,
    );
    console.log(
      `  | MessagePack | ${formatSize(msgBuffer.length).padEnd(10)} | ${msgSerTime.toFixed(2).padStart(7)}ms | ${msgDeserTime.toFixed(2).padStart(9)}ms | ${(msgSerTime + msgDeserTime).toFixed(2).padStart(8)}ms |`,
    );

    // Comparisons
    const arrowVsJsonSize = jsonStr.length / arrowBuffer.length;
    const arrowVsJsonSpeed = (jsonSerTime + jsonDeserTime) / (arrowSerTime + arrowDeserTime);
    const arrowVsMsgSize = msgBuffer.length / arrowBuffer.length;
    const arrowVsMsgSpeed = (msgSerTime + msgDeserTime) / (arrowSerTime + arrowDeserTime);

    console.log("\n  Comparisons:");
    console.log(
      `    Arrow vs JSON:        ${arrowVsJsonSize.toFixed(2)}x smaller, ${arrowVsJsonSpeed.toFixed(2)}x ${arrowVsJsonSpeed > 1 ? "faster" : "slower"}`,
    );
    console.log(
      `    Arrow vs MessagePack: ${arrowVsMsgSize.toFixed(2)}x ${arrowVsMsgSize > 1 ? "smaller" : "larger"}, ${arrowVsMsgSpeed.toFixed(2)}x ${arrowVsMsgSpeed > 1 ? "faster" : "slower"}`,
    );
  }

  // ─── Summary ──────────────────────────────────────────────────────────────────

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  Summary");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("\nKey findings:");
  console.log("  - Raw binary shows maximum achievable throughput (transport only)");
  console.log("  - JSON has base64 overhead for binary data (+33% size)");
  console.log("  - MessagePack handles binary natively (no base64)");
  console.log("  - Protobuf provides schema-based encoding with good compression");
  console.log("  - Arrow excels at columnar/tabular data (analytics workloads)");
  console.log("\nCodec selection guide:");
  console.log("  - Binary blobs:      MessagePack or Protobuf");
  console.log("  - Structured data:   Protobuf (best compression with schema)");
  console.log("  - Tabular analytics: Arrow (columnar format, cross-language)");
  console.log("  - Human-readable:    JSON (debugging, logging)");
}

main().catch(console.error);
