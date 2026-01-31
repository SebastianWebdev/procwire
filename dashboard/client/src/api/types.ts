/**
 * API response types for the dashboard client.
 */

export type PayloadSize = "1KB" | "10KB" | "100KB" | "1MB" | "10MB" | "100MB";
export type CodecType = "raw" | "msgpack" | "arrow";
export type ResponseMode = "result" | "stream" | "ack";
export type ExecutionMode = "sequential" | "pipelined";
export type RunStatus = "running" | "completed" | "failed";

export interface ScenarioInfo {
  id: string;
  name: string;
  description: string;
  sizes: PayloadSize[];
  codecs: CodecType[];
  modes: ResponseMode[];
  category: string;
}

export interface ScenariosResponse {
  scenarios: ScenarioInfo[];
}

export interface RunSummary {
  id: number;
  runId: string;
  startedAt: string;
  completedAt: string | null;
  status: RunStatus;
  executionMode: ExecutionMode;
  scenariosRun: string[];
  peakThroughputMBps: number | null;
  passed: boolean | null;
  isBaseline: boolean;
  name: string | null;
}

export interface ListRunsParams {
  limit?: number;
  offset?: number;
  status?: RunStatus;
  scenario?: string;
}

export interface ListRunsResponse {
  runs: RunSummary[];
  total: number;
  hasMore: boolean;
}

export interface SystemMeta {
  timestamp: string;
  platform: string;
  arch: string;
  nodeVersion: string;
  hostname: string;
  cpuModel: string;
  cpuCores: number;
  totalMemoryGB: number;
}

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

export interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

export interface PerformanceTarget {
  size: PayloadSize;
  targetMBps: number;
  actualMBps: number;
  passed: boolean;
  margin: string;
}

export interface BenchmarkSummary {
  totalDurationMs: number;
  totalRequests: number;
  totalBytes: number;
  peakThroughputMBps: number;
  performanceTargets: PerformanceTarget[];
  passed: boolean;
  failedTargets: string[];
}

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

export interface RunDetailResponse extends RunSummary {
  meta: SystemMeta;
  summary: BenchmarkSummary | null;
  notes: string | null;
  concurrency: number;
}

export interface RunResultsResponse {
  runId: number;
  results: ScenarioResult[];
}

export interface CreateRunRequest {
  scenarios: string[];
  options?: {
    quick?: boolean;
    concurrency?: number;
    codecs?: CodecType[];
    sizes?: PayloadSize[];
    modes?: ResponseMode[];
  };
  metadata?: {
    name?: string;
    notes?: string;
  };
}

export interface CreateRunResponse {
  id: number;
  runId: string;
  status: "running";
  wsChannel: string;
}

export interface SetBaselineResponse {
  id: number;
  isBaseline: boolean;
}

export interface ComparisonRow {
  scenarioId: string;
  codec: CodecType;
  size: PayloadSize;
  mode: ResponseMode;
  baseline: {
    throughputMBps: number;
    latencyP99: number;
  } | null;
  compare: {
    throughputMBps: number;
    latencyP99: number;
  } | null;
  delta: {
    throughputMBps: number;
    throughputPercent: number;
    latencyP99: number;
    latencyPercent: number;
    isRegression: boolean;
  };
}

export interface CompareResponse {
  baseline: RunSummary;
  compare: RunSummary;
  comparisons: ComparisonRow[];
  summary: {
    improvements: number;
    regressions: number;
    unchanged: number;
    overallDeltaPercent: number;
  };
}

export interface TrendsParams {
  metric: "throughput" | "latency_p99" | "rps";
  size: PayloadSize;
  codec?: CodecType;
  mode?: ResponseMode;
  days?: number;
}

export interface TrendsResponse {
  metric: string;
  filter: {
    size: string;
    codec: string;
    mode: string;
  };
  dataPoints: Array<{
    timestamp: string;
    value: number;
    runId: number;
    runName: string | null;
  }>;
}
