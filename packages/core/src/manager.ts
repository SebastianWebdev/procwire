/**
 * ModuleManager - Orchestrates lifecycle of worker modules.
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

import { spawn, type ChildProcess } from "node:child_process";
import { createConnection, type Socket } from "node:net";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import { EventEmitter } from "node:events";
import type { Module } from "./module.js";
import type { SpawnPolicy, ModuleSchema, InitMessage, RetryDelayConfig } from "./types.js";

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
};

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
  private readonly stdoutReaders = new Map<string, ReadlineInterface>();
  private isShuttingDown = false;

  /**
   * Register a module.
   *
   * @param module - Module to register
   * @throws {Error} if module with same name already registered
   */
  register(module: Module): this {
    if (this.modules.has(module.name)) {
      throw new Error(`Module "${module.name}" already registered`);
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
      throw new Error(`Module "${name}" not registered`);
    }

    const policy = this.resolveSpawnPolicy(module.spawnPolicyConfig);
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
      try {
        // Wait before retry (not on first attempt)
        if (attempt > 0) {
          const delay = this.calculateRetryDelay(attempt, policy.retryDelay);
          this.emit("module:retrying", name, attempt, delay, lastError);
          await this.sleep(delay);
        }

        await this.spawnModuleOnce(module, policy);
        return; // Success!
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Cleanup failed attempt
        this.cleanupModule(module);

        this.emit("module:spawnFailed", name, attempt, lastError, attempt < policy.maxRetries);
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

    // 1. Spawn process
    module._setState("initializing");

    const childProcess = spawn(exe.command, exe.args, {
      stdio: ["pipe", "pipe", "inherit"],
      cwd: exe.cwd,
      env: {
        ...process.env,
        ...exe.env,
        PROCWIRE_MODULE_NAME: module.name,
      },
    });

    module._attachProcess(childProcess);

    // Check for immediate spawn errors
    const spawnError = await this.waitForSpawnResult(childProcess);
    if (spawnError) {
      throw spawnError;
    }

    // Setup exit handler for crash detection
    childProcess.on("exit", (code, signal) => {
      this.handleProcessExit(module, code, signal);
    });

    // 2. Wait for $init from child
    const initMessage = await this.waitForInit(module, childProcess, policy.initTimeout);

    // 3. Validate schema
    this.validateSchema(module, initMessage.params.schema);
    module._attachSchema(initMessage.params.schema);

    // 4. Connect data channel
    module._setState("connecting");
    const socket = await this.connectDataChannel(initMessage.params.pipe);
    module._attachDataChannel(socket);

    // 5. Ready!
    module._setState("ready");
    this.emit("module:ready", module.name);
  }

  /**
   * Wait briefly to catch immediate spawn errors.
   */
  private waitForSpawnResult(proc: ChildProcess): Promise<Error | null> {
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
      }, 100);
    });
  }

  /**
   * Wait for $init message from child.
   */
  private waitForInit(module: Module, proc: ChildProcess, timeout: number): Promise<InitMessage> {
    return new Promise((resolve, reject) => {
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          rl.close();
          proc.kill("SIGKILL");
          reject(new Error(`Module "${module.name}" did not send $init within ${timeout}ms`));
        }
      }, timeout);

      // Listen for crash during init
      const exitHandler = (code: number | null, signal: string | null) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          rl.close();
          reject(
            new Error(
              `Module "${module.name}" crashed during init (code: ${code}, signal: ${signal})`,
            ),
          );
        }
      };
      proc.on("exit", exitHandler);

      const rl = createInterface({
        input: proc.stdout!,
        crlfDelay: Infinity,
      });

      this.stdoutReaders.set(module.name, rl);

      rl.on("line", (line) => {
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
              reject(
                new Error(`Module "${module.name}" error: ${msg.params?.message || "Unknown"}`),
              );
            }
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
   * Validate child schema against module config.
   */
  private validateSchema(module: Module, childSchema: ModuleSchema): void {
    const expected = module._buildExpectedSchema();

    for (const methodName of expected.methods) {
      if (!childSchema.methods[methodName]) {
        throw new Error(
          `Module "${module.name}": child did not register expected method "${methodName}"`,
        );
      }
    }

    for (const eventName of expected.events) {
      if (!childSchema.events[eventName]) {
        throw new Error(
          `Module "${module.name}": child did not register expected event "${eventName}"`,
        );
      }
    }
  }

  /**
   * Connect to data channel.
   */
  private connectDataChannel(pipePath: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = createConnection(pipePath);

      socket.on("connect", () => resolve(socket));
      socket.on("error", (err) => reject(new Error(`Data channel connect failed: ${err.message}`)));
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
    const error = new Error(
      `Module "${module.name}" exited unexpectedly (code: ${code}, signal: ${signal})`,
    );

    // Detach module
    module._detach();
    module._setState("disconnected");

    this.emit("module:error", module.name, error);

    // Check if we should restart
    const policy = this.resolveSpawnPolicy(module.spawnPolicyConfig);

    if (wasReady && policy.restartOnCrash && this.canRestart(module.name, policy)) {
      this.recordRestart(module.name);
      this.emit("module:restarting", module.name, error);

      // Restart async
      this.restartModule(module).catch((restartError: Error) => {
        module._setState("closed");
        this.emit(
          "module:error",
          module.name,
          new Error(`Restart failed: ${restartError.message}`),
        );
      });
    } else {
      module._setState("closed");

      if (wasReady && policy.restartOnCrash) {
        this.emit("module:error", module.name, new Error("Too many restarts, giving up"));
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
    await this.sleep(1000);

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

    // Send $shutdown via control channel
    if (proc.stdin?.writable) {
      proc.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "$shutdown",
          params: {},
        }) + "\n",
      );
    }

    // Close stdout reader
    const reader = this.stdoutReaders.get(name);
    if (reader) {
      reader.close();
      this.stdoutReaders.delete(name);
    }

    // Detach module
    module._detach();

    // Wait for exit or force kill
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
        resolve();
      }, 5000);

      proc.on("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });

    module._setState("closed");
    this.emit("module:closed", name);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Cleanup module after failed spawn.
   */
  private cleanupModule(module: Module): void {
    const proc = module.process;
    if (proc && !proc.killed) {
      proc.kill("SIGKILL");
    }

    const reader = this.stdoutReaders.get(module.name);
    if (reader) {
      reader.close();
      this.stdoutReaders.delete(module.name);
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
