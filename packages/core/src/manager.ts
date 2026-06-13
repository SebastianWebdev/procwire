/**
 * ModuleManager - Node.js runtime adapter over the shared ModuleManagerCore.
 *
 * ALL lifecycle policies (spawn retry/backoff, crash-restart window,
 * per-module shutdown guard, heartbeat state machine) live ONCE in
 * @procwire/runtime-core. This class owns only what is Node-specific:
 * child_process.spawn + exit events, the readline control-plane reader,
 * stdin EPIPE guarding, net.createConnection for the data plane and
 * SIGKILL/exit-wait mechanics.
 *
 * @module
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createConnection } from "node:net";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import type { SpawnPolicy, InitMessage } from "@procwire/runtime-core";
import { ManagerErrors, ModuleManagerCore } from "@procwire/runtime-core";
import type { Module } from "./module.js";

export { SpawnError } from "@procwire/runtime-core";

/** Delay for detecting immediate spawn errors (ms) */
const SPAWN_ERROR_DETECTION_DELAY_MS = 100;

/** Timeout for connecting to the child's data-plane pipe before giving up (ms) */
const DATA_CHANNEL_CONNECT_TIMEOUT_MS = 10000;

/**
 * ModuleManager - Orchestrates lifecycle of worker modules.
 *
 * @example
 * ```typescript
 * const manager = new ModuleManager();
 *
 * const worker = new Module('worker')
 *   .executable('python', ['worker.py'])
 *   .method('process')
 *   .spawnPolicy({ restartOnCrash: true });
 *
 * manager.register(worker);
 *
 * manager.on('module:ready', (name) => console.log(`${name} ready`));
 * manager.on('module:error', (name, err) => console.error(`${name} error:`, err));
 *
 * await manager.spawn(); // Spawns all modules
 *
 * // Use modules...
 * const result = await worker.send('process', data);
 *
 * // Cleanup
 * await manager.shutdown();
 * ```
 */
export class ModuleManager extends ModuleManagerCore<ChildProcess, Module> {
  private readonly stdoutReaders = new Map<string, ReadlineInterface>();

  // ═══════════════════════════════════════════════════════════════════════════
  // RUNTIME HOOKS: process control
  // ═══════════════════════════════════════════════════════════════════════════

  protected _spawnProcess(module: Module): ChildProcess {
    const exe = module.executableConfig!;

    // Build the child env, then make PROCWIRE_TOKEN reflect THIS spawn's auth
    // decision exactly: set it when auth is on, and delete any inherited/ambient
    // value when off. Otherwise a stray PROCWIRE_TOKEN in the parent env (nested
    // worker, CI) would leak through `...process.env` and make an auth-off child
    // demand an AUTH frame the parent never sends.
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...exe.env,
      PROCWIRE_MODULE_NAME: module.name,
    };
    if (module.authToken !== null) {
      env.PROCWIRE_TOKEN = module.authToken;
    } else {
      delete env.PROCWIRE_TOKEN;
    }

    const childProcess = spawn(exe.command, exe.args, {
      stdio: ["pipe", "pipe", "inherit"],
      cwd: exe.cwd,
      env,
    });

    // The child's stdin can emit "error" (EPIPE) when the child dies between
    // a writability check and the kernel flush - with no listener, that is an
    // uncaughtException in the parent.
    this.guardStdin(childProcess);

    return childProcess;
  }

  /**
   * Wait briefly to catch immediate spawn errors.
   */
  protected _waitForSpawnResult(_module: Module, proc: ChildProcess): Promise<Error | null> {
    return new Promise((resolve) => {
      let resolved = false;

      const errorHandler = (err: Error) => {
        if (!resolved) {
          resolved = true;
          resolve(err);
        }
      };

      proc.on("error", errorHandler);

      // Small delay to catch synchronous spawn errors
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          proc.off("error", errorHandler);
          resolve(null);
        }
      }, SPAWN_ERROR_DETECTION_DELAY_MS);
    });
  }

  protected _watchProcessExit(module: Module, proc: ChildProcess): void {
    proc.on("exit", (code, signal) => {
      this.handleProcessExit(module, proc, code, signal);
    });
  }

  protected _killProcess(module: Module): void {
    const proc = module.process;
    if (proc && !proc.killed) {
      proc.kill("SIGKILL");
    }
  }

  protected _waitForExitOrKill(
    module: Module,
    proc: ChildProcess,
    timeoutMs: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
        resolve();
      }, timeoutMs);

      proc.on("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RUNTIME HOOKS: control plane (stdio)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Wait for $init message from child.
   */
  protected _waitForInit(
    module: Module,
    proc: ChildProcess,
    timeout: number,
  ): Promise<InitMessage> {
    return new Promise((resolve, reject) => {
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          rl.close();
          proc.kill("SIGKILL");
          reject(ManagerErrors.initTimeout(module.name, timeout));
        }
      }, timeout);

      // Listen for crash during init
      const exitHandler = (code: number | null, signal: string | null) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          rl.close();
          reject(ManagerErrors.processCrashed(module.name, code, signal));
        }
      };
      proc.on("exit", exitHandler);

      const rl = createInterface({
        input: proc.stdout!,
        crlfDelay: Infinity,
      });

      this.stdoutReaders.set(module.name, rl);

      rl.on("line", (line) => {
        // OPT-03: Fast path - skip non-JSON lines without try/catch overhead
        if (!line.startsWith("{")) {
          return;
        }

        try {
          const msg = JSON.parse(line) as { method?: string; params?: { message?: string } };

          if (msg.method === "$init") {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              proc.off("exit", exitHandler);
              // Don't close rl - we might need it for control plane
              resolve(msg as InitMessage);
            }
          }

          if (msg.method === "$error") {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              proc.off("exit", exitHandler);
              rl.close();
              reject(ManagerErrors.moduleError(module.name, msg.params?.message || "Unknown"));
            }
          }

          // Heartbeat reply from the child (arrives after $init). The reader is
          // kept open for the control plane, so handle it here.
          if (msg.method === "$pong") {
            this.handlePong(module.name);
          }
        } catch {
          // Ignore non-JSON lines
        }
      });

      rl.on("error", (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          proc.off("exit", exitHandler);
          reject(err);
        }
      });
    });
  }

  /**
   * Write one newline-terminated control message to the child's stdin.
   * A dying child can EPIPE here - reported as "not sent"; the exit handler
   * (crash path) surfaces the death, not the failed write.
   */
  protected _writeControlMessage(module: Module, message: string): boolean {
    const proc = module.process;
    if (proc?.stdin?.writable) {
      this.guardStdin(proc);
      try {
        proc.stdin.write(`${message}\n`);
        return true;
      } catch {
        // Synchronous EPIPE: the child is dying; the exit handler takes over.
        return false;
      }
    }
    return false;
  }

  protected _disposeControlReader(name: string): void {
    const reader = this.stdoutReaders.get(name);
    if (reader) {
      reader.close();
      this.stdoutReaders.delete(name);
    }
  }

  /**
   * Ensure the child's stdin cannot crash the parent with an unhandled
   * "error" event (EPIPE from a dying child). Idempotent.
   */
  private guardStdin(proc: { stdin?: NodeJS.WritableStream | null } | null | undefined): void {
    const stdin = proc?.stdin;
    if (stdin && stdin.listenerCount("error") === 0) {
      stdin.on("error", () => {
        // Swallowed on purpose: a dead control channel is surfaced by the
        // process "exit" handler (crash path), not by the failed write.
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RUNTIME HOOKS: data plane
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Connect to the child's data channel and attach it to the module.
   */
  protected _connectDataChannel(
    module: Module,
    pipePath: string,
    policy: Required<SpawnPolicy>,
  ): Promise<void> {
    const socketBufferSize = policy.socketBufferSize;
    const timeoutMs = DATA_CHANNEL_CONNECT_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
      const socket = createConnection(pipePath);

      // Without a timeout, a child that advertises a pipe it never accepts on
      // would hang the spawn forever (and leak the child). Bound the wait.
      const timer = setTimeout(() => {
        socket.destroy();
        reject(
          ManagerErrors.dataChannelFailed(
            `connection to "${pipePath}" timed out after ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);

      socket.on("connect", () => {
        clearTimeout(timer);
        // OPT-01: Disable Nagle's algorithm for lower latency
        // Sends data immediately instead of buffering small packets
        socket.setNoDelay(true);

        // OPT-05: Configure socket buffer sizes if specified
        // Note: These methods exist on net.Socket but TypeScript types may not include them
        if (socketBufferSize !== undefined) {
          try {
            const anySocket = socket as {
              setRecvBufferSize?: (size: number) => void;
              setSendBufferSize?: (size: number) => void;
            };
            anySocket.setRecvBufferSize?.(socketBufferSize);
            anySocket.setSendBufferSize?.(socketBufferSize);
          } catch {
            // Ignore if OS doesn't support buffer size configuration
          }
        }

        module._attachDataChannel(socket);
        resolve();
      });
      socket.on("error", (err) => {
        clearTimeout(timer);
        reject(ManagerErrors.dataChannelFailed(err.message));
      });
    });
  }
}
