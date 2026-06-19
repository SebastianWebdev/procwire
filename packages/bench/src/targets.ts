/**
 * Performance target evaluation.
 *
 * Targets are evaluated per (size, executionMode): a result produced under
 * pipelining is judged against the pipelined target set, a sequential result
 * against the sequential one. This keeps mixed runs (a scenario carrying its
 * own `concurrency`, e.g. `pipelined-throughput`, alongside sequential ones)
 * honest instead of grading pipelined throughput against sequential targets.
 */

import type {
  BenchmarkScenario,
  ExecutionMode,
  PayloadSize,
  PerformanceTarget,
  ScenarioResult,
} from "./types.js";
import { PERFORMANCE_TARGETS } from "./types.js";

const TARGET_SIZES: PayloadSize[] = ["1KB", "10KB", "100KB", "1MB", "10MB", "100MB"];
const TARGET_MODES: ExecutionMode[] = ["sequential", "pipelined"];

/**
 * Resolves the execution mode a scenario runs under, honoring its own
 * `concurrency` first and falling back to the run-level concurrency.
 */
export function scenarioExecutionMode(
  scenario: Pick<BenchmarkScenario, "concurrency">,
  runConcurrency: number,
): ExecutionMode {
  const effective = scenario.concurrency ?? runConcurrency;
  return effective > 1 ? "pipelined" : "sequential";
}

/**
 * Calculates performance target results.
 *
 * For each payload size and execution mode, the best raw/result throughput is
 * compared against the target set matching that mode. A size yields up to two
 * targets (one per mode) when both sequential and pipelined raw/result results
 * are present in the run.
 *
 * @param results - Benchmark results to evaluate (each carries its executionMode)
 */
export function calculatePerformanceTargets(results: ScenarioResult[]): PerformanceTarget[] {
  const targets: PerformanceTarget[] = [];

  for (const size of TARGET_SIZES) {
    for (const mode of TARGET_MODES) {
      // Only raw/result results define the throughput baseline, judged against
      // the target set matching the mode they were produced under.
      const sizeResults = results.filter(
        (r) =>
          r.size === size && r.codec === "raw" && r.mode === "result" && r.executionMode === mode,
      );

      if (sizeResults.length === 0) continue;

      const bestResult = sizeResults.reduce((best, r) =>
        r.throughputMBps > best.throughputMBps ? r : best,
      );

      const targetMBps = PERFORMANCE_TARGETS[mode][size];
      const actualMBps = bestResult.throughputMBps;
      const passed = actualMBps >= targetMBps;
      const marginPercent = ((actualMBps - targetMBps) / targetMBps) * 100;
      const margin =
        marginPercent >= 0 ? `+${marginPercent.toFixed(0)}%` : `${marginPercent.toFixed(0)}%`;

      targets.push({
        size,
        executionMode: mode,
        targetMBps,
        actualMBps,
        passed,
        margin,
      });
    }
  }

  return targets;
}
