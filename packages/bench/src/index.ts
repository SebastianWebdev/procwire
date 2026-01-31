#!/usr/bin/env node

/**
 * Procwire Benchmark CLI
 *
 * TASK-16: Extended with codec, response mode, and size filtering options.
 *
 * Usage:
 *   pnpm bench                          # Run full benchmark suite
 *   pnpm bench --quick                  # Run quick benchmark (reduced iterations)
 *   pnpm bench -s full-matrix           # Run specific scenario
 *   pnpm bench --codec raw              # Filter by codec
 *   pnpm bench --response result        # Filter by response mode
 *   pnpm bench --sizes 1KB,10KB,100KB   # Filter by sizes
 *   pnpm bench --help                   # Show help
 */

import { parseArgs } from "node:util";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { BenchmarkRunner } from "./runner.js";
import { getScenarios, listScenarioIds, ALL_CODECS, ALL_MODES, ALL_SIZES } from "./scenarios.js";
import type { CodecType, ResponseMode, PayloadSize } from "./types.js";
import { writeJsonReport } from "./report/json.js";
import { writeMarkdownReport, generateMarkdownReport } from "./report/markdown.js";

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

  # Combine filters
  pnpm bench --codec raw --sizes 1MB,10MB,100MB

PERFORMANCE TARGETS:
  - 1KB:   >100 MB/s
  - 10KB:  >200 MB/s
  - 100KB: >400 MB/s
  - 1MB:   >500 MB/s
  - 10MB:  >1000 MB/s (1 GB/s)
  - 100MB: >2000 MB/s (2 GB/s)
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
    },
    allowPositionals: false,
  });

  if (values.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  // Parse and validate filters
  const codec = values.codec ? parseCodec(values.codec) : undefined;
  const responseMode = values.response ? parseResponseMode(values.response) : undefined;
  const sizes = values.sizes ? parseSizes(values.sizes) : undefined;

  const scenarios = getScenarios({
    ids: values.scenario as string[],
    quick: values.quick as boolean,
    codec,
    responseMode,
    sizes,
  });

  const outputDir = values.output as string;
  const quiet = values.quiet as boolean;

  if (!quiet) {
    console.log("\n========================================");
    console.log("  Procwire Benchmark Suite");
    console.log("========================================\n");
    console.log(`Mode: ${values.quick ? "Quick" : "Full"}`);
    console.log(`Scenarios: ${scenarios.map((s) => s.id).join(", ")}`);

    // Show what combinations will actually run
    for (const s of scenarios) {
      console.log(
        `  ${s.id}: ${s.codecs.join("+")} × ${s.modes.join("+")} × ${s.sizes.length} sizes`,
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
