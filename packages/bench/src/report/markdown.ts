/**
 * Markdown report writer.
 *
 * TASK-16: Refactored report structure with Executive Summary
 * and comprehensive tables for all codec × mode combinations.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  BenchmarkResults,
  ScenarioResult,
  PayloadSize,
  CodecType,
  ResponseMode,
} from "../types.js";

const ALL_SIZES: PayloadSize[] = ["1KB", "10KB", "100KB", "1MB", "10MB", "100MB"];
const ALL_CODECS: CodecType[] = ["raw", "msgpack", "arrow"];
const ALL_MODES: ResponseMode[] = ["result", "stream", "ack"];

/**
 * Formats a number with thousand separators.
 */
function formatNumber(num: number): string {
  return num.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/**
 * Formats duration in milliseconds to human-readable string.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

/**
 * Formats bytes to human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Formats throughput for display.
 */
function formatThroughput(mbps: number): string {
  if (mbps >= 1000) {
    return `${(mbps / 1000).toFixed(2)} GB/s`;
  }
  return `${mbps.toFixed(0)} MB/s`;
}

/**
 * Generates ASCII bar for throughput visualization.
 */
function generateBar(value: number, maxValue: number, width: number = 40): string {
  const filled = Math.round((value / maxValue) * width);
  return "\u2588".repeat(Math.max(0, filled));
}

/**
 * Find best result for given filters.
 */
function findBestResult(
  results: ScenarioResult[],
  filters: { size?: PayloadSize; codec?: CodecType; mode?: ResponseMode },
): ScenarioResult | undefined {
  return results.find(
    (r) =>
      (!filters.size || r.size === filters.size) &&
      (!filters.codec || r.codec === filters.codec) &&
      (!filters.mode || r.mode === filters.mode),
  );
}

/**
 * Get all results matching filters.
 */
function getResultsMatching(
  results: ScenarioResult[],
  filters: { size?: PayloadSize; codec?: CodecType; mode?: ResponseMode },
): ScenarioResult[] {
  return results.filter(
    (r) =>
      (!filters.size || r.size === filters.size) &&
      (!filters.codec || r.codec === filters.codec) &&
      (!filters.mode || r.mode === filters.mode),
  );
}

/**
 * Generates Executive Summary section.
 */
function generateExecutiveSummary(results: BenchmarkResults): string {
  const { summary } = results;

  // Find peak throughput result
  const peakResult = results.results.reduce((best, r) =>
    r.throughputMBps > best.throughputMBps ? r : best,
  );

  // Find best codec for large payloads (10MB+)
  const largePayloadResults = results.results.filter(
    (r) => (r.size === "10MB" || r.size === "100MB") && r.mode === "result",
  );
  const bestLargeCodec =
    largePayloadResults.length > 0
      ? largePayloadResults.reduce((best, r) => (r.throughputMBps > best.throughputMBps ? r : best))
          .codec
      : "N/A";

  // Find latency baseline (1KB raw result)
  const latencyBaseline = findBestResult(results.results, {
    size: "1KB",
    codec: "raw",
    mode: "result",
  });
  const baselineLatency = latencyBaseline ? `${latencyBaseline.latency.p50.toFixed(0)}us` : "N/A";

  return `## Executive Summary

| Metric | Value |
|--------|-------|
| Peak Throughput | **${formatThroughput(summary.peakThroughputMBps)}** (${peakResult.codec}/${peakResult.size}/${peakResult.mode}) |
| Best Codec (Large Payloads) | **${bestLargeCodec}** |
| Latency Baseline (1KB P50) | **${baselineLatency}** |
| Total Data Transferred | ${formatBytes(summary.totalBytes)} |
| Overall Status | ${summary.passed ? "**PASS**" : "**FAIL**"} |
`;
}

/**
 * Generates throughput by payload size table.
 * Shows throughput for each codec at each size (result mode).
 */
function generateThroughputBySize(results: BenchmarkResults): string {
  const resultModeResults = getResultsMatching(results.results, { mode: "result" });

  if (resultModeResults.length === 0) {
    return "No throughput data available.\n";
  }

  // Build header
  let table = "| Size |";
  for (const codec of ALL_CODECS) {
    table += ` ${codec} |`;
  }
  table += "\n|------|";
  for (let i = 0; i < ALL_CODECS.length; i++) {
    table += "--------|";
  }
  table += "\n";

  // Build rows
  for (const size of ALL_SIZES) {
    const sizeResults = getResultsMatching(resultModeResults, { size });
    if (sizeResults.length === 0) continue;

    table += `| ${size} |`;
    for (const codec of ALL_CODECS) {
      const result = sizeResults.find((r) => r.codec === codec);
      if (result) {
        table += ` ${formatThroughput(result.throughputMBps)} |`;
      } else {
        table += " - |";
      }
    }
    table += "\n";
  }

  return table;
}

/**
 * Generates response mode comparison table.
 * Compares result vs stream vs ack for a given codec.
 */
function generateResponseModeComparison(results: BenchmarkResults): string {
  // Use raw codec for comparison (no serialization overhead)
  const rawResults = getResultsMatching(results.results, { codec: "raw" });

  if (rawResults.length === 0) {
    return "No response mode comparison data available.\n";
  }

  // Build header
  let table = "| Size |";
  for (const mode of ALL_MODES) {
    table += ` ${mode} |`;
  }
  table += "\n|------|";
  for (let i = 0; i < ALL_MODES.length; i++) {
    table += "--------|";
  }
  table += "\n";

  // Build rows
  for (const size of ALL_SIZES) {
    const sizeResults = getResultsMatching(rawResults, { size });
    if (sizeResults.length === 0) continue;

    table += `| ${size} |`;
    for (const mode of ALL_MODES) {
      const result = sizeResults.find((r) => r.mode === mode);
      if (result) {
        table += ` ${formatThroughput(result.throughputMBps)} |`;
      } else {
        table += " - |";
      }
    }
    table += "\n";
  }

  return table;
}

/**
 * Generates latency percentiles table.
 */
function generateLatencyTable(results: BenchmarkResults): string {
  // Filter to latency-focused results (small payloads, result mode)
  const latencyResults = results.results.filter((r) => r.size === "1KB" && r.mode === "result");

  if (latencyResults.length === 0) {
    return "No latency data available.\n";
  }

  let table = "| Codec | P50 | P95 | P99 | P99.9 |\n";
  table += "|-------|-----|-----|-----|-------|\n";

  for (const codec of ALL_CODECS) {
    const result = latencyResults.find((r) => r.codec === codec);
    if (result) {
      const l = result.latency;
      table += `| ${codec} | ${l.p50.toFixed(0)}us | ${l.p95.toFixed(0)}us | ${l.p99.toFixed(0)}us | ${l.p999.toFixed(0)}us |\n`;
    }
  }

  return table;
}

/**
 * Generates streaming vs result comparison table.
 */
function generateStreamingComparison(results: BenchmarkResults): string {
  // Use raw codec for fairest comparison
  const rawResults = getResultsMatching(results.results, { codec: "raw" });

  if (rawResults.length === 0) {
    return "No streaming comparison data available.\n";
  }

  let table = "| Size | Result | Stream | Difference |\n";
  table += "|------|--------|--------|------------|\n";

  for (const size of ALL_SIZES) {
    const resultMode = rawResults.find((r) => r.size === size && r.mode === "result");
    const streamMode = rawResults.find((r) => r.size === size && r.mode === "stream");

    if (!resultMode && !streamMode) continue;

    const resultThroughput = resultMode?.throughputMBps ?? 0;
    const streamThroughput = streamMode?.throughputMBps ?? 0;

    let diff = "-";
    if (resultThroughput > 0 && streamThroughput > 0) {
      const pctDiff = ((streamThroughput - resultThroughput) / resultThroughput) * 100;
      diff = pctDiff >= 0 ? `+${pctDiff.toFixed(0)}%` : `${pctDiff.toFixed(0)}%`;
    }

    table += `| ${size} | ${resultMode ? formatThroughput(resultThroughput) : "-"} | ${streamMode ? formatThroughput(streamThroughput) : "-"} | ${diff} |\n`;
  }

  return table;
}

/**
 * Generates the performance targets section.
 */
function generatePerformanceTargetsSection(results: BenchmarkResults): string {
  const targets = results.summary.performanceTargets;

  if (targets.length === 0) {
    return "No performance targets measured.\n";
  }

  let section = "| Size | Target | Actual | Status | Margin |\n";
  section += "|------|--------|--------|--------|--------|\n";

  for (const target of targets) {
    const status = target.passed ? "PASS" : "**FAIL**";
    section += `| ${target.size} | ${target.targetMBps} MB/s | ${target.actualMBps.toFixed(0)} MB/s | ${status} | ${target.margin} |\n`;
  }

  return section;
}

/**
 * Generates ASCII throughput chart.
 */
function generateThroughputChart(results: BenchmarkResults): string {
  // Group by size, get best raw/result throughput for each
  const throughputBySize = new Map<string, number>();

  for (const result of results.results) {
    if (result.codec === "raw" && result.mode === "result") {
      const current = throughputBySize.get(result.size) ?? 0;
      if (result.throughputMBps > current) {
        throughputBySize.set(result.size, result.throughputMBps);
      }
    }
  }

  if (throughputBySize.size === 0) {
    return "No throughput data available.\n";
  }

  const maxThroughput = Math.max(...throughputBySize.values());
  let chart = "```\n";

  for (const size of ALL_SIZES) {
    const throughput = throughputBySize.get(size);
    if (throughput !== undefined) {
      const bar = generateBar(throughput, maxThroughput);
      chart += `${size.padEnd(6)} | ${bar} ${formatThroughput(throughput)}\n`;
    }
  }

  chart += "```\n";
  return chart;
}

/**
 * Generates detailed results section.
 */
function generateDetailedResults(results: BenchmarkResults): string {
  // Group results by scenario
  const byScenario = new Map<string, ScenarioResult[]>();

  for (const result of results.results) {
    const existing = byScenario.get(result.scenarioId) ?? [];
    existing.push(result);
    byScenario.set(result.scenarioId, existing);
  }

  let section = "";

  for (const [scenarioId, scenarioResults] of byScenario) {
    section += `### ${scenarioId}\n\n`;
    section += "| Size | Codec | Mode | Throughput | Latency P99 | Requests/s |\n";
    section += "|------|-------|------|------------|-------------|------------|\n";

    for (const r of scenarioResults) {
      section += `| ${r.size} | ${r.codec} | ${r.mode} | ${formatThroughput(r.throughputMBps)} | ${r.latency.p99.toFixed(0)}us | ${formatNumber(r.requestsPerSecond)} |\n`;
    }

    section += "\n";
  }

  return section;
}

/**
 * Generates the full Markdown report.
 */
export function generateMarkdownReport(results: BenchmarkResults): string {
  const meta = results.meta;
  const summary = results.summary;

  return `# Procwire Benchmark Report

**Generated:** ${meta.timestamp}
**Platform:** ${meta.platform} ${meta.arch} | Node.js ${meta.nodeVersion}
**Host:** ${meta.hostname} | ${meta.cpuModel} (${meta.cpuCores} cores) | ${meta.totalMemoryGB.toFixed(1)} GB RAM
**Duration:** ${formatDuration(summary.totalDurationMs)}

${generateExecutiveSummary(results)}

## 1. Throughput by Payload Size

Throughput (MB/s) for each codec using \`result\` response mode:

${generateThroughputBySize(results)}

### Throughput Chart (raw codec)

${generateThroughputChart(results)}

## 2. Response Mode Comparison

Throughput comparison across response modes (raw codec):

${generateResponseModeComparison(results)}

## 3. Latency Percentiles (1KB payload)

${generateLatencyTable(results)}

## 4. Streaming vs Result

Comparison of streaming vs single-response throughput (raw codec):

${generateStreamingComparison(results)}

## 5. Performance Targets

${generatePerformanceTargetsSection(results)}

${summary.failedTargets.length > 0 ? `**Failed targets:**\n${summary.failedTargets.map((t) => `- ${t}`).join("\n")}\n` : ""}

## 6. Detailed Results

${generateDetailedResults(results)}

---
*Generated by @procwire/bench*
`;
}

/**
 * Writes benchmark results to a Markdown file.
 * @returns Path to the written file.
 */
export async function writeMarkdownReport(
  results: BenchmarkResults,
  outputDir: string,
): Promise<string> {
  // Ensure output directory exists
  await mkdir(outputDir, { recursive: true });

  // Generate filename with timestamp
  const timestamp = results.meta.timestamp.replace(/[:.]/g, "-");
  const filename = `benchmark-${timestamp}.md`;
  const filepath = join(outputDir, filename);

  // Generate and write report
  const markdown = generateMarkdownReport(results);
  await writeFile(filepath, markdown, "utf-8");

  return filepath;
}
