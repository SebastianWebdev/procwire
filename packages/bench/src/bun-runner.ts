/**
 * Benchmark runner for Bun runtime.
 *
 * This runner uses @procwire-bun/core for parent-side operations,
 * spawning workers that use @procwire-bun/client.
 */

import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import os from "node:os";
import { ModuleManager, Module } from "@procwire-bun/core";
import { rawCodec, msgpackCodec, arrowCodec, type Codec } from "@procwire/codecs";

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
} from "./types.js";
import { PERFORMANCE_TARGETS, type ExecutionMode } from "./types.js";
import { MetricsCollector } from "./metrics.js";
import { generatePayload, getPayloadByteSize } from "./payload.js";
import { getIterationsForSize } from "./scenarios.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = join(__dirname, "..", "workers", "benchmark-worker-bun.ts");

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
 * Collects system metadata for Bun runtime.
 */
function getSystemMeta(): SystemMeta {
  const cpus = os.cpus();
  return {
    timestamp: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    // @ts-expect-error - Bun global is defined at runtime
    bunVersion: typeof Bun !== "undefined" ? Bun.version : undefined,
    runtime: "bun",
    hostname: os.hostname(),
    cpuModel: cpus[0]?.model ?? "unknown",
    cpuCores: cpus.length,
    totalMemoryGB: os.totalmem() / (1024 * 1024 * 1024),
  };
}

/**
 * Calculates performance target results.
 */
function calculatePerformanceTargets(
  results: ScenarioResult[],
  executionMode: ExecutionMode = "sequential",
): PerformanceTarget[] {
  const targets: PerformanceTarget[] = [];
  const sizes: PayloadSize[] = ["1KB", "10KB", "100KB", "1MB", "10MB", "100MB"];
  const targetSet = PERFORMANCE_TARGETS[executionMode];

  for (const size of sizes) {
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
export interface BunRunnerOptions {
  /** Concurrency level (1 = sequential, >1 = pipelined) */
  concurrency?: number;
  /** Run saturation curve analysis */
  saturation?: boolean;
}

/**
 * Default concurrency levels for saturation analysis.
 */
const DEFAULT_CONCURRENCY_LEVELS = [1, 2, 4, 8, 16, 32, 64, 128];

/**
 * BunBenchmarkRunner - Benchmark runner for Bun.js runtime.
 *
 * Events:
 * - 'scenario:start' (scenarioId: string)
 * - 'scenario:progress' (scenarioId: string, current: number, total: number)
 * - 'scenario:complete' (scenarioId: string, result: ScenarioResult)
 * - 'benchmark:start' ()
 * - 'benchmark:complete' (results: BenchmarkResults)
 */
export class BunBenchmarkRunner extends EventEmitter {
  private results: ScenarioResult[] = [];
  private saturationResults: SaturationResult[] = [];
  private concurrency: number = 1;

  /**
   * Runs the benchmark suite.
   */
  async run(
    scenarios: BenchmarkScenario[],
    options: BunRunnerOptions = {},
  ): Promise<BenchmarkResults> {
    const startTime = Date.now();
    this.results = [];
    this.saturationResults = [];
    this.concurrency = options.concurrency ?? 1;

    const executionMode: ExecutionMode = this.concurrency > 1 ? "pipelined" : "sequential";

    this.emit("benchmark:start");

    for (const scenario of scenarios) {
      if (options.saturation || scenario.concurrencyLevels) {
        await this.runSaturationAnalysis(scenario);
      } else {
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
   * Runs a single scenario.
   */
  private async runScenario(scenario: BenchmarkScenario, concurrency: number = 1): Promise<void> {
    this.emit("scenario:start", scenario.id);

    const totalCombinations =
      scenario.sizes.length * scenario.codecs.length * scenario.modes.length;
    let completedCombinations = 0;

    const manager = new ModuleManager();

    const module = new Module("bench-worker").executable("bun", ["run", WORKER_PATH]);

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

    // Force GC if available
    // @ts-expect-error - Bun global is defined at runtime
    if (typeof Bun !== "undefined" && Bun.gc) {
      // @ts-expect-error - Bun.gc is available at runtime
      Bun.gc(true);
    }

    // Measurement phase
    collector.start();

    for (let i = 0; i < iterations; i++) {
      const requestStart = process.hrtime.bigint();

      try {
        await this.executeRequest(module, methodName, mode, payload);
        const requestEnd = process.hrtime.bigint();
        collector.recordLatency(requestEnd - requestStart);
        collector.recordBytes(payloadBytes * 2);
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
      for await (const _chunk of module.stream(method, payload)) {
        // Just consume
      }
    } else {
      await module.send(method, payload);
    }
  }

  /**
   * Runs a pipelined benchmark (multiple concurrent requests).
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

    // Force GC if available
    // @ts-expect-error - Bun global is defined at runtime
    if (typeof Bun !== "undefined" && Bun.gc) {
      // @ts-expect-error - Bun.gc is available at runtime
      Bun.gc(true);
    }

    // Measurement phase with pipelining
    collector.start();

    const inflight = new Set<Promise<void>>();

    for (let i = 0; i < iterations; i++) {
      const requestStart = process.hrtime.bigint();

      const promise = this.executeRequest(module, methodName, mode, payload)
        .then(() => {
          const requestEnd = process.hrtime.bigint();
          collector.recordLatency(requestEnd - requestStart);
          collector.recordBytes(payloadBytes * 2);
          inflight.delete(promise);
        })
        .catch(() => {
          collector.recordError();
          inflight.delete(promise);
        });

      inflight.add(promise);

      if (inflight.size >= concurrency) {
        await Promise.race(inflight);
      }
    }

    await Promise.all(inflight);

    collector.stop();

    return collector.buildResult(scenario.id, codec, size, mode);
  }

  /**
   * Runs saturation curve analysis for a scenario.
   */
  private async runSaturationAnalysis(scenario: BenchmarkScenario): Promise<void> {
    this.emit("scenario:start", scenario.id);

    const levels = scenario.concurrencyLevels ?? DEFAULT_CONCURRENCY_LEVELS;

    const manager = new ModuleManager();

    const module = new Module("bench-worker").executable("bun", ["run", WORKER_PATH]);

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

            const baselineLevel = saturationResult.levels.find((l) => l.concurrency === 1);
            if (baselineLevel) {
              const baselineResult: ScenarioResult = {
                scenarioId: scenario.id,
                codec,
                size,
                mode,
                throughputMBps: baselineLevel.throughputMBps,
                totalBytes: 0,
                durationMs: 0,
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
      meta: getSystemMeta(),
      scenariosRun: scenarios.map((s) => s.id),
      results: this.results,
      summary,
      executionMode,
    };

    if (this.saturationResults.length > 0) {
      benchmarkResults.saturationResults = this.saturationResults;
    }

    return benchmarkResults;
  }
}
