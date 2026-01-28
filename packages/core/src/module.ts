/**
 * Module class - Represents a worker process with configuration and communication.
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
import type { Socket } from "node:net";
import type { ChildProcess } from "node:child_process";
import { FrameBuffer, type Frame, buildFrameBuffers, hasFlag, Flags } from "@procwire/protocol";
import { codecDeserialize, msgpackCodec, type Codec } from "@procwire/codecs";
import type {
  ModuleState,
  ExecutableConfig,
  MethodConfig,
  EventConfig,
  SpawnPolicy,
  ModuleSchema,
} from "./types.js";

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout> | null;
  codec: Codec;
}

interface PendingStream {
  push: (chunk: unknown) => void;
  end: () => void;
  error: (err: Error) => void;
  codec: Codec;
}

// ═══════════════════════════════════════════════════════════════════════════
// MODULE CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Module - Represents a worker process with configuration and communication.
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
  private _process: ChildProcess | null = null;
  private _socket: Socket | null = null;
  private _frameBuffer: FrameBuffer | null = null;
  private _childSchema: ModuleSchema | null = null;

  // Request tracking
  private _nextRequestId = 1;
  private _pendingRequests = new Map<number, PendingRequest>();
  private _pendingStreams = new Map<number, PendingStream>();

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

  get process(): ChildProcess | null {
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
    this.emit("state", state);
  }

  /**
   * @internal Called by ModuleManager to attach child process.
   */
  _attachProcess(process: ChildProcess): void {
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
  _attachDataChannel(socket: Socket): void {
    this._socket = socket;
    this._frameBuffer = new FrameBuffer(
      this._maxPayloadSize !== undefined ? { maxPayloadSize: this._maxPayloadSize } : {},
    );

    // Setup frame handling
    socket.on("data", (chunk: Buffer) => {
      const frames = this._frameBuffer!.push(chunk);
      for (const frame of frames) {
        this._handleFrame(frame);
      }
    });

    socket.on("error", (err: Error) => {
      this.emit("error", err);
    });

    socket.on("close", () => {
      if (this._state === "ready") {
        this._setState("disconnected");
        this.emit("disconnected");
      }
    });
  }

  /**
   * @internal Called by ModuleManager on shutdown/crash.
   */
  _detach(): void {
    // Reject all pending requests
    for (const [_id, pending] of this._pendingRequests) {
      pending.reject(new Error("Module disconnected"));
      if (pending.timeout) clearTimeout(pending.timeout);
    }
    this._pendingRequests.clear();

    // Error all pending streams
    for (const [_id, stream] of this._pendingStreams) {
      stream.error(new Error("Module disconnected"));
    }
    this._pendingStreams.clear();

    // Clear connection state
    this._socket?.destroy();
    this._socket = null;
    this._frameBuffer?.clear();
    this._frameBuffer = null;
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
      throw new Error(`Module "${this.name}": executable not configured`);
    }
    if (this._methods.size === 0) {
      throw new Error(`Module "${this.name}": no methods registered`);
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
      throw new Error(`Unknown method: ${method}`);
    }

    const methodId = this._methodNameToId.get(method);
    if (methodId === undefined) {
      throw new Error(`Method "${method}" not registered by child`);
    }

    const schemaMethod = this._childSchema!.methods[method];
    if (!schemaMethod) {
      throw new Error(`Method "${method}" not in child schema`);
    }

    // Validate response type
    if (schemaMethod.response === "stream") {
      throw new Error(`Method "${method}" returns a stream. Use .stream() instead of .send().`);
    }

    // Fire-and-forget
    if (schemaMethod.response === "none") {
      this._sendFrame(methodId, 0, data, methodConfig.codec);
      return undefined as TResponse;
    }

    const requestId = this._nextRequestId++;

    // Abort handling
    if (options?.signal && methodConfig.cancellable) {
      options.signal.addEventListener(
        "abort",
        () => {
          this._sendAbort(requestId);
          const pending = this._pendingRequests.get(requestId);
          if (pending) {
            pending.reject(new DOMException("Aborted", "AbortError"));
            this._cleanupRequest(requestId);
          }
        },
        { once: true },
      );
    }

    // Send frame
    this._sendFrame(methodId, requestId, data, methodConfig.codec);

    // Wait for response
    return new Promise<TResponse>((resolve, reject) => {
      const timeout = schemaMethod.timeout ?? methodConfig.timeout;
      const timer = timeout
        ? setTimeout(() => {
            this._cleanupRequest(requestId);
            reject(new Error(`Timeout waiting for response from "${method}"`));
          }, timeout)
        : null;

      this._pendingRequests.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout: timer,
        codec: methodConfig.codec,
      });
    });
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
      throw new Error(`Unknown method: ${method}`);
    }

    const methodId = this._methodNameToId.get(method);
    if (methodId === undefined) {
      throw new Error(`Method "${method}" not registered by child`);
    }

    const schemaMethod = this._childSchema!.methods[method];
    if (!schemaMethod) {
      throw new Error(`Method "${method}" not in child schema`);
    }

    // Validate response type
    if (schemaMethod.response !== "stream") {
      throw new Error(
        `Method "${method}" does not return a stream (response: "${schemaMethod.response}"). ` +
          `Use .send() instead of .stream().`,
      );
    }

    const requestId = this._nextRequestId++;

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
      codec: methodConfig.codec,
    });

    // Abort handling
    if (options?.signal && methodConfig.cancellable) {
      options.signal.addEventListener(
        "abort",
        () => {
          this._sendAbort(requestId);
          error = new DOMException("Aborted", "AbortError");
          if (resolve) resolve({ value: undefined as TChunk, done: true });
        },
        { once: true },
      );
    }

    // Send request
    this._sendFrame(methodId, requestId, data, methodConfig.codec);

    // Yield chunks
    try {
      while (!finished && !error) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else {
          const result = await new Promise<IteratorResult<TChunk>>((r) => {
            resolve = r;
          });
          if (result.done) break;
          yield result.value;
        }
      }
      if (error) throw error;
    } finally {
      this._pendingStreams.delete(requestId);
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
      throw new Error(`Unknown event: ${eventName}`);
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

    // Response to pending request
    if (header.requestId > 0 && hasFlag(header.flags, Flags.IS_RESPONSE)) {
      this._handleResponse(frame);
      return;
    }

    // Stream chunk
    if (header.requestId > 0 && hasFlag(header.flags, Flags.IS_STREAM)) {
      this._handleStreamChunk(frame);
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
    if (!pending) return;

    if (hasFlag(frame.header.flags, Flags.IS_ERROR)) {
      const errorData = codecDeserialize(pending.codec, frame);
      pending.reject(new Error(String(errorData)));
    } else {
      const data = codecDeserialize(pending.codec, frame);
      pending.resolve(data);
    }

    this._cleanupRequest(frame.header.requestId);
  }

  private _handleStreamChunk(frame: Frame): void {
    const stream = this._pendingStreams.get(frame.header.requestId);
    if (!stream) return;

    if (hasFlag(frame.header.flags, Flags.IS_ERROR)) {
      const errorData = codecDeserialize(stream.codec, frame);
      stream.error(new Error(String(errorData)));
      return;
    }

    const data = codecDeserialize(stream.codec, frame);
    stream.push(data);

    if (hasFlag(frame.header.flags, Flags.STREAM_END)) {
      stream.end();
    }
  }

  private _handleEvent(frame: Frame): void {
    const eventName = this._eventIdToName.get(frame.header.methodId);
    if (!eventName) return;

    const eventConfig = this._events.get(eventName);
    if (!eventConfig) return;

    const data = codecDeserialize(eventConfig.codec, frame);
    this.emit(`event:${eventName}`, data);
  }

  private _sendFrame(methodId: number, requestId: number, data: unknown, codec: Codec): void {
    const payload = codec.serialize(data);

    // ⚡ ZERO-COPY: Use buildFrameBuffers + cork/uncork
    // This avoids Buffer.concat for large payloads (critical for 100MB+)
    const [headerBuf, payloadBuf] = buildFrameBuffers({ methodId, flags: 0, requestId }, payload);

    // Cork groups multiple writes into single syscall
    this._socket!.cork();
    this._socket!.write(headerBuf); // 11 bytes
    this._socket!.write(payloadBuf); // payload (potentially GB)
    this._socket!.uncork(); // flush
  }

  private _sendAbort(requestId: number): void {
    const [headerBuf, payloadBuf] = buildFrameBuffers(
      { methodId: 0xffff, flags: 0, requestId },
      Buffer.alloc(0),
    );
    this._socket!.cork();
    this._socket!.write(headerBuf);
    this._socket!.write(payloadBuf);
    this._socket!.uncork();
  }

  private _cleanupRequest(requestId: number): void {
    const pending = this._pendingRequests.get(requestId);
    if (pending?.timeout) clearTimeout(pending.timeout);
    this._pendingRequests.delete(requestId);
  }

  private _ensureReady(): void {
    if (this._state !== "ready") {
      throw new Error(`Module "${this.name}" is not ready (state: ${this._state})`);
    }
  }
}
