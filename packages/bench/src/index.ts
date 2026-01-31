#!/usr/bin/env node

/**
 * Procwire Benchmark CLI
 *
 * TASK-16: Extended with codec, response mode, and size filtering options.
 * TASK-17: Extended with pipelining, saturation, stress, and realistic test options.
 *
 * Usage:
 *   pnpm bench                          # Run full benchmark suite
 *   pnpm bench --quick                  # Run quick benchmark (reduced iterations)
 *   pnpm bench -s full-matrix           # Run specific scenario
 *   pnpm bench --codec raw              # Filter by codec
 *   pnpm bench --response result        # Filter by response mode
 *   pnpm bench --sizes 1KB,10KB,100KB   # Filter by sizes
 *   pnpm bench --concurrency 32         # Run with pipelining
 *   pnpm bench --saturation             # Run saturation curve analysis
 *   pnpm bench --stress                 # Run stress tests
 *   pnpm bench --realistic              # Run realistic workload tests
 *   pnpm bench --help                   # Show help
 */

import { parseArgs } from "node:util";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { BenchmarkRunner, type RunnerOptions } from "./runner.js";
import { getScenarios, listScenarioIds, ALL_CODECS, ALL_MODES, ALL_SIZES } from "./scenarios.js";
import type { CodecType, ResponseMode, PayloadSize, TestCategory } from "./types.js";
import { writeJsonReport } from "./report/json.js";
import { writeMarkdownReport, generateMarkdownReport } from "./report/markdown.js";
import { StressTestRunner, DEFAULT_STRESS_TESTS } from "./stress-runner.js";
import {
  RealisticTestRunner,
  DEFAULT_MIXED_WORKLOAD,
  DEFAULT_MULTI_WORKER,
} from "./realistic-runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_DIR = join(__dirname, "..", "results");

const HELP_TEXT = `
procwire-bench - Benchmark suite for @procwire IPC library

USAGE:
  pnpm bench [options]

OPTIONS:
  -s, --scenario <id>       Run specific scenario(s) (can be repeated)
  -o, --output <dir>        Output directory (default: ./results)
  --quick                   Quick mode (reduced iterations)
  --codec <name>            Filter by codec: ${ALL_CODECS.join(", ")}
  --response <mode>         Filter by response mode: ${ALL_MODES.join(", ")}
  --sizes <list>            Comma-separated sizes: ${ALL_SIZES.join(", ")}
  -q, --quiet               Suppress progress output
  -h, --help                Show this help

PIPELINING OPTIONS (TASK-17):
  --concurrency <n>         Concurrency level (1=sequential, >1=pipelined)
  --saturation              Run saturation curve analysis

TEST CATEGORIES (TASK-17):
  --stress                  Run stress tests (sustained load, burst, soak)
  --realistic               Run realistic workload tests (mixed, multi-worker)
  --category <type>         Filter by test category: benchmark, stress, realistic

SCENARIOS:
${listScenarioIds()
  .map((id) => `  - ${id}`)
  .join("\n")}

EXAMPLES:
  # Run all benchmarks
  pnpm bench

  # Quick test (fewer iterations)
  pnpm bench --quick

  # Run specific scenario
  pnpm bench -s full-matrix

  # Filter by codec and response mode
  pnpm bench --codec raw --response result

  # Test only small payloads
  pnpm bench --sizes 1KB,10KB,100KB

  # Run with pipelining (32 concurrent requests)
  pnpm bench --concurrency 32

  # Find optimal concurrency (saturation curve)
  pnpm bench --saturation

  # Run stress tests
  pnpm bench --stress

  # Run realistic workload tests
  pnpm bench --realistic

PERFORMANCE TARGETS (Sequential):
  - 1KB:   >20 MB/s
  - 10KB:  >150 MB/s
  - 100KB: >400 MB/s
  - 1MB:   >800 MB/s
  - 10MB:  >1200 MB/s
  - 100MB: >1000 MB/s

PERFORMANCE TARGETS (Pipelined, c=32):
  - 1KB:   >80 MB/s
  - 10KB:  >400 MB/s
  - 100KB: >800 MB/s
  - 1MB:   >1500 MB/s
  - 10MB:  >2000 MB/s (2 GB/s)
  - 100MB: >1800 MB/s
`;

function parseCodec(value: string): CodecType {
  if (ALL_CODECS.includes(value as CodecType)) {
    return value as CodecType;
  }
  throw new Error(`Invalid codec: ${value}. Valid: ${ALL_CODECS.join(", ")}`);
}

function parseResponseMode(value: string): ResponseMode {
  if (ALL_MODES.includes(value as ResponseMode)) {
    return value as ResponseMode;
  }
  throw new Error(`Invalid response mode: ${value}. Valid: ${ALL_MODES.join(", ")}`);
}

// Map byte values to PayloadSize (pnpm may convert "1MB" to bytes)
const BYTES_TO_SIZE: Record<string, PayloadSize> = {
  "1024": "1KB",
  "10240": "10KB",
  "102400": "100KB",
  "1048576": "1MB",
  "10485760": "10MB",
  "104857600": "100MB",
};

function parseSizes(value: string): PayloadSize[] {
  const sizes = value.split(",").map((s) => {
    const trimmed = s.trim();
    // Check if it's a byte value (pnpm converted it)
    if (BYTES_TO_SIZE[trimmed]) {
      return BYTES_TO_SIZE[trimmed];
    }
    // Check if it's a valid PayloadSize
    if (ALL_SIZES.includes(trimmed as PayloadSize)) {
      return trimmed as PayloadSize;
    }
    throw new Error(`Invalid size: ${trimmed}. Valid: ${ALL_SIZES.join(", ")}`);
  });
  return sizes;
}

function parseCategory(value: string): TestCategory {
  const valid = ["benchmark", "stress", "realistic"];
  if (valid.includes(value)) {
    return value as TestCategory;
  }
  throw new Error(`Invalid category: ${value}. Valid: ${valid.join(", ")}`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      scenario: { type: "string", short: "s", multiple: true, default: [] },
      output: { type: "string", short: "o", default: DEFAULT_OUTPUT_DIR },
      quick: { type: "boolean", default: false },
      codec: { type: "string" },
      response: { type: "string" },
      sizes: { type: "string" },
      quiet: { type: "boolean", short: "q", default: false },
      help: { type: "boolean", short: "h", default: false },
      // TASK-17: New options
      concurrency: { type: "string" },
      saturation: { type: "boolean", default: false },
      stress: { type: "boolean", default: false },
      realistic: { type: "boolean", default: false },
      category: { type: "string" },
    },
    allowPositionals: false,
  });

  if (values.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  // Handle stress tests
  if (values.stress) {
    await runStressTests(values.output as string, values.quiet as boolean);
    return;
  }

  // Handle realistic tests
  if (values.realistic) {
    await runRealisticTests(values.output as string, values.quiet as boolean);
    return;
  }

  // Parse and validate filters
  const codec = values.codec ? parseCodec(values.codec) : undefined;
  const responseMode = values.response ? parseResponseMode(values.response) : undefined;
  const sizes = values.sizes ? parseSizes(values.sizes) : undefined;
  const category = values.category ? parseCategory(values.category) : undefined;
  const concurrency = values.concurrency ? parseInt(values.concurrency, 10) : undefined;

  const scenarios = getScenarios({
    ids: values.scenario as string[],
    quick: values.quick as boolean,
    codec,
    responseMode,
    sizes,
    category,
    concurrency,
  });

  const outputDir = values.output as string;
  const quiet = values.quiet as boolean;
  const saturation = values.saturation as boolean;

  // Build runner options
  const runnerOptions: RunnerOptions = {};
  if (concurrency) {
    runnerOptions.concurrency = concurrency;
  }
  if (saturation) {
    runnerOptions.saturation = true;
  }

  if (!quiet) {
    console.log("\n========================================");
    console.log("  Procwire Benchmark Suite");
    console.log("========================================\n");
    console.log(`Mode: ${values.quick ? "Quick" : "Full"}${concurrency ? ` (pipelined, c=${concurrency})` : " (sequential)"}`);
    if (saturation) {
      console.log("Running: Saturation curve analysis");
    }
    console.log(`Scenarios: ${scenarios.map((s) => s.id).join(", ")}`);

    // Show what combinations will actually run
    for (const s of scenarios) {
      const scenarioConcurrency = s.concurrency ?? concurrency ?? 1;
      console.log(
        `  ${s.id}: ${s.codecs.join("+")} × ${s.modes.join("+")} × ${s.sizes.length} sizes (c=${scenarioConcurrency})`,
      );
    }

    if (codec) console.log(`Codec filter: ${codec}`);
    if (responseMode) console.log(`Response mode filter: ${responseMode}`);
    if (sizes) console.log(`Size filter: ${sizes.join(", ")}`);
    console.log(`Output: ${outputDir}\n`);
  }

  const runner = new BenchmarkRunner();

  // Set up progress logging
  if (!quiet) {
    runner.on("scenario:start", (scenarioId: string) => {
      console.log(`\n>>> Running: ${scenarioId}`);
    });

    runner.on(
      "scenario:complete",
      (scenarioId: string, result: { size: string; codec: string; throughputMBps: number }) => {
        console.log(`    ${result.size} ${result.codec}: ${result.throughputMBps.toFixed(0)} MB/s`);
      },
    );
  }

  // Run benchmarks
  const startTime = Date.now();
  const results = await runner.run(scenarios, runnerOptions);
  const elapsed = Date.now() - startTime;

  // Write reports
  const jsonPath = await writeJsonReport(results, outputDir);
  const mdPath = await writeMarkdownReport(results, outputDir);

  // Print summary
  if (!quiet) {
    console.log("\n========================================");
    console.log("  Results");
    console.log("========================================\n");

    // Print condensed markdown to console
    console.log(generateMarkdownReport(results));

    console.log("========================================");
    console.log(`  Completed in ${(elapsed / 1000).toFixed(1)}s`);
    console.log("========================================\n");
    console.log(`JSON:     ${jsonPath}`);
    console.log(`Markdown: ${mdPath}\n`);
  }

  // Exit with error if targets failed
  if (!results.summary.passed) {
    if (!quiet) {
      console.error("WARNING: Some performance targets were not met!\n");
      for (const target of results.summary.failedTargets) {
        console.error(`  - ${target}`);
      }
      console.error("");
    }
    process.exit(1);
  }

  process.exit(0);
}

/**
 * Runs stress tests.
 */
async function runStressTests(outputDir: string, quiet: boolean): Promise<void> {
  if (!quiet) {
    console.log("\n========================================");
    console.log("  Procwire Stress Tests");
    console.log("========================================\n");
    console.log(`Tests: ${DEFAULT_STRESS_TESTS.map((t) => t.id).join(", ")}\n`);
  }

  const runner = new StressTestRunner();
  let allPassed = true;

  if (!quiet) {
    runner.on("test:start", (configId: string) => {
      console.log(`\n>>> Running: ${configId}`);
    });

    runner.on("test:checkpoint", (_configId: string, entry: { rps: number; latencyP99: number; memoryMB: number }) => {
      console.log(`    RPS: ${entry.rps.toFixed(0)} | P99: ${entry.latencyP99.toFixed(0)}μs | Mem: ${entry.memoryMB.toFixed(0)}MB`);
    });
  }

  const results = await runner.runAll(DEFAULT_STRESS_TESTS);

  if (!quiet) {
    console.log("\n========================================");
    console.log("  Stress Test Results");
    console.log("========================================\n");

    for (const result of results) {
      const status = result.passed ? "PASS" : "FAIL";
      console.log(`${result.configId}: ${status}`);
      console.log(`  Total requests: ${result.summary.totalRequests.toLocaleString()}`);
      console.log(`  Avg RPS: ${result.summary.avgRps.toFixed(0)}`);
      console.log(`  Memory growth: ${result.summary.memoryGrowth.toFixed(1)}MB`);

      if (result.failures.length > 0) {
        console.log(`  Failures:`);
        for (const failure of result.failures) {
          console.log(`    - ${failure}`);
        }
        allPassed = false;
      }
      console.log();
    }
  }

  process.exit(allPassed ? 0 : 1);
}

/**
 * Runs realistic workload tests.
 */
async function runRealisticTests(outputDir: string, quiet: boolean): Promise<void> {
  if (!quiet) {
    console.log("\n========================================");
    console.log("  Procwire Realistic Tests");
    console.log("========================================\n");
  }

  const runner = new RealisticTestRunner();

  if (!quiet) {
    runner.on("test:start", (configId: string) => {
      console.log(`\n>>> Running: ${configId}`);
    });

    runner.on("test:progress", (_configId: string, progress: number) => {
      process.stdout.write(`\r    Progress: ${(progress * 100).toFixed(0)}%`);
    });
  }

  // Run mixed workload test
  const mixedResult = await runner.runMixedWorkload(DEFAULT_MIXED_WORKLOAD);

  if (!quiet) {
    console.log("\n\n========================================");
    console.log("  Mixed Workload Results");
    console.log("========================================\n");

    console.log(`Overall: ${mixedResult.overallThroughputMBps.toFixed(0)} MB/s | ${mixedResult.overallRps.toFixed(0)} req/s\n`);
    console.log("By size:");
    for (const [size, count] of Object.entries(mixedResult.requestsBySize)) {
      const throughput = mixedResult.throughputBySize[size as keyof typeof mixedResult.throughputBySize];
      if (count > 0) {
        console.log(`  ${size}: ${count.toLocaleString()} requests | ${throughput.toFixed(0)} MB/s`);
      }
    }
  }

  // Run multi-worker test
  const multiResult = await runner.runMultiWorker(DEFAULT_MULTI_WORKER);

  if (!quiet) {
    console.log("\n========================================");
    console.log("  Multi-Worker Scaling Results");
    console.log("========================================\n");

    console.log("Worker scaling:");
    for (const s of multiResult.scaling) {
      const efficiency = (s.scalingEfficiency * 100).toFixed(0);
      console.log(`  ${s.workerCount} worker(s): ${s.requestsPerSecond.toFixed(0)} req/s (${efficiency}% efficiency)`);
    }
    console.log(`\nOptimal: ${multiResult.optimalWorkerCount} workers @ ${multiResult.peakRps.toFixed(0)} req/s`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
