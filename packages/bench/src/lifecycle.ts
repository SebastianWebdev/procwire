/**
 * Lifecycle benchmark - measures spawn->ready and shutdown timing.
 *
 * The request-throughput suite (runner.ts) does not cover process lifecycle.
 * This benchmark fills that gap and exercises the control-plane changes:
 * graceful `$shutdown` handling (vs. the parent's force-kill grace period) and,
 * optionally, the liveness heartbeat's effect on a steady request stream.
 *
 * Usage:
 *   tsx src/lifecycle.ts                 # spawn/shutdown timing (default 10 cycles)
 *   tsx src/lifecycle.ts --cycles 20
 *   tsx src/lifecycle.ts --json          # machine-readable output
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

function buildModule(): Module {
  // One method is enough to satisfy schema validation; the worker handles it.
  return new Module("lifecycle-worker")
    .executable(NODE_BIN, ["--import", TSX_LOADER, WORKER_PATH])
    .method("raw_result", { codec: rawCodec, response: "result" });
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      cycles: { type: "string", default: "10" },
      json: { type: "boolean", default: false },
    },
  });
  const cycles = parseInt(values.cycles as string, 10);
  const json = values.json as boolean;

  const spawnReady: number[] = [];
  const shutdown: number[] = [];

  // One warmup cycle (JIT, tsx loader cache) that is not recorded.
  for (let i = -1; i < cycles; i++) {
    const manager = new ModuleManager();
    manager.on("error", () => {});
    const module = buildModule();
    manager.register(module);

    const t0 = performance.now();
    await manager.spawn("lifecycle-worker");
    const tReady = performance.now() - t0;

    const t1 = performance.now();
    await manager.shutdown("lifecycle-worker");
    const tShutdown = performance.now() - t1;

    if (i >= 0) {
      spawnReady.push(tReady);
      shutdown.push(tShutdown);
    }
  }

  const result = {
    cycles,
    spawnReadyMs: {
      median: +median(spawnReady).toFixed(1),
      min: +Math.min(...spawnReady).toFixed(1),
      max: +Math.max(...spawnReady).toFixed(1),
    },
    shutdownMs: {
      median: +median(shutdown).toFixed(1),
      min: +Math.min(...shutdown).toFixed(1),
      max: +Math.max(...shutdown).toFixed(1),
    },
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`\nLifecycle benchmark (${cycles} cycles)`);
    console.log(
      `  spawn->ready: median ${result.spawnReadyMs.median}ms  (min ${result.spawnReadyMs.min} / max ${result.spawnReadyMs.max})`,
    );
    console.log(
      `  shutdown:     median ${result.shutdownMs.median}ms  (min ${result.shutdownMs.min} / max ${result.shutdownMs.max})`,
    );
  }
}

main().catch((err) => {
  console.error("Lifecycle benchmark failed:", err);
  process.exit(1);
});
