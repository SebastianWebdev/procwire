/**
 * GET /api/scenarios - List available benchmark scenarios.
 */

import type { FastifyInstance } from "fastify";
import type { ScenariosResponse, ScenarioInfo } from "../types.js";

/**
 * Available benchmark scenarios.
 *
 * These match the scenarios defined in packages/bench/src/scenarios.ts
 */
const SCENARIOS: ScenarioInfo[] = [
  {
    id: "full-matrix",
    name: "Full Matrix",
    description: "Tests all codec×size×mode combinations",
    sizes: ["1KB", "10KB", "100KB", "1MB", "10MB", "100MB"],
    codecs: ["raw", "msgpack", "arrow"],
    modes: ["result", "stream", "ack"],
    category: "benchmark",
  },
  {
    id: "latency-baseline",
    name: "Latency Baseline",
    description: "Small payloads focused on latency measurement",
    sizes: ["1KB", "10KB"],
    codecs: ["raw", "msgpack"],
    modes: ["result"],
    category: "benchmark",
  },
  {
    id: "throughput-focus",
    name: "Throughput Focus",
    description: "Large payloads for maximum throughput",
    sizes: ["1MB", "10MB", "100MB"],
    codecs: ["raw"],
    modes: ["result", "ack"],
    category: "benchmark",
  },
  {
    id: "codec-comparison",
    name: "Codec Comparison",
    description: "Compare serialization overhead across codecs",
    sizes: ["10KB", "100KB", "1MB"],
    codecs: ["raw", "msgpack", "arrow"],
    modes: ["result"],
    category: "benchmark",
  },
  {
    id: "pipelined-throughput",
    name: "Pipelined Throughput",
    description: "High concurrency test for maximum throughput",
    sizes: ["1KB", "10KB", "100KB"],
    codecs: ["raw"],
    modes: ["result"],
    category: "benchmark",
  },
];

export async function scenariosRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{
    Reply: ScenariosResponse;
  }>("/api/scenarios", async (_request, _reply) => {
    return { scenarios: SCENARIOS };
  });
}

/**
 * Get scenarios by IDs.
 */
export function getScenariosByIds(ids: string[]): ScenarioInfo[] {
  if (ids.length === 0) {
    return SCENARIOS;
  }
  return SCENARIOS.filter((s) => ids.includes(s.id));
}

/**
 * Get all available scenarios.
 */
export function getAllScenarios(): ScenarioInfo[] {
  return SCENARIOS;
}
