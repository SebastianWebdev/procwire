#!/usr/bin/env npx tsx
/**
 * Echo worker fixture for integration tests.
 * Simply echoes back whatever params it receives.
 */

import { createWorker } from "../../../src/index.js";

const worker = createWorker({
  name: "echo-worker",
  debug: process.env.DEBUG === "true",
});

// Echo handler - returns params as-is
worker.handle("echo", (params) => {
  return params;
});

// Slow echo - adds configurable delay
worker.handle("slow_echo", async (params: { message: string; delay?: number }) => {
  const delay = params.delay ?? 100;
  await new Promise((resolve) => setTimeout(resolve, delay));
  return { message: params.message, delayed_by: delay };
});

// Add handler
worker.handle("add", (params: { a: number; b: number }) => {
  return { sum: params.a + params.b };
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

// Start worker
worker.start().catch((error) => {
  console.error("[echo-worker] Fatal error:", error);
  process.exit(1);
});
