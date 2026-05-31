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
import {
  FrameBuffer,
  type Frame,
  hasFlag,
  Flags,
  HEADER_SIZE,
  HEADER_POOL_SIZE,
  ABORT_METHOD_ID,
  encodeHeaderInto,
} from "@procwire/protocol";
import { codecDeserialize, msgpackCodec, type Codec } from "@procwire/codecs";
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
import { BunDrainWaiter } from "./drain-waiter.js";

// ═══════════════════════════════════════════════════════════════════════════
// BUN TYPES (will be available at runtime)
// ═══════════════════════════════════════════════════════════════════════════

// Bun.spawn() subprocess type
type BunSubprocess = ReturnType<typeof Bun.spawn>;

// Bun socket type from Bun.connect()
type BunSocket = Awaited<ReturnType<typeof Bun.connect>>;

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout> | null;
  /** Codec for deserializing response (child→parent direction) */
  responseCodec: Codec;
  /** Expected response type: "ack" or "result" */
  expectedResponse: "ack" | "result";
  /** Removes the AbortSignal listener, if one was registered. */
  abortCleanup?: (() => void) | undefined;
}

interface PendingStream {
  push: (chunk: unknown) => void;
  end: () => void;
  error: (err: Error) => void;
  /** Codec for deserializing response chunks (child→parent direction) */
  responseCodec: Codec;
}

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

/**
 * Default per-request timeout (ms) for result/ack methods when neither the
 * child schema nor the method config specify one. Prevents send() from hanging
 * forever. Override per-method (`timeout`) or per-module (`.requestTimeout()`);
 * a value of 0 disables the timeout.
 */
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export class Module extends EventEmitter {
  readonly name: string;

  // Configuration (set via builder methods)
  private _executable: ExecutableConfig | null = null;
  private _methods = new Map<string, MethodConfig>();
  private _events = new Map<string, EventConfig>();
  private _spawnPolicy: SpawnPolicy = {};
  private _maxPayloadSize?: number;
  private _defaultRequestTimeout: number = DEFAULT_REQUEST_TIMEOUT_MS;

  // Connection state (set by ModuleManager via _attach methods)
  private _state: ModuleState = "created";
  private _process: BunSubprocess | null = null;
  private _socket: BunSocket | null = null;
  private _frameBuffer: FrameBuffer | null = null;
  private _childSchema: ModuleSchema | null = null;

  // Request tracking
  private _nextRequestId = 1;
  private _pendingRequests = new Map<number, PendingRequest>();
  private _pendingStreams = new Map<number, PendingStream>();

  // OPT-02: Header ring buffer for allocation-free sends
  private readonly _headerPool = Array.from({ length: HEADER_POOL_SIZE }, () =>
    Buffer.allocUnsafe(HEADER_SIZE),
  );
  private _headerPoolIndex = 0;

  // OPT-04: Backpressure tracking for Bun sockets
  private _drainWaiter: BunDrainWaiter | null = null;

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
   *
   * Accepts either dual codecs (`requestCodec`/`responseCodec`) or
   * a single `codec` shorthand that sets both.
   */
  method(
    name: string,
    config: Partial<Omit<MethodConfig, "cancellable">> & {
      codec?: Codec;
      cancellable?: boolean;
    } = {},
  ): this {
    // Validate: partial dual-codec config is not allowed
    const hasRequestCodec = !!config.requestCodec;
    const hasResponseCodec = !!config.responseCodec;
    if (hasRequestCodec !== hasResponseCodec) {
      throw new Error("Both requestCodec and responseCodec must be provided together");
    }

    let requestCodec: Codec;
    let responseCodec: Codec;

    if (config.requestCodec && config.responseCodec) {
      requestCodec = config.requestCodec;
      responseCodec = config.responseCodec;
    } else if (config.codec) {
      requestCodec = config.codec;
      responseCodec = config.codec;
    } else {
      requestCodec = msgpackCodec;
      responseCodec = msgpackCodec;
    }

    this._methods.set(name, {
      requestCodec,
      responseCodec,
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

  /**
   * Set the default per-request timeout (ms) for this module.
   *
   * Applied to result/ack methods when neither the child schema nor the method
   * config specify a timeout. Pass 0 to disable the default for this module.
   * A per-method `timeout` still takes precedence.
   */
  requestTimeout(ms: number): this {
    this._defaultRequestTimeout = ms;
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
   * In Bun, socket handlers are set up during connection, so this just stores the socket.
   */
  _attachDataChannel(socket: BunSocket): void {
    this._socket = socket;
    this._drainWaiter = new BunDrainWaiter();
    this._frameBuffer = new FrameBuffer(
      this._maxPayloadSize !== undefined ? { maxPayloadSize: this._maxPayloadSize } : {},
    );
  }

  /**
   * @internal Called by socket data handler from ModuleManager.
   * Processes incoming data and handles frames.
   */
  _onSocketData(data: Buffer): void {
    if (!this._frameBuffer) return;

    const frames = this._frameBuffer.push(data);
    for (const frame of frames) {
      this._handleFrame(frame);
    }
  }

  /**
   * @internal Called by socket error handler from ModuleManager.
   */
  _onSocketError(err: Error): void {
    // EventEmitter throws synchronously when "error" is emitted with no
    // listener, which would crash the whole parent process. Only emit when
    // someone is listening; an unobserved socket error is still surfaced via
    // the subsequent close -> "disconnected" transition.
    if (this.listenerCount(ModuleEvents.ERROR) > 0) {
      this.emit(ModuleEvents.ERROR, err);
    }
  }

  /**
   * Allocate the next request id, wrapping within the uint32 wire range.
   *
   * requestId is encoded as a uint32; a plain counter would overflow after
   * 2^32 requests and make encoding throw. Wrap back to 1 (0 is reserved for
   * fire-and-forget / events).
   */
  private _allocateRequestId(): number {
    const id = this._nextRequestId;
    this._nextRequestId = id >= 0xffffffff ? 1 : id + 1;
    return id;
  }

  /**
   * @internal Called by socket close handler from ModuleManager.
   */
  _onSocketClose(): void {
    if (this._state === "ready") {
      this._setState("disconnected");
      this.emit(ModuleEvents.DISCONNECTED);
    }
  }

  /**
   * @internal Called by socket drain handler from ModuleManager.
   */
  _onSocketDrain(): void {
    this._drainWaiter?.onDrain();
  }

  /**
   * @internal Called by ModuleManager on shutdown/crash.
   */
  _detach(): void {
    // Reject all pending requests
    for (const [_id, pending] of this._pendingRequests) {
      pending.reject(ModuleErrors.disconnected());
      if (pending.timeout) clearTimeout(pending.timeout);
    }
    this._pendingRequests.clear();

    // Error all pending streams
    for (const [_id, stream] of this._pendingStreams) {
      stream.error(ModuleErrors.disconnected());
    }
    this._pendingStreams.clear();

    // Clear connection state
    this._socket?.end();
    this._socket = null;
    this._frameBuffer?.clear();
    this._frameBuffer = null;
    this._process = null;

    // Clear lookups
    this._methodNameToId.clear();
    this._methodIdToName.clear();
    this._eventIdToName.clear();
    this._childSchema = null;

    // Clear backpressure state
    this._drainWaiter?.clear();
    this._drainWaiter = null;
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
    data: TRequest,
    options?: { signal?: AbortSignal },
  ): Promise<TResponse> {
    this._ensureReady();

    const methodConfig = this._methods.get(method);
    if (!methodConfig) {
      throw ModuleErrors.unknownMethod(method);
    }

    const methodId = this._methodNameToId.get(method);
    if (methodId === undefined) {
      throw ModuleErrors.methodNotRegistered(method);
    }

    const schemaMethod = this._childSchema!.methods[method];
    if (!schemaMethod) {
      throw ModuleErrors.methodNotInSchema(method);
    }

    // Validate response type
    if (schemaMethod.response === "stream") {
      throw ModuleErrors.methodReturnsStream(method);
    }

    // Fire-and-forget
    if (schemaMethod.response === "none") {
      await this._sendFrame(methodId, 0, data, methodConfig.requestCodec);
      return undefined as TResponse;
    }

    const requestId = this._allocateRequestId();

    // Abort handling. Keep a reference so the listener can be removed when the
    // request settles normally (in _cleanupRequest) instead of leaking on the
    // signal until it eventually fires.
    let abortCleanup: (() => void) | undefined;
    if (options?.signal && methodConfig.cancellable) {
      const signal = options.signal;
      const onAbort = (): void => {
        // Note: We don't await here as it's in event handler; abort is best-effort.
        this._sendAbort(requestId).catch(() => {
          // Ignore errors during abort - connection may be closed
        });
        const pending = this._pendingRequests.get(requestId);
        if (pending) {
          pending.reject(new DOMException("Aborted", "AbortError"));
          this._cleanupRequest(requestId);
        }
      };
      signal.addEventListener("abort", onAbort, { once: true });
      abortCleanup = (): void => signal.removeEventListener("abort", onAbort);
    }

    // Wait for response - MUST register BEFORE sending to avoid race condition
    // where response arrives before we're listening for it
    const responsePromise = new Promise<TResponse>((resolve, reject) => {
      // Precedence: child schema -> method config -> module default.
      // A resolved value of 0 (or negative) disables the timeout.
      const timeout = schemaMethod.timeout ?? methodConfig.timeout ?? this._defaultRequestTimeout;
      const timer =
        timeout > 0
          ? setTimeout(() => {
              this._cleanupRequest(requestId);
              reject(ModuleErrors.timeout(method));
            }, timeout)
          : null;

      this._pendingRequests.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout: timer,
        responseCodec: methodConfig.responseCodec,
        expectedResponse: schemaMethod.response as "ack" | "result",
        abortCleanup,
      });
    });

    // Send frame AFTER registering pending request (with backpressure support)
    await this._sendFrame(methodId, requestId, data, methodConfig.requestCodec);

    return responsePromise;
  }

  /**
   * Send a streaming request.
   *
   * @param method - Method name
   * @param data - Data to send
   * @param options - Optional abort signal
   * @returns AsyncGenerator yielding response chunks
   */
  async *stream<TChunk = unknown, TRequest = unknown>(
    method: string,
    data: TRequest,
    options?: { signal?: AbortSignal },
  ): AsyncGenerator<TChunk> {
    this._ensureReady();

    const methodConfig = this._methods.get(method);
    if (!methodConfig) {
      throw ModuleErrors.unknownMethod(method);
    }

    const methodId = this._methodNameToId.get(method);
    if (methodId === undefined) {
      throw ModuleErrors.methodNotRegistered(method);
    }

    const schemaMethod = this._childSchema!.methods[method];
    if (!schemaMethod) {
      throw ModuleErrors.methodNotInSchema(method);
    }

    // Validate response type
    if (schemaMethod.response !== "stream") {
      throw ModuleErrors.methodNotStream(method, schemaMethod.response);
    }

    const requestId = this._allocateRequestId();

    // ⚠️ TODO: Implement Backpressure
    // Current implementation uses unbounded in-memory queue.
    // If child sends data faster than consumer processes it,
    // this queue will grow indefinitely and cause OOM.
    // For production use with large streams, implement credit-based backpressure.
    const queue: TChunk[] = [];
    let resolve: ((result: IteratorResult<TChunk>) => void) | null = null;
    let finished = false;
    let error: Error | null = null;

    // Register stream
    this._pendingStreams.set(requestId, {
      push: (chunk) => {
        if (resolve) {
          resolve({ value: chunk as TChunk, done: false });
          resolve = null;
        } else {
          queue.push(chunk as TChunk);
        }
      },
      end: () => {
        finished = true;
        if (resolve) resolve({ value: undefined as TChunk, done: true });
      },
      error: (err) => {
        error = err;
        if (resolve) resolve({ value: undefined as TChunk, done: true });
      },
      responseCodec: methodConfig.responseCodec,
    });

    // Abort handling. Keep a reference so the listener can be removed when the
    // stream finishes (see the finally block) instead of leaking on the signal.
    let abortCleanup: (() => void) | undefined;
    if (options?.signal && methodConfig.cancellable) {
      const signal = options.signal;
      const onAbort = (): void => {
        // Note: We don't await here as it's in event handler.
        this._sendAbort(requestId).catch(() => {
          // Ignore errors during abort
        });
        error = new DOMException("Aborted", "AbortError");
        if (resolve) resolve({ value: undefined as TChunk, done: true });
      };
      signal.addEventListener("abort", onAbort, { once: true });
      abortCleanup = (): void => signal.removeEventListener("abort", onAbort);
    }

    // Send request (with backpressure support)
    await this._sendFrame(methodId, requestId, data, methodConfig.requestCodec);

    // Yield chunks
    try {
      while (true) {
        // First drain the queue (important: check queue BEFORE finished flag)
        if (queue.length > 0) {
          yield queue.shift()!;
          continue;
        }

        // Queue is empty - check if we're done
        if (finished || error) break;

        // Wait for next chunk
        const result = await new Promise<IteratorResult<TChunk>>((r) => {
          resolve = r;
        });
        if (result.done) break;
        yield result.value;
      }
      if (error) throw error;
    } finally {
      this._pendingStreams.delete(requestId);
      abortCleanup?.();
    }
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
  // PRIVATE: Frame Handling
  // ═══════════════════════════════════════════════════════════════════════════

  private _handleFrame(frame: Frame): void {
    const { header } = frame;

    // Stream chunk (check BEFORE IS_RESPONSE because stream frames have both flags)
    if (header.requestId > 0 && hasFlag(header.flags, Flags.IS_STREAM)) {
      this._handleStreamChunk(frame);
      return;
    }

    // Response to pending request
    if (header.requestId > 0 && hasFlag(header.flags, Flags.IS_RESPONSE)) {
      this._handleResponse(frame);
      return;
    }

    // Event (requestId = 0, from child)
    if (header.requestId === 0 && hasFlag(header.flags, Flags.DIRECTION_TO_PARENT)) {
      this._handleEvent(frame);
      return;
    }
  }

  private _handleResponse(frame: Frame): void {
    const pending = this._pendingRequests.get(frame.header.requestId);
    if (!pending) {
      // Response arrived for unknown request - likely a race condition or duplicate
      return;
    }

    const isAckFrame = hasFlag(frame.header.flags, Flags.IS_ACK);

    // TASK-08: Strict response type handling
    // "result" methods expect full response, ignore ACK frames
    if (pending.expectedResponse === "result" && isAckFrame) {
      // Got ACK but expected full result - ignore, keep waiting
      return;
    }
    // "ack" methods accept both ACK and full response (graceful fallback)

    if (hasFlag(frame.header.flags, Flags.IS_ERROR)) {
      const errorData = codecDeserialize(pending.responseCodec, frame);
      pending.reject(ModuleErrors.remoteError(errorData));
    } else {
      const data = codecDeserialize(pending.responseCodec, frame);
      pending.resolve(data);
    }

    this._cleanupRequest(frame.header.requestId);
  }

  private _handleStreamChunk(frame: Frame): void {
    const stream = this._pendingStreams.get(frame.header.requestId);
    if (!stream) return;

    if (hasFlag(frame.header.flags, Flags.IS_ERROR)) {
      const errorData = codecDeserialize(stream.responseCodec, frame);
      stream.error(ModuleErrors.remoteError(errorData));
      return;
    }

    // STREAM_END frame has empty payload - just end without pushing
    if (hasFlag(frame.header.flags, Flags.STREAM_END)) {
      stream.end();
      return;
    }

    // Regular chunk - deserialize and push
    const data = codecDeserialize(stream.responseCodec, frame);
    stream.push(data);
  }

  private _handleEvent(frame: Frame): void {
    const eventName = this._eventIdToName.get(frame.header.methodId);
    if (!eventName) return;

    const eventConfig = this._events.get(eventName);
    if (!eventConfig) return;

    const data = codecDeserialize(eventConfig.codec, frame);
    this.emit(`event:${eventName}`, data);
  }

  /**
   * Acquire a header buffer from the ring buffer pool.
   * OPT-02: Allocation-free sends - reuse pre-allocated buffers.
   */
  private _acquireHeaderBuffer(): Buffer {
    const buffer = this._headerPool[this._headerPoolIndex]!;
    this._headerPoolIndex = (this._headerPoolIndex + 1) % HEADER_POOL_SIZE;
    return buffer;
  }

  /**
   * Send frame with backpressure support.
   * Bun sockets don't have cork/uncork, so we concatenate buffers instead.
   */
  private async _sendFrame(
    methodId: number,
    requestId: number,
    data: unknown,
    codec: Codec,
  ): Promise<void> {
    const payload = codec.serialize(data);

    // OPT-02: Ring buffer for allocation-free headers
    const headerBuf = this._acquireHeaderBuffer();

    encodeHeaderInto(headerBuf, {
      methodId,
      flags: 0,
      requestId,
      payloadLength: payload.length,
    });

    // Bun doesn't have cork/uncork, so concatenate buffers for atomic write
    const combined = Buffer.concat([headerBuf, payload]);
    const canContinue = this._socket!.write(combined);

    // OPT-04: Wait AFTER write if backpressure
    if (!canContinue) {
      this._drainWaiter!.markNeedsDrain();
      await this._drainWaiter!.waitForDrain();
    }
  }

  private async _sendAbort(requestId: number): Promise<void> {
    // OPT-02: Ring buffer for allocation-free headers
    const headerBuf = this._acquireHeaderBuffer();

    encodeHeaderInto(headerBuf, {
      methodId: ABORT_METHOD_ID,
      flags: 0,
      requestId,
      payloadLength: 0,
    });

    const canContinue = this._socket!.write(headerBuf);

    // Wait AFTER write if backpressure
    if (!canContinue) {
      this._drainWaiter!.markNeedsDrain();
      await this._drainWaiter!.waitForDrain();
    }
  }

  private _cleanupRequest(requestId: number): void {
    const pending = this._pendingRequests.get(requestId);
    if (pending?.timeout) clearTimeout(pending.timeout);
    pending?.abortCleanup?.();
    this._pendingRequests.delete(requestId);
  }

  private _ensureReady(): void {
    if (this._state !== "ready") {
      throw ModuleErrors.notReady(this.name, this._state);
    }
  }
}
