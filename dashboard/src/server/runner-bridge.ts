/**
 * Runner bridge - connects BenchmarkRunner events to WebSocket broadcasts.
 *
 * This module bridges the benchmark execution (from packages/bench) with
 * the dashboard's WebSocket to provide real-time progress updates.
 */

import type { FastifyInstance } from "fastify";
import {
  BenchmarkRunner,
  DEFAULT_SCENARIOS,
  QUICK_SCENARIOS,
  type BenchmarkScenario,
  type ScenarioResult,
  type TestCategory,
} from "@procwire/bench";
import type { ScenarioInfo } from "./types.js";

/**
 * Execution knobs (iterations, warmup, concurrency, measureMode, ...) live in
 * the bench catalog, not in the dashboard's presentational ScenarioInfo. Index
 * the catalog by id so a selected scenario runs with its real settings.
 */
const BENCH_SCENARIOS_BY_ID = new Map(DEFAULT_SCENARIOS.map((s) => [s.id, s]));

/**
 * Quick-mode catalog: the same scenarios with reduced iterations/warmups (and
 * unchanged concurrency/measureMode). Used when the dashboard requests
 * `options.quick` so the Quick Mode toggle keeps built-in scenarios short.
 */
const QUICK_SCENARIOS_BY_ID = new Map(QUICK_SCENARIOS.map((s) => [s.id, s]));

/**
 * Resolves the effective run-level concurrency for a set of selected scenarios.
 *
 * A scenario's own `concurrency` (e.g. `max-rps` at 32) wins over the run-level
 * option, so the runner executes it pipelined regardless of the option. We take
 * the peak effective concurrency across the selected scenarios so the run is
 * recorded/shown as pipelined (instead of a misleading sequential/1) whenever it
 * contains pipelined work. Per-result `executionMode` carries the precise detail.
 */
export function resolveRunConcurrency(
  scenarioInfos: ScenarioInfo[],
  optionConcurrency?: number,
): number {
  const runConcurrency = optionConcurrency ?? 1;
  let effective = runConcurrency;
  for (const info of scenarioInfos) {
    const canonical = BENCH_SCENARIOS_BY_ID.get(info.id);
    const scenarioConcurrency = canonical?.concurrency ?? runConcurrency;
    if (scenarioConcurrency > effective) {
      effective = scenarioConcurrency;
    }
  }
  return effective;
}

/**
 * Validates and converts category string to TestCategory.
 */
function toTestCategory(category: string | undefined): TestCategory {
  if (category === "stress" || category === "realistic") {
    return category;
  }
  return "benchmark";
}

/**
 * Converts dashboard ScenarioInfo to BenchmarkScenario.
 *
 * When `quick` is requested, built-in scenarios are sourced from the reduced
 * quick-mode catalog so the dashboard's Quick Mode toggle keeps runs short
 * (otherwise canonical scenarios like `latency-baseline` would run their full
 * 10,000 iterations regardless of the toggle).
 */
export function toBenchmarkScenario(info: ScenarioInfo, quick: boolean): BenchmarkScenario {
  const catalog = quick ? QUICK_SCENARIOS_BY_ID : BENCH_SCENARIOS_BY_ID;
  const canonical = catalog.get(info.id);
  if (canonical) {
    // Keep every execution knob (iterations/warmup/concurrency/measureMode/...)
    // from the bench catalog so scenarios like `max-rps` and
    // `pipelined-throughput` run as defined instead of a short sequential
    // default; let the dashboard override only the presentational selection.
    return {
      ...canonical,
      name: info.name,
      description: info.description,
      sizes: info.sizes,
      codecs: info.codecs,
      modes: info.modes,
      category: toTestCategory(info.category),
    };
  }
  // Unknown id (a custom scenario not in the bench catalog): quick-mode defaults.
  return {
    id: info.id,
    name: info.name,
    description: info.description,
    sizes: info.sizes,
    codecs: info.codecs,
    modes: info.modes,
    iterations: 100,
    warmup: 10,
    category: toTestCategory(info.category),
  };
}

/**
 * Creates a BenchmarkRunner wired to broadcast events via WebSocket.
 */
export function createRunnerWithBroadcast(
  fastify: FastifyInstance,
  runId: number,
): BenchmarkRunner {
  const runner = new BenchmarkRunner();
  const startTime = Date.now();

  // Scenario started
  runner.on("scenario:start", (scenarioId: string) => {
    fastify.broadcast({
      type: "scenario:start",
      runId,
      scenarioId,
      total: 0, // Will be updated with progress
      timestamp: new Date().toISOString(),
    });
  });

  // Progress update
  runner.on("scenario:progress", (scenarioId: string, current: number, total: number) => {
    fastify.broadcast({
      type: "scenario:progress",
      runId,
      scenarioId,
      current,
      total,
      currentTest: {
        codec: "raw",
        size: "1KB",
        mode: "result",
      },
      timestamp: new Date().toISOString(),
    });
  });

  // Single result complete
  runner.on("scenario:complete", (scenarioId: string, result: ScenarioResult) => {
    // Save result to database immediately
    fastify.db.saveResult(runId, result);

    fastify.broadcast({
      type: "result:complete",
      runId,
      scenarioId,
      result,
      timestamp: new Date().toISOString(),
    });
  });

  // Full benchmark complete
  runner.on(
    "benchmark:complete",
    (results: { summary: import("../db/types.js").BenchmarkSummary }) => {
      const duration = Date.now() - startTime;

      fastify.broadcast({
        type: "run:complete",
        runId,
        summary: results.summary,
        duration,
        timestamp: new Date().toISOString(),
      });
    },
  );

  return runner;
}

/**
 * Runs a benchmark with WebSocket broadcasting.
 *
 * This is called by POST /api/runs to actually execute the benchmark.
 */
export async function runBenchmarkWithBroadcast(
  fastify: FastifyInstance,
  runId: number,
  scenarioInfos: ScenarioInfo[],
  options: { concurrency?: number; quick?: boolean } = {},
): Promise<void> {
  // Convert ScenarioInfo to BenchmarkScenario (quick mode swaps in the
  // reduced-iteration catalog for built-in scenarios).
  const scenarios = scenarioInfos.map((info) => toBenchmarkScenario(info, options.quick ?? false));

  // Broadcast run start
  fastify.broadcast({
    type: "run:start",
    runId,
    scenarios: scenarios.map((s) => s.id),
    timestamp: new Date().toISOString(),
  });

  const runner = createRunnerWithBroadcast(fastify, runId);

  try {
    const results = await runner.run(scenarios, {
      concurrency: options.concurrency ?? 1,
    });

    // Update run status to completed
    fastify.db.updateRunStatus(runId, "completed", results.summary);

    // Broadcast completion with regression analysis if baseline exists
    const baseline = fastify.db.getLatestBaseline();
    let regressionSummary = null;

    if (baseline) {
      const pairs = fastify.db.getComparableResults(baseline.id, runId);
      const regressions = pairs.filter((p) => {
        if (!p.baseline || !p.compare) return false;
        const diff =
          ((p.compare.throughputMBps - p.baseline.throughputMBps) / p.baseline.throughputMBps) *
          100;
        return diff < -5; // 5% regression threshold
      });

      const criticalRegressions = regressions.filter((p) => {
        if (!p.baseline || !p.compare) return false;
        const diff =
          ((p.compare.throughputMBps - p.baseline.throughputMBps) / p.baseline.throughputMBps) *
          100;
        return diff < -20; // 20% critical threshold
      });

      regressionSummary = {
        hasRegressions: regressions.length > 0,
        hasCriticalRegressions: criticalRegressions.length > 0,
        regressionCount: regressions.length,
        criticalCount: criticalRegressions.length,
      };
    }

    // Final complete message with regression info
    fastify.broadcast({
      type: "run:complete",
      runId,
      summary: results.summary,
      duration: results.summary.totalDurationMs,
      regressionSummary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Broadcast error
    fastify.broadcast({
      type: "run:error",
      runId,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });

    // Update database
    fastify.db.updateRunStatus(runId, "failed");

    throw error;
  }
}
