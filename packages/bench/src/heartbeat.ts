/**
 * Heartbeat overhead benchmark.
 *
 * The liveness heartbeat (D1) runs on the control plane (stdio), separate from
 * the data plane (named pipe). This benchmark measures whether enabling it
 * affects data-plane request throughput. It compares heartbeat OFF vs ON on the
 * same build (heartbeat is a new feature, so there is no main baseline).
 *
 * Usage:
 *   tsx src/heartbeat.ts
 *   tsx src/heartbeat.ts --rounds 5 --requests 5000 --json
 */

import { parseArgs } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { ModuleManager, Module } from "@procwire/core";
import { rawCodec } from "@procwire/codecs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = join(__dirname, "..", "workers", "benchmark-worker.ts");
const ROOT_DIR = join(__dirname, "..", "..", "..");
const TSX_LOADER = pathToFileURL(
  join(ROOT_DIR, "node_modules", "tsx", "dist", "esm", "index.mjs"),
).href;
const NODE_BIN = process.execPath;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

async function measureRps(heartbeat: boolean, requests: number): Promise<number> {
  const manager = new ModuleManager();
  manager.on("error", () => {});
  const module = new Module("hb-worker")
    .executable(NODE_BIN, ["--import", TSX_LOADER, WORKER_PATH])
    .method("raw_result", { codec: rawCodec, response: "result" });
  if (heartbeat) {
    // Aggressive interval (100 pings/s) to maximise any chance of interference.
    module.spawnPolicy({ heartbeat: { intervalMs: 10, timeoutMs: 2000 } });
  }
  manager.register(module);
  await manager.spawn("hb-worker");

  const payload = Buffer.allocUnsafe(1024);
  for (let i = 0; i < 500; i++) await module.send("raw_result", payload); // warmup

  const t0 = performance.now();
  for (let i = 0; i < requests; i++) await module.send("raw_result", payload);
  const durationSec = (performance.now() - t0) / 1000;

  await manager.shutdown("hb-worker");
  return requests / durationSec;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      rounds: { type: "string", default: "5" },
      requests: { type: "string", default: "5000" },
      json: { type: "boolean", default: false },
    },
  });
  const rounds = parseInt(values.rounds as string, 10);
  const requests = parseInt(values.requests as string, 10);

  const off: number[] = [];
  const on: number[] = [];
  // Interleave OFF/ON per round (alternating order) to cancel time drift.
  for (let r = 0; r < rounds; r++) {
    if (r % 2 === 0) {
      off.push(await measureRps(false, requests));
      on.push(await measureRps(true, requests));
    } else {
      on.push(await measureRps(true, requests));
      off.push(await measureRps(false, requests));
    }
  }

  const offRps = Math.round(median(off));
  const onRps = Math.round(median(on));
  const deltaPct = offRps ? +(((onRps - offRps) / offRps) * 100).toFixed(1) : 0;
  const result = { rounds, requests, offRps, onRps, deltaPct };

  if (values.json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`\nHeartbeat overhead (${rounds} rounds x ${requests} req, 1KB raw result)`);
    console.log(`  heartbeat OFF: ${offRps} req/s`);
    console.log(`  heartbeat ON:  ${onRps} req/s`);
    console.log(
      `  delta:         ${deltaPct >= 0 ? "+" : ""}${deltaPct}%  (~0 = no data-plane impact)`,
    );
  }
}

main().catch((err) => {
  console.error("Heartbeat benchmark failed:", err);
  process.exit(1);
});
