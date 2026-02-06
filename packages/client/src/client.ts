/**
 * Client class - Child-side API for Procwire IPC.
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
import { createServer, type Server, type Socket } from "node:net";
import {
  FrameBuffer,
  type Frame,
  Flags,
  encodeHeaderInto,
  HEADER_SIZE,
  HEADER_POOL_SIZE,
  ABORT_METHOD_ID,
  DrainWaiter,
} from "@procwire/protocol";
import {
  msgpackCodec,
  codecDeserialize,
  type Codec,
  type Schema,
  type EmptySchema,
} from "@procwire/codecs";
import type {
  MethodDefinition,
  EventDefinition,
  MethodHandler,
  ClientOptions,
  TypedRequestContext,
} from "./types.js";
import { RequestContextImpl } from "./request-context.js";
import { ClientErrors } from "./errors.js";
import type { ResponseType } from "./types.js";

/**
 * Options for `client.handle()`.
 *
 * Supports three codec patterns:
 * - `{ codec }` — single codec for both request and response
 * - `{ requestCodec, responseCodec }` — dual codecs
 * - neither — uses default codec
 */
interface HandleOptions {
  response?: ResponseType;
  cancellable?: boolean;
  codec?: Codec;
  requestCodec?: Codec;
  responseCodec?: Codec;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Client - Child-side API for Procwire IPC.
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
export class Client<S extends Schema = EmptySchema> extends EventEmitter {
  declare readonly __schema: S;

  private _defaultCodec: Codec;
  private _methods = new Map<string, { def: MethodDefinition; handler: MethodHandler }>();
  private _events = new Map<string, EventDefinition>();

  private _server: Server | null = null;
  private _socket: Socket | null = null;
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

  // OPT-04: Backpressure tracking via singleton DrainWaiter
  private _drainWaiter: DrainWaiter | null = null;

  constructor(options?: ClientOptions) {
    super();
    this._defaultCodec = options?.defaultCodec ?? msgpackCodec;
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
  handle<M extends string & keyof S["methods"]>(
    method: M,
    handler: (
      data: S["methods"][M]["reqOut"],
      ctx: TypedRequestContext<S["methods"][M]["resIn"]>,
    ) => void | Promise<void>,
    options?: HandleOptions,
  ): this;
  handle<TData = unknown>(
    method: string,
    handler: MethodHandler<TData>,
    options?: HandleOptions,
  ): this;
  handle(method: string, handler: MethodHandler, options?: HandleOptions): this {
    if (this._started) {
      throw ClientErrors.cannotAddHandlerAfterStart();
    }

    let requestCodec: Codec;
    let responseCodec: Codec;

    // Validate: partial dual-codec config is not allowed
    const hasRequestCodec = options && "requestCodec" in options;
    const hasResponseCodec = options && "responseCodec" in options;
    if (hasRequestCodec !== hasResponseCodec) {
      throw new Error("Both requestCodec and responseCodec must be provided together");
    }

    if (options && "requestCodec" in options && "responseCodec" in options) {
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
   * Creates named pipe server, waits for listen, then sends $init to parent.
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
  async emitEvent<E extends string & keyof S["events"]>(
    eventName: E,
    data: S["events"][E]["dataIn"],
  ): Promise<void>;
  async emitEvent(eventName: string, data: unknown): Promise<void>;
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
    this._socket?.destroy();
    this._server?.close();
    this._socket = null;
    this._server = null;
  }

  /**
   * Whether client is connected to parent.
   */
  get connected(): boolean {
    return this._socket !== null && !this._socket.destroyed;
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
      this._server = createServer((socket) => {
        this._socket = socket;
        this._drainWaiter = new DrainWaiter(socket);
        this._frameBuffer = new FrameBuffer();

        socket.on("data", (chunk: Buffer) => {
          const frames = this._frameBuffer!.push(chunk);
          for (const frame of frames) {
            this._handleFrame(frame);
          }
        });

        socket.on("error", (err) => this.emit("error", err));
        socket.on("close", () => {
          this._drainWaiter?.clear();
          this.emit("disconnected");
        });
      });

      this._server.on("error", reject);
      this._server.listen(pipePath, () => resolve());
    });
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
    const payload = this._defaultCodec.serialize(message);
    const headerBuf = this._acquireHeaderBuffer();

    encodeHeaderInto(headerBuf, {
      methodId,
      flags: Flags.IS_RESPONSE | Flags.IS_ERROR | Flags.DIRECTION_TO_PARENT,
      requestId,
      payloadLength: payload.length,
    });

    // RING+SYNC: No await in sync function, buffer used immediately
    this._socket?.cork();
    this._socket?.write(headerBuf);
    this._socket?.write(payload);
    this._socket?.uncork();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: Frame Sending
  // ═══════════════════════════════════════════════════════════════════════════

  private _acquireHeaderBuffer(): Buffer {
    const buffer = this._headerPool[this._headerPoolIndex]!;
    this._headerPoolIndex = (this._headerPoolIndex + 1) % HEADER_POOL_SIZE;
    return buffer;
  }

  /**
   * Send a frame with proper backpressure handling.
   * Used for emitting events to parent.
   *
   * Uses RING+SYNC pattern: write BEFORE await for allocation-free headers.
   * DrainWaiter singleton prevents MaxListenersExceededWarning.
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

    // Write BEFORE await to prevent deadlock.
    // Buffer.from() creates a copy because Named Pipes on Windows
    // may not synchronously copy buffer data.
    this._socket.cork();
    this._socket.write(Buffer.from(headerBuf));
    const canContinue = this._socket.write(payload);
    this._socket.uncork();

    // OPT-04: Wait AFTER write if backpressure - ring buffer no longer needed
    if (!canContinue) {
      await this._drainWaiter.waitForDrain();
    }
  }
}
