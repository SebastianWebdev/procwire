/**
 * GET /api/compare - Compare two benchmark runs.
 */

import type { FastifyInstance } from "fastify";
import type {
  CompareQuery,
  CompareResponse,
  ComparisonRow,
  RunSummary,
  ErrorResponse,
} from "../types.js";

const REGRESSION_THRESHOLD = 10; // 10% drop = regression

export async function compareRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{
    Querystring: CompareQuery;
    Reply: CompareResponse | ErrorResponse;
  }>("/api/compare", async (request, reply) => {
    const { baseline: baselineId, compare: compareId } = request.query;

    if (!baselineId || !compareId) {
      return reply.code(400).send({
        error: "Both baseline and compare query parameters are required",
      });
    }

    if (baselineId === compareId) {
      return reply.code(400).send({
        error: "Cannot compare a run with itself",
      });
    }

    // Get runs
    const baselineRun = fastify.db.getRun(baselineId);
    const compareRun = fastify.db.getRun(compareId);

    if (!baselineRun) {
      return reply.code(404).send({ error: "Baseline run not found" });
    }
    if (!compareRun) {
      return reply.code(404).send({ error: "Compare run not found" });
    }

    // Get comparable results
    const pairs = fastify.db.getComparableResults(baselineId, compareId);

    // Build comparison rows with deltas
    const comparisons: ComparisonRow[] = pairs.map((pair) => {
      const baselineData = pair.baseline
        ? {
            throughputMBps: pair.baseline.throughputMBps,
            latencyP99: pair.baseline.latency.p99,
          }
        : null;

      const compareData = pair.compare
        ? {
            throughputMBps: pair.compare.throughputMBps,
            latencyP99: pair.compare.latency.p99,
          }
        : null;

      // Calculate deltas
      let delta = {
        throughputMBps: 0,
        throughputPercent: 0,
        latencyP99: 0,
        latencyPercent: 0,
        isRegression: false,
      };

      if (baselineData && compareData) {
        const throughputDiff = compareData.throughputMBps - baselineData.throughputMBps;
        const throughputPercent = (throughputDiff / baselineData.throughputMBps) * 100;

        const latencyDiff = compareData.latencyP99 - baselineData.latencyP99;
        const latencyPercent =
          baselineData.latencyP99 > 0 ? (latencyDiff / baselineData.latencyP99) * 100 : 0;

        // Regression: throughput dropped by more than threshold
        const isRegression = throughputPercent < -REGRESSION_THRESHOLD;

        delta = {
          throughputMBps: throughputDiff,
          throughputPercent,
          latencyP99: latencyDiff,
          latencyPercent,
          isRegression,
        };
      }

      return {
        scenarioId: pair.scenarioId,
        codec: pair.codec,
        size: pair.size,
        mode: pair.mode,
        baseline: baselineData,
        compare: compareData,
        delta,
      };
    });

    // Calculate summary
    const withBothResults = comparisons.filter((c) => c.baseline && c.compare);
    const improvements = withBothResults.filter(
      (c) => c.delta.throughputPercent > REGRESSION_THRESHOLD,
    ).length;
    const regressions = withBothResults.filter((c) => c.delta.isRegression).length;
    const unchanged = withBothResults.length - improvements - regressions;

    const overallDeltaPercent =
      withBothResults.length > 0
        ? withBothResults.reduce((sum, c) => sum + c.delta.throughputPercent, 0) /
          withBothResults.length
        : 0;

    // Build run summaries
    const baselineParsed = fastify.db.parseDbRun(baselineRun);
    const compareParsed = fastify.db.parseDbRun(compareRun);

    const toSummary = (run: typeof baselineRun, parsed: typeof baselineParsed): RunSummary => ({
      id: run.id,
      runId: run.run_id,
      startedAt: run.started_at,
      completedAt: run.completed_at,
      status: run.status as RunSummary["status"],
      executionMode: run.execution_mode as RunSummary["executionMode"],
      scenariosRun: parsed.scenariosRun,
      peakThroughputMBps: parsed.summary?.peakThroughputMBps ?? null,
      passed: parsed.summary?.passed ?? null,
      isBaseline: run.is_baseline === 1,
      name: run.name,
    });

    return {
      baseline: toSummary(baselineRun, baselineParsed),
      compare: toSummary(compareRun, compareParsed),
      comparisons,
      summary: {
        improvements,
        regressions,
        unchanged,
        overallDeltaPercent,
      },
    };
  });
}
