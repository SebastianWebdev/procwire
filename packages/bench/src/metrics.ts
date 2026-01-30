/**
 * Metrics collection for benchmark measurements.
 *
 * Uses high-resolution timing (process.hrtime.bigint) and
 * maintains a histogram of latency samples for percentile calculation.
 */

import type {
  LatencyStats,
  MemoryStats,
  ScenarioResult,
  PayloadSize,
  CodecType,
  ResponseMode,
} from "./types.js";

/**
 * Converts nanoseconds to microseconds.
 */
function nsToUs(ns: bigint): number {
  return Number(ns / 1000n);
}

/**
 * Converts nanoseconds to milliseconds.
 */
function nsToMs(ns: bigint): number {
  return Number(ns / 1_000_000n);
}

/**
 * Calculates percentile from a sorted array.
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, index)] ?? 0;
}

/**
 * Calculates standard deviation.
 */
function stddev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquaredDiff);
}

/**
 * Metrics collector for a single benchmark run.
 *
 * Collects latency samples and calculates throughput/statistics.
 */
export class MetricsCollector {
  private startTime: bigint = 0n;
  private endTime: bigint = 0n;
  private latencies: number[] = []; // in microseconds
  private totalBytes = 0;
  private requestCount = 0;
  private errorCount = 0;

  /**
   * Marks the start of the benchmark.
   */
  start(): void {
    this.startTime = process.hrtime.bigint();
    this.latencies = [];
    this.totalBytes = 0;
    this.requestCount = 0;
    this.errorCount = 0;
  }

  /**
   * Records a single request latency.
   * @param durationNs Duration in nanoseconds (from hrtime.bigint difference)
   */
  recordLatency(durationNs: bigint): void {
    this.latencies.push(nsToUs(durationNs));
    this.requestCount++;
  }

  /**
   * Records bytes transferred.
   */
  recordBytes(bytes: number): void {
    this.totalBytes += bytes;
  }

  /**
   * Records an error.
   */
  recordError(): void {
    this.errorCount++;
  }

  /**
   * Marks the end of the benchmark.
   */
  stop(): void {
    this.endTime = process.hrtime.bigint();
  }

  /**
   * Gets the current memory usage.
   */
  getMemoryStats(): MemoryStats {
    const mem = process.memoryUsage();
    return {
      heapUsed: mem.heapUsed / (1024 * 1024),
      heapTotal: mem.heapTotal / (1024 * 1024),
      external: mem.external / (1024 * 1024),
      rss: mem.rss / (1024 * 1024),
    };
  }

  /**
   * Calculates latency statistics from collected samples.
   */
  getLatencyStats(): LatencyStats {
    if (this.latencies.length === 0) {
      return {
        min: 0,
        max: 0,
        mean: 0,
        stddev: 0,
        p50: 0,
        p75: 0,
        p90: 0,
        p95: 0,
        p99: 0,
        p999: 0,
      };
    }

    // Sort for percentile calculation
    const sorted = [...this.latencies].sort((a, b) => a - b);

    const min = sorted[0] ?? 0;
    const max = sorted[sorted.length - 1] ?? 0;
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = sum / sorted.length;

    return {
      min,
      max,
      mean,
      stddev: stddev(sorted, mean),
      p50: percentile(sorted, 50),
      p75: percentile(sorted, 75),
      p90: percentile(sorted, 90),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      p999: percentile(sorted, 99.9),
    };
  }

  /**
   * Builds the final result object.
   */
  buildResult(
    scenarioId: string,
    codec: CodecType,
    size: PayloadSize,
    mode: ResponseMode,
  ): ScenarioResult {
    const durationNs = this.endTime - this.startTime;
    const durationMs = nsToMs(durationNs);
    const durationSec = durationMs / 1000;

    // Throughput: MB/s
    const throughputMBps = durationSec > 0 ? this.totalBytes / durationSec / (1024 * 1024) : 0;

    // Requests per second
    const requestsPerSecond = durationSec > 0 ? this.requestCount / durationSec : 0;

    return {
      scenarioId,
      codec,
      size,
      mode,
      throughputMBps,
      totalBytes: this.totalBytes,
      durationMs,
      requestCount: this.requestCount,
      requestsPerSecond,
      latency: this.getLatencyStats(),
      memory: this.getMemoryStats(),
      errors: this.errorCount,
    };
  }
}
