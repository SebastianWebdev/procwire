#!/usr/bin/env npx tsx
/**
 * Crash worker for testing crash recovery scenarios.
 * Can be instructed to crash in various ways.
 */

import { createWorker } from "@procwire/sdk";

const worker = createWorker({
  name: "crash-worker",
  debug: process.env.DEBUG === "true",
});

// Normal echo (for baseline tests)
worker.handle("echo", (params) => {
  return params;
});

// Exit immediately with code
worker.handle("exit", (params: { code?: number }) => {
  process.exit(params.code ?? 0);
});

// Exit after delay
worker.handle("exit_delayed", async (params: { code?: number; delay: number }) => {
  await new Promise((r) => setTimeout(r, params.delay));
  process.exit(params.code ?? 0);
});

// Crash with uncaught exception
worker.handle("crash_throw", () => {
  // This will crash the process since it's outside try-catch
  setTimeout(() => {
    throw new Error("Uncaught exception crash");
  }, 10);
  return { crashing: true };
});

// Crash with unhandled rejection
worker.handle("crash_reject", () => {
  setTimeout(() => {
    Promise.reject(new Error("Unhandled rejection crash"));
  }, 10);
  return { crashing: true };
});

// Memory exhaustion (careful with this one)
worker.handle("crash_memory", () => {
  const arrays: number[][] = [];
  // This will cause out of memory
  try {
    while (true) {
      arrays.push(new Array(1000000).fill(0));
    }
  } catch {
    process.exit(137); // OOM kill code
  }
});

// Kill self with signal
worker.handle("crash_signal", (params: { signal?: string }) => {
  const signal = params.signal ?? "SIGKILL";
  process.kill(process.pid, signal as NodeJS.Signals);
  return { sent_signal: signal };
});

// Hang forever (simulate stuck process)
worker.handle("hang", () => {
  // Block event loop with sync loop
  while (true) {
    // Infinite loop - process will need to be killed
  }
});

// Crash after N requests
let requestCount = 0;

worker.handle("reset_count", () => {
  requestCount = 0;
  return { count: 0 };
});

worker.handle("count_then_crash", (params: { crash_after: number }) => {
  requestCount++;
  if (requestCount >= params.crash_after) {
    process.exit(1);
  }
  return { count: requestCount };
});

worker.hooks({
  onReady: () => {
    if (process.env.DEBUG === "true") {
      console.error("[crash-worker] Ready");
    }
  },
  onShutdown: (reason) => {
    if (process.env.DEBUG === "true") {
      console.error(`[crash-worker] Shutdown: ${reason}`);
    }
  },
});

worker.start().catch((error) => {
  console.error("[crash-worker] Fatal error:", error);
  process.exit(1);
});
