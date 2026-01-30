/**
 * Type definitions for the benchmark suite.
 */

export type PayloadSize = "1KB" | "10KB" | "100KB" | "1MB" | "10MB";

export type CodecType = "raw" | "msgpack" | "arrow";

export type ResponseMode = "result" | "stream" | "ack";

/**
 * Benchmark scenario configuration.
 */
export interface BenchmarkScenario {
  /** Unique scenario identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what this scenario tests */
  description: string;
  /** Payload sizes to test */
  sizes: PayloadSize[];
  /** Codecs to test */
  codecs: CodecType[];
  /** Response modes to test */
  modes: ResponseMode[];
  /** Number of iterations per combination */
  iterations: number;
  /** Warmup iterations before measurement */
  warmup: number;
}

/**
 * Latency statistics in microseconds.
 */
export interface LatencyStats {
  min: number;
  max: number;
  mean: number;
  stddev: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  p999: number;
}

/**
 * Memory usage snapshot in megabytes.
 */
export interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

/**
 * Result of a single benchmark run (one combination of size/codec/mode).
 */
export interface ScenarioResult {
  /** Scenario ID */
  scenarioId: string;
  /** Codec used */
  codec: CodecType;
  /** Payload size */
  size: PayloadSize;
  /** Response mode */
  mode: ResponseMode;

  /** Throughput in MB/s */
  throughputMBps: number;
  /** Total bytes transferred */
  totalBytes: number;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Number of requests completed */
  requestCount: number;
  /** Requests per second */
  requestsPerSecond: number;

  /** Latency statistics */
  latency: LatencyStats;
  /** Memory usage */
  memory: MemoryStats;
  /** Number of errors encountered */
  errors: number;
}

/**
 * Performance target definition.
 */
export interface PerformanceTarget {
  /** Payload size */
  size: PayloadSize;
  /** Target throughput in MB/s */
  targetMBps: number;
  /** Actual measured throughput in MB/s */
  actualMBps: number;
  /** Whether target was met */
  passed: boolean;
  /** Margin (e.g., "+25%" or "-10%") */
  margin: string;
}

/**
 * Benchmark summary.
 */
export interface BenchmarkSummary {
  /** Total benchmark duration in milliseconds */
  totalDurationMs: number;
  /** Total requests executed */
  totalRequests: number;
  /** Total bytes transferred */
  totalBytes: number;
  /** Peak throughput achieved in MB/s */
  peakThroughputMBps: number;

  /** Performance target results */
  performanceTargets: PerformanceTarget[];
  /** Whether all targets passed */
  passed: boolean;
  /** List of failed target descriptions */
  failedTargets: string[];
}

/**
 * System metadata.
 */
export interface SystemMeta {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Platform (win32, darwin, linux) */
  platform: NodeJS.Platform;
  /** Architecture (x64, arm64) */
  arch: string;
  /** Node.js version */
  nodeVersion: string;
  /** Hostname */
  hostname: string;
  /** CPU model */
  cpuModel: string;
  /** Number of CPU cores */
  cpuCores: number;
  /** Total memory in GB */
  totalMemoryGB: number;
}

/**
 * Complete benchmark results.
 */
export interface BenchmarkResults {
  /** System metadata */
  meta: SystemMeta;
  /** Scenarios that were run */
  scenariosRun: string[];
  /** Individual results */
  results: ScenarioResult[];
  /** Summary */
  summary: BenchmarkSummary;
}

/**
 * CLI options.
 */
export interface BenchmarkOptions {
  /** Specific scenarios to run (empty = all) */
  scenarios: string[];
  /** Output directory */
  outputDir: string;
  /** Quick mode (reduced iterations) */
  quick: boolean;
  /** Suppress progress output */
  quiet: boolean;
}

/**
 * Payload size in bytes lookup.
 */
export const PAYLOAD_SIZES: Record<PayloadSize, number> = {
  "1KB": 1024,
  "10KB": 10 * 1024,
  "100KB": 100 * 1024,
  "1MB": 1024 * 1024,
  "10MB": 10 * 1024 * 1024,
};

/**
 * Performance targets from TASK-15 requirements.
 */
export const PERFORMANCE_TARGETS: Record<PayloadSize, number> = {
  "1KB": 100, // MB/s
  "10KB": 200,
  "100KB": 400,
  "1MB": 500,
  "10MB": 1000, // 1 GB/s
};
