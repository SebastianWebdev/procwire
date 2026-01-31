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
import type { SpawnPolicy, RetryDelayConfig } from "./types.js";
import { ManagerErrors } from "./errors.js";
import { ManagerEvents } from "./events.js";

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

    const _policy = this.resolveSpawnPolicy(module.spawnPolicyConfig);

    // TODO: Implement spawn logic using Bun.spawn()
    // Will be implemented in TASK-33
    throw new Error(
      "Not implemented: ModuleManager.spawnModule() - will be implemented in TASK-33",
    );
  }

  /**
   * Shutdown a single module.
   */
  private async shutdownModule(name: string): Promise<void> {
    const module = this.modules.get(name);
    if (!module) return;

    // TODO: Implement shutdown logic
    // Will be implemented in TASK-33
    module._detach();
    module._setState("closed");
    this.emit(ManagerEvents.CLOSED, name);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: Helpers
  // ═══════════════════════════════════════════════════════════════════════════

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
