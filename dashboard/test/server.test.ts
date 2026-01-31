/**
 * Unit tests for the REST API server.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "../src/server/index.js";
import type { FastifyInstance } from "fastify";
import type { SystemMeta, BenchmarkSummary, ScenarioResult } from "../src/db/types.js";

describe("Dashboard API", () => {
  let fastify: FastifyInstance;

  const mockMeta: SystemMeta = {
    timestamp: new Date().toISOString(),
    platform: "linux",
    arch: "x64",
    nodeVersion: "22.0.0",
    hostname: "test-host",
    cpuModel: "Test CPU",
    cpuCores: 8,
    totalMemoryGB: 16,
  };

  const mockResult: ScenarioResult = {
    scenarioId: "full-matrix",
    codec: "raw",
    size: "1KB",
    mode: "result",
    throughputMBps: 25.5,
    totalBytes: 1024000,
    durationMs: 1000,
    requestCount: 1000,
    requestsPerSecond: 1000,
    errors: 0,
    latency: {
      min: 10,
      max: 100,
      mean: 50,
      stddev: 20,
      p50: 45,
      p75: 60,
      p90: 75,
      p95: 85,
      p99: 95,
      p999: 99,
    },
    memory: {
      heapUsed: 50,
      heapTotal: 100,
      external: 10,
      rss: 120,
    },
  };

  const mockSummary: BenchmarkSummary = {
    totalDurationMs: 5000,
    totalRequests: 10000,
    totalBytes: 10240000,
    peakThroughputMBps: 100,
    performanceTargets: [],
    passed: true,
    failedTargets: [],
  };

  beforeAll(async () => {
    const { fastify: app, db } = await createServer({
      dbPath: ":memory:",
      logger: false,
    });
    fastify = app;
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  describe("GET /api/scenarios", () => {
    it("should return scenario list", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/scenarios",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.scenarios).toBeInstanceOf(Array);
      expect(body.scenarios.length).toBeGreaterThan(0);
      expect(body.scenarios[0]).toHaveProperty("id");
      expect(body.scenarios[0]).toHaveProperty("name");
      expect(body.scenarios[0]).toHaveProperty("sizes");
      expect(body.scenarios[0]).toHaveProperty("codecs");
    });
  });

  describe("GET /api/runs", () => {
    it("should return empty list initially", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/runs",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.runs).toEqual([]);
      expect(body.total).toBe(0);
      expect(body.hasMore).toBe(false);
    });

    it("should support pagination", async () => {
      // Create some runs first
      for (let i = 0; i < 5; i++) {
        fastify.db.createRun(mockMeta, ["full-matrix"]);
      }

      const response = await fastify.inject({
        method: "GET",
        url: "/api/runs?limit=2&offset=0",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.runs.length).toBe(2);
      expect(body.total).toBe(5);
      expect(body.hasMore).toBe(true);
    });
  });

  describe("POST /api/runs", () => {
    it("should create a new run", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/runs",
        payload: {
          scenarios: ["full-matrix"],
          options: { concurrency: 1 },
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.id).toBeDefined();
      expect(body.runId).toBeDefined();
      expect(body.status).toBe("running");
      expect(body.wsChannel).toBe("/ws");
    });

    it("should reject invalid scenarios", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/runs",
        payload: {
          scenarios: ["non-existent-scenario"],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("No valid scenarios");
    });
  });

  describe("GET /api/runs/:id", () => {
    it("should return run details", async () => {
      const run = fastify.db.createRun(mockMeta, ["full-matrix"]);

      const response = await fastify.inject({
        method: "GET",
        url: `/api/runs/${run.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(run.id);
      expect(body.status).toBe("running");
      expect(body.meta).toBeDefined();
      expect(body.meta.cpuCores).toBe(8);
    });

    it("should return 404 for non-existent run", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/runs/99999",
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("GET /api/runs/:id/results", () => {
    it("should return results for a run", async () => {
      const run = fastify.db.createRun(mockMeta, ["full-matrix"]);
      fastify.db.saveResult(run.id, mockResult);

      const response = await fastify.inject({
        method: "GET",
        url: `/api/runs/${run.id}/results`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.runId).toBe(run.id);
      expect(body.results.length).toBe(1);
      expect(body.results[0].throughputMBps).toBe(25.5);
    });
  });

  describe("DELETE /api/runs/:id", () => {
    it("should delete a completed run", async () => {
      const run = fastify.db.createRun(mockMeta, ["full-matrix"]);
      fastify.db.updateRunStatus(run.id, "completed", mockSummary);

      const response = await fastify.inject({
        method: "DELETE",
        url: `/api/runs/${run.id}`,
      });

      expect(response.statusCode).toBe(204);
      expect(fastify.db.getRun(run.id)).toBeNull();
    });

    it("should reject deleting a running benchmark", async () => {
      const run = fastify.db.createRun(mockMeta, ["full-matrix"]);

      const response = await fastify.inject({
        method: "DELETE",
        url: `/api/runs/${run.id}`,
      });

      expect(response.statusCode).toBe(409);
    });
  });

  describe("PUT /api/runs/:id/baseline", () => {
    it("should set run as baseline", async () => {
      const run = fastify.db.createRun(mockMeta, ["full-matrix"]);

      const response = await fastify.inject({
        method: "PUT",
        url: `/api/runs/${run.id}/baseline`,
        payload: { isBaseline: true },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(run.id);
      expect(body.isBaseline).toBe(true);

      const updated = fastify.db.getRun(run.id);
      expect(updated?.is_baseline).toBe(1);
    });
  });

  describe("GET /api/compare", () => {
    it("should compare two runs", async () => {
      const run1 = fastify.db.createRun(mockMeta, ["full-matrix"]);
      const run2 = fastify.db.createRun(mockMeta, ["full-matrix"]);

      fastify.db.saveResult(run1.id, { ...mockResult, throughputMBps: 100 });
      fastify.db.saveResult(run2.id, { ...mockResult, throughputMBps: 120 });

      fastify.db.updateRunStatus(run1.id, "completed", mockSummary);
      fastify.db.updateRunStatus(run2.id, "completed", mockSummary);

      const response = await fastify.inject({
        method: "GET",
        url: `/api/compare?baseline=${run1.id}&compare=${run2.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.baseline.id).toBe(run1.id);
      expect(body.compare.id).toBe(run2.id);
      expect(body.comparisons.length).toBe(1);
      expect(body.comparisons[0].delta.throughputPercent).toBeCloseTo(20, 1);
      expect(body.summary.improvements).toBe(1);
    });

    it("should require both parameters", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/compare?baseline=1",
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("GET /api/trends", () => {
    it("should return trend data", async () => {
      const run = fastify.db.createRun(mockMeta, ["full-matrix"]);
      fastify.db.saveResult(run.id, mockResult);
      fastify.db.updateRunStatus(run.id, "completed", mockSummary);

      const response = await fastify.inject({
        method: "GET",
        url: "/api/trends?metric=throughput&size=1KB&codec=raw&mode=result",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.metric).toBe("throughput");
      expect(body.filter.size).toBe("1KB");
      expect(body.dataPoints).toBeInstanceOf(Array);
    });

    it("should require metric and size", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/trends?metric=throughput",
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
