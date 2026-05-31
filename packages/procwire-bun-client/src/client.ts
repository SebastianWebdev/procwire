/**
 * Client class - Child-side API for Procwire IPC.
 *
 * This is the Bun.js optimized version using Bun.listen() for named pipe server.
 *
 * RESPONSIBILITIES:
 * - Register method handlers
 * - Register events
 * - Create named pipe server
 * - Send $init to parent
 * - Handle incoming requests
 * - Emit events to parent
 *
 * @module
 */

import { EventEmitter } from "node:events";
import {
  FrameBuffer,
  type Frame,
  Flags,
  encodeHeaderInto,
  HEADER_SIZE,
  HEADER_POOL_SIZE,
  ABORT_METHOD_ID,
} from "@procwire/protocol";
import { msgpackCodec, codecDeserialize, type Codec } from "@procwire/codecs";
import type { MethodDefinition, EventDefinition, MethodHandler, ClientOptions } from "./types.js";
import { RequestContextImpl } from "./request-context.js";
import { ClientErrors } from "./errors.js";
import { BunDrainWaiter } from "./drain-waiter.js";

// Bun types
type BunServer = ReturnType<typeof Bun.listen>;
type BunSocket = Awaited<ReturnType<typeof Bun.connect>>;

/**
 * Client - Child-side API for Procwire IPC.
 *
 * This is the Bun.js optimized version.
 *
 * @example
 * ```typescript
 * const client = new Client()
 *   .handle('query', async (data, ctx) => {
 *     const results = await search(data);
 *     ctx.respond(results);
 *   })
 *   .handle('insert', async (data, ctx) => {
 *     ctx.ack({ accepted: true });
 *     await processInBackground(data);
 *   })
 *   .event('progress');
 *
 * await client.start();
 *
 * // Emit events to parent
 * client.emitEvent('progress', { percent: 50 });
 * ```
 */
export class Client extends EventEmitter {
  private _defaultCodec: Codec;
  private readonly _maxPayloadSize?: number;
  private _methods = new Map<string, { def: MethodDefinition; handler: MethodHandler }>();
  private _events = new Map<string, EventDefinition>();

  private _server: BunServer | null = null;
  private _socket: BunSocket | null = null;
  private _frameBuffer: FrameBuffer | null = null;

  private _methodNameToId = new Map<string, number>();
  private _methodIdToName = new Map<number, string>();
  private _eventNameToId = new Map<string, number>();

  private _abortCallbacks = new Map<number, Set<() => void>>();
  private _activeContexts = new Map<number, RequestContextImpl>();
  private _started = false;

  // Ring buffer for headers (OPT-02: allocation-free sends)
  private readonly _headerPool = Array.from({ length: HEADER_POOL_SIZE }, () =>
    Buffer.allocUnsafe(HEADER_SIZE),
  );
  private _headerPoolIndex = 0;

  // OPT-04: Backpressure tracking via BunDrainWaiter
  private _drainWaiter: BunDrainWaiter | null = null;

  constructor(options?: ClientOptions) {
    super();
    this._defaultCodec = options?.defaultCodec ?? msgpackCodec;
    if (options?.maxPayloadSize !== undefined) {
      this._maxPayloadSize = options.maxPayloadSize;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BUILDER API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Register a method handler.
   *
   * @param method - Method name
   * @param handler - Handler function
   * @param options - Method configuration
   * @returns this for chaining
   *
   * @example
   * ```typescript
   * client.handle('query', async (data, ctx) => {
   *   ctx.respond({ results: [] });
   * });
   * ```
   */
  handle<TData = unknown>(
    method: string,
    handler: MethodHandler<TData>,
    options?: Partial<MethodDefinition> & { codec?: Codec },
  ): this {
    if (this._started) {
      throw ClientErrors.cannotAddHandlerAfterStart();
    }

    let requestCodec: Codec;
    let responseCodec: Codec;

    // Validate: partial dual-codec config is not allowed
    const hasRequestCodec = !!(options && "requestCodec" in options && options.requestCodec);
    const hasResponseCodec = !!(options && "responseCodec" in options && options.responseCodec);
    if (hasRequestCodec !== hasResponseCodec) {
      throw new Error("Both requestCodec and responseCodec must be provided together");
    }

    if (options?.requestCodec && options?.responseCodec) {
      requestCodec = options.requestCodec;
      responseCodec = options.responseCodec;
    } else if (options && "codec" in options && options.codec) {
      requestCodec = options.codec;
      responseCodec = options.codec;
    } else {
      requestCodec = this._defaultCodec;
      responseCodec = this._defaultCodec;
    }

    this._methods.set(method, {
      def: {
        response: options?.response ?? "result",
        requestCodec,
        responseCodec,
        cancellable: options?.cancellable ?? false,
      },
      handler: handler as MethodHandler,
    });

    return this;
  }

  /**
   * Register an event that can be emitted to parent.
   *
   * @param name - Event name
   * @param options - Event configuration
   * @returns this for chaining
   *
   * @example
   * ```typescript
   * client.event('progress');
   * client.event('status', { codec: arrowCodec });
   * ```
   */
  event(name: string, options?: Partial<EventDefinition>): this {
    if (this._started) {
      throw ClientErrors.cannotAddEventAfterStart();
    }

    this._events.set(name, {
      codec: options?.codec ?? this._defaultCodec,
    });

    return this;
  }

  /**
   * Start the client.
   *
   * Creates named pipe server using Bun.listen(), waits for server to be ready,
   * then sends $init to parent.
   *
   * @example
   * ```typescript
   * await client.start();
   * // Client is now ready to receive requests
   * ```
   */
  async start(): Promise<void> {
    if (this._started) {
      throw ClientErrors.alreadyStarted();
    }
    this._started = true;

    // Assign IDs to methods and events
    let methodId = 1;
    for (const name of this._methods.keys()) {
      this._methodNameToId.set(name, methodId);
      this._methodIdToName.set(methodId, name);
      methodId++;
    }

    let eventId = 1;
    for (const name of this._events.keys()) {
      this._eventNameToId.set(name, eventId);
      eventId++;
    }

    // Create pipe path
    const pipePath = this._generatePipePath();

    // Create server and wait for listen
    await this._createPipeServer(pipePath);

    // Send $init to parent (via stdout, JSON-RPC control plane)
    this._sendInit(pipePath);
  }

  /**
   * Emit an event to parent.
   *
   * @param eventName - Event name (must be registered with .event())
   * @param data - Event data
   * @returns Promise that resolves when the event has been written
   *          and socket buffer has drained (if backpressure occurred).
   *
   * @example
   * ```typescript
   * await client.emitEvent('progress', { percent: 50 });
   * ```
   */
  async emitEvent(eventName: string, data: unknown): Promise<void> {
    if (!this._socket) {
      throw ClientErrors.notConnected();
    }

    const eventId = this._eventNameToId.get(eventName);
    if (eventId === undefined) {
      throw ClientErrors.unknownEvent(eventName);
    }

    const eventDef = this._events.get(eventName)!;
    const codec = eventDef.codec ?? this._defaultCodec;

    await this._sendFrame(eventId, 0, data, codec, Flags.DIRECTION_TO_PARENT);
  }

  /**
   * Graceful shutdown.
   */
  async shutdown(): Promise<void> {
    this._socket?.end();
    this._server?.stop(true);
    this._drainWaiter?.clear();
    this._socket = null;
    this._server = null;
  }

  /**
   * Whether client is connected to parent.
   */
  get connected(): boolean {
    return this._socket !== null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL API (for RequestContextImpl)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * @internal Acquire a header buffer from the ring pool.
   */
  _acquireHeaderBuffer(): Buffer {
    const buffer = this._headerPool[this._headerPoolIndex]!;
    this._headerPoolIndex = (this._headerPoolIndex + 1) % HEADER_POOL_SIZE;
    return buffer;
  }

  /**
   * @internal Get the drain waiter instance.
   */
  _getDrainWaiter(): BunDrainWaiter | null {
    return this._drainWaiter;
  }

  /**
   * @internal Get the socket instance.
   */
  _getSocket(): BunSocket | null {
    return this._socket;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: Initialization
  // ═══════════════════════════════════════════════════════════════════════════

  private _generatePipePath(): string {
    const id = Math.random().toString(36).slice(2, 10);
    return process.platform === "win32"
      ? `\\\\.\\pipe\\procwire-${process.pid}-${id}`
      : `/tmp/procwire-${process.pid}-${id}.sock`;
  }

  private _createPipeServer(pipePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Create server using Bun.listen with unix socket
        this._server = Bun.listen({
          unix: pipePath,
          socket: {
            open: (socket: BunSocket) => {
              this._onConnectionOpen(socket);
            },
            data: (socket: BunSocket, data: Buffer) => {
              this._onSocketData(socket, data);
            },
            error: (_socket: BunSocket, err: Error) => {
              this._onSocketError(err);
            },
            close: (_socket: BunSocket) => {
              this._onConnectionClose();
            },
            drain: (_socket: BunSocket) => {
              // Backpressure released
              this._drainWaiter?.onDrain();
            },
          },
        });

        // Server is listening
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * @internal Handle a new parent connection.
   *
   * Single-parent model: the parent connects exactly once. Reject any extra or
   * stray connection rather than overwriting (and corrupting) the active
   * connection's in-flight state.
   */
  private _onConnectionOpen(socket: BunSocket): void {
    if (this._socket) {
      socket.end();
      return;
    }
    this._socket = socket;
    this._drainWaiter = new BunDrainWaiter();
    this._frameBuffer = new FrameBuffer(
      this._maxPayloadSize !== undefined ? { maxPayloadSize: this._maxPayloadSize } : {},
    );
  }

  /**
   * @internal Process inbound bytes into frames.
   *
   * Wrapped in try/catch so an oversized/invalid frame (e.g. a payload above
   * maxPayloadSize) drops the connection instead of throwing out of the socket
   * data handler and crashing the child.
   */
  private _onSocketData(socket: BunSocket, data: Buffer): void {
    if (!this._frameBuffer) return;
    let frames;
    try {
      frames = this._frameBuffer.push(data);
    } catch (err) {
      if (this.listenerCount("error") > 0) {
        this.emit("error", err as Error);
      }
      socket.end();
      return;
    }
    for (const frame of frames) {
      this._handleFrame(frame);
    }
  }

  /**
   * @internal Tear down per-connection state when the parent disconnects.
   *
   * In-flight requests are abandoned by the parent on disconnect, so we abort
   * their contexts, fire their onAbort callbacks (user cleanup: close cursors,
   * kill queries), drop all references so nothing leaks, and emit "disconnected".
   */
  private _onConnectionClose(): void {
    this._drainWaiter?.clear();

    for (const ctx of this._activeContexts.values()) {
      ctx._markAborted();
    }
    for (const callbacks of this._abortCallbacks.values()) {
      for (const cb of callbacks) {
        try {
          cb();
        } catch {
          /* ignore - user cleanup errors must not block teardown */
        }
      }
    }
    this._activeContexts.clear();
    this._abortCallbacks.clear();

    this._socket = null;
    this._frameBuffer = null;
    this._drainWaiter = null;

    this.emit("disconnected");
  }

  /**
   * @internal Handle a socket error.
   *
   * EventEmitter throws synchronously when "error" is emitted with no listener,
   * which would crash the whole child process. Only emit when someone is
   * listening; the subsequent "close" still drives disconnect handling.
   */
  private _onSocketError(err: Error): void {
    if (this.listenerCount("error") > 0) {
      this.emit("error", err);
    }
  }

  private _sendInit(pipePath: string): void {
    const schema = {
      methods: Object.fromEntries(
        Array.from(this._methods.entries()).map(([name, { def }]) => [
          name,
          {
            id: this._methodNameToId.get(name)!,
            response: def.response,
          },
        ]),
      ),
      events: Object.fromEntries(
        Array.from(this._events.keys()).map((name) => [
          name,
          { id: this._eventNameToId.get(name)! },
        ]),
      ),
    };

    const initMessage = {
      jsonrpc: "2.0",
      method: "$init",
      params: {
        pipe: pipePath,
        schema,
        version: "2.0.0",
      },
    };

    // Write to stdout (JSON-RPC control plane)
    console.log(JSON.stringify(initMessage));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: Frame Handling
  // ═══════════════════════════════════════════════════════════════════════════

  private _handleFrame(frame: Frame): void {
    const { header } = frame;

    // Abort signal (reserved methodId)
    if (header.methodId === ABORT_METHOD_ID) {
      this._handleAbort(header.requestId);
      return;
    }

    // Request from parent
    const methodName = this._methodIdToName.get(header.methodId);
    if (!methodName) {
      // Unknown method - send error response
      this._sendErrorResponse(
        header.requestId,
        header.methodId,
        `Unknown method ID: ${header.methodId}`,
      );
      return;
    }

    const methodEntry = this._methods.get(methodName);
    if (!methodEntry) return;

    const { def, handler } = methodEntry;
    const data = codecDeserialize(def.requestCodec, frame);

    // Create request context with RESPONSE codec (child→parent direction)
    const ctx = new RequestContextImpl(
      header.requestId,
      methodName,
      header.methodId,
      def.responseCodec,
      this._socket!,
      this._abortCallbacks,
      () => this._acquireHeaderBuffer(),
      this._drainWaiter!,
    );

    // Track active context for abort handling
    this._activeContexts.set(header.requestId, ctx);

    // Call handler
    try {
      const result = handler(data, ctx);
      if (result instanceof Promise) {
        result
          .catch((err) => {
            if (!ctx.responded) {
              // ctx.error() is async - fire and forget with error handling
              ctx.error(err).catch(() => {
                /* ignore - socket may be closed */
              });
            }
          })
          .finally(() => {
            this._activeContexts.delete(header.requestId);
          });
      } else {
        this._activeContexts.delete(header.requestId);
      }
    } catch (err) {
      if (!ctx.responded) {
        // ctx.error() is async - fire and forget with error handling
        ctx.error(err as Error).catch(() => {
          /* ignore - socket may be closed */
        });
      }
      this._activeContexts.delete(header.requestId);
    }
  }

  private _handleAbort(requestId: number): void {
    // Mark context as aborted
    const ctx = this._activeContexts.get(requestId);
    if (ctx) {
      ctx._markAborted();
    }

    // Call abort callbacks
    const callbacks = this._abortCallbacks.get(requestId);
    if (callbacks) {
      for (const cb of callbacks) {
        try {
          cb();
        } catch {
          /* ignore */
        }
      }
      this._abortCallbacks.delete(requestId);
    }
  }

  private _sendErrorResponse(requestId: number, methodId: number, message: string): void {
    if (!this._socket) return;

    const payload = this._defaultCodec.serialize(message);
    const headerBuf = this._acquireHeaderBuffer();

    encodeHeaderInto(headerBuf, {
      methodId,
      flags: Flags.IS_RESPONSE | Flags.IS_ERROR | Flags.DIRECTION_TO_PARENT,
      requestId,
      payloadLength: payload.length,
    });

    // Bun doesn't have cork/uncork, concatenate for atomic write
    const combined = Buffer.concat([headerBuf, payload]);
    this._socket.write(combined);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: Frame Sending
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Send a frame with proper backpressure handling.
   * Used for emitting events to parent.
   *
   * Bun sockets don't have cork/uncork, so we concatenate buffers.
   */
  private async _sendFrame(
    methodId: number,
    requestId: number,
    data: unknown,
    codec: Codec,
    flags: number,
  ): Promise<void> {
    if (!this._socket || !this._drainWaiter) return;

    const payload = codec.serialize(data);
    const headerBuf = this._acquireHeaderBuffer();

    encodeHeaderInto(headerBuf, {
      methodId,
      flags,
      requestId,
      payloadLength: payload.length,
    });

    // Bun doesn't have cork/uncork, concatenate for atomic write
    const combined = Buffer.concat([headerBuf, payload]);
    const canContinue = this._socket.write(combined);

    // OPT-04: Wait AFTER write if backpressure
    if (!canContinue) {
      this._drainWaiter.markNeedsDrain();
      await this._drainWaiter.waitForDrain();
    }
  }
}
