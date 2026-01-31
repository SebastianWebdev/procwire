/**
 * Benchmark runner - orchestrates benchmark execution.
 */

import { EventEmitter } from "node:events";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import os from "node:os";
import { ModuleManager } from "@procwire/core";
import { Module } from "@procwire/core";
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
} from "./types.js";
import { PERFORMANCE_TARGETS } from "./types.js";
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
 * Collects system metadata.
 */
function getSystemMeta(): SystemMeta {
  const cpus = os.cpus();
  return {
    timestamp: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    hostname: os.hostname(),
    cpuModel: cpus[0]?.model ?? "unknown",
    cpuCores: cpus.length,
    totalMemoryGB: os.totalmem() / (1024 * 1024 * 1024),
  };
}

/**
 * Calculates performance target results.
 */
function calculatePerformanceTargets(results: ScenarioResult[]): PerformanceTarget[] {
  const targets: PerformanceTarget[] = [];
  const sizes: PayloadSize[] = ["1KB", "10KB", "100KB", "1MB", "10MB", "100MB"];

  for (const size of sizes) {
    // Find best throughput for this size (raw codec, result mode)
    const sizeResults = results.filter(
      (r) => r.size === size && r.codec === "raw" && r.mode === "result",
    );

    if (sizeResults.length === 0) continue;

    const bestResult = sizeResults.reduce((best, r) =>
      r.throughputMBps > best.throughputMBps ? r : best,
    );

    const targetMBps = PERFORMANCE_TARGETS[size];
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
 * BenchmarkRunner events:
 * - 'scenario:start' (scenarioId: string)
 * - 'scenario:progress' (scenarioId: string, current: number, total: number)
 * - 'scenario:complete' (scenarioId: string, result: ScenarioResult)
 * - 'benchmark:start' ()
 * - 'benchmark:complete' (results: BenchmarkResults)
 */
export class BenchmarkRunner extends EventEmitter {
  private results: ScenarioResult[] = [];

  /**
   * Runs the benchmark suite.
   */
  async run(scenarios: BenchmarkScenario[]): Promise<BenchmarkResults> {
    const startTime = Date.now();
    this.results = [];

    this.emit("benchmark:start");

    for (const scenario of scenarios) {
      await this.runScenario(scenario);
    }

    const totalDurationMs = Date.now() - startTime;
    const benchmarkResults = this.buildResults(scenarios, totalDurationMs);

    this.emit("benchmark:complete", benchmarkResults);

    return benchmarkResults;
  }

  /**
   * Runs a single scenario (all size/codec/mode combinations).
   */
  private async runScenario(scenario: BenchmarkScenario): Promise<void> {
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
            const result = await this.runSingleBenchmark(module, scenario, size, codec, mode);

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
        // Count both request and response bytes for throughput
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
   * Builds the final results object.
   */
  private buildResults(scenarios: BenchmarkScenario[], totalDurationMs: number): BenchmarkResults {
    const performanceTargets = calculatePerformanceTargets(this.results);

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

    return {
      meta: getSystemMeta(),
      scenariosRun: scenarios.map((s) => s.id),
      results: this.results,
      summary,
    };
  }
}
