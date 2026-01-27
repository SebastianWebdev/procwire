#!/usr/bin/env npx tsx
/**
 * Slow worker for timeout and delay testing.
 * All operations have configurable delays.
 */

import { createWorker } from "@procwire/sdk";

const worker = createWorker({
  name: "slow-worker",
  debug: process.env.DEBUG === "true",
});

// Slow echo - adds configurable delay
worker.handle("slow_echo", async (params: { message: string; delay?: number }) => {
  const delay = params.delay ?? 100;
  await new Promise((resolve) => setTimeout(resolve, delay));
  return { message: params.message, delayed_by: delay };
});

// Variable delay - returns after specified milliseconds
worker.handle("delay", async (params: { ms: number }) => {
  await new Promise((resolve) => setTimeout(resolve, params.ms));
  return { delayed: true, ms: params.ms };
});

// Delay then echo
worker.handle("delayed_echo", async (params: { data: unknown; delay: number }) => {
  await new Promise((resolve) => setTimeout(resolve, params.delay));
  return params.data;
});

// Delay then throw error
worker.handle("delayed_error", async (params: { message: string; delay: number }) => {
  await new Promise((resolve) => setTimeout(resolve, params.delay));
  throw new Error(params.message);
});

// Infinite delay (for timeout testing) - will be cancelled
worker.handle("hang", async (_params, context) => {
  // Wait until aborted
  return new Promise((resolve, reject) => {
    const checkAbort = setInterval(() => {
      if (context.signal.aborted) {
        clearInterval(checkAbort);
        reject(new Error("Request cancelled"));
      }
    }, 100);

    // Never resolves normally - will timeout or be cancelled
  });
});

// Step-by-step processing with delays
worker.handle("slow_steps", async (params: { steps: number; step_delay: number }, context) => {
  const results: number[] = [];

  for (let i = 0; i < params.steps; i++) {
    if (context.signal.aborted) {
      throw new Error("Cancelled during step " + i);
    }

    await new Promise((r) => setTimeout(r, params.step_delay));
    results.push(i);
  }

  return { completed: true, steps: results };
});

worker.hooks({
  onReady: () => {
    if (process.env.DEBUG === "true") {
      console.error("[slow-worker] Ready");
    }
  },
  onShutdown: (reason) => {
    if (process.env.DEBUG === "true") {
      console.error(`[slow-worker] Shutdown: ${reason}`);
    }
  },
});

worker.start().catch((error) => {
  console.error("[slow-worker] Fatal error:", error);
  process.exit(1);
});
