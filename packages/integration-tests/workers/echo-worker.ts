#!/usr/bin/env npx tsx
/**
 * Echo worker for basic integration tests.
 * Echoes back whatever params it receives.
 */

import { createWorker } from "@procwire/sdk";

const worker = createWorker({
  name: "echo-worker",
  debug: process.env.DEBUG === "true",
});

// Simple echo - returns params as-is
worker.handle("echo", (params) => {
  return params;
});

// Add two numbers
worker.handle("add", (params: { a: number; b: number }) => {
  return { sum: params.a + params.b };
});

// Multiply two numbers
worker.handle("multiply", (params: { a: number; b: number }) => {
  return { product: params.a * params.b };
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
  };
});

// Lifecycle hooks
worker.hooks({
  onReady: () => {
    if (process.env.DEBUG === "true") {
      console.error("[echo-worker] Ready");
    }
  },
  onShutdown: (reason) => {
    if (process.env.DEBUG === "true") {
      console.error(`[echo-worker] Shutdown: ${reason}`);
    }
  },
});

worker.start().catch((error) => {
  console.error("[echo-worker] Fatal error:", error);
  process.exit(1);
});
