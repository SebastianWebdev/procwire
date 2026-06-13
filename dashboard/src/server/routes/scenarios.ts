/**
 * GET /api/scenarios - List available benchmark scenarios.
 */

import type { FastifyInstance } from "fastify";
import { DEFAULT_SCENARIOS } from "@procwire/bench";
import type { ScenariosResponse, ScenarioInfo } from "../types.js";

/**
 * Available benchmark scenarios.
 *
 * Derived from the single source of truth in @procwire/bench
 * (packages/bench/src/scenarios.ts) so this catalog can never drift from the
 * scenarios the runner actually executes. Only the presentational subset
 * (no iteration/warmup/concurrency knobs) is exposed to the API.
 */
const SCENARIOS: ScenarioInfo[] = DEFAULT_SCENARIOS.map((scenario) => ({
  id: scenario.id,
  name: scenario.name,
  description: scenario.description,
  sizes: scenario.sizes,
  codecs: scenario.codecs,
  modes: scenario.modes,
  category: scenario.category ?? "benchmark",
}));

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
