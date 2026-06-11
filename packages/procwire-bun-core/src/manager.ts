/**
 * ModuleManager - Bun runtime adapter over the shared ModuleManagerCore.
 *
 * ALL lifecycle policies (spawn retry/backoff, crash-restart window,
 * per-module shutdown guard, heartbeat state machine) live ONCE in
 * @procwire/runtime-core. This class owns only what is Bun-specific:
 * Bun.spawn + onExit wiring, the WHATWG-stream control-plane readers,
 * FileSink stdin writes, Bun.connect for the data plane and kill/exit-wait
 * mechanics.
 *
 * @module
 */

import type { SpawnPolicy, InitMessage } from "@procwire/runtime-core";
import { ManagerErrors, ModuleManagerCore } from "@procwire/runtime-core";
import type { Module } from "./module.js";

export { SpawnError } from "@procwire/runtime-core";

// ═══════════════════════════════════════════════════════════════════════════
// BUN TYPES
// ═══════════════════════════════════════════════════════════════════════════

// Bun.spawn() subprocess type
type BunSubprocess = ReturnType<typeof Bun.spawn>;

// Bun socket type from Bun.connect()
type BunSocket = Awaited<ReturnType<typeof Bun.connect>>;

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** Delay for detecting immediate spawn errors (ms) */
const SPAWN_ERROR_DETECTION_DELAY_MS = 100;

/** Timeout for connecting to the child's data-plane pipe before giving up (ms) */
const DATA_CHANNEL_CONNECT_TIMEOUT_MS = 10000;

/**
 * ModuleManager - Orchestrates lifecycle of worker modules.
 *
 * This is the Bun.js version; the API is identical to @procwire/core.
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
export class ModuleManager extends ModuleManagerCore<BunSubprocess, Module> {
  private readonly stdoutAbortControllers = new Map<string, AbortController>();
  private readonly heartbeatReaders = new Map<string, AbortController>();
  // Exit promise per spawned process, used by _waitForSpawnResult to detect
  // an immediate death (Bun delivers exits via the onExit option fixed at
  // spawn time, not via an attachable event).
  private readonly exitPromises = new WeakMap<
    object,
    Promise<{ code: number | null; signal: string | null }>
  >();

  // ═══════════════════════════════════════════════════════════════════════════
  // RUNTIME HOOKS: process control
  // ═══════════════════════════════════════════════════════════════════════════

  protected _spawnProcess(module: Module): BunSubprocess {
    const exe = module.executableConfig!;

    let exitResolve: ((result: { code: number | null; signal: string | null }) => void) | null =
      null;
    const exitPromise = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
      exitResolve = resolve;
    });

    const childProcess = Bun.spawn([exe.command, ...exe.args], {
      cwd: exe.cwd ?? process.cwd(),
      env: {
        ...process.env,
        ...exe.env,
        PROCWIRE_MODULE_NAME: module.name,
      },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "inherit",
      // Exit wiring is fixed at spawn time in Bun (no attachable event);
      // _watchProcessExit below is therefore a no-op.
      onExit: (_proc, exitCode, signalCode, _error) => {
        const signal = signalCode !== null ? String(signalCode) : null;
        exitResolve?.({ code: exitCode, signal });
        this.handleProcessExit(module, exitCode, signal);
      },
    });

    this.exitPromises.set(childProcess, exitPromise);
    return childProcess;
  }

  /**
   * Wait briefly to catch immediate spawn errors.
   */
  protected _waitForSpawnResult(_module: Module, proc: BunSubprocess): Promise<Error | null> {
    const exitPromise = this.exitPromises.get(proc);

    return new Promise((resolve) => {
      let resolved = false;

      // No PID - spawn failed immediately
      if (!proc.pid) {
        resolved = true;
        resolve(new Error("Failed to spawn process (no PID)"));
        return;
      }

      // Race between timeout and exit
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(null); // Process started OK
        }
      }, SPAWN_ERROR_DETECTION_DELAY_MS);

      // Check if process exited immediately (error case)
      exitPromise?.then(({ code, signal }) => {
        if (!resolved && code !== 0) {
          resolved = true;
          clearTimeout(timer);
          resolve(new Error(`Process exited immediately (code: ${code}, signal: ${signal})`));
        }
      });
    });
  }

  protected _watchProcessExit(_module: Module, _proc: BunSubprocess): void {
    // Exit routing is wired at spawn time via Bun.spawn's onExit option.
  }

  protected _killProcess(module: Module): void {
    const proc = module.process;
    if (proc && proc.exitCode === null) {
      proc.kill();
    }
  }

  protected _waitForExitOrKill(
    _module: Module,
    proc: BunSubprocess,
    timeoutMs: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        proc.kill();
        resolve();
      }, timeoutMs);

      // Check if process is already dead
      if (proc.exitCode !== null) {
        clearTimeout(timer);
        resolve();
        return;
      }

      // Poll for exit (Bun doesn't have process.on('exit') equivalent)
      const checkExit = setInterval(() => {
        if (proc.exitCode !== null) {
          clearInterval(checkExit);
          clearTimeout(timer);
          resolve();
        }
      }, 100);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RUNTIME HOOKS: control plane (stdio)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Wait for $init message from child.
   * Uses Bun's ReadableStream API for stdout.
   */
  protected _waitForInit(
    module: Module,
    proc: BunSubprocess,
    timeout: number,
  ): Promise<InitMessage> {
    return new Promise((resolve, reject) => {
      let resolved = false;
      let buffer = "";

      // Create abort controller for cleanup
      const abortController = new AbortController();
      this.stdoutAbortControllers.set(module.name, abortController);

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          abortController.abort();
          proc.kill();
          reject(ManagerErrors.initTimeout(module.name, timeout));
        }
      }, timeout);

      // Read stdout using Bun's stream API
      // proc.stdout is guaranteed to be ReadableStream when we use stdout: "pipe"
      const stdout = proc.stdout as ReadableStream<Uint8Array>;
      const reader = stdout.getReader();

      const readLoop = async () => {
        try {
          while (!resolved) {
            const { value, done } = await reader.read();

            if (done) {
              if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                reject(ManagerErrors.processCrashed(module.name, null, null));
              }
              break;
            }

            // Convert Uint8Array to string
            const chunk = new TextDecoder().decode(value);
            buffer += chunk;

            // Process complete lines
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

            for (const line of lines) {
              // OPT-03: Fast path - skip non-JSON lines without try/catch overhead
              if (!line.startsWith("{")) {
                continue;
              }

              try {
                const msg = JSON.parse(line) as { method?: string; params?: { message?: string } };

                if (msg.method === "$init") {
                  if (!resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    // Release reader but don't close - we might need it for control plane
                    reader.releaseLock();
                    resolve(msg as unknown as InitMessage);
                    return;
                  }
                }

                if (msg.method === "$error") {
                  if (!resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    reader.releaseLock();
                    reject(
                      ManagerErrors.moduleError(module.name, msg.params?.message || "Unknown"),
                    );
                    return;
                  }
                }
              } catch {
                // Ignore non-JSON lines
              }
            }
          }
        } catch (error) {
          if (!resolved && !abortController.signal.aborted) {
            resolved = true;
            clearTimeout(timer);
            reject(error);
          }
        }
      };

      // Start reading
      readLoop();
    });
  }

  /**
   * Write one newline-terminated control message to the child's stdin
   * (FileSink when spawned with stdin: "pipe").
   */
  protected _writeControlMessage(module: Module, message: string): boolean {
    const stdin = module.process?.stdin as
      | { write: (data: string) => number; flush?: () => void }
      | undefined;
    if (!stdin) return false;
    try {
      stdin.write(`${message}\n`);
      stdin.flush?.();
      return true;
    } catch {
      // Process might already be dead; the exit path surfaces the death.
      return false;
    }
  }

  protected _disposeControlReader(name: string): void {
    const abortController = this.stdoutAbortControllers.get(name);
    if (abortController) {
      abortController.abort();
      this.stdoutAbortControllers.delete(name);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RUNTIME HOOKS: heartbeat $pong reader
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Bun releases the stdout reader after the handshake, so the heartbeat
   * needs its own $pong reader (Node keeps the readline interface open and
   * routes $pong from there).
   */
  protected override _onHeartbeatStart(module: Module): void {
    this.startPongReader(module);
  }

  protected override _onHeartbeatStop(name: string): void {
    const reader = this.heartbeatReaders.get(name);
    if (reader) {
      reader.abort();
      this.heartbeatReaders.delete(name);
    }
  }

  /**
   * Read the child's stdout (released by the handshake) for `$pong` replies.
   */
  private startPongReader(module: Module): void {
    const stdout = module.process?.stdout as ReadableStream<Uint8Array> | undefined;
    if (!stdout) return;

    let reader: ReturnType<ReadableStream<Uint8Array>["getReader"]>;
    try {
      reader = stdout.getReader();
    } catch {
      return; // lock unavailable (e.g. handshake still holds it)
    }

    const controller = new AbortController();
    this.heartbeatReaders.set(module.name, controller);

    const decoder = new TextDecoder();
    let buffer = "";
    const loop = async (): Promise<void> => {
      try {
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value);
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("{")) continue;
            try {
              const msg = JSON.parse(line) as { method?: string };
              if (msg.method === "$pong") this.handlePong(module.name);
            } catch {
              // Ignore non-JSON / malformed control lines.
            }
          }
        }
      } catch {
        // Reader cancelled or stream closed.
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // already released
        }
      }
    };
    void loop();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RUNTIME HOOKS: data plane
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Connect to the data channel using Bun.connect().
   * Creates socket handlers that delegate to Module methods.
   */
  protected _connectDataChannel(
    module: Module,
    pipePath: string,
    _policy: Required<SpawnPolicy>,
  ): Promise<void> {
    const timeoutMs = DATA_CHANNEL_CONNECT_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
      // Without a timeout, a child that advertises a pipe it never accepts on
      // would hang the spawn forever (and leak the child). Bound the wait and
      // guard against settling twice.
      let settled = false;
      let connected: BunSocket | null = null;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        connected?.end();
        reject(
          ManagerErrors.dataChannelFailed(
            `connection to "${pipePath}" timed out after ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);

      try {
        // Bun.connect with socket handlers that delegate to Module. The
        // socket argument is passed through so the Module can ignore late
        // events from a previous (replaced) connection - Bun handlers are
        // fixed at connect time and outlive restarts (Bug W8).
        const connectPromise = Bun.connect({
          unix: pipePath,
          socket: {
            open(socket: BunSocket) {
              connected = socket;
              if (settled) {
                socket.end();
                return;
              }
              settled = true;
              clearTimeout(timer);
              module._attachDataChannel(socket);
              resolve();
            },
            data(socket: BunSocket, data: Buffer) {
              // Delegate to Module for frame parsing
              module._onSocketData(socket, data);
            },
            error(socket: BunSocket, error: Error) {
              // Before the connection settles, reject the connect promise;
              // afterwards delegate to the Module (identity-checked there).
              if (!settled) {
                settled = true;
                clearTimeout(timer);
                reject(ManagerErrors.dataChannelFailed(error.message));
                return;
              }
              module._onSocketError(socket, error);
            },
            close(socket: BunSocket) {
              module._onSocketClose(socket);
            },
            drain(socket: BunSocket) {
              // Notify Module that backpressure is relieved
              module._onSocketDrain(socket);
            },
            // Without connectError, Bun puts a failed connect on the
            // unhandled rejection queue (process-fatal by default) instead
            // of letting us reject cleanly (Bug W5).
            connectError(_socket: BunSocket, error: Error) {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              reject(ManagerErrors.dataChannelFailed(error.message));
            },
          },
        });
        // Belt and braces: with connectError set the returned promise should
        // not reject unhandled, but keep it observed regardless.
        void Promise.resolve(connectPromise).catch(() => {});
      } catch (error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(
          ManagerErrors.dataChannelFailed(error instanceof Error ? error.message : String(error)),
        );
      }
    });
  }
}
