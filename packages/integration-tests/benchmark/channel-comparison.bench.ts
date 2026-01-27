/**
 * Benchmark: Data Channel vs Control Channel Performance Comparison
 *
 * This benchmark compares the performance of:
 * - Control channel (stdio) - line-delimited JSON-RPC over stdin/stdout
 * - Data channel (pipes/sockets) - length-prefixed JSON-RPC over named pipes/unix sockets
 *
 * Run with: pnpm benchmark
 */

import { ProcessManager, PipePath, ReservedMethods } from "@procwire/transport";
import type { IProcessHandle } from "@procwire/transport";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface BenchmarkResult {
  name: string;
  channel: "control" | "data";
  payloadSizeKB: number;
  iterations: number;
  totalTimeMs: number;
  avgTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  throughputMBps: number;
  messagesPerSec: number;
}

interface BenchmarkReport {
  timestamp: string;
  system: {
    platform: string;
    arch: string;
    cpus: string;
    cpuCount: number;
    totalMemoryGB: number;
    nodeVersion: string;
  };
  results: BenchmarkResult[];
  comparisons: Array<{
    testName: string;
    payloadSizeKB: number;
    controlChannel: BenchmarkResult;
    dataChannel: BenchmarkResult;
    speedupFactor: number;
    throughputDiff: string;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function createWorkerPath(workerName: string): string {
  return path.join(__dirname, "..", "workers", workerName);
}

function filterEnv(extra?: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  if (extra) {
    Object.assign(result, extra);
  }
  return result;
}

function generatePayload(sizeKB: number): string {
  return "x".repeat(sizeKB * 1024);
}

function percentile(sorted: number[], p: number): number {
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function calculateStats(times: number[]): {
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
} {
  const sorted = [...times].sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);
  return {
    avg: sum / times.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker Management
// ─────────────────────────────────────────────────────────────────────────────

async function spawnWorkerControlOnly(
  manager: ProcessManager,
  id: string,
): Promise<IProcessHandle> {
  const workerPath = createWorkerPath("data-channel-worker.ts");

  const handle = await manager.spawn(id, {
    executablePath: "node",
    args: ["--import", "tsx", workerPath],
    env: filterEnv(),
  });

  await handle.request(ReservedMethods.HANDSHAKE, {
    version: "1.0",
    capabilities: ["heartbeat"],
  });

  return handle;
}

async function spawnWorkerWithDataChannel(
  manager: ProcessManager,
  id: string,
): Promise<IProcessHandle> {
  const workerPath = createWorkerPath("data-channel-worker.ts");
  const dataPath = PipePath.forModule("benchmark", id);

  const dataChannelReady = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timeout waiting for data channel ready"));
    }, 30000);

    const unsubscribe = manager.on("dataChannelReady", (eventUnknown) => {
      const event = eventUnknown as { id: string; path: string };
      if (event.id === id) {
        clearTimeout(timeout);
        unsubscribe();
        resolve();
      }
    });
  });

  const handle = await manager.spawn(id, {
    executablePath: "node",
    args: ["--import", "tsx", workerPath],
    env: filterEnv({
      PROCWIRE_DATA_PATH: dataPath,
    }),
    dataChannel: {
      enabled: true,
      path: dataPath,
    },
  });

  await handle.request(ReservedMethods.HANDSHAKE, {
    version: "1.0",
    capabilities: ["heartbeat", "data_channel"],
    data_channel: {
      path: dataPath,
      serialization: "json",
    },
  });

  await dataChannelReady;
  return handle;
}

// ─────────────────────────────────────────────────────────────────────────────
// Benchmark Functions
// ─────────────────────────────────────────────────────────────────────────────

async function benchmarkPayloadTransfer(
  handle: IProcessHandle,
  channel: "control" | "data",
  payloadSizeKB: number,
  iterations: number,
): Promise<BenchmarkResult> {
  const payload = generatePayload(payloadSizeKB);
  const times: number[] = [];

  // Warmup
  for (let i = 0; i < 5; i++) {
    if (channel === "data") {
      await handle.requestViaData("process_payload", { data: payload });
    } else {
      await handle.request("process_payload", { data: payload });
    }
  }

  // Benchmark
  const totalStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    if (channel === "data") {
      await handle.requestViaData("process_payload", { data: payload });
    } else {
      await handle.request("process_payload", { data: payload });
    }
    times.push(performance.now() - start);
  }
  const totalTimeMs = performance.now() - totalStart;

  const stats = calculateStats(times);
  const totalDataMB = (payloadSizeKB * iterations) / 1024;

  return {
    name: `payload_${payloadSizeKB}KB`,
    channel,
    payloadSizeKB,
    iterations,
    totalTimeMs,
    avgTimeMs: stats.avg,
    minTimeMs: stats.min,
    maxTimeMs: stats.max,
    p50Ms: stats.p50,
    p95Ms: stats.p95,
    p99Ms: stats.p99,
    throughputMBps: totalDataMB / (totalTimeMs / 1000),
    messagesPerSec: iterations / (totalTimeMs / 1000),
  };
}

async function benchmarkThroughput(
  handle: IProcessHandle,
  channel: "control" | "data",
  messagesCount: number,
): Promise<BenchmarkResult> {
  const times: number[] = [];

  // Warmup
  for (let i = 0; i < 10; i++) {
    if (channel === "data") {
      await handle.requestViaData("echo", { n: i });
    } else {
      await handle.request("echo", { n: i });
    }
  }

  // Benchmark - concurrent requests
  const totalStart = performance.now();
  const promises = Array.from({ length: messagesCount }, async (_, i) => {
    const start = performance.now();
    if (channel === "data") {
      await handle.requestViaData("echo", { n: i });
    } else {
      await handle.request("echo", { n: i });
    }
    return performance.now() - start;
  });

  const results = await Promise.all(promises);
  times.push(...results);
  const totalTimeMs = performance.now() - totalStart;

  const stats = calculateStats(times);

  return {
    name: `throughput_${messagesCount}`,
    channel,
    payloadSizeKB: 0,
    iterations: messagesCount,
    totalTimeMs,
    avgTimeMs: stats.avg,
    minTimeMs: stats.min,
    maxTimeMs: stats.max,
    p50Ms: stats.p50,
    p95Ms: stats.p95,
    p99Ms: stats.p99,
    throughputMBps: 0,
    messagesPerSec: messagesCount / (totalTimeMs / 1000),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Report Generation
// ─────────────────────────────────────────────────────────────────────────────

function generateReport(results: BenchmarkResult[]): BenchmarkReport {
  const cpus = os.cpus();

  const report: BenchmarkReport = {
    timestamp: new Date().toISOString(),
    system: {
      platform: os.platform(),
      arch: os.arch(),
      cpus: cpus[0]?.model || "Unknown",
      cpuCount: cpus.length,
      totalMemoryGB: Math.round((os.totalmem() / 1024 / 1024 / 1024) * 10) / 10,
      nodeVersion: process.version,
    },
    results,
    comparisons: [],
  };

  // Group results by test name and create comparisons
  const grouped = new Map<string, { control?: BenchmarkResult; data?: BenchmarkResult }>();

  for (const result of results) {
    const key = `${result.name}_${result.payloadSizeKB}KB`;
    if (!grouped.has(key)) {
      grouped.set(key, {});
    }
    const group = grouped.get(key)!;
    if (result.channel === "control") {
      group.control = result;
    } else {
      group.data = result;
    }
  }

  for (const [key, group] of grouped) {
    if (group.control && group.data) {
      const speedup = group.control.avgTimeMs / group.data.avgTimeMs;
      const throughputDiff =
        group.data.payloadSizeKB > 0
          ? `${((group.data.throughputMBps / group.control.throughputMBps - 1) * 100).toFixed(1)}%`
          : `${((group.data.messagesPerSec / group.control.messagesPerSec - 1) * 100).toFixed(1)}%`;

      report.comparisons.push({
        testName: key,
        payloadSizeKB: group.control.payloadSizeKB,
        controlChannel: group.control,
        dataChannel: group.data,
        speedupFactor: Math.round(speedup * 100) / 100,
        throughputDiff,
      });
    }
  }

  return report;
}

function formatMarkdownReport(report: BenchmarkReport): string {
  const lines: string[] = [];

  lines.push("# Channel Performance Benchmark Report");
  lines.push("");
  lines.push(`**Generated:** ${report.timestamp}`);
  lines.push("");
  lines.push("## System Information");
  lines.push("");
  lines.push("| Property | Value |");
  lines.push("|----------|-------|");
  lines.push(`| Platform | ${report.system.platform} |`);
  lines.push(`| Architecture | ${report.system.arch} |`);
  lines.push(`| CPU | ${report.system.cpus} |`);
  lines.push(`| CPU Cores | ${report.system.cpuCount} |`);
  lines.push(`| Total Memory | ${report.system.totalMemoryGB} GB |`);
  lines.push(`| Node.js | ${report.system.nodeVersion} |`);
  lines.push("");

  lines.push("## Summary Comparison");
  lines.push("");
  lines.push(
    "| Test | Payload | Control (ms) | Data (ms) | Speedup | Throughput Diff |",
  );
  lines.push("|------|---------|--------------|-----------|---------|-----------------|");

  for (const comp of report.comparisons) {
    const payload = comp.payloadSizeKB > 0 ? `${comp.payloadSizeKB} KB` : "minimal";
    const speedupStr =
      comp.speedupFactor >= 1
        ? `**${comp.speedupFactor.toFixed(2)}x faster**`
        : `${comp.speedupFactor.toFixed(2)}x`;
    const diffStr = comp.throughputDiff.startsWith("-")
      ? comp.throughputDiff
      : `+${comp.throughputDiff}`;

    lines.push(
      `| ${comp.testName} | ${payload} | ${comp.controlChannel.avgTimeMs.toFixed(2)} | ${comp.dataChannel.avgTimeMs.toFixed(2)} | ${speedupStr} | ${diffStr} |`,
    );
  }

  lines.push("");
  lines.push("## Detailed Results");
  lines.push("");

  // Payload transfer tests
  const payloadTests = report.results.filter((r) => r.payloadSizeKB > 0);
  if (payloadTests.length > 0) {
    lines.push("### Payload Transfer Performance");
    lines.push("");
    lines.push(
      "| Channel | Payload | Iterations | Avg (ms) | P50 (ms) | P95 (ms) | P99 (ms) | Throughput (MB/s) |",
    );
    lines.push(
      "|---------|---------|------------|----------|----------|----------|----------|-------------------|",
    );

    for (const r of payloadTests) {
      lines.push(
        `| ${r.channel} | ${r.payloadSizeKB} KB | ${r.iterations} | ${r.avgTimeMs.toFixed(2)} | ${r.p50Ms.toFixed(2)} | ${r.p95Ms.toFixed(2)} | ${r.p99Ms.toFixed(2)} | ${r.throughputMBps.toFixed(2)} |`,
      );
    }
    lines.push("");
  }

  // Throughput tests
  const throughputTests = report.results.filter((r) => r.payloadSizeKB === 0);
  if (throughputTests.length > 0) {
    lines.push("### Message Throughput Performance");
    lines.push("");
    lines.push(
      "| Channel | Messages | Total (ms) | Avg (ms) | P50 (ms) | P95 (ms) | P99 (ms) | Messages/sec |",
    );
    lines.push(
      "|---------|----------|------------|----------|----------|----------|----------|--------------|",
    );

    for (const r of throughputTests) {
      lines.push(
        `| ${r.channel} | ${r.iterations} | ${r.totalTimeMs.toFixed(0)} | ${r.avgTimeMs.toFixed(2)} | ${r.p50Ms.toFixed(2)} | ${r.p95Ms.toFixed(2)} | ${r.p99Ms.toFixed(2)} | ${Math.round(r.messagesPerSec)} |`,
      );
    }
    lines.push("");
  }

  lines.push("## Interpretation");
  lines.push("");
  lines.push("- **Speedup > 1**: Data channel is faster than control channel");
  lines.push("- **Speedup < 1**: Control channel is faster than data channel");
  lines.push("- **Throughput Diff**: Positive means data channel has higher throughput");
  lines.push("");
  lines.push("### Notes");
  lines.push("");
  lines.push("- Control channel uses stdio (stdin/stdout) with line-delimited framing");
  lines.push("- Data channel uses named pipes (Windows) or Unix sockets with length-prefixed framing");
  lines.push("- Length-prefixed framing is more efficient for binary/large payloads");
  lines.push("- Results may vary based on system load and hardware");

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Benchmark Runner
// ─────────────────────────────────────────────────────────────────────────────

async function runBenchmarks(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Channel Performance Benchmark: Data Channel vs Control Channel");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");

  const manager = new ProcessManager({
    namespace: "benchmark",
    defaultTimeout: 60000,
    gracefulShutdownMs: 5000,
  });

  const results: BenchmarkResult[] = [];

  try {
    // Spawn workers
    console.log("Spawning workers...");
    const controlWorker = await spawnWorkerControlOnly(manager, "control-worker");
    const dataWorker = await spawnWorkerWithDataChannel(manager, "data-worker");
    console.log("Workers ready.\n");

    // Payload sizes to test (KB)
    // 1KB, 10KB, 100KB, 500KB, 1MB, 2MB, 5MB, 10MB, 50MB, 100MB
    const payloadSizes = [1, 10, 100, 500, 1024, 2048, 5120, 10240, 51200, 102400];
    // Fewer iterations for large payloads to keep benchmark time reasonable
    const getIterations = (sizeKB: number): number => {
      if (sizeKB >= 50000) return 5; // 50MB+ : 5 iterations
      if (sizeKB >= 10000) return 10; // 10MB+ : 10 iterations
      if (sizeKB >= 5000) return 20; // 5MB+ : 20 iterations
      return 50; // smaller: 50 iterations
    };

    // Throughput test sizes
    const throughputSizes = [100, 500, 1000, 2000];

    // ─── Payload Transfer Benchmarks ───────────────────────────────────────────

    console.log("Running payload transfer benchmarks...\n");

    for (const sizeKB of payloadSizes) {
      const iterations = getIterations(sizeKB);
      const sizeLabel = sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(0)} MB` : `${sizeKB} KB`;
      process.stdout.write(`  Testing ${sizeLabel} payload (${iterations} iterations)... `);

      const controlResult = await benchmarkPayloadTransfer(
        controlWorker,
        "control",
        sizeKB,
        iterations,
      );
      results.push(controlResult);

      const dataResult = await benchmarkPayloadTransfer(
        dataWorker,
        "data",
        sizeKB,
        iterations,
      );
      results.push(dataResult);

      const speedup = controlResult.avgTimeMs / dataResult.avgTimeMs;
      const winner = speedup > 1 ? "data" : "control";
      const speedupStr = speedup > 1 ? speedup.toFixed(2) : (1 / speedup).toFixed(2);

      console.log(
        `control: ${controlResult.avgTimeMs.toFixed(2)}ms, data: ${dataResult.avgTimeMs.toFixed(2)}ms (${winner} ${speedupStr}x faster)`,
      );
    }

    console.log("");

    // ─── Throughput Benchmarks ─────────────────────────────────────────────────

    console.log("Running throughput benchmarks...\n");

    for (const count of throughputSizes) {
      process.stdout.write(`  Testing ${count} concurrent messages... `);

      const controlResult = await benchmarkThroughput(controlWorker, "control", count);
      results.push(controlResult);

      const dataResult = await benchmarkThroughput(dataWorker, "data", count);
      results.push(dataResult);

      const speedup = controlResult.avgTimeMs / dataResult.avgTimeMs;
      const winner = speedup > 1 ? "data" : "control";
      const speedupStr = speedup > 1 ? speedup.toFixed(2) : (1 / speedup).toFixed(2);

      console.log(
        `control: ${Math.round(controlResult.messagesPerSec)} msg/s, data: ${Math.round(dataResult.messagesPerSec)} msg/s (${winner} ${speedupStr}x faster)`,
      );
    }

    console.log("");

    // ─── Generate Report ───────────────────────────────────────────────────────

    console.log("Generating report...\n");

    const report = generateReport(results);

    // Create reports directory
    const reportsDir = path.join(__dirname, "..", "benchmark-reports");
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    // Save JSON report
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const jsonPath = path.join(reportsDir, `benchmark-${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    console.log(`  JSON report: ${jsonPath}`);

    // Save Markdown report
    const mdPath = path.join(reportsDir, `benchmark-${timestamp}.md`);
    fs.writeFileSync(mdPath, formatMarkdownReport(report));
    console.log(`  Markdown report: ${mdPath}`);

    // Also save latest report
    const latestJsonPath = path.join(reportsDir, "latest.json");
    const latestMdPath = path.join(reportsDir, "latest.md");
    fs.writeFileSync(latestJsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(latestMdPath, formatMarkdownReport(report));
    console.log(`  Latest report: ${latestMdPath}`);

    console.log("");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  Benchmark Complete!");
    console.log("═══════════════════════════════════════════════════════════════");

    // Cleanup
    await manager.terminate("control-worker");
    await manager.terminate("data-worker");
  } catch (error) {
    console.error("Benchmark failed:", error);
    await manager.terminateAll();
    process.exit(1);
  }
}

// Run benchmarks
runBenchmarks().catch(console.error);
