/**
 * Type definitions for the benchmark suite.
 */

export type PayloadSize = "1KB" | "10KB" | "100KB" | "1MB" | "10MB" | "100MB";

export type CodecType = "raw" | "msgpack" | "arrow";

export type ResponseMode = "result" | "stream" | "ack";

/**
 * Runtime environment for benchmarks.
 */
export type RuntimeType = "node" | "bun";

/**
 * Test category for benchmarks.
 */
export type TestCategory = "benchmark" | "stress" | "realistic";

/**
 * Primary metric to measure.
 */
export type MeasureMode = "throughput" | "requests" | "latency";

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

  // --- New pipelining options (TASK-17) ---

  /** Test category (default: "benchmark") */
  category?: TestCategory;
  /** Concurrency level for pipelined execution (default: 1 = sequential) */
  concurrency?: number;
  /** Multiple concurrency levels to test for saturation analysis */
  concurrencyLevels?: number[];
  /** Minimum test duration in milliseconds (for duration-based tests) */
  duration?: number;
  /** Primary metric to measure (default: "throughput") */
  measureMode?: MeasureMode;
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
  /** Bun version (if running on Bun) */
  bunVersion?: string;
  /** Runtime used (node or bun) */
  runtime: RuntimeType;
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
  /** Individual results (sequential execution) */
  results: ScenarioResult[];
  /** Pipelined results (if concurrency > 1 was used) */
  pipelinedResults?: ScenarioResult[];
  /** Saturation curve results (if saturation test was run) */
  saturationResults?: SaturationResult[];
  /** Summary */
  summary: BenchmarkSummary;
  /** Execution mode used */
  executionMode: ExecutionMode;
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
  /** Concurrency level for pipelined execution */
  concurrency?: number;
  /** Run saturation curve analysis */
  saturation?: boolean;
  /** Test category to run */
  category?: TestCategory;
}

/**
 * Result of a concurrency level test for saturation analysis.
 */
export interface ConcurrencyLevelResult {
  /** Concurrency level tested */
  concurrency: number;
  /** Requests per second achieved */
  requestsPerSecond: number;
  /** Throughput in MB/s */
  throughputMBps: number;
  /** Improvement over baseline (concurrency=1) */
  improvementPercent: number;
}

/**
 * Result of saturation curve analysis.
 */
export interface SaturationResult {
  /** Scenario ID */
  scenarioId: string;
  /** Codec used */
  codec: CodecType;
  /** Payload size */
  size: PayloadSize;
  /** Response mode */
  mode: ResponseMode;
  /** Results at each concurrency level */
  levels: ConcurrencyLevelResult[];
  /** Optimal concurrency (saturation point) */
  optimalConcurrency: number;
  /** Maximum requests/second achieved */
  peakRequestsPerSecond: number;
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
  "100MB": 100 * 1024 * 1024,
};

/**
 * Execution mode for benchmarks.
 */
export type ExecutionMode = "sequential" | "pipelined";

/**
 * Performance targets from TASK-15 requirements.
 *
 * TASK-17: Split into sequential (baseline) and pipelined (realistic) targets.
 * Sequential targets reflect single-request-at-a-time measurement.
 * Pipelined targets reflect concurrent request execution.
 */
export const PERFORMANCE_TARGETS: Record<ExecutionMode, Record<PayloadSize, number>> = {
  /**
   * Sequential targets (one request at a time).
   * Limited by syscall overhead for small payloads.
   */
  sequential: {
    "1KB": 20, // MB/s - syscall limited (~14k req/s theoretical)
    "10KB": 150, // MB/s
    "100KB": 400, // MB/s
    "1MB": 800, // MB/s
    "10MB": 1200, // MB/s
    "100MB": 1000, // MB/s - round-trip time dominates
  },
  /**
   * Pipelined targets (concurrent requests with backpressure).
   * Achievable with concurrency=32 or higher.
   */
  pipelined: {
    "1KB": 80, // MB/s - should hit 50k+ req/s
    "10KB": 400, // MB/s
    "100KB": 800, // MB/s
    "1MB": 1500, // MB/s
    "10MB": 2000, // MB/s (2 GB/s)
    "100MB": 1800, // MB/s - memory bandwidth limited
  },
};

/**
 * Legacy compatibility: default to sequential targets.
 * @deprecated Use PERFORMANCE_TARGETS.sequential instead.
 */
export const SEQUENTIAL_TARGETS = PERFORMANCE_TARGETS.sequential;
