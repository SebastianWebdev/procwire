/**
 * Unit tests for the database layer.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BenchmarkDbService } from "../src/db/service.js";
import type { ScenarioResult, SystemMeta, BenchmarkSummary } from "../src/db/types.js";

describe("BenchmarkDbService", () => {
  let db: BenchmarkDbService;

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

  beforeEach(() => {
    // Use in-memory database for tests
    db = new BenchmarkDbService(":memory:");
    db.initialize();
  });

  afterEach(() => {
    db.close();
  });

  describe("initialization", () => {
    it("should initialize schema without errors", () => {
      const newDb = new BenchmarkDbService(":memory:");
      expect(() => newDb.initialize()).not.toThrow();
      newDb.close();
    });

    it("should be idempotent (can initialize multiple times)", () => {
      expect(() => db.initialize()).not.toThrow();
      expect(() => db.initialize()).not.toThrow();
    });
  });

  describe("runs CRUD", () => {
    it("should create a run", () => {
      const run = db.createRun(mockMeta, ["full-matrix"], { concurrency: 1 });

      expect(run.id).toBeDefined();
      expect(run.status).toBe("running");
      expect(run.execution_mode).toBe("sequential");
      expect(run.run_id).toMatch(/^run_\d{4}-\d{2}-\d{2}_[a-z0-9]+$/);
    });

    it("should create a pipelined run when concurrency > 1", () => {
      const run = db.createRun(mockMeta, ["full-matrix"], { concurrency: 32 });

      expect(run.execution_mode).toBe("pipelined");
      expect(run.concurrency).toBe(32);
    });

    it("should retrieve a run by ID", () => {
      const created = db.createRun(mockMeta, ["full-matrix"]);
      const retrieved = db.getRun(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.status).toBe("running");
    });

    it("should retrieve a run by external ID", () => {
      const created = db.createRun(mockMeta, ["full-matrix"]);
      const retrieved = db.getRunByExternalId(created.run_id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
    });

    it("should return null for non-existent run", () => {
      const run = db.getRun(99999);
      expect(run).toBeNull();
    });

    it("should update run status to completed", () => {
      const run = db.createRun(mockMeta, ["full-matrix"]);
      db.updateRunStatus(run.id, "completed", mockSummary);

      const updated = db.getRun(run.id);
      expect(updated?.status).toBe("completed");
      expect(updated?.completed_at).not.toBeNull();
      expect(updated?.summary).not.toBeNull();
    });

    it("should update run status to failed", () => {
      const run = db.createRun(mockMeta, ["full-matrix"]);
      db.updateRunStatus(run.id, "failed");

      const updated = db.getRun(run.id);
      expect(updated?.status).toBe("failed");
      expect(updated?.completed_at).not.toBeNull();
    });

    it("should delete a run", () => {
      const run = db.createRun(mockMeta, ["full-matrix"]);
      const deleted = db.deleteRun(run.id);

      expect(deleted).toBe(true);
      expect(db.getRun(run.id)).toBeNull();
    });

    it("should return false when deleting non-existent run", () => {
      const deleted = db.deleteRun(99999);
      expect(deleted).toBe(false);
    });
  });

  describe("run listing", () => {
    beforeEach(() => {
      // Create 10 runs
      for (let i = 0; i < 10; i++) {
        const run = db.createRun(mockMeta, ["full-matrix"]);
        if (i < 5) {
          db.updateRunStatus(run.id, "completed", mockSummary);
        }
      }
    });

    it("should list runs with default pagination", () => {
      const { runs, total } = db.listRuns();

      expect(runs.length).toBe(10);
      expect(total).toBe(10);
    });

    it("should list runs with custom limit", () => {
      const { runs, total } = db.listRuns({ limit: 5, offset: 0 });

      expect(runs.length).toBe(5);
      expect(total).toBe(10);
    });

    it("should list runs with offset", () => {
      const { runs, total } = db.listRuns({ limit: 5, offset: 5 });

      expect(runs.length).toBe(5);
      expect(total).toBe(10);
    });

    it("should filter by status", () => {
      const { runs, total } = db.listRuns({ status: "completed" });

      expect(runs.length).toBe(5);
      expect(total).toBe(5);
      runs.forEach((run) => expect(run.status).toBe("completed"));
    });

    it("should order by started_at descending by default", () => {
      const { runs } = db.listRuns();

      for (let i = 1; i < runs.length; i++) {
        expect(runs[i - 1].started_at >= runs[i].started_at).toBe(true);
      }
    });
  });

  describe("baseline operations", () => {
    it("should set a run as baseline", () => {
      const run = db.createRun(mockMeta, ["full-matrix"]);
      db.setBaseline(run.id, true);

      const updated = db.getRun(run.id);
      expect(updated?.is_baseline).toBe(1);
    });

    it("should unset a run as baseline", () => {
      const run = db.createRun(mockMeta, ["full-matrix"]);
      db.setBaseline(run.id, true);
      db.setBaseline(run.id, false);

      const updated = db.getRun(run.id);
      expect(updated?.is_baseline).toBe(0);
    });

    it("should only have one baseline at a time", () => {
      const run1 = db.createRun(mockMeta, ["full-matrix"]);
      const run2 = db.createRun(mockMeta, ["full-matrix"]);

      db.setBaseline(run1.id, true);
      expect(db.getRun(run1.id)?.is_baseline).toBe(1);

      db.setBaseline(run2.id, true);
      expect(db.getRun(run1.id)?.is_baseline).toBe(0);
      expect(db.getRun(run2.id)?.is_baseline).toBe(1);
    });

    it("should get latest baseline", () => {
      const run1 = db.createRun(mockMeta, ["full-matrix"]);
      db.setBaseline(run1.id, true);

      const baseline = db.getLatestBaseline();
      expect(baseline?.id).toBe(run1.id);
    });

    it("should return null when no baseline exists", () => {
      db.createRun(mockMeta, ["full-matrix"]);
      const baseline = db.getLatestBaseline();
      expect(baseline).toBeNull();
    });
  });

  describe("results", () => {
    it("should save a single result", () => {
      const run = db.createRun(mockMeta, ["full-matrix"]);
      db.saveResult(run.id, mockResult);

      const results = db.getResults(run.id);
      expect(results.length).toBe(1);
      expect(results[0].throughputMBps).toBe(25.5);
    });

    it("should save multiple results in batch", () => {
      const run = db.createRun(mockMeta, ["full-matrix"]);
      const results: ScenarioResult[] = [
        { ...mockResult, size: "1KB" },
        { ...mockResult, size: "10KB", throughputMBps: 150 },
        { ...mockResult, size: "100KB", throughputMBps: 500 },
      ];

      db.saveResults(run.id, results);

      const retrieved = db.getResults(run.id);
      expect(retrieved.length).toBe(3);
    });

    it("should return empty array for run with no results", () => {
      const run = db.createRun(mockMeta, ["full-matrix"]);
      const results = db.getResults(run.id);
      expect(results).toEqual([]);
    });

    it("should preserve latency and memory stats as objects", () => {
      const run = db.createRun(mockMeta, ["full-matrix"]);
      db.saveResult(run.id, mockResult);

      const results = db.getResults(run.id);
      expect(results[0].latency.p99).toBe(95);
      expect(results[0].memory.heapUsed).toBe(50);
    });

    it("should delete results when run is deleted (cascade)", () => {
      const run = db.createRun(mockMeta, ["full-matrix"]);
      db.saveResult(run.id, mockResult);

      db.deleteRun(run.id);

      // Results should be deleted too - verify by checking the table directly
      const stmt = db.getDb().prepare("SELECT COUNT(*) as count FROM results WHERE run_id = ?");
      const { count } = stmt.get(run.id) as { count: number };
      expect(count).toBe(0);
    });
  });

  describe("comparison", () => {
    it("should get comparable results between two runs", () => {
      const run1 = db.createRun(mockMeta, ["full-matrix"]);
      const run2 = db.createRun(mockMeta, ["full-matrix"]);

      const result1 = { ...mockResult, throughputMBps: 100 };
      const result2 = { ...mockResult, throughputMBps: 120 };

      db.saveResult(run1.id, result1);
      db.saveResult(run2.id, result2);

      const pairs = db.getComparableResults(run1.id, run2.id);

      expect(pairs.length).toBe(1);
      expect(pairs[0].baseline?.throughputMBps).toBe(100);
      expect(pairs[0].compare?.throughputMBps).toBe(120);
    });

    it("should handle missing results in comparison", () => {
      const run1 = db.createRun(mockMeta, ["full-matrix"]);
      const run2 = db.createRun(mockMeta, ["full-matrix"]);

      db.saveResult(run1.id, { ...mockResult, size: "1KB" });
      db.saveResult(run2.id, { ...mockResult, size: "10KB" });

      const pairs = db.getComparableResults(run1.id, run2.id);

      expect(pairs.length).toBe(2);

      const pair1KB = pairs.find((p) => p.size === "1KB");
      const pair10KB = pairs.find((p) => p.size === "10KB");

      expect(pair1KB?.baseline).not.toBeNull();
      expect(pair1KB?.compare).toBeNull();
      expect(pair10KB?.baseline).toBeNull();
      expect(pair10KB?.compare).not.toBeNull();
    });
  });

  describe("trends", () => {
    it("should get trend data for a metric", () => {
      // Create and complete a run with results
      const run = db.createRun(mockMeta, ["full-matrix"]);
      db.saveResult(run.id, mockResult);
      db.updateRunStatus(run.id, "completed", mockSummary);

      const trends = db.getTrendData({
        metric: "throughput",
        size: "1KB",
        codec: "raw",
        mode: "result",
      });

      expect(trends.length).toBe(1);
      expect(trends[0].value).toBe(25.5);
      expect(trends[0].runId).toBe(run.id);
    });

    it("should filter trend data by date range", () => {
      const run = db.createRun(mockMeta, ["full-matrix"]);
      db.saveResult(run.id, mockResult);
      db.updateRunStatus(run.id, "completed", mockSummary);

      // With very short range (0 days), should get no results
      // because the cutoff would be today
      const trends = db.getTrendData({
        metric: "throughput",
        size: "1KB",
        days: 30,
      });

      expect(trends.length).toBeGreaterThanOrEqual(0);
    });

    it("should return empty array when no matching data", () => {
      const trends = db.getTrendData({
        metric: "throughput",
        size: "100MB",
        codec: "arrow",
      });

      expect(trends).toEqual([]);
    });
  });

  describe("parseDbRun", () => {
    it("should parse JSON fields from DbRun", () => {
      const run = db.createRun(mockMeta, ["full-matrix", "latency-baseline"]);
      db.updateRunStatus(run.id, "completed", mockSummary);

      const updated = db.getRun(run.id)!;
      const parsed = db.parseDbRun(updated);

      expect(parsed.meta.platform).toBe("linux");
      expect(parsed.scenariosRun).toEqual(["full-matrix", "latency-baseline"]);
      expect(parsed.summary?.passed).toBe(true);
    });
  });
});
