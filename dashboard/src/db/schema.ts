/**
 * Database schema and migrations for the benchmark dashboard.
 */

import type Database from "better-sqlite3";

const SCHEMA_VERSION = 2;

/**
 * Initialize the database schema, running any pending migrations.
 */
export function initializeSchema(db: Database.Database): void {
  // Enable foreign keys
  db.pragma("foreign_keys = ON");

  // Check current version
  const versionRow = db.pragma("user_version", { simple: true }) as number;

  if (versionRow < SCHEMA_VERSION) {
    // Run the migrations and bump user_version atomically. DDL is transactional
    // in SQLite, so a crash mid-upgrade rolls back BOTH the schema change and
    // the version bump together. Without this, a process killed after an
    // ALTER TABLE but before the version bump would re-enter runMigrations on
    // the next start and re-run the same `ADD COLUMN`, throwing
    // "duplicate column name" and bricking startup.
    const migrate = db.transaction(() => {
      runMigrations(db, versionRow);
      db.pragma(`user_version = ${SCHEMA_VERSION}`);
    });
    migrate();
  }
}

/**
 * Run migrations from the given version to the current version.
 */
function runMigrations(db: Database.Database, fromVersion: number): void {
  if (fromVersion < 1) {
    db.exec(MIGRATION_001);
  }
  if (fromVersion < 2) {
    db.exec(MIGRATION_002);
  }
}

/**
 * Migration 001: Initial schema.
 *
 * Creates the runs and results tables with all necessary indexes.
 */
const MIGRATION_001 = `
  -- Benchmark runs (main table)
  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT UNIQUE NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
    execution_mode TEXT NOT NULL CHECK (execution_mode IN ('sequential', 'pipelined')),
    scenarios_run TEXT NOT NULL,
    concurrency INTEGER DEFAULT 1,
    meta TEXT NOT NULL,
    summary TEXT,
    name TEXT,
    notes TEXT,
    is_baseline INTEGER DEFAULT 0 CHECK (is_baseline IN (0, 1)),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Individual test results
  CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL,
    scenario_id TEXT NOT NULL,
    codec TEXT NOT NULL CHECK (codec IN ('raw', 'msgpack', 'arrow')),
    size TEXT NOT NULL CHECK (size IN ('1KB', '10KB', '100KB', '1MB', '10MB', '100MB')),
    mode TEXT NOT NULL CHECK (mode IN ('result', 'stream', 'ack')),
    throughput_mbps REAL NOT NULL,
    total_bytes INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    request_count INTEGER NOT NULL,
    requests_per_second REAL NOT NULL,
    errors INTEGER NOT NULL DEFAULT 0,
    latency TEXT NOT NULL,
    memory TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
  );

  -- Indexes for runs table
  CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
  CREATE INDEX IF NOT EXISTS idx_runs_baseline ON runs(is_baseline) WHERE is_baseline = 1;

  -- Indexes for results table
  CREATE INDEX IF NOT EXISTS idx_results_run_id ON results(run_id);
  CREATE INDEX IF NOT EXISTS idx_results_scenario ON results(scenario_id);
  CREATE INDEX IF NOT EXISTS idx_results_lookup ON results(codec, size, mode);
`;

/**
 * Migration 002: Per-result execution mode.
 *
 * Records whether each result was produced sequentially or pipelined, so the
 * dashboard can grade a result against the target set matching its own
 * concurrency (scenarios like `pipelined-throughput` carry their own
 * concurrency and run pipelined even when the run-level option is sequential).
 * Existing rows predate pipelined scenarios and default to 'sequential'.
 */
const MIGRATION_002 = `
  ALTER TABLE results ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'sequential'
    CHECK (execution_mode IN ('sequential', 'pipelined'));
`;

/**
 * Get the current schema version.
 */
export function getSchemaVersion(db: Database.Database): number {
  return db.pragma("user_version", { simple: true }) as number;
}
