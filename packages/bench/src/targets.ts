/**
 * Performance target evaluation.
 *
 * Targets are graded against the WHOLE-RUN execution mode: a sequential run
 * (run-level concurrency 1) is judged against the sequential target set, a
 * pipelined run (run-level `--concurrency > 1`) against the pipelined set.
 *
 * Each `ScenarioResult` still records the per-result `executionMode` it ran
 * under (a scenario like `pipelined-throughput` carries its own concurrency and
 * runs pipelined even in a sequential run), but the pass/fail grade uses the
 * run-level mode. The pipelined targets assume high concurrency (≥32); grading a
 * default run's low-concurrency pipelined scenarios against them would make the
 * default `pnpm bench` fail, so the run-level mode is the honest yardstick.
 */

import type { ExecutionMode, PerformanceTarget, ScenarioResult } from "./types.js";
import { PERFORMANCE_TARGETS } from "./types.js";
import { ALL_SIZES } from "./scenarios.js";

/**
 * Calculates performance target results for a run.
 *
 * For each payload size, the best raw/result throughput is compared against the
 * target set matching the run's execution mode.
 *
 * @param results - Benchmark results to evaluate
 * @param executionMode - Which target set to grade against (the run-level mode)
 */
export function calculatePerformanceTargets(
  results: ScenarioResult[],
  executionMode: ExecutionMode = "sequential",
): PerformanceTarget[] {
  const targets: PerformanceTarget[] = [];
  const targetSet = PERFORMANCE_TARGETS[executionMode];

  for (const size of ALL_SIZES) {
    // Only raw/result results define the throughput baseline.
    const sizeResults = results.filter(
      (r) => r.size === size && r.codec === "raw" && r.mode === "result",
    );

    if (sizeResults.length === 0) continue;

    const bestResult = sizeResults.reduce((best, r) =>
      r.throughputMBps > best.throughputMBps ? r : best,
    );

    const targetMBps = targetSet[size];
    const actualMBps = bestResult.throughputMBps;
    const passed = actualMBps >= targetMBps;
    const marginPercent = ((actualMBps - targetMBps) / targetMBps) * 100;
    const margin =
      marginPercent >= 0 ? `+${marginPercent.toFixed(0)}%` : `${marginPercent.toFixed(0)}%`;

    targets.push({
      size,
      executionMode,
      targetMBps,
      actualMBps,
      passed,
      margin,
    });
  }

  return targets;
}
