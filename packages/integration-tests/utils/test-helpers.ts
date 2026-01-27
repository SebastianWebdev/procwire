/**
 * Shared test utilities for integration tests.
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { ReservedMethods, PipePath } from "@procwire/transport";
import type { ProcessManager, IProcessHandle } from "@procwire/transport";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Get absolute path to a worker fixture.
 */
export function createWorkerPath(workerName: string): string {
  return path.join(__dirname, "..", "workers", workerName);
}

/**
 * Filter environment variables to remove undefined values.
 */
export function filterEnv(extra?: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  if (extra) {
    Object.assign(result, extra);
  }
  return result;
}

/**
 * Spawn a worker using tsx and complete the handshake.
 */
export async function spawnWorker(
  manager: ProcessManager,
  id: string,
  workerName: string,
  env?: Record<string, string>,
): Promise<IProcessHandle> {
  const workerPath = createWorkerPath(workerName);

  const handle = await manager.spawn(id, {
    executablePath: "node",
    args: ["--import", "tsx", workerPath],
    env: filterEnv(env),
  });

  // Complete handshake using SDK-expected field names
  await handle.request(ReservedMethods.HANDSHAKE, {
    version: "1.0",
    capabilities: ["heartbeat"],
  });

  return handle;
}

/**
 * Measure execution time of an async function.
 */
export async function measureTime<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; elapsed: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, elapsed: Date.now() - start };
}

/**
 * Wait for a condition with timeout.
 */
export function waitFor(
  condition: () => boolean,
  timeoutMs: number = 5000,
  intervalMs: number = 50,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const check = () => {
      if (condition()) {
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timeout waiting for condition after ${timeoutMs}ms`));
      } else {
        setTimeout(check, intervalMs);
      }
    };

    check();
  });
}

/**
 * Wait for a specified duration.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a deferred promise for async coordination.
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Retry an operation with exponential backoff.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
  } = {},
): Promise<T> {
  const { maxAttempts = 3, initialDelayMs = 100, maxDelayMs = 5000 } = options;

  let lastError: Error | undefined;
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxAttempts) {
        await delay(delayMs);
        delayMs = Math.min(delayMs * 2, maxDelayMs);
      }
    }
  }

  throw lastError;
}

/**
 * Spawn a worker with data channel enabled.
 * Uses named pipes (Windows) or Unix sockets (macOS/Linux) for the data channel.
 *
 * This helper:
 * 1. Spawns the worker with dataChannel option enabled
 * 2. Completes the handshake
 * 3. Waits for the data channel to become ready (worker sends __data_channel_ready__)
 */
export async function spawnWorkerWithDataChannel(
  manager: ProcessManager,
  id: string,
  workerName: string,
  env?: Record<string, string>,
): Promise<IProcessHandle> {
  const workerPath = createWorkerPath(workerName);
  const dataPath = PipePath.forModule("integration-test", id);

  // Create a promise to wait for data channel ready
  const dataChannelReady = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timeout waiting for data channel ready"));
    }, 10000);

    const unsubscribe = manager.on("dataChannelReady", (eventUnknown) => {
      const event = eventUnknown as { id: string; path: string };
      if (event.id === id) {
        clearTimeout(timeout);
        unsubscribe();
        resolve();
      }
    });

    // Also listen for errors
    const errorUnsub = manager.on("error", (eventUnknown) => {
      const event = eventUnknown as { id: string; error: Error };
      if (event.id === id && event.error.message.includes("Data channel")) {
        clearTimeout(timeout);
        unsubscribe();
        errorUnsub();
        reject(event.error);
      }
    });
  });

  const handle = await manager.spawn(id, {
    executablePath: "node",
    args: ["--import", "tsx", workerPath],
    env: filterEnv({
      ...env,
      PROCWIRE_DATA_PATH: dataPath,
    }),
    dataChannel: {
      enabled: true,
      path: dataPath,
    },
  });

  // Complete handshake with data_channel capability
  // This triggers worker to start the socket server and send __data_channel_ready__
  await handle.request(ReservedMethods.HANDSHAKE, {
    version: "1.0",
    capabilities: ["heartbeat", "data_channel"],
    data_channel: {
      path: dataPath,
      serialization: "json",
    },
  });

  // Wait for data channel to be connected
  await dataChannelReady;

  return handle;
}

/**
 * Generate a payload of specified size for testing.
 */
export function generatePayload(sizeKB: number): { data: string; size: number } {
  const data = "x".repeat(sizeKB * 1024);
  return { data, size: sizeKB * 1024 };
}
