#!/usr/bin/env npx tsx
/**
 * Protobuf over pipe worker - Codec benchmark.
 *
 * This worker uses the data channel with Protocol Buffers serialization.
 * Best for schema-validated, cross-language, compact payloads.
 *
 * Note: Protobuf requires the same schema on both sides. For benchmarking,
 * we use a simple BenchmarkPayload schema that can handle variable-size data.
 */

import { createWorker } from "@procwire/sdk";
import { createCodecFromJSON } from "@procwire/codec-protobuf";

// ─────────────────────────────────────────────────────────────────────────────
// Schema Definition (must match manager side)
// ─────────────────────────────────────────────────────────────────────────────

// This schema is designed for benchmarking with variable payload sizes
export const benchmarkPayloadSchema = {
  nested: {
    BenchmarkPayload: {
      fields: {
        id: { type: "int32", id: 1 },
        name: { type: "string", id: 2 },
        data: { type: "string", id: 3 }, // Variable size string
        items: { type: "int32", id: 4, rule: "repeated" }, // Array of numbers
      },
    },
    BenchmarkResult: {
      fields: {
        receivedId: { type: "int32", id: 1 },
        receivedName: { type: "string", id: 2 },
        dataSize: { type: "int32", id: 3 },
        itemsCount: { type: "int32", id: 4 },
        checksum: { type: "int32", id: 5 },
      },
    },
  },
};

export interface BenchmarkPayload {
  id: number;
  name: string;
  data: string;
  items: number[];
}

export interface BenchmarkResult {
  receivedId: number;
  receivedName: string;
  dataSize: number;
  itemsCount: number;
  checksum: number;
}

// Create codec for data channel
const payloadCodec = createCodecFromJSON<BenchmarkPayload>(
  benchmarkPayloadSchema,
  "BenchmarkPayload",
);

const worker = createWorker({
  name: "protobuf-worker",
  debug: process.env.DEBUG === "true",
  dataChannel: {
    serialization: payloadCodec,
  },
});

// Echo - returns params as-is (control channel)
worker.handle("echo", (params) => {
  return params;
});

// Process structured payload and return stats
worker.handle("process_payload", (params: BenchmarkPayload) => {
  let checksum = 0;
  for (let i = 0; i < params.data.length; i++) {
    checksum += params.data.charCodeAt(i);
  }
  for (const item of params.items) {
    checksum += item;
  }
  return {
    receivedId: params.id,
    receivedName: params.name,
    dataSize: params.data.length,
    itemsCount: params.items.length,
    checksum: checksum % 1000000,
  };
});

// Ping for health check
worker.handle("ping", () => {
  return { pong: true, timestamp: Date.now() };
});

worker.hooks({
  onReady: () => {
    if (process.env.DEBUG === "true") {
      console.error("[protobuf-worker] Ready");
      console.error(`[protobuf-worker] Data path: ${process.env.PROCWIRE_DATA_PATH}`);
    }
  },
});

worker.start().catch((error) => {
  console.error("[protobuf-worker] Fatal error:", error);
  process.exit(1);
});
