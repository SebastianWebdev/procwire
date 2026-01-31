/**
 * Realistic test runner for real-world usage patterns.
 *
 * TASK-17: Implements realistic testing scenarios:
 * - Mixed workload: Various payload sizes simultaneously
 * - Multi-worker: Load distributed across N workers
 */

import { EventEmitter } from "node:events";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { ModuleManager, Module } from "@procwire/core";
import { rawCodec, msgpackCodec, arrowCodec, type Codec } from "@procwire/codecs";

import type { PayloadSize, CodecType, ResponseMode } from "./types.js";
import { generatePayload, getPayloadByteSize } from "./payload.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = join(__dirname, "..", "workers", "benchmark-worker.ts");
const ROOT_DIR = join(__dirname, "..", "..", "..");
const TSX_LOADER = pathToFileURL(
  join(ROOT_DIR, "node_modules", "tsx", "dist", "esm", "index.mjs"),
).href;
const NODE_BIN = process.execPath;

/**
 * Mixed workload distribution.
 */
export type PayloadDistribution = Partial<Record<PayloadSize, number>>;

/**
 * Mixed workload test configuration.
 */
export interface MixedWorkloadConfig {
  /** Test identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description */
  description: string;
  /** Test duration in milliseconds */
  duration: number;
  /** Payload size distribution (size -> percentage, must sum to 1.0) */
  distribution: PayloadDistribution;
  /** Target requests per second */
  targetRps: number;
  /** Codec to use */
  codec: CodecType;
  /** Response mode */
  mode: ResponseMode;
  /** Concurrency level */
  concurrency?: number;
}

/**
 * Multi-worker test configuration.
 */
export interface MultiWorkerConfig {
  /** Test identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description */
  description: string;
  /** Test duration in milliseconds */
  duration: number;
  /** Worker counts to test */
  workerCounts: number[];
  /** Target total RPS (distributed across workers) */
  targetRps: number;
  /** Payload size */
  payloadSize: PayloadSize;
  /** Codec to use */
  codec: CodecType;
  /** Response mode */
  mode: ResponseMode;
}

/**
 * Mixed workload result.
 */
export interface MixedWorkloadResult {
  /** Test ID */
  configId: string;
  /** Total requests by size */
  requestsBySize: Record<PayloadSize, number>;
  /** Throughput by size in MB/s */
  throughputBySize: Record<PayloadSize, number>;
  /** Overall throughput in MB/s */
  overallThroughputMBps: number;
  /** Overall requests per second */
  overallRps: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Error count */
  errors: number;
}

/**
 * Worker scaling result.
 */
export interface WorkerScalingResult {
  /** Number of workers */
  workerCount: number;
  /** Requests per second */
  requestsPerSecond: number;
  /** Throughput in MB/s */
  throughputMBps: number;
  /** Scaling efficiency compared to single worker */
  scalingEfficiency: number;
}

/**
 * Multi-worker test result.
 */
export interface MultiWorkerResult {
  /** Test ID */
  configId: string;
  /** Results for each worker count */
  scaling: WorkerScalingResult[];
  /** Optimal worker count */
  optimalWorkerCount: number;
  /** Peak throughput achieved */
  peakThroughputMBps: number;
  /** Peak requests per second */
  peakRps: number;
}

/**
 * Default realistic test configurations.
 */
export const DEFAULT_MIXED_WORKLOAD: MixedWorkloadConfig = {
  id: "realistic-mixed",
  name: "Mixed Workload Pattern",
  description: "Simulates real app with mixed request sizes",
  duration: 30_000,
  distribution: {
    "1KB": 0.7, // 70% small requests
    "10KB": 0.2, // 20% medium
    "100KB": 0.08, // 8% large
    "1MB": 0.02, // 2% very large
  },
  targetRps: 20_000,
  codec: "raw",
  mode: "result",
  concurrency: 32,
};

export const DEFAULT_MULTI_WORKER: MultiWorkerConfig = {
  id: "realistic-multi-worker",
  name: "Multiple Workers Scaling",
  description: "Load distributed across N workers",
  duration: 15_000,
  workerCounts: [1, 2, 4, 8],
  targetRps: 50_000,
  payloadSize: "1KB",
  codec: "raw",
  mode: "ack",
};

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
 * Sleep utility.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Weighted random selection based on distribution.
 */
function selectPayloadSize(distribution: PayloadDistribution): PayloadSize {
  const rand = Math.random();
  let cumulative = 0;

  for (const [size, weight] of Object.entries(distribution)) {
    cumulative += weight;
    if (rand < cumulative) {
      return size as PayloadSize;
    }
  }

  // Fallback to first size
  return Object.keys(distribution)[0] as PayloadSize;
}

/**
 * RealisticTestRunner events:
 * - 'test:start' (configId: string)
 * - 'test:progress' (configId: string, progress: number)
 * - 'test:complete' (result: MixedWorkloadResult | MultiWorkerResult)
 */
export class RealisticTestRunner extends EventEmitter {
  /**
   * Runs a mixed workload test.
   */
  async runMixedWorkload(config: MixedWorkloadConfig): Promise<MixedWorkloadResult> {
    this.emit("test:start", config.id);

    const manager = new ModuleManager();
    const module = new Module("mixed-worker").executable(NODE_BIN, [
      "--import",
      TSX_LOADER,
      WORKER_PATH,
    ]);

    const methodName = getMethodName(config.codec, config.mode);
    module.method(methodName, {
      codec: getCodec(config.codec),
      response: config.mode,
    });

    manager.register(module);

    try {
      await manager.spawn("mixed-worker");

      const concurrency = config.concurrency ?? 32;
      const sizes = Object.keys(config.distribution) as PayloadSize[];

      // Pre-generate payloads for each size
      const payloads = new Map<PayloadSize, unknown>();
      for (const size of sizes) {
        payloads.set(size, generatePayload(size, config.codec));
      }

      const requestsBySize: Record<string, number> = {};
      const bytesBySize: Record<string, number> = {};
      for (const size of sizes) {
        requestsBySize[size] = 0;
        bytesBySize[size] = 0;
      }

      let totalErrors = 0;
      const testStart = Date.now();
      const inflight = new Set<Promise<void>>();

      while (Date.now() - testStart < config.duration) {
        // Select size based on distribution
        const size = selectPayloadSize(config.distribution);
        const payload = payloads.get(size)!;
        const payloadBytes = getPayloadByteSize(size);

        const executeRequest = async (): Promise<void> => {
          try {
            if (config.mode === "stream") {
              for await (const _chunk of module.stream(methodName, payload)) {
                // Consume
              }
            } else {
              await module.send(methodName, payload);
            }
            requestsBySize[size] = (requestsBySize[size] ?? 0) + 1;
            bytesBySize[size] = (bytesBySize[size] ?? 0) + payloadBytes * 2;
          } catch {
            totalErrors++;
          }
        };

        const promise = executeRequest().finally(() => inflight.delete(promise));
        inflight.add(promise);

        // Backpressure
        if (inflight.size >= concurrency) {
          await Promise.race(inflight);
        }

        // Rate limiting
        const targetDelayMs = 1000 / config.targetRps;
        if (targetDelayMs > 0.1) {
          await sleep(targetDelayMs);
        }

        // Progress reporting
        const progress = (Date.now() - testStart) / config.duration;
        if (Math.floor(progress * 10) !== Math.floor(((Date.now() - testStart - 100) / config.duration) * 10)) {
          this.emit("test:progress", config.id, progress);
        }
      }

      // Wait for remaining requests
      await Promise.all(inflight);

      const durationMs = Date.now() - testStart;
      const durationSec = durationMs / 1000;

      // Calculate throughput by size
      const throughputBySize: Record<string, number> = {};
      let totalBytes = 0;
      let totalRequests = 0;

      for (const size of sizes) {
        const sizeBytes = bytesBySize[size] ?? 0;
        const sizeRequests = requestsBySize[size] ?? 0;
        throughputBySize[size] = sizeBytes / durationSec / (1024 * 1024);
        totalBytes += sizeBytes;
        totalRequests += sizeRequests;
      }

      const result: MixedWorkloadResult = {
        configId: config.id,
        requestsBySize: requestsBySize as Record<PayloadSize, number>,
        throughputBySize: throughputBySize as Record<PayloadSize, number>,
        overallThroughputMBps: totalBytes / durationSec / (1024 * 1024),
        overallRps: totalRequests / durationSec,
        durationMs,
        errors: totalErrors,
      };

      this.emit("test:complete", result);
      return result;
    } finally {
      await manager.shutdown();
    }
  }

  /**
   * Runs a multi-worker scaling test.
   */
  async runMultiWorker(config: MultiWorkerConfig): Promise<MultiWorkerResult> {
    this.emit("test:start", config.id);

    const scaling: WorkerScalingResult[] = [];
    let baselineRps = 0;

    for (const workerCount of config.workerCounts) {
      const result = await this.runWithWorkerCount(config, workerCount);

      if (workerCount === 1) {
        baselineRps = result.rps;
      }

      const scalingEfficiency = baselineRps > 0 ? (result.rps / (baselineRps * workerCount)) : 1;

      scaling.push({
        workerCount,
        requestsPerSecond: result.rps,
        throughputMBps: result.throughputMBps,
        scalingEfficiency,
      });

      this.emit("test:progress", config.id, config.workerCounts.indexOf(workerCount) / config.workerCounts.length);
    }

    // Find optimal worker count (highest RPS)
    const optimalResult = scaling.reduce((best, s) =>
      s.requestsPerSecond > best.requestsPerSecond ? s : best,
    );

    const result: MultiWorkerResult = {
      configId: config.id,
      scaling,
      optimalWorkerCount: optimalResult.workerCount,
      peakThroughputMBps: optimalResult.throughputMBps,
      peakRps: optimalResult.requestsPerSecond,
    };

    this.emit("test:complete", result);
    return result;
  }

  /**
   * Runs test with a specific worker count.
   */
  private async runWithWorkerCount(
    config: MultiWorkerConfig,
    workerCount: number,
  ): Promise<{ rps: number; throughputMBps: number }> {
    const manager = new ModuleManager();
    const modules: Module[] = [];

    // Create multiple workers
    for (let i = 0; i < workerCount; i++) {
      const module = new Module(`worker-${i}`).executable(NODE_BIN, [
        "--import",
        TSX_LOADER,
        WORKER_PATH,
      ]);

      const methodName = getMethodName(config.codec, config.mode);
      module.method(methodName, {
        codec: getCodec(config.codec),
        response: config.mode,
      });

      manager.register(module);
      modules.push(module);
    }

    try {
      // Spawn all workers
      for (const mod of modules) {
        await manager.spawn(mod.name);
      }

      const methodName = getMethodName(config.codec, config.mode);
      const payload = generatePayload(config.payloadSize, config.codec);
      const payloadBytes = getPayloadByteSize(config.payloadSize);
      const concurrencyPerWorker = Math.ceil(32 / workerCount);

      let totalRequests = 0;
      let totalBytes = 0;
      const testStart = Date.now();
      const inflight = new Set<Promise<void>>();

      while (Date.now() - testStart < config.duration) {
        // Round-robin across workers
        const workerIndex = totalRequests % workerCount;
        const workerModule = modules[workerIndex]!;

        const executeRequest = async (): Promise<void> => {
          try {
            if (config.mode === "stream") {
              for await (const _chunk of workerModule.stream(methodName, payload)) {
                // Consume
              }
            } else {
              await workerModule.send(methodName, payload);
            }
            totalRequests++;
            totalBytes += payloadBytes * 2;
          } catch {
            // Ignore errors for scaling test
          }
        };

        const promise = executeRequest().finally(() => inflight.delete(promise));
        inflight.add(promise);

        // Backpressure
        if (inflight.size >= concurrencyPerWorker * workerCount) {
          await Promise.race(inflight);
        }

        // Rate limiting
        const targetDelayMs = 1000 / config.targetRps;
        if (targetDelayMs > 0.1) {
          await sleep(targetDelayMs);
        }
      }

      // Wait for remaining requests
      await Promise.all(inflight);

      const durationSec = (Date.now() - testStart) / 1000;

      return {
        rps: totalRequests / durationSec,
        throughputMBps: totalBytes / durationSec / (1024 * 1024),
      };
    } finally {
      await manager.shutdown();
    }
  }
}
