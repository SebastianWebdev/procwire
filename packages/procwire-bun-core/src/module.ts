/**
 * Module class - Represents a worker process with configuration and communication.
 *
 * This is the Bun.js optimized version using Bun.spawn() and Bun.listen()/Bun.connect().
 *
 * RESPONSIBILITIES:
 * - Store configuration (executable, methods, events, codecs)
 * - Handle communication (send, stream, on)
 * - Manage connection state (socket, pending requests)
 *
 * NOT RESPONSIBLE FOR:
 * - Spawning process (ModuleManager does this)
 * - Retry/restart logic (ModuleManager does this)
 * - Health monitoring (ModuleManager does this)
 *
 * @module
 */

import { EventEmitter } from "node:events";
import { msgpackCodec } from "@procwire/codecs";
import type {
  ModuleState,
  ExecutableConfig,
  MethodConfig,
  EventConfig,
  SpawnPolicy,
  ModuleSchema,
} from "./types.js";
import { ModuleErrors } from "./errors.js";
import { ModuleEvents } from "./events.js";

// ═══════════════════════════════════════════════════════════════════════════
// BUN TYPES (will be available at runtime)
// ═══════════════════════════════════════════════════════════════════════════

// Bun.spawn() subprocess type
type BunSubprocess = ReturnType<typeof Bun.spawn>;

// Bun socket type from Bun.connect()
type BunSocket = Awaited<ReturnType<typeof Bun.connect>>;

// ═══════════════════════════════════════════════════════════════════════════
// MODULE CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Module - Represents a worker process with configuration and communication.
 *
 * This is the Bun.js optimized version.
 *
 * @example
 * ```typescript
 * const worker = new Module('worker')
 *   .executable('python', ['worker.py'])
 *   .method('process', { codec: msgpackCodec })
 *   .event('progress');
 *
 * // After manager.spawn():
 * const result = await worker.send('process', data);
 * worker.onEvent('progress', console.log);
 * ```
 */
export class Module extends EventEmitter {
  readonly name: string;

  // Configuration (set via builder methods)
  private _executable: ExecutableConfig | null = null;
  private _methods = new Map<string, MethodConfig>();
  private _events = new Map<string, EventConfig>();
  private _spawnPolicy: SpawnPolicy = {};
  private _maxPayloadSize?: number;

  // Connection state (set by ModuleManager via _attach methods)
  private _state: ModuleState = "created";
  private _process: BunSubprocess | null = null;
  private _socket: BunSocket | null = null;
  private _childSchema: ModuleSchema | null = null;

  // Request tracking
  private _nextRequestId = 1;

  // Lookups (populated from child schema)
  private _methodNameToId = new Map<string, number>();
  private _methodIdToName = new Map<number, string>();
  private _eventIdToName = new Map<number, string>();

  constructor(name: string) {
    super();
    this.name = name;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BUILDER API (Configuration)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Set executable command.
   */
  executable(
    command: string,
    args: string[] = [],
    options?: { cwd?: string; env?: Record<string, string> },
  ): this {
    this._executable = {
      command,
      args,
      cwd: options?.cwd,
      env: options?.env,
    };
    return this;
  }

  /**
   * Register a method.
   */
  method(
    name: string,
    config: Partial<Omit<MethodConfig, "cancellable">> & { cancellable?: boolean } = {},
  ): this {
    this._methods.set(name, {
      codec: config.codec ?? msgpackCodec,
      response: config.response ?? "result",
      timeout: config.timeout,
      cancellable: config.cancellable ?? false,
    });
    return this;
  }

  /**
   * Register an event.
   */
  event(name: string, config: Partial<EventConfig> = {}): this {
    this._events.set(name, {
      codec: config.codec ?? msgpackCodec,
    });
    return this;
  }

  /**
   * Set spawn policy.
   */
  spawnPolicy(policy: SpawnPolicy): this {
    this._spawnPolicy = { ...this._spawnPolicy, ...policy };
    return this;
  }

  /**
   * Set max payload size.
   */
  maxPayloadSize(size: number): this {
    this._maxPayloadSize = size;
    return this;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GETTERS (for ModuleManager)
  // ═══════════════════════════════════════════════════════════════════════════

  get state(): ModuleState {
    return this._state;
  }

  get executableConfig(): ExecutableConfig | null {
    return this._executable;
  }

  get methods(): ReadonlyMap<string, MethodConfig> {
    return this._methods;
  }

  get events(): ReadonlyMap<string, EventConfig> {
    return this._events;
  }

  get spawnPolicyConfig(): SpawnPolicy {
    return this._spawnPolicy;
  }

  get process(): BunSubprocess | null {
    return this._process;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL API (called by ModuleManager)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * @internal Called by ModuleManager when process is spawned.
   */
  _setState(state: ModuleState): void {
    this._state = state;
    this.emit(ModuleEvents.STATE, state);
  }

  /**
   * @internal Called by ModuleManager to attach child process.
   */
  _attachProcess(process: BunSubprocess): void {
    this._process = process;
  }

  /**
   * @internal Called by ModuleManager when $init received.
   */
  _attachSchema(schema: ModuleSchema): void {
    this._childSchema = schema;

    // Build lookup maps
    for (const [name, info] of Object.entries(schema.methods)) {
      this._methodNameToId.set(name, info.id);
      this._methodIdToName.set(info.id, name);
    }

    for (const [name, info] of Object.entries(schema.events)) {
      this._eventIdToName.set(info.id, name);
    }
  }

  /**
   * @internal Called by ModuleManager to attach data channel.
   */
  _attachDataChannel(socket: BunSocket): void {
    this._socket = socket;

    // TODO: Setup frame handling via socket handlers
    // Bun sockets use handler-based API instead of EventEmitter
  }

  /**
   * @internal Called by ModuleManager on shutdown/crash.
   */
  _detach(): void {
    // TODO: Reject pending requests, cleanup

    // Clear connection state
    this._socket?.end();
    this._socket = null;
    this._process = null;

    // Clear lookups
    this._methodNameToId.clear();
    this._methodIdToName.clear();
    this._eventIdToName.clear();
    this._childSchema = null;
  }

  /**
   * @internal Validate configuration before spawn.
   */
  _validate(): void {
    if (!this._executable) {
      throw ModuleErrors.executableNotConfigured(this.name);
    }
    if (this._methods.size === 0) {
      throw ModuleErrors.noMethodsRegistered(this.name);
    }
  }

  /**
   * @internal Build expected schema for validation against child.
   */
  _buildExpectedSchema(): { methods: string[]; events: string[] } {
    return {
      methods: Array.from(this._methods.keys()),
      events: Array.from(this._events.keys()),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API (Communication)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Send a request to the module.
   *
   * @param method - Method name
   * @param data - Data to send
   * @param options - Optional abort signal
   * @returns Response data
   *
   * @throws {Error} if module not ready
   * @throws {Error} if method unknown
   * @throws {Error} if timeout
   * @throws {DOMException} if aborted
   */
  async send<TResponse = unknown, TRequest = unknown>(
    method: string,
    _data: TRequest,
    _options?: { signal?: AbortSignal },
  ): Promise<TResponse> {
    this._ensureReady();

    const methodConfig = this._methods.get(method);
    if (!methodConfig) {
      throw ModuleErrors.unknownMethod(method);
    }

    // TODO: Implement send logic using Bun socket
    throw new Error("Not implemented: Module.send() - will be implemented in TASK-35");
  }

  /**
   * Send a streaming request.
   *
   * @param method - Method name
   * @param data - Data to send
   * @param options - Optional abort signal
   * @returns AsyncGenerator yielding response chunks
   */
  // eslint-disable-next-line require-yield
  async *stream<TChunk = unknown, TRequest = unknown>(
    method: string,
    _data: TRequest,
    _options?: { signal?: AbortSignal },
  ): AsyncGenerator<TChunk> {
    this._ensureReady();

    const methodConfig = this._methods.get(method);
    if (!methodConfig) {
      throw ModuleErrors.unknownMethod(method);
    }

    // TODO: Implement stream logic using Bun socket
    throw new Error("Not implemented: Module.stream() - will be implemented in TASK-35");
  }

  /**
   * Listen for events from module.
   *
   * @param eventName - Event name
   * @param handler - Handler function
   * @returns Unsubscribe function
   */
  onEvent<T = unknown>(eventName: string, handler: (data: T) => void): () => void {
    const eventConfig = this._events.get(eventName);
    if (!eventConfig) {
      throw ModuleErrors.unknownEvent(eventName);
    }

    const wrappedHandler = (data: T) => handler(data);
    this.on(`event:${eventName}`, wrappedHandler);

    return () => {
      this.off(`event:${eventName}`, wrappedHandler);
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE
  // ═══════════════════════════════════════════════════════════════════════════

  private _ensureReady(): void {
    if (this._state !== "ready") {
      throw ModuleErrors.notReady(this.name, this._state);
    }
  }
}
