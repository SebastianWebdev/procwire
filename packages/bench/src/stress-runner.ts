/**
 * Stress test runner for stability validation.
 *
 * TASK-17: Implements stress testing capabilities:
 * - Sustained load: Constant high throughput for extended period
 * - Burst: Sudden traffic spikes
 * - Memory soak: Extended duration for leak detection
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
 * Stress test configuration.
 */
export interface StressTestConfig {
  /** Test identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description */
  description: string;

  /** Test duration in milliseconds */
  duration: number;
  /** Target requests per second */
  targetRps: number;
  /** Payload size to use */
  payloadSize: PayloadSize;
  /** Codec to use */
  codec: CodecType;
  /** Response mode */
  mode: ResponseMode;
  /** Concurrency level for pipelining */
  concurrency?: number;

  // Burst test specific
  /** Phases for burst testing (duration and RPS for each phase) */
  phases?: Array<{ duration: number; rps: number }>;

  // Success criteria
  /** Maximum acceptable error rate (0.001 = 0.1%) */
  maxErrorRate?: number;
  /** Maximum P99 latency in microseconds */
  maxLatencyP99?: number;
  /** Maximum memory growth in MB */
  maxMemoryGrowth?: number;
  /** Maximum dropped requests for burst tests */
  maxDroppedRequests?: number;
  /** Recovery time after burst in milliseconds */
  recoveryTime?: number;
}

/**
 * Timeline checkpoint for stress test.
 */
export interface StressTimelineEntry {
  /** Timestamp offset in milliseconds */
  timestamp: number;
  /** Requests per second during this interval */
  rps: number;
  /** P99 latency in microseconds */
  latencyP99: number;
  /** Error count during this interval */
  errors: number;
  /** Memory usage in MB */
  memoryMB: number;
}

/**
 * Stress test result.
 */
export interface StressTestResult {
  /** Test configuration ID */
  configId: string;
  /** Whether all criteria passed */
  passed: boolean;
  /** Timeline of checkpoints */
  timeline: StressTimelineEntry[];
  /** Summary statistics */
  summary: {
    totalRequests: number;
    successRate: number;
    memoryGrowth: number;
    avgLatencyP99: number;
    peakRps: number;
    avgRps: number;
  };
  /** List of failure reasons */
  failures: string[];
  /** Test duration in milliseconds */
  durationMs: number;
}

/**
 * Default stress test configurations.
 */
export const DEFAULT_STRESS_TESTS: StressTestConfig[] = [
  {
    id: "stress-sustained",
    name: "Sustained High Load",
    description: "100% target load for 60 seconds",
    duration: 60_000,
    targetRps: 30_000,
    payloadSize: "1KB",
    codec: "raw",
    mode: "ack",
    concurrency: 32,
    maxErrorRate: 0.001,
    maxLatencyP99: 1000,
    maxMemoryGrowth: 50,
  },
  {
    id: "stress-burst",
    name: "Burst Load Handling",
    description: "Sudden traffic spikes with recovery periods",
    duration: 30_000,
    targetRps: 10_000,
    payloadSize: "1KB",
    codec: "raw",
    mode: "ack",
    concurrency: 32,
    phases: [
      { duration: 5000, rps: 10_000 },
      { duration: 2000, rps: 50_000 }, // BURST!
      { duration: 5000, rps: 10_000 },
      { duration: 2000, rps: 50_000 }, // BURST!
      { duration: 5000, rps: 10_000 },
    ],
    maxDroppedRequests: 100,
    recoveryTime: 1000,
  },
  {
    id: "stress-soak",
    name: "Memory Soak Test",
    description: "Extended duration for memory leak detection",
    duration: 120_000, // 2 minutes
    targetRps: 10_000,
    payloadSize: "100KB",
    codec: "raw",
    mode: "result",
    concurrency: 8,
    maxMemoryGrowth: 30, // Max 30MB growth over test
  },
];

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
 * Calculates percentile from sorted array.
 */
function percentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, index)] ?? 0;
}

/**
 * Sleep utility.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * StressTestRunner events:
 * - 'test:start' (configId: string)
 * - 'test:checkpoint' (configId: string, entry: StressTimelineEntry)
 * - 'test:complete' (result: StressTestResult)
 */
export class StressTestRunner extends EventEmitter {
  private manager: ModuleManager | null = null;
  private module: Module | null = null;

  /**
   * Runs a stress test.
   */
  async run(config: StressTestConfig): Promise<StressTestResult> {
    this.emit("test:start", config.id);

    // Initialize module
    await this.initModule(config);

    try {
      // Run appropriate test type
      if (config.phases) {
        return await this.runBurstTest(config);
      } else {
        return await this.runSustainedTest(config);
      }
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Runs multiple stress tests.
   */
  async runAll(configs: StressTestConfig[]): Promise<StressTestResult[]> {
    const results: StressTestResult[] = [];

    for (const config of configs) {
      const result = await this.run(config);
      results.push(result);
    }

    return results;
  }

  /**
   * Initializes the worker module.
   */
  private async initModule(config: StressTestConfig): Promise<void> {
    this.manager = new ModuleManager();

    this.module = new Module("stress-worker").executable(NODE_BIN, [
      "--import",
      TSX_LOADER,
      WORKER_PATH,
    ]);

    const methodName = getMethodName(config.codec, config.mode);
    this.module.method(methodName, {
      codec: getCodec(config.codec),
      response: config.mode,
    });

    this.manager.register(this.module);
    await this.manager.spawn("stress-worker");
  }

  /**
   * Cleans up the worker module.
   */
  private async cleanup(): Promise<void> {
    if (this.manager) {
      await this.manager.shutdown();
      this.manager = null;
      this.module = null;
    }
  }

  /**
   * Runs a sustained load stress test.
   */
  private async runSustainedTest(config: StressTestConfig): Promise<StressTestResult> {
    const module = this.module!;
    const timeline: StressTimelineEntry[] = [];
    const intervalMs = 10_000; // Report every 10 seconds
    const concurrency = config.concurrency ?? 32;

    const methodName = getMethodName(config.codec, config.mode);
    const payload = generatePayload(config.payloadSize, config.codec);
    const _payloadBytes = getPayloadByteSize(config.payloadSize);

    const testStart = Date.now();
    const startMem = process.memoryUsage().heapUsed;

    let totalRequests = 0;
    let totalErrors = 0;
    const allLatencies: number[] = [];

    // Run load in intervals
    while (Date.now() - testStart < config.duration) {
      const intervalStart = Date.now();
      const intervalLatencies: number[] = [];
      let intervalErrors = 0;

      // Use pipelining with backpressure
      const inflight = new Set<Promise<void>>();

      while (Date.now() - intervalStart < intervalMs && Date.now() - testStart < config.duration) {
        const requestStart = process.hrtime.bigint();

        const executeRequest = async (): Promise<void> => {
          try {
            if (config.mode === "stream") {
              for await (const _chunk of module.stream(methodName, payload)) {
                // Consume
              }
            } else {
              await module.send(methodName, payload);
            }
            const requestEnd = process.hrtime.bigint();
            const latencyUs = Number(requestEnd - requestStart) / 1000;
            intervalLatencies.push(latencyUs);
            totalRequests++;
          } catch {
            intervalErrors++;
            totalErrors++;
          }
        };

        const promise = executeRequest().finally(() => inflight.delete(promise));
        inflight.add(promise);

        // Backpressure
        if (inflight.size >= concurrency) {
          await Promise.race(inflight);
        }

        // Rate limiting to approach target RPS
        const targetDelayMs = 1000 / config.targetRps;
        if (targetDelayMs > 1) {
          await sleep(targetDelayMs);
        }
      }

      // Wait for remaining requests
      await Promise.all(inflight);

      // Record checkpoint
      const elapsed = (Date.now() - intervalStart) / 1000;
      const sortedLatencies = intervalLatencies.sort((a, b) => a - b);
      const entry: StressTimelineEntry = {
        timestamp: Date.now() - testStart,
        rps: intervalLatencies.length / elapsed,
        latencyP99: percentile(sortedLatencies, 99),
        errors: intervalErrors,
        memoryMB: process.memoryUsage().heapUsed / (1024 * 1024),
      };

      timeline.push(entry);
      allLatencies.push(...intervalLatencies);

      this.emit("test:checkpoint", config.id, entry);
    }

    const endMem = process.memoryUsage().heapUsed;
    const memoryGrowth = (endMem - startMem) / (1024 * 1024);
    const durationMs = Date.now() - testStart;

    // Calculate summary
    const avgRps = timeline.reduce((sum, t) => sum + t.rps, 0) / timeline.length;
    const peakRps = Math.max(...timeline.map((t) => t.rps));
    const avgP99 = timeline.reduce((sum, t) => sum + t.latencyP99, 0) / timeline.length;
    const successRate = totalRequests > 0 ? (totalRequests - totalErrors) / totalRequests : 1;

    // Evaluate pass/fail
    const failures: string[] = [];

    if (config.maxErrorRate && (totalErrors / Math.max(1, totalRequests)) > config.maxErrorRate) {
      const errorRate = (totalErrors / totalRequests) * 100;
      failures.push(`Error rate ${errorRate.toFixed(2)}% > ${config.maxErrorRate * 100}%`);
    }

    if (config.maxLatencyP99 && avgP99 > config.maxLatencyP99) {
      failures.push(`Avg P99 latency ${avgP99.toFixed(0)}μs > ${config.maxLatencyP99}μs`);
    }

    if (config.maxMemoryGrowth && memoryGrowth > config.maxMemoryGrowth) {
      failures.push(`Memory growth ${memoryGrowth.toFixed(1)}MB > ${config.maxMemoryGrowth}MB`);
    }

    const result: StressTestResult = {
      configId: config.id,
      passed: failures.length === 0,
      timeline,
      summary: {
        totalRequests,
        successRate,
        memoryGrowth,
        avgLatencyP99: avgP99,
        peakRps,
        avgRps,
      },
      failures,
      durationMs,
    };

    this.emit("test:complete", result);
    return result;
  }

  /**
   * Runs a burst load stress test.
   */
  private async runBurstTest(config: StressTestConfig): Promise<StressTestResult> {
    const module = this.module!;
    const timeline: StressTimelineEntry[] = [];
    const phases = config.phases!;
    const concurrency = config.concurrency ?? 32;

    const methodName = getMethodName(config.codec, config.mode);
    const payload = generatePayload(config.payloadSize, config.codec);

    const testStart = Date.now();
    const startMem = process.memoryUsage().heapUsed;

    let totalRequests = 0;
    let totalErrors = 0;
    let droppedRequests = 0;

    for (const phase of phases) {
      const phaseStart = Date.now();
      const phaseLatencies: number[] = [];
      let phaseErrors = 0;

      const inflight = new Set<Promise<void>>();
      const targetDelayMs = 1000 / phase.rps;

      while (Date.now() - phaseStart < phase.duration) {
        const requestStart = process.hrtime.bigint();

        // Check if we're falling behind (backpressure)
        if (inflight.size >= concurrency * 2) {
          droppedRequests++;
          continue;
        }

        const executeRequest = async (): Promise<void> => {
          try {
            if (config.mode === "stream") {
              for await (const _chunk of module.stream(methodName, payload)) {
                // Consume
              }
            } else {
              await module.send(methodName, payload);
            }
            const requestEnd = process.hrtime.bigint();
            const latencyUs = Number(requestEnd - requestStart) / 1000;
            phaseLatencies.push(latencyUs);
            totalRequests++;
          } catch {
            phaseErrors++;
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
        if (targetDelayMs > 0.1) {
          await sleep(targetDelayMs);
        }
      }

      // Wait for remaining requests
      await Promise.all(inflight);

      // Record phase checkpoint
      const elapsed = (Date.now() - phaseStart) / 1000;
      const sortedLatencies = phaseLatencies.sort((a, b) => a - b);
      const entry: StressTimelineEntry = {
        timestamp: Date.now() - testStart,
        rps: phaseLatencies.length / elapsed,
        latencyP99: percentile(sortedLatencies, 99),
        errors: phaseErrors,
        memoryMB: process.memoryUsage().heapUsed / (1024 * 1024),
      };

      timeline.push(entry);
      this.emit("test:checkpoint", config.id, entry);
    }

    const endMem = process.memoryUsage().heapUsed;
    const memoryGrowth = (endMem - startMem) / (1024 * 1024);
    const durationMs = Date.now() - testStart;

    // Calculate summary
    const avgRps = timeline.reduce((sum, t) => sum + t.rps, 0) / timeline.length;
    const peakRps = Math.max(...timeline.map((t) => t.rps));
    const avgP99 = timeline.reduce((sum, t) => sum + t.latencyP99, 0) / timeline.length;
    const successRate = totalRequests > 0 ? (totalRequests - totalErrors) / totalRequests : 1;

    // Evaluate pass/fail
    const failures: string[] = [];

    if (config.maxDroppedRequests && droppedRequests > config.maxDroppedRequests) {
      failures.push(`Dropped ${droppedRequests} requests > ${config.maxDroppedRequests}`);
    }

    if (config.maxErrorRate && (totalErrors / Math.max(1, totalRequests)) > config.maxErrorRate) {
      const errorRate = (totalErrors / totalRequests) * 100;
      failures.push(`Error rate ${errorRate.toFixed(2)}% > ${config.maxErrorRate * 100}%`);
    }

    const result: StressTestResult = {
      configId: config.id,
      passed: failures.length === 0,
      timeline,
      summary: {
        totalRequests,
        successRate,
        memoryGrowth,
        avgLatencyP99: avgP99,
        peakRps,
        avgRps,
      },
      failures,
      durationMs,
    };

    this.emit("test:complete", result);
    return result;
  }
}
