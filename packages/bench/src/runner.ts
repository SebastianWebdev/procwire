/**
 * Benchmark runner - orchestrates benchmark execution.
 */

import { EventEmitter } from "node:events";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import os from "node:os";
import { ModuleManager } from "@procwire/core";
import { Module } from "@procwire/core";
import { rawCodec, msgpackCodec, type Codec } from "@procwire/codecs";
import { arrowCodec } from "@procwire/codecs/arrow";

import type {
  BenchmarkScenario,
  ScenarioResult,
  BenchmarkResults,
  BenchmarkSummary,
  SystemMeta,
  PayloadSize,
  CodecType,
  ResponseMode,
  PerformanceTarget,
  SaturationResult,
  ConcurrencyLevelResult,
  RuntimeType,
} from "./types.js";
import { PERFORMANCE_TARGETS, type ExecutionMode } from "./types.js";
import { MetricsCollector } from "./metrics.js";
import { generatePayload, getPayloadByteSize } from "./payload.js";
import { getIterationsForSize } from "./scenarios.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = join(__dirname, "..", "workers", "benchmark-worker.ts");

// Find tsx loader in monorepo root
const ROOT_DIR = join(__dirname, "..", "..", "..");
const TSX_LOADER = pathToFileURL(
  join(ROOT_DIR, "node_modules", "tsx", "dist", "esm", "index.mjs"),
).href;

const NODE_BIN = process.execPath;

/**
 * Maps codec type to codec instance.
 */
function getCodec(codecType: CodecType): Codec {
  switch (codecType) {
    case "raw":
      return rawCodec;
    case "msgpack":
      return msgpackCodec;
    case "arrow":
      return arrowCodec;
    default:
      throw new Error(`Unknown codec: ${codecType}`);
  }
}

/**
 * Gets the method name for a codec/mode combination.
 */
function getMethodName(codec: CodecType, mode: ResponseMode): string {
  return `${codec}_${mode}`;
}

/**
 * Detects current runtime.
 */
function detectRuntime(): RuntimeType {
  // @ts-expect-error - Bun global is defined at runtime
  if (typeof Bun !== "undefined") {
    return "bun";
  }
  return "node";
}

/**
 * Collects system metadata.
 */
function getSystemMeta(runtime?: RuntimeType): SystemMeta {
  const cpus = os.cpus();
  const detectedRuntime = runtime ?? detectRuntime();

  const meta: SystemMeta = {
    timestamp: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    runtime: detectedRuntime,
    hostname: os.hostname(),
    cpuModel: cpus[0]?.model ?? "unknown",
    cpuCores: cpus.length,
    totalMemoryGB: os.totalmem() / (1024 * 1024 * 1024),
  };

  // Add Bun version if running on Bun
  if (detectedRuntime === "bun") {
    // @ts-expect-error - Bun global is defined at runtime
    meta.bunVersion = typeof Bun !== "undefined" ? Bun.version : undefined;
  }

  return meta;
}

/**
 * Calculates performance target results.
 * @param results - Benchmark results to evaluate
 * @param executionMode - Which target set to use (sequential or pipelined)
 */
function calculatePerformanceTargets(
  results: ScenarioResult[],
  executionMode: ExecutionMode = "sequential",
): PerformanceTarget[] {
  const targets: PerformanceTarget[] = [];
  const sizes: PayloadSize[] = ["1KB", "10KB", "100KB", "1MB", "10MB", "100MB"];
  const targetSet = PERFORMANCE_TARGETS[executionMode];

  for (const size of sizes) {
    // Find best throughput for this size (raw codec, result mode)
    const sizeResults = results.filter(
      (r) => r.size === size && r.codec === "raw" && r.mode === "result",
    );

    if (sizeResults.length === 0) continue;

    const bestResult = sizeResults.reduce((best, r) =>
      r.throughputMBps > best.throughputMBps ? r : best,
    );

    const targetMBps = targetSet[size];
    const actualMBps = bestResult.throughputMBps;
    const passed = actualMBps >= targetMBps;
    const marginPercent = ((actualMBps - targetMBps) / targetMBps) * 100;
    const margin =
      marginPercent >= 0 ? `+${marginPercent.toFixed(0)}%` : `${marginPercent.toFixed(0)}%`;

    targets.push({
      size,
      targetMBps,
      actualMBps,
      passed,
      margin,
    });
  }

  return targets;
}

/**
 * Runner options for controlling execution mode.
 */
export interface RunnerOptions {
  /** Concurrency level (1 = sequential, >1 = pipelined) */
  concurrency?: number;
  /** Run saturation curve analysis */
  saturation?: boolean;
  /** Runtime to use (node or bun). Auto-detected if not specified. */
  runtime?: RuntimeType;
}

/**
 * Default concurrency levels for saturation analysis.
 */
const DEFAULT_CONCURRENCY_LEVELS = [1, 2, 4, 8, 16, 32, 64, 128];

/**
 * BenchmarkRunner events:
 * - 'scenario:start' (scenarioId: string)
 * - 'scenario:progress' (scenarioId: string, current: number, total: number)
 * - 'scenario:complete' (scenarioId: string, result: ScenarioResult)
 * - 'benchmark:start' ()
 * - 'benchmark:complete' (results: BenchmarkResults)
 */
export class BenchmarkRunner extends EventEmitter {
  private results: ScenarioResult[] = [];
  private saturationResults: SaturationResult[] = [];
  private concurrency: number = 1;
  private runtime: RuntimeType = "node";

  /**
   * Runs the benchmark suite.
   * @param scenarios - Scenarios to run
   * @param options - Runner options (concurrency, etc.)
   */
  async run(
    scenarios: BenchmarkScenario[],
    options: RunnerOptions = {},
  ): Promise<BenchmarkResults> {
    const startTime = Date.now();
    this.results = [];
    this.saturationResults = [];
    this.concurrency = options.concurrency ?? 1;
    this.runtime = options.runtime ?? detectRuntime();

    const executionMode: ExecutionMode = this.concurrency > 1 ? "pipelined" : "sequential";

    this.emit("benchmark:start");

    for (const scenario of scenarios) {
      // Check if saturation analysis is requested
      if (options.saturation || scenario.concurrencyLevels) {
        await this.runSaturationAnalysis(scenario);
      } else {
        // Use scenario-level concurrency if specified, otherwise use runner-level
        const scenarioConcurrency = scenario.concurrency ?? this.concurrency;
        await this.runScenario(scenario, scenarioConcurrency);
      }
    }

    const totalDurationMs = Date.now() - startTime;
    const benchmarkResults = this.buildResults(scenarios, totalDurationMs, executionMode);

    this.emit("benchmark:complete", benchmarkResults);

    return benchmarkResults;
  }

  /**
   * Runs a single scenario (all size/codec/mode combinations).
   * @param scenario - Scenario configuration
   * @param concurrency - Concurrency level (1 = sequential, >1 = pipelined)
   */
  private async runScenario(scenario: BenchmarkScenario, concurrency: number = 1): Promise<void> {
    this.emit("scenario:start", scenario.id);

    // Calculate total combinations for progress
    const totalCombinations =
      scenario.sizes.length * scenario.codecs.length * scenario.modes.length;
    let completedCombinations = 0;

    // Create manager and module for this scenario
    const manager = new ModuleManager();

    // Register all methods we'll need
    const module = new Module("bench-worker").executable(NODE_BIN, [
      "--import",
      TSX_LOADER,
      WORKER_PATH,
    ]);

    // Register all method combinations
    for (const codec of scenario.codecs) {
      for (const mode of scenario.modes) {
        const methodName = getMethodName(codec, mode);
        module.method(methodName, {
          codec: getCodec(codec),
          response: mode,
        });
      }
    }

    manager.register(module);

    try {
      await manager.spawn("bench-worker");

      // Run all combinations
      for (const size of scenario.sizes) {
        for (const codec of scenario.codecs) {
          for (const mode of scenario.modes) {
            const result =
              concurrency > 1
                ? await this.runPipelinedBenchmark(module, scenario, size, codec, mode, concurrency)
                : await this.runSingleBenchmark(module, scenario, size, codec, mode);

            this.results.push(result);
            completedCombinations++;

            this.emit("scenario:progress", scenario.id, completedCombinations, totalCombinations);
            this.emit("scenario:complete", scenario.id, result);
          }
        }
      }
    } finally {
      await manager.shutdown();
    }
  }

  /**
   * Runs a single benchmark (one size/codec/mode combination).
   */
  private async runSingleBenchmark(
    module: Module,
    scenario: BenchmarkScenario,
    size: PayloadSize,
    codec: CodecType,
    mode: ResponseMode,
  ): Promise<ScenarioResult> {
    const methodName = getMethodName(codec, mode);
    const payload = generatePayload(size, codec);
    const payloadBytes = getPayloadByteSize(size);

    // Get scaled iterations for this size (larger payloads = fewer iterations)
    const { iterations, warmup } = getIterationsForSize(scenario, size);

    const collector = new MetricsCollector();

    // Warmup phase
    for (let i = 0; i < warmup; i++) {
      try {
        await this.executeRequest(module, methodName, mode, payload);
      } catch {
        // Ignore warmup errors
      }
    }

    // Force GC if available (run with --expose-gc)
    if (global.gc) {
      global.gc();
    }

    // Measurement phase
    collector.start();

    for (let i = 0; i < iterations; i++) {
      const requestStart = process.hrtime.bigint();

      try {
        await this.executeRequest(module, methodName, mode, payload);
        const requestEnd = process.hrtime.bigint();
        collector.recordLatency(requestEnd - requestStart);
        // Throughput bytes: echo-style modes return the payload (request +
        // response), ack handlers return an empty acknowledgement - counting
        // payloadBytes * 2 for ack inflated MB/s by ~2x.
        collector.recordBytes(mode === "ack" ? payloadBytes : payloadBytes * 2);
      } catch {
        collector.recordError();
      }
    }

    collector.stop();

    return collector.buildResult(scenario.id, codec, size, mode);
  }

  /**
   * Executes a single request based on response mode.
   */
  private async executeRequest(
    module: Module,
    method: string,
    mode: ResponseMode,
    payload: unknown,
  ): Promise<void> {
    if (mode === "stream") {
      // Consume the entire stream
      for await (const _chunk of module.stream(method, payload)) {
        // Just consume
      }
    } else {
      // result or ack
      await module.send(method, payload);
    }
  }

  /**
   * Runs a pipelined benchmark (multiple concurrent requests).
   * This measures realistic throughput with request pipelining.
   */
  private async runPipelinedBenchmark(
    module: Module,
    scenario: BenchmarkScenario,
    size: PayloadSize,
    codec: CodecType,
    mode: ResponseMode,
    concurrency: number,
  ): Promise<ScenarioResult> {
    const methodName = getMethodName(codec, mode);
    const payload = generatePayload(size, codec);
    const payloadBytes = getPayloadByteSize(size);

    // Get scaled iterations for this size
    const { iterations, warmup } = getIterationsForSize(scenario, size);

    const collector = new MetricsCollector();

    // Warmup phase (still sequential for consistency)
    for (let i = 0; i < warmup; i++) {
      try {
        await this.executeRequest(module, methodName, mode, payload);
      } catch {
        // Ignore warmup errors
      }
    }

    // Force GC if available
    if (global.gc) {
      global.gc();
    }

    // Measurement phase with pipelining
    collector.start();

    const inflight = new Set<Promise<void>>();

    for (let i = 0; i < iterations; i++) {
      const requestStart = process.hrtime.bigint();

      // Fire request immediately (no await!)
      const promise = this.executeRequest(module, methodName, mode, payload)
        .then(() => {
          const requestEnd = process.hrtime.bigint();
          collector.recordLatency(requestEnd - requestStart);
          // Same accounting as the sequential path: ack returns no payload.
          collector.recordBytes(mode === "ack" ? payloadBytes : payloadBytes * 2);
          inflight.delete(promise);
        })
        .catch(() => {
          collector.recordError();
          inflight.delete(promise);
        });

      inflight.add(promise);

      // Backpressure: limit concurrent requests
      if (inflight.size >= concurrency) {
        await Promise.race(inflight);
      }
    }

    // Wait for all remaining requests
    await Promise.all(inflight);

    collector.stop();

    return collector.buildResult(scenario.id, codec, size, mode);
  }

  /**
   * Runs saturation curve analysis for a scenario.
   * Tests multiple concurrency levels to find the optimal saturation point.
   */
  private async runSaturationAnalysis(scenario: BenchmarkScenario): Promise<void> {
    this.emit("scenario:start", scenario.id);

    const levels = scenario.concurrencyLevels ?? DEFAULT_CONCURRENCY_LEVELS;

    // Create manager and module for this scenario
    const manager = new ModuleManager();

    const module = new Module("bench-worker").executable(NODE_BIN, [
      "--import",
      TSX_LOADER,
      WORKER_PATH,
    ]);

    // Register all method combinations
    for (const codec of scenario.codecs) {
      for (const mode of scenario.modes) {
        const methodName = getMethodName(codec, mode);
        module.method(methodName, {
          codec: getCodec(codec),
          response: mode,
        });
      }
    }

    manager.register(module);

    try {
      await manager.spawn("bench-worker");

      // Run saturation analysis for each size/codec/mode combination
      for (const size of scenario.sizes) {
        for (const codec of scenario.codecs) {
          for (const mode of scenario.modes) {
            const saturationResult = await this.runSaturationCurve(
              module,
              scenario,
              size,
              codec,
              mode,
              levels,
            );

            this.saturationResults.push(saturationResult);

            // Also add the baseline (concurrency=1) result to regular results
            const baselineLevel = saturationResult.levels.find((l) => l.concurrency === 1);
            if (baselineLevel) {
              // Create a ScenarioResult from the baseline
              const baselineResult: ScenarioResult = {
                scenarioId: scenario.id,
                codec,
                size,
                mode,
                throughputMBps: baselineLevel.throughputMBps,
                totalBytes: 0, // Not tracked in saturation
                durationMs: 0, // Not tracked separately
                requestCount: 0,
                requestsPerSecond: baselineLevel.requestsPerSecond,
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
                errors: 0,
              };
              this.results.push(baselineResult);
            }

            this.emit("saturation:complete", scenario.id, saturationResult);
          }
        }
      }
    } finally {
      await manager.shutdown();
    }
  }

  /**
   * Runs saturation curve for a single size/codec/mode combination.
   */
  private async runSaturationCurve(
    module: Module,
    scenario: BenchmarkScenario,
    size: PayloadSize,
    codec: CodecType,
    mode: ResponseMode,
    concurrencyLevels: number[],
  ): Promise<SaturationResult> {
    const results: ConcurrencyLevelResult[] = [];
    let baselineRps = 0;

    for (const concurrency of concurrencyLevels) {
      const result =
        concurrency === 1
          ? await this.runSingleBenchmark(module, scenario, size, codec, mode)
          : await this.runPipelinedBenchmark(module, scenario, size, codec, mode, concurrency);

      if (concurrency === 1) {
        baselineRps = result.requestsPerSecond;
      }

      const improvement =
        baselineRps > 0 ? ((result.requestsPerSecond - baselineRps) / baselineRps) * 100 : 0;

      results.push({
        concurrency,
        requestsPerSecond: result.requestsPerSecond,
        throughputMBps: result.throughputMBps,
        improvementPercent: improvement,
      });
    }

    // Find saturation point (where improvement drops below 10%)
    const optimalConcurrency = this.findSaturationPoint(results);
    const peakRps = Math.max(...results.map((r) => r.requestsPerSecond));

    return {
      scenarioId: scenario.id,
      codec,
      size,
      mode,
      levels: results,
      optimalConcurrency,
      peakRequestsPerSecond: peakRps,
    };
  }

  /**
   * Finds the saturation point where additional concurrency doesn't help.
   */
  private findSaturationPoint(results: ConcurrencyLevelResult[]): number {
    if (results.length < 2) {
      return results[0]?.concurrency ?? 1;
    }

    let prev = results[0]!;
    for (let i = 1; i < results.length; i++) {
      const curr = results[i]!;
      const incrementalImprovement =
        prev.requestsPerSecond > 0
          ? ((curr.requestsPerSecond - prev.requestsPerSecond) / prev.requestsPerSecond) * 100
          : 0;

      // Less than 10% incremental improvement = saturated
      if (incrementalImprovement < 10) {
        return prev.concurrency;
      }
      prev = curr;
    }

    return results[results.length - 1]!.concurrency;
  }

  /**
   * Builds the final results object.
   */
  private buildResults(
    scenarios: BenchmarkScenario[],
    totalDurationMs: number,
    executionMode: ExecutionMode = "sequential",
  ): BenchmarkResults {
    const performanceTargets = calculatePerformanceTargets(this.results, executionMode);

    const summary: BenchmarkSummary = {
      totalDurationMs,
      totalRequests: this.results.reduce((sum, r) => sum + r.requestCount, 0),
      totalBytes: this.results.reduce((sum, r) => sum + r.totalBytes, 0),
      peakThroughputMBps: Math.max(...this.results.map((r) => r.throughputMBps)),
      performanceTargets,
      passed: performanceTargets.every((t) => t.passed),
      failedTargets: performanceTargets
        .filter((t) => !t.passed)
        .map((t) => `${t.size}: ${t.actualMBps.toFixed(0)} MB/s < ${t.targetMBps} MB/s target`),
    };

    const benchmarkResults: BenchmarkResults = {
      meta: getSystemMeta(this.runtime),
      scenariosRun: scenarios.map((s) => s.id),
      results: this.results,
      summary,
      executionMode,
    };

    // Add saturation results if any
    if (this.saturationResults.length > 0) {
      benchmarkResults.saturationResults = this.saturationResults;
    }

    return benchmarkResults;
  }
}
