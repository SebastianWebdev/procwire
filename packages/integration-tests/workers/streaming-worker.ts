#!/usr/bin/env npx tsx
/**
 * Streaming worker for testing data streaming scenarios.
 * Generates or processes streams of data.
 */

import { createWorker } from "@procwire/sdk";

const worker = createWorker({
  name: "streaming-worker",
  debug: process.env.DEBUG === "true",
});

// Generate sequence of numbers
worker.handle("generate_sequence", async (params: { count: number; delay?: number }) => {
  const sequence: number[] = [];
  const delayMs = params.delay ?? 0;

  for (let i = 0; i < params.count; i++) {
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
    sequence.push(i);
  }

  return { sequence, count: params.count };
});

// Process array of items
worker.handle("process_batch", (params: { items: unknown[] }) => {
  const processed = params.items.map((item, index) => ({
    index,
    original: item,
    processed: true,
  }));

  return { processed, count: params.items.length };
});

// Echo large payload
worker.handle("echo_large", (params: { data: string }) => {
  return { data: params.data, size: params.data.length };
});

// Generate large response
worker.handle("generate_large", (params: { size: number }) => {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let data = "";
  for (let i = 0; i < params.size; i++) {
    data += chars[Math.floor(Math.random() * chars.length)];
  }
  return { data, size: params.size };
});

// Transform array items
worker.handle(
  "transform_items",
  (params: { items: Array<{ id: number; value: number }> }) => {
    return {
      items: params.items.map((item) => ({
        ...item,
        value: item.value * 2,
        transformed: true,
      })),
    };
  },
);

// Aggregate values
worker.handle("aggregate", (params: { values: number[] }) => {
  const sum = params.values.reduce((a, b) => a + b, 0);
  const avg = sum / params.values.length;
  const min = Math.min(...params.values);
  const max = Math.max(...params.values);

  return { sum, avg, min, max, count: params.values.length };
});

// Chunk data
worker.handle("chunk_data", (params: { data: string; chunkSize: number }) => {
  const chunks: string[] = [];
  for (let i = 0; i < params.data.length; i += params.chunkSize) {
    chunks.push(params.data.slice(i, i + params.chunkSize));
  }
  return { chunks, chunkCount: chunks.length };
});

worker.hooks({
  onReady: () => {
    if (process.env.DEBUG === "true") {
      console.error("[streaming-worker] Ready");
    }
  },
  onShutdown: (reason) => {
    if (process.env.DEBUG === "true") {
      console.error(`[streaming-worker] Shutdown: ${reason}`);
    }
  },
});

worker.start().catch((error) => {
  console.error("[streaming-worker] Fatal error:", error);
  process.exit(1);
});
