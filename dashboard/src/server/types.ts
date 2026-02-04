/**
 * Server-specific types for the dashboard API.
 */

import type {
  PayloadSize,
  CodecType,
  ResponseMode,
  ExecutionMode,
  RunStatus,
  SystemMeta,
  BenchmarkSummary,
  ScenarioResult,
} from "../db/types.js";

// Re-export for convenience
export type {
  PayloadSize,
  CodecType,
  ResponseMode,
  ExecutionMode,
  RunStatus,
  SystemMeta,
  BenchmarkSummary,
  ScenarioResult,
};

// =============================================================================
// API Request/Response Types
// =============================================================================

/**
 * Scenario info for GET /api/scenarios
 */
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

/**
 * Run summary for listing
 */
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

/**
 * Query params for GET /api/runs
 */
export interface ListRunsQuery {
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

/**
 * Full run detail for GET /api/runs/:id
 */
export interface RunDetailResponse extends RunSummary {
  meta: SystemMeta;
  summary: BenchmarkSummary | null;
  notes: string | null;
  concurrency: number;
}

/**
 * Results for GET /api/runs/:id/results
 */
export interface RunResultsResponse {
  runId: number;
  results: ScenarioResult[];
}

/**
 * Request body for POST /api/runs
 */
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

/**
 * Request body for PUT /api/runs/:id/baseline
 */
export interface SetBaselineRequest {
  isBaseline: boolean;
}

export interface SetBaselineResponse {
  id: number;
  isBaseline: boolean;
}

/**
 * Query params for GET /api/compare
 */
export interface CompareQuery {
  baseline: number;
  compare: number;
}

/**
 * Comparison row with deltas
 */
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

/**
 * Query params for GET /api/trends
 */
export interface TrendsQuery {
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

/**
 * Error response
 */
export interface ErrorResponse {
  error: string;
  statusCode?: number;
}
