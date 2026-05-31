/**
 * Backpressure benchmark - exercises the D2 receive-side flow control.
 *
 * The worker floods the parent with chunks faster than the parent consumes
 * them. Without receive-side backpressure the parent's stream queue grows
 * unbounded (memory blows up); with D2 the parent pauses the socket past the
 * high-water mark, which stalls the producer and bounds memory.
 *
 * Reports peak RSS growth during a deliberately slow consume. Run main vs
 * branch (swap dist) to see the difference.
 *
 * Usage:
 *   tsx src/backpressure.ts
 *   FLOOD_CHUNKS=3000 FLOOD_CHUNK_SIZE=32768 tsx src/backpressure.ts --json
 */

import { parseArgs } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { ModuleManager, Module } from "@procwire/core";
import { rawCodec } from "@procwire/codecs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = join(__dirname, "..", "workers", "benchmark-worker.ts");
const ROOT_DIR = join(__dirname, "..", "..", "..");
const TSX_LOADER = pathToFileURL(
  join(ROOT_DIR, "node_modules", "tsx", "dist", "esm", "index.mjs"),
).href;
const NODE_BIN = process.execPath;
const MB = 1024 * 1024;

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { json: { type: "boolean", default: false } } });
  const json = values.json as boolean;

  const chunkSize = Number(process.env.FLOOD_CHUNK_SIZE ?? 32 * 1024);
  const chunks = Number(process.env.FLOOD_CHUNKS ?? 3000);
  const totalMB = (chunkSize * chunks) / MB;

  const manager = new ModuleManager();
  manager.on("error", () => {});
  const module = new Module("flood-worker")
    .executable(NODE_BIN, ["--import", TSX_LOADER, WORKER_PATH])
    .method("stream_flood", { codec: rawCodec, response: "stream" });
  manager.register(module);

  await manager.spawn("flood-worker");

  if (global.gc) global.gc();
  const baseRss = process.memoryUsage().rss;
  let peakRss = baseRss;
  let count = 0;

  // Sample RSS on a timer so we capture the peak while the consumer is blocked
  // (no chunk callback runs during the stall below).
  const sampler = setInterval(() => {
    const r = process.memoryUsage().rss;
    if (r > peakRss) peakRss = r;
  }, 20);
  sampler.unref?.();

  const stallMs = Number(process.env.STALL_MS ?? 800);
  const t0 = performance.now();
  // Blocked consumer: after the first chunk, stall long enough for the producer
  // to flood the receive queue. Without backpressure the queue (and RSS) grows
  // toward the full produced size; with D2 the socket is paused at the
  // high-water mark, bounding it.
  for await (const _chunk of module.stream("stream_flood", Buffer.alloc(0))) {
    count++;
    if (count === 1) await delay(stallMs);
  }
  const durationMs = performance.now() - t0;
  clearInterval(sampler);

  await manager.shutdown("flood-worker");

  const result = {
    chunks: count,
    chunkSizeKB: chunkSize / 1024,
    totalProducedMB: +totalMB.toFixed(1),
    peakRssGrowthMB: +((peakRss - baseRss) / MB).toFixed(1),
    durationMs: +durationMs.toFixed(0),
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`\nBackpressure benchmark (slow consumer)`);
    console.log(
      `  produced:        ${result.chunks} x ${result.chunkSizeKB}KB = ${result.totalProducedMB}MB`,
    );
    console.log(
      `  peak RSS growth: ${result.peakRssGrowthMB}MB  (lower = bounded by backpressure)`,
    );
    console.log(`  duration:        ${result.durationMs}ms`);
  }
}

main().catch((err) => {
  console.error("Backpressure benchmark failed:", err);
  process.exit(1);
});
