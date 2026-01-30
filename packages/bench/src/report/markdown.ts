/**
 * Markdown report writer.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BenchmarkResults, ScenarioResult, PayloadSize, CodecType } from "../types.js";

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
 * Generates ASCII bar for throughput visualization.
 */
function generateBar(value: number, maxValue: number, width: number = 40): string {
  const filled = Math.round((value / maxValue) * width);
  return "\u2588".repeat(Math.max(0, filled));
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
  const sizes: PayloadSize[] = ["1KB", "10KB", "100KB", "1MB", "10MB"];
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

  for (const size of sizes) {
    const throughput = throughputBySize.get(size);
    if (throughput !== undefined) {
      const bar = generateBar(throughput, maxThroughput);
      chart += `${size.padEnd(6)} | ${bar} ${throughput.toFixed(0)} MB/s\n`;
    }
  }

  chart += "```\n";
  return chart;
}

/**
 * Generates latency table.
 */
function generateLatencyTable(results: BenchmarkResults): string {
  // Filter to latency-focused results (small payloads)
  const latencyResults = results.results.filter((r) => r.size === "1KB" && r.mode === "result");

  if (latencyResults.length === 0) {
    return "No latency data available.\n";
  }

  let table = "| Codec | P50 | P95 | P99 | P99.9 |\n";
  table += "|-------|-----|-----|-----|-------|\n";

  for (const result of latencyResults) {
    const l = result.latency;
    table += `| ${result.codec} | ${l.p50.toFixed(0)}us | ${l.p95.toFixed(0)}us | ${l.p99.toFixed(0)}us | ${l.p999.toFixed(0)}us |\n`;
  }

  return table;
}

/**
 * Generates codec comparison table.
 */
function generateCodecComparison(results: BenchmarkResults): string {
  // Find results for 1MB payload with result mode
  const comparisonResults = results.results.filter((r) => r.size === "1MB" && r.mode === "result");

  if (comparisonResults.length === 0) {
    return "No codec comparison data available.\n";
  }

  // Find raw throughput as baseline
  const rawResult = comparisonResults.find((r) => r.codec === "raw");
  const rawThroughput = rawResult?.throughputMBps ?? 0;

  let table = "| Codec | Throughput | vs Raw |\n";
  table += "|-------|------------|--------|\n";

  const codecs: CodecType[] = ["raw", "msgpack", "arrow"];
  for (const codec of codecs) {
    const result = comparisonResults.find((r) => r.codec === codec);
    if (result) {
      const overhead =
        codec === "raw"
          ? "-"
          : `${(((result.throughputMBps - rawThroughput) / rawThroughput) * 100).toFixed(0)}%`;
      table += `| ${codec} | ${result.throughputMBps.toFixed(0)} MB/s | ${overhead} |\n`;
    }
  }

  return table;
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
      section += `| ${r.size} | ${r.codec} | ${r.mode} | ${r.throughputMBps.toFixed(0)} MB/s | ${r.latency.p99.toFixed(0)}us | ${formatNumber(r.requestsPerSecond)} |\n`;
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

## Summary

| Metric | Value |
|--------|-------|
| Total Duration | ${formatDuration(summary.totalDurationMs)} |
| Total Requests | ${formatNumber(summary.totalRequests)} |
| Total Data | ${formatBytes(summary.totalBytes)} |
| Peak Throughput | **${summary.peakThroughputMBps.toFixed(0)} MB/s** |
| Status | ${summary.passed ? "**PASS**" : "**FAIL**"} |

## Performance Targets

${generatePerformanceTargetsSection(results)}

${summary.failedTargets.length > 0 ? `**Failed targets:**\n${summary.failedTargets.map((t) => `- ${t}`).join("\n")}\n` : ""}

## Throughput by Payload Size

${generateThroughputChart(results)}

## Latency (1KB payload)

${generateLatencyTable(results)}

## Codec Comparison (1MB payload)

${generateCodecComparison(results)}

## Detailed Results

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
