/**
 * Unit tests for performance target evaluation.
 */

import { describe, it, expect } from "vitest";
import { calculatePerformanceTargets, scenarioExecutionMode } from "../src/targets.js";
import { PERFORMANCE_TARGETS } from "../src/types.js";
import type { ScenarioResult } from "../src/types.js";

function makeResult(overrides: Partial<ScenarioResult> = {}): ScenarioResult {
  return {
    scenarioId: "test",
    codec: "raw",
    size: "1MB",
    mode: "result",
    executionMode: "sequential",
    throughputMBps: 0,
    totalBytes: 0,
    durationMs: 0,
    requestCount: 0,
    requestsPerSecond: 0,
    errors: 0,
    latency: {
      min: 0,
      max: 0,
      mean: 0,
      stddev: 0,
      p50: 0,
      p75: 0,
      p90: 0,
      p95: 0,
      p99: 0,
      p999: 0,
    },
    memory: { heapUsed: 0, heapTotal: 0, external: 0, rss: 0 },
    ...overrides,
  };
}

describe("scenarioExecutionMode", () => {
  it("honors the scenario's own concurrency over the run-level value", () => {
    expect(scenarioExecutionMode({ concurrency: 32 }, 1)).toBe("pipelined");
    expect(scenarioExecutionMode({ concurrency: 4 }, 1)).toBe("pipelined");
  });

  it("falls back to the run-level concurrency when the scenario has none", () => {
    expect(scenarioExecutionMode({}, 1)).toBe("sequential");
    expect(scenarioExecutionMode({}, 8)).toBe("pipelined");
  });

  it("treats concurrency 1 as sequential regardless of the run-level value", () => {
    expect(scenarioExecutionMode({ concurrency: 1 }, 16)).toBe("sequential");
  });
});

describe("calculatePerformanceTargets", () => {
  it("grades a pipelined result against the pipelined target set", () => {
    const targets = calculatePerformanceTargets([
      makeResult({ size: "1MB", throughputMBps: 1000, executionMode: "pipelined" }),
    ]);

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      size: "1MB",
      executionMode: "pipelined",
      targetMBps: PERFORMANCE_TARGETS.pipelined["1MB"], // 1500
      actualMBps: 1000,
      passed: false, // 1000 < 1500
    });
  });

  it("grades the same throughput as passing under the sequential target set", () => {
    const targets = calculatePerformanceTargets([
      makeResult({ size: "1MB", throughputMBps: 1000, executionMode: "sequential" }),
    ]);

    expect(targets[0]).toMatchObject({
      executionMode: "sequential",
      targetMBps: PERFORMANCE_TARGETS.sequential["1MB"], // 800
      passed: true, // 1000 >= 800
    });
  });

  it("emits a separate target per (size, mode) for mixed runs", () => {
    const targets = calculatePerformanceTargets([
      makeResult({ size: "10MB", throughputMBps: 1300, executionMode: "sequential" }),
      makeResult({ size: "10MB", throughputMBps: 1400, executionMode: "pipelined" }),
    ]);

    expect(targets).toHaveLength(2);
    const seq = targets.find((t) => t.executionMode === "sequential");
    const pipe = targets.find((t) => t.executionMode === "pipelined");
    expect(seq?.passed).toBe(true); // 1300 >= 1200 (sequential 10MB)
    expect(pipe?.passed).toBe(false); // 1400 < 2000 (pipelined 10MB)
  });

  it("picks the best throughput within a (size, mode) group", () => {
    const targets = calculatePerformanceTargets([
      makeResult({ size: "1MB", throughputMBps: 900, executionMode: "pipelined" }),
      makeResult({ size: "1MB", throughputMBps: 1600, executionMode: "pipelined" }),
    ]);

    expect(targets).toHaveLength(1);
    expect(targets[0]?.actualMBps).toBe(1600);
    expect(targets[0]?.passed).toBe(true); // 1600 >= 1500
  });

  it("only considers raw/result rows", () => {
    const targets = calculatePerformanceTargets([
      makeResult({
        size: "1MB",
        throughputMBps: 5000,
        executionMode: "pipelined",
        codec: "msgpack",
      }),
      makeResult({ size: "1MB", throughputMBps: 5000, executionMode: "pipelined", mode: "ack" }),
    ]);

    expect(targets).toHaveLength(0);
  });
});
