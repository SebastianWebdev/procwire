/**
 * Kill-signal regression tests (bun-core), run against REAL spawned children.
 *
 * D8: the Bun manager used bare proc.kill() (SIGTERM) where the Node manager
 * uses SIGKILL (init-timeout, heartbeat-timeout/force-kill via _killProcess,
 * exit-wait force kill). A hung child with a SIGTERM handler survived every
 * "force" kill. The exit wait additionally polled exitCode every 100ms and
 * leaked that interval when the force-kill timeout fired first; it must use
 * `await proc.exited` instead.
 *
 * Written to FAIL against the buggy code and PASS once the fix is applied.
 */
import { describe, it, expect } from "bun:test";
import { Module, ModuleManager } from "../src/index.js";

type BunSubprocess = ReturnType<typeof Bun.spawn>;

const FIXTURE = new URL("./fixtures/sigterm-trap-child.ts", import.meta.url).pathname;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(cond: () => boolean, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 25));
  }
  return true;
}

/** Spawn the trap fixture directly and wait until its SIGTERM handler is up. */
async function spawnTrapChild(): Promise<BunSubprocess> {
  const proc = Bun.spawn(["bun", FIXTURE], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "inherit",
  });

  const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    const deadline = Date.now() + 5000;
    while (!buffer.includes("TRAP-READY")) {
      if (Date.now() > deadline) throw new Error("trap fixture did not become ready");
      const { value, done } = await reader.read();
      if (done) throw new Error("trap fixture exited before becoming ready");
      buffer += decoder.decode(value);
    }
  } finally {
    reader.releaseLock();
  }
  return proc;
}

function forceReap(proc: BunSubprocess): void {
  try {
    proc.kill("SIGKILL");
  } catch {
    /* already dead */
  }
}

describe("D8 (bun-core): force kills must use SIGKILL", () => {
  it("_killProcess terminates a child that traps SIGTERM", async () => {
    const proc = await spawnTrapChild();
    try {
      const mod = new Module("trap").executable("bun", [FIXTURE]).method("x");
      mod._attachProcess(proc);

      const manager = new ModuleManager();
      (manager as unknown as { _killProcess(m: Module): void })._killProcess(mod);

      // SIGTERM is trapped by the fixture: only SIGKILL can have worked.
      expect(await waitFor(() => !isAlive(proc.pid), 3000)).toBe(true);
    } finally {
      forceReap(proc);
    }
  }, 10000);

  it("the exit-wait force-kill path uses SIGKILL, awaits the real exit, and leaks no poll timer", async () => {
    const proc = await spawnTrapChild();
    try {
      const manager = new ModuleManager();
      const api = manager as unknown as {
        _waitForExitOrKill(module: unknown, proc: BunSubprocess, timeoutMs: number): Promise<void>;
      };

      // The child ignores SIGTERM and never exits on its own: the 300ms
      // force-kill timeout must fire, SIGKILL it, and resolve only once the
      // process is really gone.
      await api._waitForExitOrKill({ process: proc }, proc, 300);

      expect(proc.exitCode === null && proc.signalCode === null).toBe(false);
      expect(await waitFor(() => !isAlive(proc.pid), 3000)).toBe(true);
    } finally {
      forceReap(proc);
    }
  }, 10000);

  it("init-timeout spawn failure terminates a SIGTERM-trapping child", async () => {
    const mod = new Module("trap")
      .executable("bun", [FIXTURE])
      .method("x")
      .spawnPolicy({ initTimeout: 500, maxRetries: 0 });
    const manager = new ModuleManager();
    manager.register(mod);

    const spawnResult = manager.spawn("trap").then(
      () => null,
      (err: Error) => err,
    );

    // Capture the pid while the spawn attempt is in flight (the failed
    // attempt detaches the process from the module afterwards).
    const sawPid = await waitFor(() => mod.process?.pid !== undefined, 3000);
    expect(sawPid).toBe(true);
    const pid = mod.process!.pid;

    try {
      const err = await spawnResult;
      expect(err).not.toBeNull();
      expect(err!.message).toContain("$init");

      // The init-timeout and cleanup kills must defeat the SIGTERM trap.
      expect(await waitFor(() => !isAlive(pid), 3000)).toBe(true);
    } finally {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* already dead */
      }
    }
  }, 15000);
});
