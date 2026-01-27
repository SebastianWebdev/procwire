/**
 * Performance measurement utilities for stress tests.
 */

import type { IProcessHandle } from "@procwire/transport";

export interface ThroughputResult {
  messagesPerSecond: number;
  errors: number;
  totalMessages: number;
  durationMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
}

/**
 * Measure throughput over a duration.
 *
 * Note: This uses batched requests to overcome setTimeout's minimum resolution (~15ms on Windows).
 * For high target RPS, we send multiple requests per timer tick.
 */
export async function measureThroughput(options: {
  handle: IProcessHandle;
  method: string;
  durationMs: number;
  targetRps: number;
  payload?: Record<string, unknown>;
}): Promise<ThroughputResult> {
  const { handle, method, durationMs, targetRps, payload = {} } = options;

  const startTime = Date.now();
  const endTime = startTime + durationMs;

  // setTimeout has minimum resolution of ~15ms on Windows, ~1ms on Linux
  // So for high RPS we batch multiple requests per timer tick
  const timerResolutionMs = 16; // Assume worst case (Windows)
  const requestsPerTick = Math.max(1, Math.ceil((targetRps * timerResolutionMs) / 1000));
  const tickIntervalMs = Math.max(1, Math.floor(1000 / targetRps) * requestsPerTick);

  let totalMessages = 0;
  let errors = 0;
  const latencies: number[] = [];
  const pending: Promise<void>[] = [];

  while (Date.now() < endTime) {
    // Send batch of requests
    for (let i = 0; i < requestsPerTick && Date.now() < endTime; i++) {
      const requestStart = Date.now();

      const promise = handle
        .request(method, { ...payload, timestamp: requestStart })
        .then(() => {
          latencies.push(Date.now() - requestStart);
          totalMessages++;
        })
        .catch(() => {
          errors++;
        });

      pending.push(promise);
    }

    // Rate limiting - use setImmediate for high throughput, setTimeout for lower
    if (tickIntervalMs <= 1) {
      await new Promise((r) => setImmediate(r));
    } else {
      await new Promise((r) => setTimeout(r, tickIntervalMs));
    }
  }

  await Promise.all(pending);

  const actualDuration = Date.now() - startTime;
  latencies.sort((a, b) => a - b);

  return {
    messagesPerSecond: (totalMessages / actualDuration) * 1000,
    errors,
    totalMessages,
    durationMs: actualDuration,
    p50LatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    p99LatencyMs: percentile(latencies, 99),
  };
}

/**
 * Measure burst throughput (send as fast as possible).
 */
export async function measureBurst(options: {
  handle: IProcessHandle;
  method: string;
  count: number;
  payload?: Record<string, unknown>;
}): Promise<{
  totalMessages: number;
  errors: number;
  durationMs: number;
  messagesPerSecond: number;
}> {
  const { handle, method, count, payload = {} } = options;

  const startTime = Date.now();

  const promises = Array.from({ length: count }, (_, i) =>
    handle.request(method, { ...payload, seq: i }).then(
      () => true,
      () => false,
    ),
  );

  const results = await Promise.all(promises);
  const durationMs = Date.now() - startTime;

  const successful = results.filter((r) => r).length;
  const errors = results.filter((r) => !r).length;

  return {
    totalMessages: successful,
    errors,
    durationMs,
    messagesPerSecond: (successful / durationMs) * 1000,
  };
}

/**
 * Calculate percentile from sorted array.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))] ?? 0;
}

/**
 * Collect memory stats.
 */
export function getMemoryStats(): {
  heapUsedMB: number;
  heapTotalMB: number;
  externalMB: number;
  rssMB: number;
} {
  const usage = process.memoryUsage();
  return {
    heapUsedMB: usage.heapUsed / 1024 / 1024,
    heapTotalMB: usage.heapTotal / 1024 / 1024,
    externalMB: usage.external / 1024 / 1024,
    rssMB: usage.rss / 1024 / 1024,
  };
}
