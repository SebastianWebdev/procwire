/**
 * Cross-runtime E2E: a BUN parent (@procwire/bun-core) driving a NODE child
 * (@procwire/client) over a real socket and a real spawned process.
 *
 * "Identical on the wire" is the core claim of the Node/Bun split; after the
 * Phase-4 A2 extraction both runtimes share one ModuleCore/ClientCore, and
 * this test pins the claim end-to-end. Skipped when Node or the tsx loader
 * is unavailable.
 */
import { describe, it, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Module } from "../src/module.js";
import { ModuleManager } from "../src/manager.js";

const FIXTURE_PATH = join(import.meta.dir, "fixtures", "node-echo-child.ts");
const ROOT_DIR = join(import.meta.dir, "..", "..", "..");
const TSX_LOADER_PATH = join(ROOT_DIR, "node_modules", "tsx", "dist", "esm", "index.mjs");
const TSX_LOADER = pathToFileURL(TSX_LOADER_PATH).href;
const NODE_BIN = Bun.which("node");

const nodeAvailable = NODE_BIN !== null && existsSync(TSX_LOADER_PATH);

async function waitFor(cond: () => boolean, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 10));
  }
  return true;
}

describe.skipIf(!nodeAvailable)("Cross-runtime E2E: Bun parent <-> Node child", () => {
  function makeModule(): Module {
    return new Module("node-child")
      .executable(NODE_BIN!, ["--import", TSX_LOADER, FIXTURE_PATH])
      .method("echo")
      .method("echoStream", { response: "stream" })
      .method("emitProgress")
      .event("progress")
      .requestTimeout(10_000) as Module;
  }

  it("handshakes, echoes a request and round-trips a stream", async () => {
    const mod = makeModule();
    const manager = new ModuleManager();
    manager.register(mod);

    try {
      await manager.spawn("node-child");
      expect(mod.state).toBe("ready");

      const echoed = await mod.send("echo", { hello: "from bun", n: 42 });
      expect(echoed).toEqual({ hello: "from bun", n: 42 });

      const chunks: unknown[] = [];
      for await (const chunk of mod.stream("echoStream", ["a", "b", "c"])) {
        chunks.push(chunk);
      }
      expect(chunks).toEqual(["a", "b", "c"]);
    } finally {
      await manager.shutdown();
    }
  }, 30_000);

  it("handshakes and echoes over an authenticated data plane (Workstream C)", async () => {
    const mod = new Module("node-child")
      .executable(NODE_BIN!, ["--import", TSX_LOADER, FIXTURE_PATH])
      .method("echo")
      .requestTimeout(10_000)
      .spawnPolicy({ auth: true }) as Module;
    const manager = new ModuleManager();
    manager.register(mod);

    try {
      // A Bun parent injects PROCWIRE_TOKEN and sends the AUTH frame over a Bun
      // socket; the Node child validates it before adopting. Reaching "ready"
      // and echoing proves the auth handshake round-trips across runtimes.
      await manager.spawn("node-child");
      expect(mod.state).toBe("ready");

      const echoed = await mod.send("echo", { hello: "authed", n: 7 });
      expect(echoed).toEqual({ hello: "authed", n: 7 });
    } finally {
      await manager.shutdown();
    }
  }, 30_000);

  it("receives child events emitted by the Node client", async () => {
    const mod = makeModule();
    const manager = new ModuleManager();
    manager.register(mod);

    try {
      await manager.spawn("node-child");

      const events: unknown[] = [];
      mod.onEvent("progress", (data) => events.push(data));

      const result = await mod.send("emitProgress", { count: 3 });
      expect(result).toEqual({ emitted: 3 });

      expect(await waitFor(() => events.length === 3, 5000)).toBe(true);
      expect(events[2]).toEqual({ current: 3, total: 3 });
    } finally {
      await manager.shutdown();
    }
  }, 30_000);
});
