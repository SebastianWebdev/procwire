#!/usr/bin/env npx tsx
/**
 * Compute worker for stress testing.
 * Performs CPU-intensive operations with configurable delays.
 */

import { createWorker } from "@procwire/sdk";

const worker = createWorker({
  name: "compute-worker",
  debug: process.env.DEBUG === "true",
});

// Simple addition
worker.handle("add", (params: { a: number; b: number }) => {
  return { sum: params.a + params.b };
});

// Slow computation with configurable delay
worker.handle("slow_compute", async (params: { delay: number; value: string }) => {
  await new Promise((r) => setTimeout(r, params.delay));
  return { value: params.value, delayed_by: params.delay };
});

// CPU-intensive computation (fibonacci)
worker.handle("fibonacci", (params: { n: number }) => {
  const fib = (n: number): number => {
    if (n <= 1) return n;
    return fib(n - 1) + fib(n - 2);
  };
  return { result: fib(Math.min(params.n, 30)) }; // Cap to prevent too long execution
});

// Matrix multiplication (memory + CPU)
worker.handle("matrix_multiply", (params: { size: number }) => {
  const size = Math.min(params.size, 100); // Cap size
  const a = Array.from({ length: size }, () => Array.from({ length: size }, () => Math.random()));
  const b = Array.from({ length: size }, () => Array.from({ length: size }, () => Math.random()));

  const c = Array.from({ length: size }, () => Array(size).fill(0) as number[]);

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      for (let k = 0; k < size; k++) {
        c[i]![j]! += a[i]![k]! * b[k]![j]!;
      }
    }
  }

  return { size, checksum: (c[0]?.[0] ?? 0) + (c[size - 1]?.[size - 1] ?? 0) };
});

// Echo with timestamp
worker.handle("echo", (params: Record<string, unknown>) => {
  return { ...params, processed_at: Date.now() };
});

// Concurrent counter for testing
let concurrentCount = 0;
let maxConcurrent = 0;

worker.handle("reset_concurrent", () => {
  concurrentCount = 0;
  maxConcurrent = 0;
  return { reset: true };
});

worker.handle("concurrent_test", async (params: { id: number; delay: number }) => {
  concurrentCount++;
  maxConcurrent = Math.max(maxConcurrent, concurrentCount);

  await new Promise((r) => setTimeout(r, params.delay));

  concurrentCount--;
  return { id: params.id, max_concurrent: maxConcurrent };
});

worker.handle("get_max_concurrent", () => {
  return { max: maxConcurrent };
});

// Long running task with steps
worker.handle("long_task", async (params: { steps: number; step_delay: number }, context) => {
  const results: number[] = [];

  for (let i = 0; i < params.steps; i++) {
    if (context.signal.aborted) {
      throw new Error("Task cancelled");
    }
    await new Promise((r) => setTimeout(r, params.step_delay));
    results.push(i);
  }

  return { completed: true, results };
});

worker.hooks({
  onReady: () => {
    if (process.env.DEBUG === "true") {
      console.error("[compute-worker] Ready");
    }
  },
  onShutdown: (reason) => {
    if (process.env.DEBUG === "true") {
      console.error(`[compute-worker] Shutdown: ${reason}`);
    }
  },
});

worker.start().catch((error) => {
  console.error("[compute-worker] Fatal error:", error);
  process.exit(1);
});
