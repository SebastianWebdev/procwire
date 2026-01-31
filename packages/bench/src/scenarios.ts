/**
 * Benchmark scenario definitions.
 *
 * TASK-16: Refactored to test all codec × response mode combinations
 * with scaled iterations per payload size.
 */

import type { BenchmarkScenario, PayloadSize, CodecType, ResponseMode } from "./types.js";

/**
 * Iteration counts scaled by payload size.
 * Larger payloads use fewer iterations to keep test duration reasonable.
 */
export const ITERATIONS_BY_SIZE: Record<PayloadSize, { iterations: number; warmup: number }> = {
  "1KB": { iterations: 1000, warmup: 100 },
  "10KB": { iterations: 500, warmup: 50 },
  "100KB": { iterations: 200, warmup: 20 },
  "1MB": { iterations: 50, warmup: 10 },
  "10MB": { iterations: 10, warmup: 3 },
  "100MB": { iterations: 3, warmup: 1 },
};

/**
 * All supported payload sizes (ordered).
 */
export const ALL_SIZES: PayloadSize[] = ["1KB", "10KB", "100KB", "1MB", "10MB", "100MB"];

/**
 * All supported codecs.
 */
export const ALL_CODECS: CodecType[] = ["raw", "msgpack", "arrow"];

/**
 * All supported response modes.
 */
export const ALL_MODES: ResponseMode[] = ["result", "stream", "ack"];

/**
 * Default benchmark scenarios covering all library features.
 *
 * Scenarios:
 * - full-matrix: All 9 codec×mode combinations across all sizes
 * - throughput-max: Maximum throughput test with raw codec
 * - latency-baseline: High-iteration latency measurement
 */
export const DEFAULT_SCENARIOS: BenchmarkScenario[] = [
  // Full matrix: 3 codecs × 3 response modes = 9 combinations
  {
    id: "full-matrix",
    name: "Full Codec × Mode Matrix",
    description:
      "Tests all combinations of codecs (raw, msgpack, arrow) and response modes (result, stream, ack)",
    sizes: ALL_SIZES,
    codecs: ALL_CODECS,
    modes: ALL_MODES,
    iterations: 100, // Base iterations, will be scaled by size
    warmup: 10,
  },

  // Maximum throughput with raw codec (no serialization overhead)
  {
    id: "throughput-max",
    name: "Maximum Throughput",
    description: "Peak throughput test with raw codec on largest payloads",
    sizes: ["10MB", "100MB"],
    codecs: ["raw"],
    modes: ["result"],
    iterations: 10,
    warmup: 3,
  },

  // High-iteration latency baseline for accurate percentiles
  {
    id: "latency-baseline",
    name: "Latency Baseline",
    description: "High-iteration test for precise latency percentiles on small payloads",
    sizes: ["1KB"],
    codecs: ["raw", "msgpack"],
    modes: ["result"],
    iterations: 10000,
    warmup: 1000,
  },
];

/**
 * Quick benchmark scenarios (reduced iterations for fast testing).
 */
export const QUICK_SCENARIOS: BenchmarkScenario[] = DEFAULT_SCENARIOS.map((scenario) => ({
  ...scenario,
  iterations: Math.max(10, Math.floor(scenario.iterations / 10)),
  warmup: Math.max(3, Math.floor(scenario.warmup / 10)),
}));

/**
 * Gets the appropriate iteration count for a given scenario and payload size.
 * Scales iterations based on payload size to maintain reasonable test duration.
 */
export function getIterationsForSize(
  scenario: BenchmarkScenario,
  size: PayloadSize,
): { iterations: number; warmup: number } {
  // For full-matrix scenario, use scaled iterations
  if (scenario.id === "full-matrix") {
    return ITERATIONS_BY_SIZE[size];
  }

  // For other scenarios, use the scenario's base iterations
  return {
    iterations: scenario.iterations,
    warmup: scenario.warmup,
  };
}

export interface GetScenariosOptions {
  /** Specific scenario IDs to run */
  ids?: string[] | undefined;
  /** Quick mode (reduced iterations) */
  quick?: boolean | undefined;
  /** Filter by codec */
  codec?: CodecType | undefined;
  /** Filter by response mode */
  responseMode?: ResponseMode | undefined;
  /** Filter by sizes */
  sizes?: PayloadSize[] | undefined;
}

/**
 * Gets scenarios with optional filtering.
 */
export function getScenarios(
  idsOrOptions: string[] | GetScenariosOptions,
  quick?: boolean,
): BenchmarkScenario[] {
  // Handle legacy call signature: getScenarios(ids, quick)
  if (Array.isArray(idsOrOptions)) {
    return getScenariosLegacy(idsOrOptions, quick ?? false);
  }

  const options = idsOrOptions;
  let scenarios = options.quick ? QUICK_SCENARIOS : DEFAULT_SCENARIOS;

  // Filter by IDs
  if (options.ids && options.ids.length > 0) {
    scenarios = scenarios.filter((s) => options.ids!.includes(s.id));
    if (scenarios.length === 0) {
      const available = DEFAULT_SCENARIOS.map((s) => s.id).join(", ");
      throw new Error(`No matching scenarios found. Available: ${available}`);
    }
  }

  // Apply codec filter
  if (options.codec) {
    scenarios = scenarios
      .map((s) => ({
        ...s,
        codecs: s.codecs.filter((c) => c === options.codec),
      }))
      .filter((s) => s.codecs.length > 0);
  }

  // Apply response mode filter
  if (options.responseMode) {
    scenarios = scenarios
      .map((s) => ({
        ...s,
        modes: s.modes.filter((m) => m === options.responseMode),
      }))
      .filter((s) => s.modes.length > 0);
  }

  // Apply size filter
  if (options.sizes && options.sizes.length > 0) {
    scenarios = scenarios
      .map((s) => ({
        ...s,
        sizes: s.sizes.filter((size) => options.sizes!.includes(size)),
      }))
      .filter((s) => s.sizes.length > 0);
  }

  return scenarios;
}

/**
 * Legacy getScenarios implementation for backward compatibility.
 */
function getScenariosLegacy(ids: string[], quick: boolean): BenchmarkScenario[] {
  const scenarios = quick ? QUICK_SCENARIOS : DEFAULT_SCENARIOS;

  if (ids.length === 0) {
    return scenarios;
  }

  const selected = scenarios.filter((s) => ids.includes(s.id));
  if (selected.length === 0) {
    const available = scenarios.map((s) => s.id).join(", ");
    throw new Error(`No matching scenarios found. Available: ${available}`);
  }

  return selected;
}

/**
 * Lists all available scenario IDs.
 */
export function listScenarioIds(): string[] {
  return DEFAULT_SCENARIOS.map((s) => s.id);
}
