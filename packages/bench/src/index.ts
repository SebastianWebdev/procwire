#!/usr/bin/env node

/**
 * Procwire Benchmark CLI
 *
 * Usage:
 *   pnpm bench              # Run full benchmark suite
 *   pnpm bench --quick      # Run quick benchmark (reduced iterations)
 *   pnpm bench -s latency   # Run specific scenario
 *   pnpm bench --help       # Show help
 */

import { parseArgs } from "node:util";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { BenchmarkRunner } from "./runner.js";
import { getScenarios, listScenarioIds } from "./scenarios.js";
import { writeJsonReport } from "./report/json.js";
import { writeMarkdownReport, generateMarkdownReport } from "./report/markdown.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_DIR = join(__dirname, "..", "results");

const HELP_TEXT = `
procwire-bench - Benchmark suite for @procwire IPC library

USAGE:
  pnpm bench [options]

OPTIONS:
  -s, --scenario <id>   Run specific scenario(s) (can be repeated)
  -o, --output <dir>    Output directory (default: ./results)
  --quick               Quick mode (reduced iterations)
  -q, --quiet           Suppress progress output
  -h, --help            Show this help

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
  pnpm bench -s throughput-raw

  # Multiple scenarios
  pnpm bench -s throughput-raw -s latency

PERFORMANCE TARGETS:
  - 1KB:  >100 MB/s
  - 10KB: >200 MB/s
  - 1MB:  >500 MB/s
  - 10MB: >1000 MB/s (1 GB/s)
`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      scenario: { type: "string", short: "s", multiple: true, default: [] },
      output: { type: "string", short: "o", default: DEFAULT_OUTPUT_DIR },
      quick: { type: "boolean", default: false },
      quiet: { type: "boolean", short: "q", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const scenarios = getScenarios(values.scenario as string[], values.quick as boolean);
  const outputDir = values.output as string;
  const quiet = values.quiet as boolean;

  if (!quiet) {
    console.log("\n========================================");
    console.log("  Procwire Benchmark Suite");
    console.log("========================================\n");
    console.log(`Mode: ${values.quick ? "Quick" : "Full"}`);
    console.log(`Scenarios: ${scenarios.map((s) => s.id).join(", ")}`);
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
  const results = await runner.run(scenarios);
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

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
