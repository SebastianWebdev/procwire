/**
 * /api/runs - CRUD operations for benchmark runs.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type {
  ListRunsQuery,
  ListRunsResponse,
  RunSummary,
  RunDetailResponse,
  RunResultsResponse,
  CreateRunRequest,
  CreateRunResponse,
  SetBaselineRequest,
  SetBaselineResponse,
  ErrorResponse,
  SystemMeta,
} from "../types.js";
import { getScenariosByIds } from "./scenarios.js";
import os from "os";

/**
 * Convert DbRun to RunSummary for API response.
 */
function toRunSummary(
  run: import("../../db/types.js").DbRun,
  parsed: ReturnType<import("../../db/service.js").BenchmarkDbService["parseDbRun"]>,
): RunSummary {
  return {
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
  };
}

/**
 * Collect system metadata.
 */
function collectSystemMeta(): SystemMeta {
  const cpus = os.cpus();
  return {
    timestamp: new Date().toISOString(),
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    runtime: "node", // Dashboard always runs on Node.js
    hostname: os.hostname(),
    cpuModel: cpus[0]?.model ?? "Unknown",
    cpuCores: cpus.length,
    totalMemoryGB: Math.round((os.totalmem() / (1024 * 1024 * 1024)) * 10) / 10,
  };
}

export async function runsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/runs - List runs
  fastify.get<{
    Querystring: ListRunsQuery;
    Reply: ListRunsResponse;
  }>("/api/runs", async (request, _reply) => {
    const { limit = 50, offset = 0, status, scenario } = request.query;

    const { runs, total } = fastify.db.listRuns({
      limit: Math.min(limit, 100),
      offset,
      status,
      scenarioId: scenario,
    });

    const runSummaries = runs.map((run) => {
      const parsed = fastify.db.parseDbRun(run);
      return toRunSummary(run, parsed);
    });

    return {
      runs: runSummaries,
      total,
      hasMore: offset + runs.length < total,
    };
  });

  // GET /api/runs/:id - Get single run
  fastify.get<{
    Params: { id: string };
    Reply: RunDetailResponse | ErrorResponse;
  }>("/api/runs/:id", async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) {
      return reply.code(400).send({ error: "Invalid run ID" });
    }

    const run = fastify.db.getRun(id);
    if (!run) {
      return reply.code(404).send({ error: "Run not found" });
    }

    const parsed = fastify.db.parseDbRun(run);

    return {
      ...toRunSummary(run, parsed),
      meta: parsed.meta,
      summary: parsed.summary,
      notes: run.notes,
      concurrency: run.concurrency,
    };
  });

  // GET /api/runs/:id/results - Get results for a run
  fastify.get<{
    Params: { id: string };
    Reply: RunResultsResponse | ErrorResponse;
  }>("/api/runs/:id/results", async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) {
      return reply.code(400).send({ error: "Invalid run ID" });
    }

    const run = fastify.db.getRun(id);
    if (!run) {
      return reply.code(404).send({ error: "Run not found" });
    }

    const results = fastify.db.getResults(id);
    return { runId: id, results };
  });

  // POST /api/runs - Create new run
  fastify.post<{
    Body: CreateRunRequest;
    Reply: CreateRunResponse | ErrorResponse;
  }>("/api/runs", async (request, reply) => {
    const { scenarios: scenarioIds, options = {}, metadata = {} } = request.body;

    // Validate scenarios
    const validScenarios = getScenariosByIds(scenarioIds);
    if (validScenarios.length === 0) {
      return reply.code(400).send({ error: "No valid scenarios specified" });
    }

    // Collect system metadata
    const meta = collectSystemMeta();

    // Create run record
    const run = fastify.db.createRun(meta, scenarioIds, {
      concurrency: options.concurrency ?? 1,
      name: metadata.name,
      notes: metadata.notes,
    });

    // TODO: Start benchmark in background (TASK-22 will add WebSocket broadcasting)
    // For now, we just create the run record. The actual benchmark execution
    // will be implemented when we have the WebSocket infrastructure.

    return reply.code(201).send({
      id: run.id,
      runId: run.run_id,
      status: "running",
      wsChannel: "/ws",
    });
  });

  // DELETE /api/runs/:id - Delete a run
  fastify.delete<{
    Params: { id: string };
    Reply: void | ErrorResponse;
  }>("/api/runs/:id", async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) {
      return reply.code(400).send({ error: "Invalid run ID" });
    }

    const run = fastify.db.getRun(id);
    if (!run) {
      return reply.code(404).send({ error: "Run not found" });
    }

    if (run.status === "running") {
      return reply.code(409).send({ error: "Cannot delete running benchmark" });
    }

    fastify.db.deleteRun(id);
    return reply.code(204).send();
  });

  // PUT /api/runs/:id/baseline - Set/unset baseline
  fastify.put<{
    Params: { id: string };
    Body: SetBaselineRequest;
    Reply: SetBaselineResponse | ErrorResponse;
  }>("/api/runs/:id/baseline", async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) {
      return reply.code(400).send({ error: "Invalid run ID" });
    }

    const { isBaseline } = request.body;

    const run = fastify.db.getRun(id);
    if (!run) {
      return reply.code(404).send({ error: "Run not found" });
    }

    fastify.db.setBaseline(id, isBaseline);

    return { id, isBaseline };
  });
}
