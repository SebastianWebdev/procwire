#!/usr/bin/env npx tsx
/**
 * JSON over stdio worker - Lower baseline benchmark.
 *
 * This worker uses only the control channel (stdio) with JSON serialization.
 * Represents the traditional way of doing IPC without procwire's data channel.
 */

import { createWorker } from "@procwire/sdk";

const worker = createWorker({
  name: "json-stdio-worker",
  debug: process.env.DEBUG === "true",
  // No data channel - only stdio
});

// Echo - returns params as-is
worker.handle("echo", (params) => {
  return params;
});

// Process payload and return stats
worker.handle("process_payload", (params: { data: string }) => {
  let checksum = 0;
  for (let i = 0; i < params.data.length; i++) {
    checksum += params.data.charCodeAt(i);
  }
  return {
    receivedSize: params.data.length,
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
      console.error("[json-stdio-worker] Ready");
    }
  },
});

worker.start().catch((error) => {
  console.error("[json-stdio-worker] Fatal error:", error);
  process.exit(1);
});
