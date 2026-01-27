#!/usr/bin/env npx tsx
/**
 * Error worker for testing error handling scenarios.
 * Various ways to produce errors.
 */

import { createWorker } from "@procwire/sdk";

const worker = createWorker({
  name: "error-worker",
  debug: process.env.DEBUG === "true",
});

// Throw synchronous error
worker.handle("throw_sync", () => {
  throw new Error("Sync error");
});

// Throw async error
worker.handle("throw_async", async () => {
  await new Promise((r) => setTimeout(r, 10));
  throw new Error("Async error");
});

// Return error object (not thrown)
worker.handle("return_error", () => {
  return { error: "This is an error object, not a thrown error" };
});

// Throw custom error type
worker.handle("throw_custom", (params: { code: string; message: string }) => {
  const error = new Error(params.message);
  (error as Error & { code: string }).code = params.code;
  throw error;
});

// Throw after delay
worker.handle("throw_delayed", async (params: { message: string; delay: number }) => {
  await new Promise((r) => setTimeout(r, params.delay));
  throw new Error(params.message);
});

// Conditional error
worker.handle("maybe_error", (params: { should_error: boolean; value: unknown }) => {
  if (params.should_error) {
    throw new Error("Conditional error triggered");
  }
  return params.value;
});

// Nested error
worker.handle("nested_error", () => {
  try {
    throw new Error("Inner error");
  } catch (inner) {
    throw new Error(`Outer error: ${(inner as Error).message}`);
  }
});

// Reject promise (not throw)
worker.handle("reject_promise", () => {
  return Promise.reject(new Error("Rejected promise"));
});

// Return null
worker.handle("return_null", () => {
  return null;
});

// Return undefined
worker.handle("return_undefined", () => {
  return undefined;
});

// Echo for baseline
worker.handle("echo", (params) => {
  return params;
});

worker.hooks({
  onReady: () => {
    if (process.env.DEBUG === "true") {
      console.error("[error-worker] Ready");
    }
  },
  onShutdown: (reason) => {
    if (process.env.DEBUG === "true") {
      console.error(`[error-worker] Shutdown: ${reason}`);
    }
  },
  onError: (error) => {
    if (process.env.DEBUG === "true") {
      console.error(`[error-worker] Error: ${error.message}`);
    }
  },
});

worker.start().catch((error) => {
  console.error("[error-worker] Fatal error:", error);
  process.exit(1);
});
