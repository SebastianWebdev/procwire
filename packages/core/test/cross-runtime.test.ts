/**
 * Cross-runtime E2E: a NODE parent (@procwire/core) driving a BUN child
 * (@procwire/bun-client) over a real socket and a real spawned process.
 *
 * "Identical on the wire" is the core claim of the Node/Bun split; after the
 * Phase-4 A2 extraction both runtimes share one ModuleCore/ClientCore, and
 * this test pins the claim end-to-end. Skipped when Bun is not installed
 * (e.g. the OS-matrix CI legs); the dedicated Bun CI job runs it.
 */
import { describe, it, expect, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Module } from "../src/module.js";
import { ModuleManager } from "../src/manager.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, "fixtures", "bun-echo-child.ts");

const bunAvailable = ((): boolean => {
  try {
    return spawnSync("bun", ["--version"], { stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
})();

describe.skipIf(!bunAvailable)("Cross-runtime E2E: Node parent <-> Bun child", () => {
  function makeModule() {
    return new Module("bun-child")
      .executable("bun", [FIXTURE_PATH])
      .method("echo")
      .method("echoStream", { response: "stream" })
      .method("emitProgress")
      .event("progress")
      .requestTimeout(10_000);
  }

  it("handshakes, echoes a request and round-trips a stream", async () => {
    const mod = makeModule();
    const manager = new ModuleManager();
    manager.register(mod);

    try {
      await manager.spawn("bun-child");
      expect(mod.state).toBe("ready");

      const echoed = await mod.send("echo", { hello: "from node", n: 42 });
      expect(echoed).toEqual({ hello: "from node", n: 42 });

      const chunks: unknown[] = [];
      for await (const chunk of mod.stream("echoStream", ["a", "b", "c"])) {
        chunks.push(chunk);
      }
      expect(chunks).toEqual(["a", "b", "c"]);
    } finally {
      await manager.shutdown();
    }
  }, 30_000);

  it("receives child events emitted by the Bun client", async () => {
    const mod = makeModule();
    const manager = new ModuleManager();
    manager.register(mod);

    try {
      await manager.spawn("bun-child");

      const events: unknown[] = [];
      mod.onEvent("progress", (data) => events.push(data));

      const result = await mod.send("emitProgress", { count: 3 });
      expect(result).toEqual({ emitted: 3 });

      await vi.waitFor(() => expect(events).toHaveLength(3));
      expect(events[2]).toEqual({ current: 3, total: 3 });
    } finally {
      await manager.shutdown();
    }
  }, 30_000);
});
