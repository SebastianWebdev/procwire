#!/usr/bin/env npx tsx
/**
 * Error worker fixture for testing error handling.
 */

import { createWorker } from "../../../src/index.js";

const worker = createWorker({
  name: "error-worker",
  debug: process.env.DEBUG === "true",
});

// Throws a sync error
worker.handle("throw_sync", () => {
  throw new Error("Intentional sync error");
});

// Throws an async error
worker.handle("throw_async", async () => {
  await new Promise((resolve) => setTimeout(resolve, 10));
  throw new Error("Intentional async error");
});

// Returns error object (not throwing)
worker.handle("return_error", () => {
  return { error: "This is an error object, not a thrown error" };
});

// Throws with custom error class
class CustomError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "CustomError";
  }
}

worker.handle("throw_custom", () => {
  throw new CustomError("ERR_CUSTOM", "Custom error with code");
});

worker.start().catch((error) => {
  console.error("[error-worker] Fatal error:", error);
  process.exit(1);
});
