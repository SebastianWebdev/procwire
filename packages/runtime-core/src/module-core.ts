/**
 * ModuleCore - the runtime-agnostic half of the parent-side Module.
 *
 * Owns ALL protocol logic: builder configuration, correlation maps, frame
 * dispatch (_handleFrame/_handleResponse/_handleStreamChunk/_handleEvent),
 * request-id allocation, abort bookkeeping, the stream generator with
 * HWM/LWM socket-pause backpressure, and timeout precedence.
 *
 * What it deliberately does NOT own (runtime adapters do):
 * - process spawn/exit wiring (ModuleManager adapters)
 * - socket lifecycle and identity checks (Module adapters)
 * - drain delivery (socket event -> transport.handleDrain())
 *
 * The data plane is reached exclusively through a FrameTransport, so this
 * logic exists exactly once for Node and Bun.
 *
 * @module
 */

import { EventEmitter } from "node:events";
import {
  FrameBuffer,
  type Frame,
  type FrameTransport,
  hasFlag,
  Flags,
  HEADER_SIZE,
  ABORT_METHOD_ID,
  encodeHeaderInto,
} from "@procwire/protocol";
import {
  codecDeserialize,
  msgpackCodec,
  type Codec,
  type Schema,
  type EmptySchema,
} from "@procwire/codecs";
import type {
  ModuleState,
  ExecutableConfig,
  MethodConfig,
  EventConfig,
  SpawnPolicy,
  ModuleSchema,
  ResponseType,
} from "./types.js";
import type {
  AddMethod,
  AddMethodSymmetric,
  AddEvent,
  SendReturn,
  MethodsWithResponseType,
  MethodsWithoutResponseType,
  DualCodecMethodConfig,
  SingleCodecMethodConfig,
  TypedEventConfig,
} from "./schema-types.js";
import { ModuleErrors } from "./errors.js";
import { ModuleEvents } from "./events.js";

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

/**
 * Default per-request timeout (ms) applied to result/ack methods when neither
 * the child schema nor the method config specify one. Prevents send() from
 * hanging forever. Override per-method (`timeout`) or per-module
 * (`.requestTimeout()`); a value of 0 disables the timeout.
 */
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/**
 * Stream consumer-queue backpressure thresholds (in buffered chunks).
 *
 * When a stream's buffered queue grows past the high-water mark, the socket is
 * paused so the child stops producing (TCP backpressure). It is resumed once
 * the consumer drains the queue back below the low-water mark. This bounds
 * memory use when the consumer is slower than the producer.
 */
const STREAM_BACKPRESSURE_HIGH_WATER_MARK = 256;
const STREAM_BACKPRESSURE_LOW_WATER_MARK = 64;

const EMPTY_PAYLOAD = Buffer.alloc(0);

// ═══════════════════════════════════════════════════════════════════════════
// MODULE CORE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ModuleCore - shared parent-side Module logic.
 *
 * The runtime packages subclass this (`Module` in @procwire/core and
 * @procwire/bun-core), adding only socket/process attachment.
 *
 * @typeParam S - Accumulated schema (builder pattern)
 * @typeParam TProcess - Runtime process handle (ChildProcess / Bun.Subprocess)
 */
export class ModuleCore<S extends Schema = EmptySchema, TProcess = unknown> extends EventEmitter {
  declare readonly __schema: S;

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
  private _process: TProcess | null = null;
  private _transport: FrameTransport | null = null;
  private _frameBuffer: FrameBuffer | null = null;
  private _childSchema: ModuleSchema | null = null;

  // Request tracking
  private _nextRequestId = 1;
  private _pendingRequests = new Map<number, PendingRequest>();
  private _pendingStreams = new Map<number, PendingStream>();

  // Receive-side backpressure: number of streams currently requesting a socket
  // pause. The socket is paused while this is > 0 (see _pause/_resumeForBackpressure).
  private _socketPauseCount = 0;

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
   * Register a method with dual codecs (full control).
   *
   * Use when request and response need different codecs,
   * or when using asymmetric codecs like Arrow.
   */
  method<
    const N extends string,
    CReq extends Codec,
    CRes extends Codec,
    const RT extends ResponseType = "result",
  >(
    name: N,
    config: DualCodecMethodConfig<CReq, CRes> & { response?: RT },
  ): ModuleCore<AddMethod<S, N, CReq, CRes, RT>, TProcess>;

  /**
   * Register a method with a single codec (symmetric shorthand).
   */
  method<const N extends string, C extends Codec = Codec, const RT extends ResponseType = "result">(
    name: N,
    config?: SingleCodecMethodConfig<C> & { response?: RT },
  ): ModuleCore<AddMethodSymmetric<S, N, C, RT>, TProcess>;

  /**
   * Register a method (implementation).
   */
  method(
    name: string,
    config:
      | (DualCodecMethodConfig & { response?: ResponseType })
      | (SingleCodecMethodConfig & { response?: ResponseType })
      | undefined = undefined,
  ): ModuleCore<Schema, TProcess> {
    let requestCodec: Codec;
    let responseCodec: Codec;

    // Validate: partial dual-codec config is not allowed
    const hasRequestCodec = !!(config && "requestCodec" in config && config.requestCodec);
    const hasResponseCodec = !!(config && "responseCodec" in config && config.responseCodec);
    if (hasRequestCodec !== hasResponseCodec) {
      throw new Error("Both requestCodec and responseCodec must be provided together");
    }

    if (
      config &&
      "requestCodec" in config &&
      "responseCodec" in config &&
      config.requestCodec &&
      config.responseCodec
    ) {
      // Dual-codec config
      requestCodec = config.requestCodec;
      responseCodec = config.responseCodec;
    } else if (config && "codec" in config && config.codec) {
      // Single-codec shorthand
      requestCodec = config.codec;
      responseCodec = config.codec;
    } else {
      // Default codec
      requestCodec = msgpackCodec;
      responseCodec = msgpackCodec;
    }

    this._methods.set(name, {
      requestCodec,
      responseCodec,
      response: config?.response ?? "result",
      timeout: config?.timeout,
      cancellable: config?.cancellable ?? false,
    });

    return this as ModuleCore<Schema, TProcess>;
  }

  /**
   * Register an event.
   */
  event<const N extends string, C extends Codec = Codec>(
    name: N,
    config: TypedEventConfig<C> = {} as TypedEventConfig<C>,
  ): ModuleCore<AddEvent<S, N, C>, TProcess> {
    this._events.set(name, {
      codec: config.codec ?? msgpackCodec,
    });
    return this as unknown as ModuleCore<AddEvent<S, N, C>, TProcess>;
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

  get process(): TProcess | null {
    return this._process;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL API (called by ModuleManager / runtime adapters)
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
  _attachProcess(process: TProcess): void {
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
   * @internal Called by the runtime adapter to attach the data channel.
   * The adapter wraps its socket in a FrameTransport and wires the socket's
   * inbound events to _handleTransportData/-Error/-Close.
   */
  _attachTransport(transport: FrameTransport): void {
    this._transport = transport;
    this._frameBuffer = new FrameBuffer(
      this._maxPayloadSize !== undefined ? { maxPayloadSize: this._maxPayloadSize } : {},
    );
  }

  /**
   * @internal Inbound bytes from the runtime adapter.
   *
   * A framing error (e.g. payload over maxPayloadSize) poisons the byte
   * stream: drop the connection instead of throwing out of the socket data
   * handler, which would be an uncaughtException in the parent - the
   * supervisor of every module.
   */
  _handleTransportData(chunk: Buffer): void {
    // Guard: a late "data" event can fire after _detach() niled the buffer.
    if (!this._frameBuffer) return;

    let frames;
    try {
      frames = this._frameBuffer.push(chunk);
    } catch (err) {
      if (this.listenerCount(ModuleEvents.ERROR) > 0) {
        this.emit(ModuleEvents.ERROR, err as Error);
      }
      this._transport?.close();
      return;
    }

    for (const frame of frames) {
      // Per-frame handler errors (e.g. a corrupt payload rejected inside
      // _handleResponse) must not kill the parent either; the framing is
      // still aligned, so the connection stays up.
      try {
        this._handleFrame(frame);
      } catch (err) {
        if (this.listenerCount(ModuleEvents.ERROR) > 0) {
          this.emit(ModuleEvents.ERROR, err as Error);
        }
      }
    }
  }

  /**
   * @internal Socket error from the runtime adapter.
   *
   * EventEmitter throws synchronously when "error" is emitted with no
   * listener, which would crash the whole parent process. Only emit when
   * someone is listening; an unobserved socket error is still surfaced via
   * the subsequent close -> "disconnected" transition.
   */
  _handleTransportError(err: Error): void {
    if (this.listenerCount(ModuleEvents.ERROR) > 0) {
      this.emit(ModuleEvents.ERROR, err);
    }
  }

  /**
   * @internal Socket close from the runtime adapter.
   */
  _handleTransportClose(): void {
    if (this._state === "ready") {
      this._setState("disconnected");
      this.emit(ModuleEvents.DISCONNECTED);
    }
  }

  /**
   * @internal Runtime hook: release adapter-held connection resources
   * (socket listeners / identity references) before the transport closes.
   */
  protected _teardownDataChannel(): void {
    // Default: nothing - adapters override.
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

    // Let the adapter remove its socket listeners BEFORE the transport tears
    // the socket down, so a late "data"/"error"/"close" event cannot fire
    // against torn-down state and the closures don't leak across restarts.
    this._teardownDataChannel();
    this._transport?.close();
    this._transport = null;
    this._frameBuffer?.clear();
    this._frameBuffer = null;
    this._process = null;

    // Clear lookups
    this._methodNameToId.clear();
    this._methodIdToName.clear();
    this._eventIdToName.clear();
    this._childSchema = null;

    // Reset backpressure state
    this._socketPauseCount = 0;
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
  async send<M extends MethodsWithoutResponseType<S, "stream"> & string>(
    method: M,
    data: S["methods"][M]["reqIn"],
    options?: { signal?: AbortSignal },
  ): Promise<SendReturn<S["methods"][M]["resOut"], S["methods"][M]["responseType"]>>;
  async send<TResponse = unknown, TRequest = unknown>(
    method: string,
    data: TRequest,
    options?: { signal?: AbortSignal },
  ): Promise<TResponse>;
  async send(method: string, data: unknown, options?: { signal?: AbortSignal }): Promise<unknown> {
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
      return undefined;
    }

    const requestId = this._allocateRequestId();

    // Abort handling. Keep a reference to the listener so it can be removed
    // when the request settles normally - otherwise a reused long-lived signal
    // accumulates listeners.
    let abortCleanup: (() => void) | undefined;
    const signal = options?.signal;
    if (signal && methodConfig.cancellable) {
      const onAbort = (): void => {
        // Note: best-effort; we don't await in an event handler.
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
    const responsePromise = new Promise<unknown>((resolve, reject) => {
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
    try {
      await this._sendFrame(methodId, requestId, data, methodConfig.requestCodec);
    } catch (error) {
      // The request never hit the wire. Drop the pending entry NOW: otherwise
      // its timeout timer (or a later _detach) would reject responsePromise,
      // which no caller observes -> unhandled rejection -> process death.
      this._cleanupRequest(requestId);
      throw error;
    }

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
  stream<M extends MethodsWithResponseType<S, "stream"> & string>(
    method: M,
    data: S["methods"][M]["reqIn"],
    options?: { signal?: AbortSignal },
  ): AsyncGenerator<S["methods"][M]["resOut"]>;
  stream<TChunk = unknown, TRequest = unknown>(
    method: string,
    data: TRequest,
    options?: { signal?: AbortSignal },
  ): AsyncGenerator<TChunk>;
  async *stream(
    method: string,
    data: unknown,
    options?: { signal?: AbortSignal },
  ): AsyncGenerator<unknown> {
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

    // Receive-side backpressure: if the consumer falls behind, the queue is
    // bounded by pausing the socket (see _pause/_resumeSocketForBackpressure).
    const queue: unknown[] = [];
    let resolve: ((result: IteratorResult<unknown>) => void) | null = null;
    let finished = false;
    let error: Error | null = null;
    let backpressured = false;

    // Register stream
    this._pendingStreams.set(requestId, {
      push: (chunk) => {
        if (resolve) {
          resolve({ value: chunk, done: false });
          resolve = null;
        } else {
          queue.push(chunk);
          // Consumer is behind: pause the socket once we cross the high-water mark.
          if (!backpressured && queue.length >= STREAM_BACKPRESSURE_HIGH_WATER_MARK) {
            backpressured = true;
            this._pauseSocketForBackpressure();
          }
        }
      },
      end: () => {
        finished = true;
        if (resolve) resolve({ value: undefined, done: true });
      },
      error: (err) => {
        error = err;
        if (resolve) resolve({ value: undefined, done: true });
      },
      responseCodec: methodConfig.responseCodec,
    });

    // Abort handling. Keep a reference so the listener can be removed when the
    // stream finishes (see the finally block) instead of leaking on the signal.
    let abortCleanup: (() => void) | undefined;
    const signal = options?.signal;
    if (signal && methodConfig.cancellable) {
      const onAbort = (): void => {
        // Note: best-effort; we don't await in an event handler.
        this._sendAbort(requestId).catch(() => {
          // Ignore errors during abort
        });
        error = new DOMException("Aborted", "AbortError");
        if (resolve) resolve({ value: undefined, done: true });
      };
      signal.addEventListener("abort", onAbort, { once: true });
      abortCleanup = (): void => signal.removeEventListener("abort", onAbort);
    }

    // Send request (with backpressure support)
    try {
      await this._sendFrame(methodId, requestId, data, methodConfig.requestCodec);
    } catch (sendError) {
      // The request never hit the wire: release the stream entry and the
      // abort listener registered above, or they leak until _detach.
      this._pendingStreams.delete(requestId);
      abortCleanup?.();
      throw sendError;
    }

    // Yield chunks
    try {
      while (true) {
        // First drain the queue (important: check queue BEFORE finished flag)
        if (queue.length > 0) {
          yield queue.shift()!;
          // Consumer caught up: resume the socket once we drop below low-water.
          if (backpressured && queue.length <= STREAM_BACKPRESSURE_LOW_WATER_MARK) {
            backpressured = false;
            this._resumeSocketForBackpressure();
          }
          continue;
        }

        // Queue is empty - check if we're done
        if (finished || error) break;

        // Wait for next chunk
        const result = await new Promise<IteratorResult<unknown>>((r) => {
          resolve = r;
        });
        if (result.done) break;
        yield result.value;
      }
      if (error) throw error;
    } finally {
      this._pendingStreams.delete(requestId);
      abortCleanup?.();
      // Release any backpressure this stream was holding on the shared socket.
      if (backpressured) {
        backpressured = false;
        this._resumeSocketForBackpressure();
      }
    }
  }

  /**
   * Listen for events from module.
   *
   * @param eventName - Event name
   * @param handler - Handler function
   * @returns Unsubscribe function
   */
  onEvent<E extends string & keyof S["events"]>(
    eventName: E,
    handler: (data: S["events"][E]["dataOut"]) => void,
  ): () => void;
  onEvent<T = unknown>(eventName: string, handler: (data: T) => void): () => void;
  onEvent(eventName: string, handler: (data: unknown) => void): () => void {
    const eventConfig = this._events.get(eventName);
    if (!eventConfig) {
      throw ModuleErrors.unknownEvent(eventName);
    }

    const wrappedHandler = (data: unknown) => handler(data);
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

    // A corrupt payload must reject THIS request (the caller gets the decode
    // error now instead of waiting out the timeout) - and must not escape
    // into the socket data handler.
    if (hasFlag(frame.header.flags, Flags.IS_ERROR)) {
      let errorData: unknown;
      try {
        errorData = codecDeserialize(pending.responseCodec, frame);
      } catch (decodeError) {
        pending.reject(decodeError as Error);
        this._cleanupRequest(frame.header.requestId);
        return;
      }
      pending.reject(ModuleErrors.remoteError(errorData));
    } else {
      let data: unknown;
      try {
        data = codecDeserialize(pending.responseCodec, frame);
      } catch (decodeError) {
        pending.reject(decodeError as Error);
        this._cleanupRequest(frame.header.requestId);
        return;
      }
      pending.resolve(data);
    }

    this._cleanupRequest(frame.header.requestId);
  }

  private _handleStreamChunk(frame: Frame): void {
    const stream = this._pendingStreams.get(frame.header.requestId);
    if (!stream) return;

    if (hasFlag(frame.header.flags, Flags.IS_ERROR)) {
      let errorData: unknown;
      try {
        errorData = codecDeserialize(stream.responseCodec, frame);
      } catch (decodeError) {
        stream.error(decodeError as Error);
        return;
      }
      stream.error(ModuleErrors.remoteError(errorData));
      return;
    }

    // STREAM_END frame has empty payload - just end without pushing
    if (hasFlag(frame.header.flags, Flags.STREAM_END)) {
      stream.end();
      return;
    }

    // Regular chunk - deserialize and push. A corrupt chunk errors THIS
    // stream (consumer sees the decode failure) instead of crashing the
    // parent's receive loop.
    let data: unknown;
    try {
      data = codecDeserialize(stream.responseCodec, frame);
    } catch (decodeError) {
      stream.error(decodeError as Error);
      return;
    }
    stream.push(data);
  }

  private _handleEvent(frame: Frame): void {
    const eventName = this._eventIdToName.get(frame.header.methodId);
    if (!eventName) return;

    const eventConfig = this._events.get(eventName);
    if (!eventConfig) return;

    // A corrupt event payload is dropped (surfaced via "error" when someone
    // listens) - events have no caller to reject.
    let data: unknown;
    try {
      data = codecDeserialize(eventConfig.codec, frame);
    } catch (decodeError) {
      if (this.listenerCount(ModuleEvents.ERROR) > 0) {
        this.emit(ModuleEvents.ERROR, decodeError as Error);
      }
      return;
    }
    this.emit(`event:${eventName}`, data);
  }

  /**
   * Allocate the next correlation id.
   *
   * requestId is a uint32 on the wire. The counter wraps within [1, 0xFFFFFFFF]
   * and skips 0, which is reserved for fire-and-forget requests and events.
   * Without wrapping, writeUInt32BE would throw RangeError after 2^32 requests.
   */
  private _allocateRequestId(): number {
    const id = this._nextRequestId;
    this._nextRequestId = id >= 0xffffffff ? 1 : id + 1;
    return id;
  }

  /**
   * Pause the socket on behalf of a lagging stream consumer.
   *
   * The socket is shared by all streams/requests on this module, so pauses are
   * ref-counted: the socket is paused on the first request and only resumed
   * once every requester has released (see _resumeSocketForBackpressure).
   */
  private _pauseSocketForBackpressure(): void {
    this._socketPauseCount++;
    if (this._socketPauseCount === 1) {
      this._transport?.pause();
    }
  }

  /**
   * Release a backpressure pause; resume the socket when none remain.
   */
  private _resumeSocketForBackpressure(): void {
    if (this._socketPauseCount === 0) return;
    this._socketPauseCount--;
    if (this._socketPauseCount === 0) {
      this._transport?.resume();
    }
  }

  /**
   * Send a frame through the transport; resolves once the bytes are fully
   * handed to the OS (after any backpressure drained).
   *
   * The header buffer is freshly allocated and owned by this call, so the
   * transport can write it without a defensive copy (Node) or hold it across
   * a drain wait (Bun).
   */
  private async _sendFrame(
    methodId: number,
    requestId: number,
    data: unknown,
    codec: Codec,
  ): Promise<void> {
    const payload = codec.serialize(data);
    const headerBuf = Buffer.allocUnsafe(HEADER_SIZE);

    encodeHeaderInto(headerBuf, {
      methodId,
      flags: 0,
      requestId,
      payloadLength: payload.length,
    });

    await this._transport!.writeFrame(headerBuf, payload);
  }

  private async _sendAbort(requestId: number): Promise<void> {
    const headerBuf = Buffer.allocUnsafe(HEADER_SIZE);

    encodeHeaderInto(headerBuf, {
      methodId: ABORT_METHOD_ID,
      flags: 0,
      requestId,
      payloadLength: 0,
    });

    await this._transport!.writeFrame(headerBuf, EMPTY_PAYLOAD);
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
