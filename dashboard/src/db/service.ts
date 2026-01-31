/**
 * Database service for benchmark dashboard.
 *
 * Provides CRUD operations for benchmark runs and results.
 */

import Database from "better-sqlite3";
import { initializeSchema } from "./schema.js";
import type {
  DbRun,
  DbResult,
  DbRunInsert,
  DbResultInsert,
  ListRunsOptions,
  CreateRunOptions,
  ScenarioResult,
  BenchmarkSummary,
  SystemMeta,
  RunStatus,
  ComparisonPair,
  LatencyStats,
  MemoryStats,
  CodecType,
  PayloadSize,
  ResponseMode,
  ExecutionMode,
} from "./types.js";

/**
 * Generate a unique run ID.
 */
function generateRunId(): string {
  const date = new Date().toISOString().slice(0, 10);
  const random = Math.random().toString(36).substring(2, 8);
  return `run_${date}_${random}`;
}

/**
 * Service class for database operations.
 */
export class BenchmarkDbService {
  private db: Database.Database;
  private readonly dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.db = new Database(dbPath);
  }

  /**
   * Initialize the database schema.
   */
  initialize(): void {
    initializeSchema(this.db);
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }

  /**
   * Get the underlying database instance.
   */
  getDb(): Database.Database {
    return this.db;
  }

  // ==========================================================================
  // Runs CRUD
  // ==========================================================================

  /**
   * Create a new benchmark run.
   */
  createRun(meta: SystemMeta, scenarios: string[], options: CreateRunOptions = {}): DbRun {
    const runId = generateRunId();
    const now = new Date().toISOString();
    const executionMode: ExecutionMode =
      (options.concurrency ?? 1) > 1 ? "pipelined" : "sequential";

    const stmt = this.db.prepare(`
      INSERT INTO runs (
        run_id, started_at, status, execution_mode,
        scenarios_run, concurrency, meta, name, notes
      ) VALUES (
        @run_id, @started_at, @status, @execution_mode,
        @scenarios_run, @concurrency, @meta, @name, @notes
      )
    `);

    const result = stmt.run({
      run_id: runId,
      started_at: now,
      status: "running",
      execution_mode: executionMode,
      scenarios_run: JSON.stringify(scenarios),
      concurrency: options.concurrency ?? 1,
      meta: JSON.stringify(meta),
      name: options.name ?? null,
      notes: options.notes ?? null,
    });

    return this.getRun(result.lastInsertRowid as number)!;
  }

  /**
   * Update the status of a run.
   */
  updateRunStatus(runId: number, status: RunStatus, summary?: BenchmarkSummary): void {
    const now = new Date().toISOString();

    if (status === "completed" || status === "failed") {
      const stmt = this.db.prepare(`
        UPDATE runs
        SET status = @status, completed_at = @completed_at, summary = @summary
        WHERE id = @id
      `);
      stmt.run({
        id: runId,
        status,
        completed_at: now,
        summary: summary ? JSON.stringify(summary) : null,
      });
    } else {
      const stmt = this.db.prepare(`
        UPDATE runs SET status = @status WHERE id = @id
      `);
      stmt.run({ id: runId, status });
    }
  }

  /**
   * Get a run by its numeric ID.
   */
  getRun(runId: number): DbRun | null {
    const stmt = this.db.prepare("SELECT * FROM runs WHERE id = ?");
    return (stmt.get(runId) as DbRun) ?? null;
  }

  /**
   * Get a run by its external string ID.
   */
  getRunByExternalId(externalId: string): DbRun | null {
    const stmt = this.db.prepare("SELECT * FROM runs WHERE run_id = ?");
    return (stmt.get(externalId) as DbRun) ?? null;
  }

  /**
   * List runs with pagination and filtering.
   */
  listRuns(options: ListRunsOptions = {}): { runs: DbRun[]; total: number } {
    const {
      limit = 50,
      offset = 0,
      status,
      scenarioId,
      orderBy = "started_at",
      order = "desc",
    } = options;

    // Build WHERE clause
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (status) {
      conditions.push("status = @status");
      params.status = status;
    }

    if (scenarioId) {
      conditions.push("json_extract(scenarios_run, '$') LIKE @scenarioId");
      params.scenarioId = `%"${scenarioId}"%`;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count total
    const countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM runs ${whereClause}`);
    const { count: total } = countStmt.get(params) as { count: number };

    // Get paginated results
    const orderDirection = order.toUpperCase();
    const stmt = this.db.prepare(`
      SELECT * FROM runs
      ${whereClause}
      ORDER BY ${orderBy} ${orderDirection}
      LIMIT @limit OFFSET @offset
    `);

    const runs = stmt.all({ ...params, limit, offset }) as DbRun[];

    return { runs, total };
  }

  /**
   * Delete a run and its associated results.
   */
  deleteRun(runId: number): boolean {
    const stmt = this.db.prepare("DELETE FROM runs WHERE id = ?");
    const result = stmt.run(runId);
    return result.changes > 0;
  }

  /**
   * Set or unset a run as the baseline.
   *
   * Only one run can be the baseline at a time.
   */
  setBaseline(runId: number, isBaseline: boolean): void {
    const transaction = this.db.transaction(() => {
      if (isBaseline) {
        // Clear existing baseline
        this.db.prepare("UPDATE runs SET is_baseline = 0").run();
      }
      // Set new baseline
      this.db.prepare("UPDATE runs SET is_baseline = @isBaseline WHERE id = @id").run({
        id: runId,
        isBaseline: isBaseline ? 1 : 0,
      });
    });

    transaction();
  }

  /**
   * Get the latest baseline run.
   */
  getLatestBaseline(): DbRun | null {
    const stmt = this.db.prepare(`
      SELECT * FROM runs
      WHERE is_baseline = 1
      ORDER BY started_at DESC
      LIMIT 1
    `);
    return (stmt.get() as DbRun) ?? null;
  }

  // ==========================================================================
  // Results
  // ==========================================================================

  /**
   * Save a single result.
   */
  saveResult(runId: number, result: ScenarioResult): void {
    const stmt = this.db.prepare(`
      INSERT INTO results (
        run_id, scenario_id, codec, size, mode,
        throughput_mbps, total_bytes, duration_ms,
        request_count, requests_per_second, errors,
        latency, memory
      ) VALUES (
        @run_id, @scenario_id, @codec, @size, @mode,
        @throughput_mbps, @total_bytes, @duration_ms,
        @request_count, @requests_per_second, @errors,
        @latency, @memory
      )
    `);

    stmt.run({
      run_id: runId,
      scenario_id: result.scenarioId,
      codec: result.codec,
      size: result.size,
      mode: result.mode,
      throughput_mbps: result.throughputMBps,
      total_bytes: result.totalBytes,
      duration_ms: result.durationMs,
      request_count: result.requestCount,
      requests_per_second: result.requestsPerSecond,
      errors: result.errors,
      latency: JSON.stringify(result.latency),
      memory: JSON.stringify(result.memory),
    });
  }

  /**
   * Save multiple results in a batch (transaction).
   */
  saveResults(runId: number, results: ScenarioResult[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO results (
        run_id, scenario_id, codec, size, mode,
        throughput_mbps, total_bytes, duration_ms,
        request_count, requests_per_second, errors,
        latency, memory
      ) VALUES (
        @run_id, @scenario_id, @codec, @size, @mode,
        @throughput_mbps, @total_bytes, @duration_ms,
        @request_count, @requests_per_second, @errors,
        @latency, @memory
      )
    `);

    const insertMany = this.db.transaction((items: ScenarioResult[]) => {
      for (const result of items) {
        stmt.run({
          run_id: runId,
          scenario_id: result.scenarioId,
          codec: result.codec,
          size: result.size,
          mode: result.mode,
          throughput_mbps: result.throughputMBps,
          total_bytes: result.totalBytes,
          duration_ms: result.durationMs,
          request_count: result.requestCount,
          requests_per_second: result.requestsPerSecond,
          errors: result.errors,
          latency: JSON.stringify(result.latency),
          memory: JSON.stringify(result.memory),
        });
      }
    });

    insertMany(results);
  }

  /**
   * Get all results for a run.
   */
  getResults(runId: number): ScenarioResult[] {
    const stmt = this.db.prepare("SELECT * FROM results WHERE run_id = ?");
    const rows = stmt.all(runId) as DbResult[];

    return rows.map((row) => this.dbResultToScenarioResult(row));
  }

  // ==========================================================================
  // Conversions
  // ==========================================================================

  /**
   * Convert a database result row to a ScenarioResult.
   */
  private dbResultToScenarioResult(row: DbResult): ScenarioResult {
    return {
      scenarioId: row.scenario_id,
      codec: row.codec,
      size: row.size,
      mode: row.mode,
      throughputMBps: row.throughput_mbps,
      totalBytes: row.total_bytes,
      durationMs: row.duration_ms,
      requestCount: row.request_count,
      requestsPerSecond: row.requests_per_second,
      errors: row.errors,
      latency: JSON.parse(row.latency) as LatencyStats,
      memory: JSON.parse(row.memory) as MemoryStats,
    };
  }

  /**
   * Parse a DbRun's JSON fields.
   */
  parseDbRun(run: DbRun): {
    meta: SystemMeta;
    scenariosRun: string[];
    summary: BenchmarkSummary | null;
  } {
    return {
      meta: JSON.parse(run.meta) as SystemMeta,
      scenariosRun: JSON.parse(run.scenarios_run) as string[],
      summary: run.summary ? (JSON.parse(run.summary) as BenchmarkSummary) : null,
    };
  }

  // ==========================================================================
  // Comparison helpers
  // ==========================================================================

  /**
   * Get comparable results between two runs.
   *
   * Returns pairs of results that can be compared (same scenario, codec, size, mode).
   */
  getComparableResults(runId1: number, runId2: number): ComparisonPair[] {
    const results1 = this.getResults(runId1);
    const results2 = this.getResults(runId2);

    // Create a map for quick lookup
    const makeKey = (r: ScenarioResult) => `${r.scenarioId}:${r.codec}:${r.size}:${r.mode}`;

    const map1 = new Map(results1.map((r) => [makeKey(r), r]));
    const map2 = new Map(results2.map((r) => [makeKey(r), r]));

    // Collect all unique keys
    const allKeys = new Set([...map1.keys(), ...map2.keys()]);

    const pairs: ComparisonPair[] = [];
    for (const key of allKeys) {
      const [scenarioId, codec, size, mode] = key.split(":");
      pairs.push({
        scenarioId,
        codec: codec as CodecType,
        size: size as PayloadSize,
        mode: mode as ResponseMode,
        baseline: map1.get(key) ?? null,
        compare: map2.get(key) ?? null,
      });
    }

    return pairs;
  }

  // ==========================================================================
  // Trends
  // ==========================================================================

  /**
   * Get trend data for a specific metric configuration.
   */
  getTrendData(options: {
    metric: "throughput" | "latency_p99" | "rps";
    size: PayloadSize;
    codec?: CodecType;
    mode?: ResponseMode;
    days?: number;
  }): Array<{
    timestamp: string;
    value: number;
    runId: number;
    runName: string | null;
  }> {
    const { metric, size, codec = "raw", mode = "result", days = 30 } = options;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const metricColumn =
      metric === "throughput"
        ? "r.throughput_mbps"
        : metric === "rps"
          ? "r.requests_per_second"
          : "json_extract(r.latency, '$.p99')";

    const stmt = this.db.prepare(`
      SELECT
        runs.started_at as timestamp,
        ${metricColumn} as value,
        runs.id as runId,
        runs.name as runName
      FROM results r
      JOIN runs ON r.run_id = runs.id
      WHERE runs.status = 'completed'
        AND r.size = @size
        AND r.codec = @codec
        AND r.mode = @mode
        AND runs.started_at >= @cutoff
      ORDER BY runs.started_at ASC
    `);

    return stmt.all({
      size,
      codec,
      mode,
      cutoff: cutoffDate.toISOString(),
    }) as Array<{
      timestamp: string;
      value: number;
      runId: number;
      runName: string | null;
    }>;
  }
}
