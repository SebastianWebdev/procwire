#!/usr/bin/env npx tsx
/**
 * Raw pipe worker - Upper baseline benchmark.
 *
 * This worker uses the data channel (named pipes/unix sockets) with JSON codec.
 * Measures transport overhead of named pipes vs stdio.
 *
 * Note: RawCodec cannot be used with JSON-RPC protocol because RawCodec
 * expects Buffer input/output but JSON-RPC creates JavaScript objects.
 * True raw binary mode would require a different protocol (SimpleProtocol).
 */

import { createWorker } from "@procwire/sdk";

const worker = createWorker({
  name: "raw-pipe-worker",
  debug: process.env.DEBUG === "true",
  dataChannel: {
    // Using default JSON codec - RawCodec is incompatible with JSON-RPC protocol
  },
});

// Echo - returns params as-is (control channel for handshake etc.)
worker.handle("echo", (params) => {
  return params;
});

// Process payload via data channel
// Note: Without true raw mode, params is JSON-serialized
worker.handle("process_raw", (params: { data: string } | Buffer) => {
  // Handle both Buffer (if raw) and object (if JSON)
  const data = Buffer.isBuffer(params) ? params : Buffer.from(params.data || "", "utf8");

  // Simple checksum: sum of bytes
  let checksum = 0;
  for (let i = 0; i < data.length; i++) {
    checksum += data[i]!;
  }
  return {
    receivedSize: data.length,
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
      console.error("[raw-pipe-worker] Ready");
      console.error(`[raw-pipe-worker] Data path: ${process.env.PROCWIRE_DATA_PATH}`);
    }
  },
});

worker.start().catch((error) => {
  console.error("[raw-pipe-worker] Fatal error:", error);
  process.exit(1);
});
