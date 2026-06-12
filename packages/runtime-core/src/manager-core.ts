/**
 * ModuleManagerCore - the runtime-agnostic half of ModuleManager.
 *
 * Owns the lifecycle POLICIES: spawn retry/backoff, the crash-restart window,
 * the per-module shutdown guard (Bug W4 semantics - a single global flag
 * suppressed crash handling for ALL modules while ANY shutdown ran), and the
 * control-plane heartbeat state machine (timeout measured from the actual
 * outstanding $ping, never from startup).
 *
 * What the runtime adapters own (abstract methods below): process spawn and
 * exit wiring, the control-plane IO (stdin writes, stdout readers), the
 * data-channel connect, and process kill/exit-wait mechanics.
 *
 * @module
 */

import { EventEmitter } from "node:events";
import type {
  ModuleState,
  ExecutableConfig,
  SpawnPolicy,
  ModuleSchema,
  InitMessage,
  RetryDelayConfig,
  HeartbeatConfig,
  ResponseType,
} from "./types.js";
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
  heartbeat: null, // disabled by default
};

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
// MANAGED MODULE (what the manager needs from a Module)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Structural view of a Module as the manager core uses it. ModuleCore
 * satisfies this for any schema, which keeps the manager generic without
 * being invariant over the module's accumulated schema type.
 */
export interface ManagedModule<TProcess> {
  readonly name: string;
  readonly state: ModuleState;
  readonly executableConfig: ExecutableConfig | null;
  readonly spawnPolicyConfig: SpawnPolicy;
  readonly process: TProcess | null;
  _validate(): void;
  _setState(state: ModuleState): void;
  _attachProcess(process: TProcess): void;
  _attachSchema(schema: ModuleSchema): void;
  _buildExpectedSchema(): { methods: { name: string; response: ResponseType }[]; events: string[] };
  _detach(): void;
}

// ═══════════════════════════════════════════════════════════════════════════
// MODULE MANAGER CORE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ModuleManagerCore - shared lifecycle orchestration for worker modules.
 *
 * @typeParam TProcess - Runtime process handle (ChildProcess / Bun.Subprocess)
 * @typeParam TModule - Concrete module type managed by the runtime package
 */
export abstract class ModuleManagerCore<
  TProcess,
  TModule extends ManagedModule<TProcess>,
> extends EventEmitter {
  protected readonly modules = new Map<string, TModule>();
  private readonly restartTimestamps = new Map<string, number[]>();
  // Pending crash-restart timers, kept so they can be cancelled on shutdown to
  // avoid resurrecting a module mid-/post-shutdown (the restart delay outlives
  // the per-module shuttingDown window, which ends when its shutdown returns).
  private readonly restartTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // Control-plane heartbeat state (only populated when a module enables it).
  private readonly heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>();
  // Timestamp of an outstanding (unanswered) $ping per module; cleared once the
  // matching $pong arrives. Lets us measure the timeout from an actual ping
  // rather than from startup.
  private readonly heartbeatPingAt = new Map<string, number>();
  // Names of modules whose shutdown is currently in flight. Per-module on
  // purpose: a single global flag suppressed crash handling for ALL modules
  // while ANY shutdown ran, and overlapping shutdowns raced on resetting it
  // (Bug W4).
  private readonly shuttingDown = new Set<string>();

  // ═══════════════════════════════════════════════════════════════════════════
  // RUNTIME ADAPTER HOOKS (abstract)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Spawn the child process for `module`. The adapter owns stdio config and
   * any runtime-specific guards (e.g. Node's stdin EPIPE guard). Exit wiring
   * happens in _watchProcessExit (or at spawn time, if the runtime requires
   * it) and must route into this.handleProcessExit() with the exited process.
   */
  protected abstract _spawnProcess(module: TModule): TProcess;

  /**
   * Wait briefly to catch immediate spawn errors; resolve null when the
   * process started.
   */
  protected abstract _waitForSpawnResult(module: TModule, proc: TProcess): Promise<Error | null>;

  /**
   * Attach crash detection for the started process, routing exits into
   * this.handleProcessExit(module, proc, code, signal). Called once the
   * spawn-error window has passed; runtimes that must wire exit at spawn time
   * (Bun's onExit option) implement this as a no-op.
   */
  protected abstract _watchProcessExit(module: TModule, proc: TProcess): void;

  /**
   * Wait for the child's $init on the control plane (stdout). The adapter
   * owns the reader; $pong lines seen on the same reader must be routed to
   * this.handlePong(module.name).
   */
  protected abstract _waitForInit(
    module: TModule,
    proc: TProcess,
    timeout: number,
  ): Promise<InitMessage>;

  /**
   * Connect the data plane to `pipePath` and attach it to the module
   * (transport + inbound wiring). Resolves once the module is wired.
   */
  protected abstract _connectDataChannel(
    module: TModule,
    pipePath: string,
    policy: Required<SpawnPolicy>,
  ): Promise<void>;

  /**
   * Write one newline-terminated JSON-RPC control message to the child's
   * stdin. Returns false when the message could not be handed off (dead or
   * non-writable stdin) - the caller treats that as "not sent".
   */
  protected abstract _writeControlMessage(module: TModule, message: string): boolean;

  /**
   * Force-kill the child process (no-op when it already exited).
   */
  protected abstract _killProcess(module: TModule): void;

  /**
   * Wait for the child to exit; after `timeoutMs` force-kill it and resolve.
   */
  protected abstract _waitForExitOrKill(
    module: TModule,
    proc: TProcess,
    timeoutMs: number,
  ): Promise<void>;

  /**
   * Release the control-plane stdout reader for a module (close the readline
   * interface / abort the stream reader), if one is active.
   */
  protected abstract _disposeControlReader(name: string): void;

  /**
   * Heartbeat lifecycle hooks for runtimes that need a dedicated $pong reader
   * (Bun re-acquires the stdout stream after the handshake releases it).
   */
  protected _onHeartbeatStart(_module: TModule): void {
    // Default: $pong arrives via the handshake reader kept open (Node).
  }

  protected _onHeartbeatStop(_name: string): void {
    // Default: nothing to release.
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Register a module.
   *
   * @param module - Module to register
   * @throws {Error} if module with same name already registered
   */
  register(module: TModule): this {
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
  get(name: string): TModule | undefined {
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
    const targets = name !== undefined ? [name] : Array.from(this.modules.keys());

    for (const target of targets) {
      this.shuttingDown.add(target);
    }
    try {
      await Promise.all(targets.map((n) => this.shutdownModule(n)));
    } finally {
      for (const target of targets) {
        this.shuttingDown.delete(target);
      }
    }
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
  private async spawnModuleOnce(module: TModule, policy: Required<SpawnPolicy>): Promise<void> {
    // 1. Spawn process
    module._setState("initializing");

    const proc = this._spawnProcess(module);
    module._attachProcess(proc);

    // Check for immediate spawn errors
    const spawnError = await this._waitForSpawnResult(module, proc);
    if (spawnError) {
      throw spawnError;
    }

    // Setup exit handler for crash detection
    this._watchProcessExit(module, proc);

    // 2. Wait for $init from child
    const initMessage = await this._waitForInit(module, proc, policy.initTimeout);

    // 3. Validate schema
    this.validateSchema(module, initMessage.params.schema);
    module._attachSchema(initMessage.params.schema);

    // 4. Connect data channel
    module._setState("connecting");
    await this._connectDataChannel(module, initMessage.params.pipe, policy);

    // 5. Ready!
    module._setState("ready");
    this.emit(ManagerEvents.READY, module.name);

    // 6. Start liveness heartbeat if configured.
    if (policy.heartbeat) {
      this.startHeartbeat(module, policy.heartbeat);
    }
  }

  /**
   * Validate child schema against module config.
   */
  private validateSchema(module: TModule, childSchema: ModuleSchema): void {
    const expected = module._buildExpectedSchema();

    for (const { name: methodName, response } of expected.methods) {
      const childMethod = childSchema.methods[methodName];
      if (!childMethod) {
        throw ManagerErrors.schemaMissingMethod(module.name, methodName);
      }
      // Both sides declare a response type; disagreement (e.g. parent expects
      // a stream, child answers with a single result) must fail the handshake
      // instead of surfacing later as a confusing send()/stream() error (D4).
      if (childMethod.response !== response) {
        throw ManagerErrors.schemaResponseMismatch(
          module.name,
          methodName,
          response,
          childMethod.response,
        );
      }
    }

    for (const eventName of expected.events) {
      if (!childSchema.events[eventName]) {
        throw ManagerErrors.schemaMissingEvent(module.name, eventName);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROTECTED: Crash & Restart
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handle child process exit. Runtime adapters route their exit events here,
   * passing the process whose exit fired so stale generations are filtered.
   */
  protected handleProcessExit(
    module: TModule,
    proc: TProcess,
    code: number | null,
    signal: string | null,
  ): void {
    // Generation guard: a late exit from a previous (killed/replaced) process
    // must not detach the module's CURRENT process - it would tear down a
    // freshly respawned session and stop its heartbeat (D1). The module holds
    // exactly the process of the live generation; anything else is stale.
    if (module.process !== proc) {
      return;
    }

    // The process is gone: stop pinging it.
    this.stopHeartbeat(module.name);

    // Ignore if THIS module is shutting down (an unrelated module's
    // shutdown must not swallow this crash)
    if (this.shuttingDown.has(module.name)) {
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
  private restartModule(module: TModule): Promise<void> {
    // Wait a bit before restart, using a tracked timer so shutdown() can cancel it.
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.restartTimers.delete(module.name);

        // Bail if the module was shut down (or closed) during the delay; the
        // shuttingDown entry is removed once its shutdown returns, so the
        // module state is the reliable signal here.
        if (this.shuttingDown.has(module.name) || module.state === "closed") {
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
  // PROTECTED: Heartbeat (liveness)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start the control-plane heartbeat for a ready module.
   *
   * Sends a `$ping` over the child's stdin and, while a ping is unanswered,
   * checks that the matching `$pong` arrives within `timeoutMs` of *that ping*
   * (never from startup). A new ping is only sent once the previous one was
   * answered, so a dead child is reliably detected regardless of how
   * `intervalMs` and `timeoutMs` relate. On timeout the child is treated as
   * dead (killed -> the normal crash/restart path runs).
   */
  private startHeartbeat(module: TModule, config: HeartbeatConfig): void {
    const { name } = module;
    this.stopHeartbeat(name); // never run two timers for one module
    this._onHeartbeatStart(module);

    // Send the first ping immediately so the timeout is always measured from an
    // actual ping rather than from when the module became ready.
    this._sendHeartbeatPing(module);

    const timer = setInterval(() => {
      const pingAt = this.heartbeatPingAt.get(name);
      if (pingAt !== undefined) {
        // A ping is still unanswered: time out only relative to that ping. Do
        // not send another ping meanwhile (it would reset the deadline and a
        // dead child would never be detected).
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
  private _sendHeartbeatPing(module: TModule): void {
    if (this._writeControlMessage(module, JSON.stringify({ jsonrpc: "2.0", method: "$ping" }))) {
      this.heartbeatPingAt.set(module.name, Date.now());
    }
  }

  /** Record a `$pong`: the outstanding ping was answered. */
  protected handlePong(name: string): void {
    if (this.heartbeatTimers.has(name)) {
      this.heartbeatPingAt.delete(name);
    }
  }

  /** The child missed too many heartbeats: kill it so the crash path runs. */
  private onHeartbeatTimeout(module: TModule, timeoutMs: number): void {
    this.stopHeartbeat(module.name);
    this.emit(
      ManagerEvents.ERROR,
      module.name,
      ManagerErrors.heartbeatTimeout(module.name, timeoutMs),
    );
    // Kill a hung child; its exit drives handleProcessExit -> restart.
    this._killProcess(module);
  }

  /** Stop and clear heartbeat state for a module. */
  private stopHeartbeat(name: string): void {
    const timer = this.heartbeatTimers.get(name);
    if (timer !== undefined) {
      clearInterval(timer);
      this.heartbeatTimers.delete(name);
    }
    this._onHeartbeatStop(name);
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

    // Send $shutdown via control channel. A dying child can fail the write -
    // that's fine, the exit wait below (with force-kill fallback) still runs.
    this._writeControlMessage(
      module,
      JSON.stringify({ jsonrpc: "2.0", method: "$shutdown", params: {} }),
    );

    // Close control-plane reader
    this._disposeControlReader(name);

    // Detach module
    module._detach();

    // Wait for exit or force kill
    await this._waitForExitOrKill(module, proc, FORCE_KILL_TIMEOUT_MS);

    module._setState("closed");
    this.emit(ManagerEvents.CLOSED, name);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Cleanup module after failed spawn.
   */
  private cleanupModule(module: TModule): void {
    this.stopHeartbeat(module.name);
    this._killProcess(module);
    this._disposeControlReader(module.name);
    module._detach();
  }

  /**
   * Resolve spawn policy with defaults.
   */
  protected resolveSpawnPolicy(policy: SpawnPolicy): Required<SpawnPolicy> {
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
