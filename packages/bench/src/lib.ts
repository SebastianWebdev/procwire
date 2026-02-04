/**
 * @procwire/bench library exports.
 *
 * This module provides the public API for programmatic use of the benchmark suite.
 * For CLI usage, see index.ts.
 */

// Core runner
export { BenchmarkRunner, type RunnerOptions } from "./runner.js";
export { BunBenchmarkRunner, type BunRunnerOptions } from "./bun-runner.js";

// Scenarios
export {
  getScenarios,
  listScenarioIds,
  getIterationsForSize,
  DEFAULT_SCENARIOS,
  QUICK_SCENARIOS,
  ALL_SIZES,
  ALL_CODECS,
  ALL_MODES,
  ITERATIONS_BY_SIZE,
  type GetScenariosOptions,
} from "./scenarios.js";

// Types
export type {
  PayloadSize,
  CodecType,
  ResponseMode,
  RuntimeType,
  TestCategory,
  MeasureMode,
  BenchmarkScenario,
  LatencyStats,
  MemoryStats,
  ScenarioResult,
  PerformanceTarget,
  BenchmarkSummary,
  SystemMeta,
  BenchmarkResults,
  BenchmarkOptions,
  ConcurrencyLevelResult,
  SaturationResult,
  ExecutionMode,
} from "./types.js";

export { PAYLOAD_SIZES, PERFORMANCE_TARGETS, SEQUENTIAL_TARGETS } from "./types.js";

// Payload utilities
export {
  generatePayload,
  generateStreamChunks,
  getPayloadByteSize,
  getOptimalChunkCount,
} from "./payload.js";

// Metrics
export { MetricsCollector } from "./metrics.js";

// Reports
export { writeJsonReport } from "./report/json.js";
export { writeMarkdownReport, generateMarkdownReport } from "./report/markdown.js";

// Stress tests
export {
  StressTestRunner,
  DEFAULT_STRESS_TESTS,
  type StressTestConfig,
  type StressTimelineEntry,
  type StressTestResult,
} from "./stress-runner.js";

// Realistic tests
export {
  RealisticTestRunner,
  DEFAULT_MIXED_WORKLOAD,
  DEFAULT_MULTI_WORKER,
  type PayloadDistribution,
  type MixedWorkloadConfig,
  type MultiWorkerConfig,
  type MixedWorkloadResult,
  type WorkerScalingResult,
  type MultiWorkerResult,
} from "./realistic-runner.js";
