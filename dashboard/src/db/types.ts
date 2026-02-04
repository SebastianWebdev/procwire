/**
 * Database layer types for the benchmark dashboard.
 */

// Re-export benchmark types that we use
export type PayloadSize = "1KB" | "10KB" | "100KB" | "1MB" | "10MB" | "100MB";
export type CodecType = "raw" | "msgpack" | "arrow";
export type ResponseMode = "result" | "stream" | "ack";
export type ExecutionMode = "sequential" | "pipelined";
export type RunStatus = "running" | "completed" | "failed";
export type RuntimeType = "node" | "bun";

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
 * System metadata.
 */
export interface SystemMeta {
  timestamp: string;
  platform: string;
  arch: string;
  nodeVersion: string;
  bunVersion?: string;
  runtime: RuntimeType;
  hostname: string;
  cpuModel: string;
  cpuCores: number;
  totalMemoryGB: number;
}

/**
 * Performance target definition.
 */
export interface PerformanceTarget {
  size: PayloadSize;
  targetMBps: number;
  actualMBps: number;
  passed: boolean;
  margin: string;
}

/**
 * Benchmark summary.
 */
export interface BenchmarkSummary {
  totalDurationMs: number;
  totalRequests: number;
  totalBytes: number;
  peakThroughputMBps: number;
  performanceTargets: PerformanceTarget[];
  passed: boolean;
  failedTargets: string[];
}

/**
 * Result of a single benchmark run (one combination of size/codec/mode).
 */
export interface ScenarioResult {
  scenarioId: string;
  codec: CodecType;
  size: PayloadSize;
  mode: ResponseMode;
  throughputMBps: number;
  totalBytes: number;
  durationMs: number;
  requestCount: number;
  requestsPerSecond: number;
  latency: LatencyStats;
  memory: MemoryStats;
  errors: number;
}

// ============================================================================
// Database-specific types
// ============================================================================

/**
 * Database row for benchmark runs.
 */
export interface DbRun {
  id: number;
  run_id: string;
  started_at: string;
  completed_at: string | null;
  status: RunStatus;
  execution_mode: ExecutionMode;
  scenarios_run: string; // JSON array
  concurrency: number;
  meta: string; // JSON: SystemMeta
  summary: string | null; // JSON: BenchmarkSummary
  name: string | null;
  notes: string | null;
  is_baseline: number; // 0 or 1
  created_at: string;
}

/**
 * Database row for individual results.
 */
export interface DbResult {
  id: number;
  run_id: number;
  scenario_id: string;
  codec: CodecType;
  size: PayloadSize;
  mode: ResponseMode;
  throughput_mbps: number;
  total_bytes: number;
  duration_ms: number;
  request_count: number;
  requests_per_second: number;
  errors: number;
  latency: string; // JSON: LatencyStats
  memory: string; // JSON: MemoryStats
  created_at: string;
}

/**
 * Insert data for a new run.
 */
export interface DbRunInsert {
  run_id: string;
  started_at: string;
  status: RunStatus;
  execution_mode: ExecutionMode;
  scenarios_run: string[];
  concurrency: number;
  meta: SystemMeta;
  name?: string;
  notes?: string;
}

/**
 * Insert data for a result.
 */
export interface DbResultInsert {
  scenario_id: string;
  codec: CodecType;
  size: PayloadSize;
  mode: ResponseMode;
  throughput_mbps: number;
  total_bytes: number;
  duration_ms: number;
  request_count: number;
  requests_per_second: number;
  errors: number;
  latency: LatencyStats;
  memory: MemoryStats;
}

/**
 * Options for listing runs.
 */
export interface ListRunsOptions {
  limit?: number;
  offset?: number;
  status?: RunStatus;
  scenarioId?: string;
  runtime?: RuntimeType;
  orderBy?: "started_at" | "completed_at";
  order?: "asc" | "desc";
}

/**
 * Options for creating a run.
 */
export interface CreateRunOptions {
  concurrency?: number;
  name?: string;
  notes?: string;
}

/**
 * Comparison pair for two runs.
 */
export interface ComparisonPair {
  scenarioId: string;
  codec: CodecType;
  size: PayloadSize;
  mode: ResponseMode;
  baseline: ScenarioResult | null;
  compare: ScenarioResult | null;
}
