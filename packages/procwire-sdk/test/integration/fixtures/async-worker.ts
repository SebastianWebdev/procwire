#!/usr/bin/env npx tsx
/**
 * Async worker fixture for testing async handlers and concurrency.
 */

import { createWorker } from "../../../src/index.js";

const worker = createWorker({
  name: "async-worker",
  debug: process.env.DEBUG === "true",
});

// Track concurrent requests
let concurrentRequests = 0;
let maxConcurrent = 0;

worker.handle("concurrent_test", async (params: { id: number; delay: number }) => {
  concurrentRequests++;
  maxConcurrent = Math.max(maxConcurrent, concurrentRequests);

  await new Promise((resolve) => setTimeout(resolve, params.delay));

  concurrentRequests--;

  return {
    id: params.id,
    concurrent_at_start: maxConcurrent,
  };
});

worker.handle("get_max_concurrent", () => {
  return { max: maxConcurrent };
});

worker.handle("reset_concurrent", () => {
  maxConcurrent = 0;
  return { reset: true };
});

// Long-running task with progress
worker.handle("long_task", async (params: { steps: number; step_delay: number }) => {
  const results: number[] = [];

  for (let i = 0; i < params.steps; i++) {
    await new Promise((resolve) => setTimeout(resolve, params.step_delay));
    results.push(i);
  }

  return { completed: true, results };
});

worker.start().catch((error) => {
  console.error("[async-worker] Fatal error:", error);
  process.exit(1);
});
