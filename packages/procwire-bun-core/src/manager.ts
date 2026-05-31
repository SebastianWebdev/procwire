/**
 * ModuleManager - Orchestrates lifecycle of worker modules.
 *
 * This is the Bun.js optimized version using Bun.spawn().
 *
 * RESPONSIBILITIES:
 * - Register and store modules
 * - Spawn child processes
 * - Handle spawn retry on failure
 * - Handle restart on crash
 * - Graceful shutdown
 *
 * NOT RESPONSIBLE FOR:
 * - Communication (Module does this)
 * - Request tracking (Module does this)
 *
 * @module
 */

import { EventEmitter } from "node:events";
import type { Module } from "./module.js";
import type {
  SpawnPolicy,
  ModuleSchema,
  InitMessage,
  RetryDelayConfig,
  HeartbeatConfig,
} from "./types.js";
import { ManagerErrors } from "./errors.js";
import { ManagerEvents } from "./events.js";

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

/**
 * Default spawn policy values.
 */
const DEFAULT_SPAWN_POLICY: Required<SpawnPolicy> = {
  initTimeout: 30_000,
  maxRetries: 3,
  retryDelay: { type: "exponential", base: 1000, max: 30_000 },
  restartOnCrash: false,
  restartLimit: { maxRestarts: 5, windowMs: 60_000 },
  socketBufferSize: undefined as unknown as number, // undefined = use OS default
  heartbeat: null, // disabled by default
};

/** Delay for detecting immediate spawn errors (ms) */
const SPAWN_ERROR_DETECTION_DELAY_MS = 100;

/** Delay before attempting to restart a crashed module (ms) */
const RESTART_WAIT_DELAY_MS = 1000;

/** Timeout for graceful shutdown before force kill (ms) */
const FORCE_KILL_TIMEOUT_MS = 5000;

/** Timeout for connecting to the child's data-plane pipe before giving up (ms) */
const DATA_CHANNEL_CONNECT_TIMEOUT_MS = 10000;

// ═══════════════════════════════════════════════════════════════════════════
// SPAWN ERROR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Spawn error with details.
 */
export class SpawnError extends Error {
  constructor(
    message: string,
    public readonly moduleName: string,
    public readonly attempts: number,
    public readonly lastError?: Error | undefined,
  ) {
    super(message);
    this.name = "SpawnError";
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MODULE MANAGER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ModuleManager - Orchestrates lifecycle of worker modules.
 *
 * This is the Bun.js optimized version.
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
export class ModuleManager extends EventEmitter {
  private readonly modules = new Map<string, Module>();
  private readonly restartTimestamps = new Map<string, number[]>();
  private readonly stdoutAbortControllers = new Map<string, AbortController>();
  // Pending crash-restart timers, kept so they can be cancelled on shutdown to
  // avoid resurrecting a module mid-/post-shutdown (the restart delay outlives
  // the isShuttingDown window, which is reset when shutdown() returns).
  private readonly restartTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // Control-plane heartbeat state (only populated when a module enables it).
  private readonly heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>();
  // Timestamp of an outstanding (unanswered) $ping per module; cleared on $pong.
  // Lets us measure the timeout from an actual ping rather than from startup.
  private readonly heartbeatPingAt = new Map<string, number>();
  private readonly heartbeatReaders = new Map<string, AbortController>();
  private isShuttingDown = false;

  /**
   * Register a module.
   *
   * @param module - Module to register
   * @throws {Error} if module with same name already registered
   */
  register(module: Module): this {
    if (this.modules.has(module.name)) {
      throw ManagerErrors.alreadyRegistered(module.name);
    }

    module._validate();
    this.modules.set(module.name, module);

    return this;
  }

  /**
   * Get a registered module.
   *
   * @param name - Module name
   * @returns Module or undefined
   */
  get(name: string): Module | undefined {
    return this.modules.get(name);
  }

  /**
   * Check if module is registered.
   */
  has(name: string): boolean {
    return this.modules.has(name);
  }

  /**
   * Get all registered module names.
   */
  get moduleNames(): string[] {
    return Array.from(this.modules.keys());
  }

  /**
   * Spawn module(s).
   *
   * @param name - Module name, or undefined to spawn all
   * @throws {SpawnError} if spawn fails after all retries
   */
  async spawn(name?: string): Promise<void> {
    if (name !== undefined) {
      await this.spawnModule(name);
    } else {
      // Spawn all in parallel
      await Promise.all(Array.from(this.modules.keys()).map((n) => this.spawnModule(n)));
    }
  }

  /**
   * Shutdown module(s).
   *
   * @param name - Module name, or undefined to shutdown all
   */
  async shutdown(name?: string): Promise<void> {
    this.isShuttingDown = true;

    if (name !== undefined) {
      await this.shutdownModule(name);
    } else {
      await Promise.all(Array.from(this.modules.keys()).map((n) => this.shutdownModule(n)));
    }

    this.isShuttingDown = false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: Spawn Logic
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Spawn a single module with retry logic.
   */
  private async spawnModule(name: string): Promise<void> {
    const module = this.modules.get(name);
    if (!module) {
      throw ManagerErrors.notRegistered(name);
    }

    const policy = this.resolveSpawnPolicy(module.spawnPolicyConfig);
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
      try {
        // Wait before retry (not on first attempt)
        if (attempt > 0) {
          const delay = this.calculateRetryDelay(attempt, policy.retryDelay);
          this.emit(ManagerEvents.RETRYING, name, attempt, delay, lastError);
          await this.sleep(delay);
        }

        await this.spawnModuleOnce(module, policy);
        return; // Success!
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Cleanup failed attempt
        this.cleanupModule(module);

        this.emit(
          ManagerEvents.SPAWN_FAILED,
          name,
          attempt,
          lastError,
          attempt < policy.maxRetries,
        );
      }
    }

    // All retries exhausted
    module._setState("closed");
    throw new SpawnError(
      `Failed to spawn module "${name}" after ${policy.maxRetries + 1} attempts: ${lastError?.message}`,
      name,
      policy.maxRetries + 1,
      lastError ?? undefined,
    );
  }

  /**
   * Single spawn attempt (no retry).
   */
  private async spawnModuleOnce(module: Module, policy: Required<SpawnPolicy>): Promise<void> {
    const exe = module.executableConfig!;

    // 1. Spawn process using Bun.spawn()
    module._setState("initializing");

    // Track exit for crash detection
    let exitHandled = false;
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
      onExit: (_proc, exitCode, signalCode, _error) => {
        if (!exitHandled) {
          exitHandled = true;
          const signal = signalCode !== null ? String(signalCode) : null;
          exitResolve?.({ code: exitCode, signal });
          // Handle crash/exit after init is complete
          this.handleProcessExit(module, exitCode, signal);
        }
      },
    });

    module._attachProcess(childProcess);

    // Check for immediate spawn errors
    const spawnError = await this.waitForSpawnResult(childProcess, exitPromise);
    if (spawnError) {
      throw spawnError;
    }

    // 2. Wait for $init from child
    const initMessage = await this.waitForInit(module, childProcess, policy.initTimeout);

    // 3. Validate schema
    this.validateSchema(module, initMessage.params.schema);
    module._attachSchema(initMessage.params.schema);

    // 4. Connect data channel
    module._setState("connecting");
    const socket = await this.connectDataChannel(module, initMessage.params.pipe);
    module._attachDataChannel(socket);

    // 5. Ready!
    module._setState("ready");
    this.emit(ManagerEvents.READY, module.name);

    // 6. Start liveness heartbeat if configured.
    if (policy.heartbeat) {
      this.startHeartbeat(module, policy.heartbeat);
    }
  }

  /**
   * Wait briefly to catch immediate spawn errors.
   */
  private waitForSpawnResult(
    proc: BunSubprocess,
    exitPromise: Promise<{ code: number | null; signal: string | null }>,
  ): Promise<Error | null> {
    return new Promise((resolve) => {
      let resolved = false;

      // Race between timeout and exit
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(null); // Process started OK
        }
      }, SPAWN_ERROR_DETECTION_DELAY_MS);

      // Check if process exited immediately (error case)
      exitPromise.then(({ code, signal }) => {
        if (!resolved && code !== 0) {
          resolved = true;
          clearTimeout(timer);
          resolve(new Error(`Process exited immediately (code: ${code}, signal: ${signal})`));
        }
      });

      // Also check if the process PID exists (started successfully)
      if (proc.pid) {
        // Process has a PID, it started
        // Continue waiting for timeout to catch quick exits
      } else {
        // No PID - spawn failed immediately
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(new Error("Failed to spawn process (no PID)"));
        }
      }
    });
  }

  /**
   * Wait for $init message from child.
   * Uses Bun's ReadableStream API for stdout.
   */
  private async waitForInit(
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
   * Validate child schema against module config.
   */
  private validateSchema(module: Module, childSchema: ModuleSchema): void {
    const expected = module._buildExpectedSchema();

    for (const methodName of expected.methods) {
      if (!childSchema.methods[methodName]) {
        throw ManagerErrors.schemaMissingMethod(module.name, methodName);
      }
    }

    for (const eventName of expected.events) {
      if (!childSchema.events[eventName]) {
        throw ManagerErrors.schemaMissingEvent(module.name, eventName);
      }
    }
  }

  /**
   * Connect to data channel using Bun.connect().
   * Creates socket handlers that delegate to Module methods.
   */
  private connectDataChannel(
    module: Module,
    pipePath: string,
    timeoutMs: number = DATA_CHANNEL_CONNECT_TIMEOUT_MS,
  ): Promise<BunSocket> {
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
        // Bun.connect with socket handlers that delegate to Module
        Bun.connect({
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
              resolve(socket);
            },
            data(_socket: BunSocket, data: Buffer) {
              // Delegate to Module for frame parsing
              module._onSocketData(data);
            },
            error(_socket: BunSocket, error: Error) {
              // During connection, reject the promise
              // After connection, delegate to Module
              module._onSocketError(error);
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              reject(ManagerErrors.dataChannelFailed(error.message));
            },
            close(_socket: BunSocket) {
              module._onSocketClose();
            },
            drain(_socket: BunSocket) {
              // Notify Module that backpressure is relieved
              module._onSocketDrain();
            },
          },
        });
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

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: Crash & Restart
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handle child process exit.
   */
  private handleProcessExit(module: Module, code: number | null, signal: string | null): void {
    // The process is gone: stop pinging it.
    this.stopHeartbeat(module.name);

    // Ignore if shutting down
    if (this.isShuttingDown) {
      module._detach();
      module._setState("closed");
      return;
    }

    // Ignore if already closed
    if (module.state === "closed") {
      return;
    }

    const wasReady = module.state === "ready";
    const error = ManagerErrors.processCrashed(module.name, code, signal);

    // Detach module
    module._detach();
    module._setState("disconnected");

    this.emit(ManagerEvents.ERROR, module.name, error);

    // Check if we should restart
    const policy = this.resolveSpawnPolicy(module.spawnPolicyConfig);

    if (wasReady && policy.restartOnCrash && this.canRestart(module.name, policy)) {
      this.recordRestart(module.name);
      this.emit(ManagerEvents.RESTARTING, module.name, error);

      // Restart async
      this.restartModule(module).catch((restartError: Error) => {
        module._setState("closed");
        this.emit(
          ManagerEvents.ERROR,
          module.name,
          ManagerErrors.restartFailed(restartError.message),
        );
      });
    } else {
      module._setState("closed");

      if (wasReady && policy.restartOnCrash) {
        this.emit(ManagerEvents.ERROR, module.name, ManagerErrors.tooManyRestarts());
      }
    }
  }

  /**
   * Check if restart is allowed.
   */
  private canRestart(name: string, policy: Required<SpawnPolicy>): boolean {
    const { maxRestarts, windowMs } = policy.restartLimit;
    const now = Date.now();

    // Get timestamps, filter to window
    let timestamps = this.restartTimestamps.get(name) ?? [];
    timestamps = timestamps.filter((ts) => now - ts < windowMs);
    this.restartTimestamps.set(name, timestamps);

    return timestamps.length < maxRestarts;
  }

  /**
   * Record a restart.
   */
  private recordRestart(name: string): void {
    const timestamps = this.restartTimestamps.get(name) ?? [];
    timestamps.push(Date.now());
    this.restartTimestamps.set(name, timestamps);
  }

  /**
   * Restart a module.
   */
  private restartModule(module: Module): Promise<void> {
    // Wait a bit before restart, using a tracked timer so shutdown() can cancel it.
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.restartTimers.delete(module.name);

        // Bail if the module was shut down (or closed) during the delay; the
        // isShuttingDown flag is reset once shutdown() returns, so the module
        // state is the reliable signal here.
        if (this.isShuttingDown || module.state === "closed") {
          resolve();
          return;
        }

        // Re-spawn with retry logic.
        this.spawnModule(module.name).then(resolve, reject);
      }, RESTART_WAIT_DELAY_MS);

      this.restartTimers.set(module.name, timer);
    });
  }

  /**
   * Cancel a pending crash-restart timer, if any.
   */
  private cancelRestart(name: string): void {
    const timer = this.restartTimers.get(name);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.restartTimers.delete(name);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: Heartbeat (liveness)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start the control-plane heartbeat for a ready module.
   *
   * Every `intervalMs` we send a `$ping` over the child's stdin and check that
   * a `$pong` has been seen within `timeoutMs`; otherwise the child is treated
   * as dead (killed -> the normal crash/restart path runs).
   */
  private startHeartbeat(module: Module, config: HeartbeatConfig): void {
    const { name } = module;
    this.stopHeartbeat(name); // never run two timers for one module
    this.startPongReader(module);

    // Send the first ping immediately so the timeout is always measured from an
    // actual ping rather than from when the module became ready.
    this._sendHeartbeatPing(module);

    const timer = setInterval(() => {
      const pingAt = this.heartbeatPingAt.get(name);
      if (pingAt !== undefined) {
        // A ping is still unanswered: time out only relative to that ping, and
        // don't stack another ping (it would reset the deadline so a dead child
        // would never be detected).
        if (Date.now() - pingAt >= config.timeoutMs) {
          this.onHeartbeatTimeout(module, config.timeoutMs);
        }
        return;
      }
      // Previous ping was answered: send the next one.
      this._sendHeartbeatPing(module);
    }, config.intervalMs);

    this.heartbeatTimers.set(name, timer);
  }

  /** Write a `$ping` to the child and mark it outstanding (awaiting `$pong`). */
  private _sendHeartbeatPing(module: Module): void {
    const stdin = module.process?.stdin as
      | { write: (data: string) => number; flush?: () => void }
      | undefined;
    if (stdin) {
      stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "$ping" })}\n`);
      stdin.flush?.();
      this.heartbeatPingAt.set(module.name, Date.now());
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

  /** Record a `$pong`: the outstanding ping was answered. */
  private handlePong(name: string): void {
    if (this.heartbeatTimers.has(name)) {
      this.heartbeatPingAt.delete(name);
    }
  }

  /** The child missed too many heartbeats: kill it so the crash path runs. */
  private onHeartbeatTimeout(module: Module, timeoutMs: number): void {
    this.stopHeartbeat(module.name);
    this.emit(
      ManagerEvents.ERROR,
      module.name,
      ManagerErrors.heartbeatTimeout(module.name, timeoutMs),
    );
    // Kill a hung child; its exit drives handleProcessExit -> restart.
    module.process?.kill();
  }

  /** Stop and clear heartbeat state for a module. */
  private stopHeartbeat(name: string): void {
    const timer = this.heartbeatTimers.get(name);
    if (timer !== undefined) {
      clearInterval(timer);
      this.heartbeatTimers.delete(name);
    }
    const reader = this.heartbeatReaders.get(name);
    if (reader) {
      reader.abort();
      this.heartbeatReaders.delete(name);
    }
    this.heartbeatPingAt.delete(name);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: Shutdown
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Shutdown a single module.
   */
  private async shutdownModule(name: string): Promise<void> {
    const module = this.modules.get(name);
    if (!module) return;

    // Cancel any pending crash-restart so the module isn't resurrected, and
    // stop the liveness heartbeat.
    this.cancelRestart(name);
    this.stopHeartbeat(name);

    const proc = module.process;
    if (!proc) {
      module._setState("closed");
      return;
    }

    // Send $shutdown via control channel (stdin)
    const shutdownMessage =
      JSON.stringify({
        jsonrpc: "2.0",
        method: "$shutdown",
        params: {},
      }) + "\n";

    try {
      // proc.stdin is FileSink when using stdin: "pipe"
      const stdin = proc.stdin as { write: (data: string) => number; flush: () => void };
      stdin.write(shutdownMessage);
      stdin.flush();
    } catch {
      // Ignore write errors - process might already be dead
    }

    // Abort stdout reader
    const abortController = this.stdoutAbortControllers.get(name);
    if (abortController) {
      abortController.abort();
      this.stdoutAbortControllers.delete(name);
    }

    // Detach module
    module._detach();

    // Wait for exit or force kill
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        proc.kill();
        resolve();
      }, FORCE_KILL_TIMEOUT_MS);

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

    module._setState("closed");
    this.emit(ManagerEvents.CLOSED, name);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Cleanup module after failed spawn.
   */
  private cleanupModule(module: Module): void {
    this.stopHeartbeat(module.name);

    const proc = module.process;
    if (proc && proc.exitCode === null) {
      proc.kill();
    }

    const abortController = this.stdoutAbortControllers.get(module.name);
    if (abortController) {
      abortController.abort();
      this.stdoutAbortControllers.delete(module.name);
    }

    module._detach();
  }

  /**
   * Resolve spawn policy with defaults.
   */
  private resolveSpawnPolicy(policy: SpawnPolicy): Required<SpawnPolicy> {
    return {
      initTimeout: policy.initTimeout ?? DEFAULT_SPAWN_POLICY.initTimeout,
      maxRetries: policy.maxRetries ?? DEFAULT_SPAWN_POLICY.maxRetries,
      retryDelay: policy.retryDelay ?? DEFAULT_SPAWN_POLICY.retryDelay,
      restartOnCrash: policy.restartOnCrash ?? DEFAULT_SPAWN_POLICY.restartOnCrash,
      restartLimit: policy.restartLimit ?? DEFAULT_SPAWN_POLICY.restartLimit,
      socketBufferSize: policy.socketBufferSize ?? DEFAULT_SPAWN_POLICY.socketBufferSize,
      heartbeat: policy.heartbeat ?? DEFAULT_SPAWN_POLICY.heartbeat,
    };
  }

  /**
   * Calculate retry delay.
   */
  private calculateRetryDelay(attempt: number, config: RetryDelayConfig): number {
    if (config.type === "fixed") {
      return config.delay;
    }

    // Exponential: base * 2^(attempt-1), capped at max
    const delay = config.base * Math.pow(2, attempt - 1);
    return Math.min(delay, config.max);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
