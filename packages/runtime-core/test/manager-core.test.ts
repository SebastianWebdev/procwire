/**
 * ModuleManagerCore tested ONCE against fake runtime hooks.
 *
 * Pins the shared lifecycle policies: spawn retry/backoff, crash-restart,
 * the PER-MODULE shutdown guard (Bug W4 - now unified for Bun too, which
 * previously used a global flag), and the heartbeat state machine.
 */
import { describe, it, expect, vi } from "vitest";
import type { EmptySchema } from "@procwire/codecs";
import type { InitMessage, SpawnPolicy } from "../src/types.js";
import { ModuleCore } from "../src/module-core.js";
import { ModuleManagerCore, SpawnError } from "../src/manager-core.js";
import { ManagerEvents } from "../src/events.js";
import { FakeTransport } from "./fake-transport.js";

interface FakeProc {
  id: number;
  alive: boolean;
}

/** Test module whose data channel is the fake transport directly. */
class TestModule extends ModuleCore<EmptySchema, FakeProc> {
  _attachDataChannel(transport: FakeTransport): void {
    this._attachTransport(transport);
  }
}

class FakeManager extends ModuleManagerCore<FakeProc, TestModule> {
  nextProcId = 1;
  /** When > 0, the next N spawn attempts fail at the init step. */
  failInits = 0;
  /** When true, _waitForInit resolves a $init without params.schema. */
  malformedInit = false;
  controlMessages: { name: string; message: string }[] = [];
  killed: number[] = [];
  exitHandlers = new Map<number, (code: number | null, signal: string | null) => void>();

  protected _spawnProcess(_module: TestModule): FakeProc {
    return { id: this.nextProcId++, alive: true };
  }

  protected _waitForSpawnResult(): Promise<Error | null> {
    return Promise.resolve(null);
  }

  protected _watchProcessExit(module: TestModule, proc: FakeProc): void {
    this.exitHandlers.set(proc.id, (code, signal) => {
      proc.alive = false;
      this.handleProcessExit(module, proc, code, signal);
    });
  }

  protected _waitForInit(): Promise<InitMessage> {
    if (this.failInits > 0) {
      this.failInits--;
      return Promise.reject(new Error("init boom"));
    }
    if (this.malformedInit) {
      // What a buggy/foreign child can produce: a syntactically valid $init
      // line whose params lack the schema entirely.
      return Promise.resolve({
        jsonrpc: "2.0",
        method: "$init",
        params: { pipe: "/tmp/fake.sock" },
      } as InitMessage);
    }
    return Promise.resolve({
      jsonrpc: "2.0",
      method: "$init",
      params: {
        pipe: "/tmp/fake.sock",
        schema: { methods: { foo: { id: 1, response: "result" } }, events: {} },
        version: "1.0.0",
      },
    });
  }

  protected _connectDataChannel(module: TestModule): Promise<void> {
    module._attachDataChannel(new FakeTransport());
    return Promise.resolve();
  }

  protected _writeControlMessage(module: TestModule, message: string): boolean {
    if (!module.process?.alive) return false;
    this.controlMessages.push({ name: module.name, message });
    return true;
  }

  protected _killProcess(module: TestModule): void {
    const proc = module.process;
    if (proc && proc.alive) {
      this.killed.push(proc.id);
    }
  }

  protected _waitForExitOrKill(): Promise<void> {
    return Promise.resolve();
  }

  protected _disposeControlReader(): void {}
}

function makeModule(name: string, policy: SpawnPolicy = {}): TestModule {
  const mod = new TestModule(name).executable("node", ["w.js"]);
  mod.method("foo");
  mod.spawnPolicy({ maxRetries: 0, ...policy });
  return mod;
}

describe("ManagerCore: spawn flow", () => {
  it("drives a module to ready and emits module:ready", async () => {
    const manager = new FakeManager();
    const mod = makeModule("worker");
    manager.register(mod);

    const ready = vi.fn();
    manager.on(ManagerEvents.READY, ready);

    await manager.spawn("worker");

    expect(mod.state).toBe("ready");
    expect(ready).toHaveBeenCalledWith("worker");
  });

  it("rejects duplicate registration", () => {
    const manager = new FakeManager();
    manager.register(makeModule("worker"));
    expect(() => manager.register(makeModule("worker"))).toThrow("already registered");
  });

  it("retries with backoff and throws SpawnError when retries are exhausted", async () => {
    vi.useFakeTimers();
    try {
      const manager = new FakeManager();
      manager.failInits = 3; // more failures than retries
      const mod = makeModule("worker", {
        maxRetries: 2,
        retryDelay: { type: "fixed", delay: 100 },
      });
      manager.register(mod);

      const retrying = vi.fn();
      const failed = vi.fn();
      manager.on(ManagerEvents.RETRYING, retrying);
      manager.on(ManagerEvents.SPAWN_FAILED, failed);

      const outcome = manager.spawn("worker").then(
        () => null,
        (err: unknown) => err,
      );
      await vi.advanceTimersByTimeAsync(1000);
      const err = await outcome;

      expect(err).toBeInstanceOf(SpawnError);
      expect((err as SpawnError).attempts).toBe(3);
      expect(retrying).toHaveBeenCalledTimes(2);
      expect(failed).toHaveBeenCalledTimes(3);
      expect(mod.state).toBe("closed");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("ManagerCore: schema validation", () => {
  it("D4: handshake fails when the child's declared response type disagrees with the parent's", async () => {
    const manager = new FakeManager();
    // FakeManager's $init declares foo as "result"; the parent declares
    // "stream". Today the mismatch surfaces only later, as a confusing
    // send()/stream() error - it must fail the handshake instead.
    const mod = new TestModule("worker").executable("node", ["w.js"]);
    mod.method("foo", { response: "stream" });
    mod.spawnPolicy({ maxRetries: 0 });
    manager.register(mod);

    await expect(manager.spawn("worker")).rejects.toThrow(/response type/);
  });
});

describe("ManagerCore: crash & restart", () => {
  it("restarts a crashed ready module after the restart delay", async () => {
    vi.useFakeTimers();
    try {
      const manager = new FakeManager();
      const mod = makeModule("worker", { restartOnCrash: true });
      manager.register(mod);
      manager.on(ManagerEvents.ERROR, () => {});

      await manager.spawn("worker");
      const restarting = vi.fn();
      manager.on(ManagerEvents.RESTARTING, restarting);

      // Crash the live process.
      manager.exitHandlers.get(mod.process!.id)!(1, null);
      expect(mod.state).toBe("disconnected");
      expect(restarting).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1500);
      expect(mod.state).toBe("ready");
    } finally {
      vi.useRealTimers();
    }
  });

  it("W4: one module's shutdown must not swallow another module's crash", async () => {
    vi.useFakeTimers();
    try {
      const manager = new FakeManager();
      const a = makeModule("a", { restartOnCrash: true });
      const b = makeModule("b", { restartOnCrash: true });
      manager.register(a);
      manager.register(b);
      manager.on(ManagerEvents.ERROR, () => {});

      await manager.spawn();

      // Stall a's shutdown so b crashes WHILE a is shutting down.
      let releaseExit: (() => void) | null = null;
      const waitSpy = vi
        .spyOn(
          manager as unknown as { _waitForExitOrKill: () => Promise<void> },
          "_waitForExitOrKill",
        )
        .mockImplementation(
          () =>
            new Promise<void>((resolve) => {
              releaseExit = resolve;
            }),
        );

      const restarting = vi.fn();
      manager.on(ManagerEvents.RESTARTING, restarting);

      const shutdownA = manager.shutdown("a");
      manager.exitHandlers.get(b.process!.id)!(1, null);

      // b's crash was NOT swallowed: the restart path engaged.
      expect(restarting).toHaveBeenCalledWith("b", expect.anything());

      releaseExit!();
      waitSpy.mockRestore();
      await shutdownA;
      expect(a.state).toBe("closed");

      await vi.advanceTimersByTimeAsync(1500);
      expect(b.state).toBe("ready");
    } finally {
      vi.useRealTimers();
    }
  });

  it("D1: a late exit from a previous (replaced) process must not detach the respawned module", async () => {
    vi.useFakeTimers();
    try {
      const manager = new FakeManager();
      const mod = makeModule("worker", { restartOnCrash: true });
      manager.register(mod);
      const errors: Error[] = [];
      manager.on(ManagerEvents.ERROR, (_name: string, err: Error) => errors.push(err));

      await manager.spawn("worker");
      const firstExit = manager.exitHandlers.get(mod.process!.id)!;

      // Generation 1 crashes; the restart respawns generation 2.
      firstExit(1, null);
      await vi.advanceTimersByTimeAsync(1500);
      expect(mod.state).toBe("ready");
      expect(mod.process!.id).toBe(2);

      // A late/duplicate exit event from the old generation arrives (e.g. a
      // killed predecessor's exit delivered after the respawn). It must be
      // ignored: not detach the fresh module, not emit errors, not restart.
      const errorsBefore = errors.length;
      firstExit(1, null);

      expect(mod.state).toBe("ready");
      expect(mod.process!.id).toBe(2);
      expect(errors.length).toBe(errorsBefore);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a pending crash-restart when the module is shut down", async () => {
    vi.useFakeTimers();
    try {
      const manager = new FakeManager();
      const mod = makeModule("worker", { restartOnCrash: true });
      manager.register(mod);
      manager.on(ManagerEvents.ERROR, () => {});

      await manager.spawn("worker");
      const firstProcId = mod.process!.id;
      manager.exitHandlers.get(firstProcId)!(1, null);

      // Shut down while the restart timer is pending.
      await manager.shutdown("worker");
      await vi.advanceTimersByTimeAsync(5000);

      expect(mod.state).toBe("closed");
      // No re-spawn happened after the shutdown.
      expect(manager.nextProcId).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("ManagerCore: config & handshake validation (D9)", () => {
  it("D9: rejects a heartbeat config with non-positive intervalMs at spawn", async () => {
    const manager = new FakeManager();
    // intervalMs: 0 means setInterval(.., 0) -> ~1ms ping spam.
    const mod = makeModule("worker", { heartbeat: { intervalMs: 0, timeoutMs: 1000 } });
    manager.register(mod);

    await expect(manager.spawn("worker")).rejects.toThrow(/heartbeat/);
    expect(manager.nextProcId).toBe(1); // failed fast: nothing was spawned
  });

  it("D9: rejects a heartbeat config with non-positive timeoutMs at spawn", async () => {
    const manager = new FakeManager();
    const mod = makeModule("worker", { heartbeat: { intervalMs: 1000, timeoutMs: -1 } });
    manager.register(mod);

    await expect(manager.spawn("worker")).rejects.toThrow(/heartbeat/);
  });

  it("D9: a malformed $init (missing schema) fails the spawn descriptively, not with a TypeError", async () => {
    const manager = new FakeManager();
    manager.malformedInit = true;
    const mod = makeModule("worker");
    manager.register(mod);

    const err = await manager.spawn("worker").then(
      () => null,
      (e: Error) => e,
    );

    expect(err).toBeInstanceOf(SpawnError);
    expect(err!.message).toContain("invalid $init");
    expect(err!.message).not.toContain("Cannot read properties");
  });
});

describe("ManagerCore: data-channel loss (D3)", () => {
  it("D3: data-channel loss while the process lives kills the child and the restart path runs", async () => {
    vi.useFakeTimers();
    try {
      const manager = new FakeManager();
      const mod = makeModule("worker", { restartOnCrash: true });
      manager.register(mod);
      const errors: Error[] = [];
      manager.on(ManagerEvents.ERROR, (_name: string, err: Error) => errors.push(err));

      await manager.spawn("worker");
      const proc = mod.process!;

      // The socket drops while the process is still alive. Today this leaves
      // the module wedged: nothing rejected, nothing killed, no restart.
      mod._handleTransportClose();

      expect(errors.some((e) => /data channel/i.test(e.message))).toBe(true);
      expect(manager.killed).toContain(proc.id);

      // The kill drives the normal exit -> crash -> restart path.
      manager.exitHandlers.get(proc.id)!(null, "SIGKILL");
      await vi.advanceTimersByTimeAsync(1500);
      expect(mod.state).toBe("ready");
      expect(mod.process!.id).not.toBe(proc.id);
    } finally {
      vi.useRealTimers();
    }
  });

  it("D3: a data-channel close during that module's own shutdown is not treated as a loss", async () => {
    const manager = new FakeManager();
    const mod = makeModule("worker", { restartOnCrash: true });
    manager.register(mod);
    const errors: Error[] = [];
    manager.on(ManagerEvents.ERROR, (_name: string, err: Error) => errors.push(err));

    await manager.spawn("worker");
    const proc = mod.process!;

    // Stall the shutdown after it sent $shutdown, then let the socket close
    // arrive in that window (the child tears its server down on $shutdown).
    let releaseExit: (() => void) | null = null;
    const waitSpy = vi
      .spyOn(
        manager as unknown as { _waitForExitOrKill: () => Promise<void> },
        "_waitForExitOrKill",
      )
      .mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            releaseExit = resolve;
          }),
      );

    const shutdownDone = manager.shutdown("worker");
    mod._handleTransportClose();

    expect(errors).toEqual([]);
    expect(manager.killed).not.toContain(proc.id);

    releaseExit!();
    waitSpy.mockRestore();
    await shutdownDone;
    expect(mod.state).toBe("closed");
  });
});

describe("ManagerCore: double-spawn guard", () => {
  it("D2: spawning an already-ready module rejects instead of orphaning the first child", async () => {
    const manager = new FakeManager();
    const mod = makeModule("worker");
    manager.register(mod);

    await manager.spawn("worker");
    const firstProcId = mod.process!.id;

    await expect(manager.spawn("worker")).rejects.toThrow(/cannot be spawned/);

    // The live child was untouched and no second process was ever created.
    expect(mod.state).toBe("ready");
    expect(mod.process!.id).toBe(firstProcId);
    expect(manager.nextProcId).toBe(2);
  });

  it("D2: an explicit spawn during the crash-restart delay cancels the pending restart", async () => {
    vi.useFakeTimers();
    try {
      const manager = new FakeManager();
      const mod = makeModule("worker", { restartOnCrash: true });
      manager.register(mod);
      manager.on(ManagerEvents.ERROR, () => {});

      await manager.spawn("worker");
      manager.exitHandlers.get(mod.process!.id)!(1, null); // crash -> restart pending
      expect(mod.state).toBe("disconnected");

      // The user respawns explicitly while the restart timer is pending.
      await manager.spawn("worker");
      expect(mod.state).toBe("ready");
      const procId = mod.process!.id;

      // The stale restart timer must not fire a third spawn later.
      await vi.advanceTimersByTimeAsync(5000);
      expect(mod.process!.id).toBe(procId);
      expect(manager.nextProcId).toBe(3); // exactly two processes ever spawned
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("ManagerCore: heartbeat", () => {
  it("pings, accepts pongs, and kills the child when a ping times out", async () => {
    vi.useFakeTimers();
    try {
      const manager = new FakeManager();
      const mod = makeModule("worker", { heartbeat: { intervalMs: 1000, timeoutMs: 3000 } });
      manager.register(mod);
      const errors: Error[] = [];
      manager.on(ManagerEvents.ERROR, (_name: string, err: Error) => errors.push(err));

      await manager.spawn("worker");

      // First ping goes out immediately.
      const pings = () => manager.controlMessages.filter((m) => m.message.includes("$ping")).length;
      expect(pings()).toBe(1);

      // Answered pings keep the loop alive: a new ping per interval, no kill.
      const api = manager as unknown as { handlePong(name: string): void };
      api.handlePong("worker");
      await vi.advanceTimersByTimeAsync(1000);
      expect(pings()).toBe(2);
      expect(manager.killed).toHaveLength(0);

      // Now stop answering: the deadline runs from the outstanding ping.
      await vi.advanceTimersByTimeAsync(3000);
      expect(manager.killed).toHaveLength(1);
      expect(errors.some((e) => e.message.includes("heartbeat"))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends $shutdown over the control plane during shutdown", async () => {
    const manager = new FakeManager();
    const mod = makeModule("worker");
    manager.register(mod);

    await manager.spawn("worker");
    const closed = vi.fn();
    manager.on(ManagerEvents.CLOSED, closed);

    await manager.shutdown("worker");

    expect(
      manager.controlMessages.some((m) => m.name === "worker" && m.message.includes("$shutdown")),
    ).toBe(true);
    expect(closed).toHaveBeenCalledWith("worker");
    expect(mod.state).toBe("closed");
  });
});
