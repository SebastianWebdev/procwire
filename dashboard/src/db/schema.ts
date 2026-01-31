/**
 * Database schema and migrations for the benchmark dashboard.
 */

import type Database from "better-sqlite3";

const SCHEMA_VERSION = 1;

/**
 * Initialize the database schema, running any pending migrations.
 */
export function initializeSchema(db: Database.Database): void {
  // Enable foreign keys
  db.pragma("foreign_keys = ON");

  // Check current version
  const versionRow = db.pragma("user_version", { simple: true }) as number;

  if (versionRow < SCHEMA_VERSION) {
    runMigrations(db, versionRow);
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  }
}

/**
 * Run migrations from the given version to the current version.
 */
function runMigrations(db: Database.Database, fromVersion: number): void {
  if (fromVersion < 1) {
    db.exec(MIGRATION_001);
  }
  // Future migrations would go here:
  // if (fromVersion < 2) { db.exec(MIGRATION_002); }
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
 * Get the current schema version.
 */
export function getSchemaVersion(db: Database.Database): number {
  return db.pragma("user_version", { simple: true }) as number;
}
