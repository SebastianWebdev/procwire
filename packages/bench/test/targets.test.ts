/**
 * Unit tests for performance target evaluation.
 */

import { describe, it, expect } from "vitest";
import { calculatePerformanceTargets } from "../src/targets.js";
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

describe("calculatePerformanceTargets", () => {
  it("defaults to the sequential target set", () => {
    const targets = calculatePerformanceTargets([
      makeResult({ size: "1MB", throughputMBps: 1000 }),
    ]);

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      size: "1MB",
      executionMode: "sequential",
      targetMBps: PERFORMANCE_TARGETS.sequential["1MB"], // 800
      actualMBps: 1000,
      passed: true, // 1000 >= 800
    });
  });

  it("grades against the pipelined target set when the run is pipelined", () => {
    const targets = calculatePerformanceTargets(
      [makeResult({ size: "1MB", throughputMBps: 1000 })],
      "pipelined",
    );

    expect(targets[0]).toMatchObject({
      executionMode: "pipelined",
      targetMBps: PERFORMANCE_TARGETS.pipelined["1MB"], // 1500
      passed: false, // 1000 < 1500
    });
  });

  it("grades every size against the whole-run mode regardless of per-result executionMode", () => {
    // A default (sequential) run may contain rows that individually ran
    // pipelined (e.g. pipelined-throughput @ c=4); they are still graded
    // against the sequential targets, not held to the high-concurrency set.
    const targets = calculatePerformanceTargets(
      [
        makeResult({ size: "1MB", throughputMBps: 1000, executionMode: "pipelined" }),
        makeResult({ size: "10MB", throughputMBps: 1300, executionMode: "sequential" }),
      ],
      "sequential",
    );

    expect(targets).toHaveLength(2);
    const oneMb = targets.find((t) => t.size === "1MB");
    const tenMb = targets.find((t) => t.size === "10MB");
    expect(oneMb).toMatchObject({ executionMode: "sequential", passed: true }); // 1000 >= 800
    expect(tenMb).toMatchObject({ executionMode: "sequential", passed: true }); // 1300 >= 1200
  });

  it("picks the best throughput for a size", () => {
    const targets = calculatePerformanceTargets(
      [
        makeResult({ size: "1MB", throughputMBps: 900 }),
        makeResult({ size: "1MB", throughputMBps: 1600 }),
      ],
      "pipelined",
    );

    expect(targets).toHaveLength(1);
    expect(targets[0]?.actualMBps).toBe(1600);
    expect(targets[0]?.passed).toBe(true); // 1600 >= 1500
  });

  it("only considers raw/result rows", () => {
    const targets = calculatePerformanceTargets([
      makeResult({ size: "1MB", throughputMBps: 5000, codec: "msgpack" }),
      makeResult({ size: "1MB", throughputMBps: 5000, mode: "ack" }),
    ]);

    expect(targets).toHaveLength(0);
  });
});
