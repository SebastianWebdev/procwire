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
import type { SpawnPolicy, ModuleSchema, InitMessage, RetryDelayConfig } from "./types.js";
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
};

/** Delay for detecting immediate spawn errors (ms) */
const SPAWN_ERROR_DETECTION_DELAY_MS = 100;

/** Delay before attempting to restart a crashed module (ms) */
const RESTART_WAIT_DELAY_MS = 1000;

/** Timeout for graceful shutdown before force kill (ms) */
const FORCE_KILL_TIMEOUT_MS = 5000;

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
    const socket = await this.connectDataChannel(initMessage.params.pipe, policy.socketBufferSize);
    module._attachDataChannel(socket);

    // 5. Ready!
    module._setState("ready");
    this.emit(ManagerEvents.READY, module.name);
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
                    reject(ManagerErrors.moduleError(module.name, msg.params?.message || "Unknown"));
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
   */
  private connectDataChannel(pipePath: string, _socketBufferSize?: number): Promise<BunSocket> {
    return new Promise((resolve, reject) => {
      // Determine if it's a Unix socket or Windows named pipe
      const isWindows = process.platform === "win32";

      // Create connection options
      const connectOptions = {
        unix: isWindows ? undefined : pipePath,
        hostname: isWindows ? pipePath : undefined,
        socket: {
          open(socket: BunSocket) {
            resolve(socket);
          },
          data(_socket: BunSocket, _data: Buffer) {
            // Data handling will be set up by Module._attachDataChannel()
          },
          error(_socket: BunSocket, error: Error) {
            reject(ManagerErrors.dataChannelFailed(error.message));
          },
          close(_socket: BunSocket) {
            // Socket closed
          },
          drain(_socket: BunSocket) {
            // Socket drained (backpressure relieved)
          },
        },
      };

      try {
        // For Windows named pipes, Bun uses the path directly
        if (isWindows) {
          Bun.connect({
            unix: pipePath,
            socket: connectOptions.socket,
          });
        } else {
          Bun.connect({
            unix: pipePath,
            socket: connectOptions.socket,
          });
        }
      } catch (error) {
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
  private async restartModule(module: Module): Promise<void> {
    // Wait a bit before restart
    await this.sleep(RESTART_WAIT_DELAY_MS);

    // Re-spawn with retry logic
    await this.spawnModule(module.name);
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
