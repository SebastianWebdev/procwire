#!/usr/bin/env npx tsx
/**
 * Worker with data channel support for integration tests.
 *
 * This worker initializes a data channel (socket/named pipe) in addition
 * to the control channel (stdio). It supports both channels for
 * receiving requests.
 */

import { createWorker } from "@procwire/sdk";

const worker = createWorker({
  name: "data-channel-worker",
  debug: process.env.DEBUG === "true",
  // Enable data channel - reads path from PROCWIRE_DATA_PATH env var
  dataChannel: {},
});

// Echo - returns params as-is (works on both channels)
worker.handle("echo", (params) => {
  return params;
});

// Return large payload (useful for testing data channel with big data)
worker.handle("generate_payload", (params: { sizeKB: number }) => {
  const data = "x".repeat(params.sizeKB * 1024);
  return { data, size: data.length };
});

// Process large payload and return checksum-like value
worker.handle("process_payload", (params: { data: string }) => {
  // Simple checksum: sum of char codes
  let checksum = 0;
  for (let i = 0; i < params.data.length; i++) {
    checksum += params.data.charCodeAt(i);
  }
  return {
    receivedSize: params.data.length,
    checksum: checksum % 1000000,
  };
});

// Return which channel received the request (for testing routing)
worker.handle("identify_channel", (_params, context) => {
  return {
    channel: context.channel,
    requestId: context.requestId,
  };
});

// Ping for health check
worker.handle("ping", () => {
  return { pong: true, timestamp: Date.now() };
});

// Get process info
worker.handle("get_info", () => {
  return {
    pid: process.pid,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    hasDataChannel: !!process.env.PROCWIRE_DATA_PATH,
  };
});

// Lifecycle hooks
worker.hooks({
  onReady: () => {
    if (process.env.DEBUG === "true") {
      console.error("[data-channel-worker] Ready");
      console.error(`[data-channel-worker] Data path: ${process.env.PROCWIRE_DATA_PATH}`);
    }
  },
  onShutdown: (reason) => {
    if (process.env.DEBUG === "true") {
      console.error(`[data-channel-worker] Shutdown: ${reason}`);
    }
  },
});

worker.start().catch((error) => {
  console.error("[data-channel-worker] Fatal error:", error);
  process.exit(1);
});
