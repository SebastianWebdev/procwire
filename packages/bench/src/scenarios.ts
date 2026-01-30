/**
 * Benchmark scenario definitions.
 */

import type { BenchmarkScenario } from "./types.js";

/**
 * Default benchmark scenarios covering all library features.
 *
 * Includes payload sizes from 1KB to 10MB to validate proper
 * backpressure handling at all scales.
 */
export const DEFAULT_SCENARIOS: BenchmarkScenario[] = [
  // Primary throughput test with raw codec (no serialization overhead)
  {
    id: "throughput-raw",
    name: "Raw Throughput",
    description: "Maximum throughput with raw codec (no serialization overhead)",
    sizes: ["1KB", "10KB", "100KB", "1MB", "10MB"],
    codecs: ["raw"],
    modes: ["result"],
    iterations: 1000,
    warmup: 100,
  },

  // Codec comparison at various payload sizes
  {
    id: "codec-comparison",
    name: "Codec Comparison",
    description: "Compares raw, msgpack, and arrow codecs",
    sizes: ["1KB", "10KB", "100KB", "1MB"],
    codecs: ["raw", "msgpack", "arrow"],
    modes: ["result"],
    iterations: 500,
    warmup: 50,
  },

  // Response type comparison
  {
    id: "response-types",
    name: "Response Type Comparison",
    description: "Compares result, ack, and stream response types",
    sizes: ["1KB", "10KB", "100KB"],
    codecs: ["msgpack"],
    modes: ["result", "ack", "stream"],
    iterations: 500,
    warmup: 50,
  },

  // High-iteration latency test for accurate percentiles
  {
    id: "latency",
    name: "Latency Measurement",
    description: "High-iteration test for precise latency percentiles",
    sizes: ["1KB"],
    codecs: ["raw", "msgpack"],
    modes: ["result"],
    iterations: 10000,
    warmup: 1000,
  },

  // Streaming throughput
  {
    id: "streaming",
    name: "Streaming Throughput",
    description: "Stream response mode throughput",
    sizes: ["1KB", "10KB", "100KB"],
    codecs: ["raw", "msgpack"],
    modes: ["stream"],
    iterations: 100,
    warmup: 10,
  },
];

/**
 * Quick benchmark scenarios (reduced iterations for fast testing).
 */
export const QUICK_SCENARIOS: BenchmarkScenario[] = DEFAULT_SCENARIOS.map((scenario) => ({
  ...scenario,
  iterations: Math.max(10, Math.floor(scenario.iterations / 10)),
  warmup: Math.max(5, Math.floor(scenario.warmup / 10)),
}));

/**
 * Gets scenarios by IDs, or returns all default scenarios if no IDs specified.
 */
export function getScenarios(ids: string[], quick: boolean): BenchmarkScenario[] {
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
