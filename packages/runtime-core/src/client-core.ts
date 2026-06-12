/**
 * ClientCore - the runtime-agnostic half of the child-side Client.
 *
 * Owns ALL protocol logic: handler/event registries, method/event id
 * assignment, the $init schema, control-line handling ($ping/$shutdown),
 * frame dispatch (_handleFrame/_handleAbort), abort bookkeeping, request
 * contexts and the disconnect teardown.
 *
 * What it deliberately does NOT own (runtime adapters do): the pipe server
 * (net.createServer vs Bun.listen) including the single-parent identity
 * checks, the control-plane stdin reader (readline vs WHATWG stream reader),
 * and drain delivery.
 *
 * @module
 */

import { EventEmitter } from "node:events";
import {
  FrameBuffer,
  type Frame,
  type FrameTransport,
  Flags,
  encodeHeaderInto,
  HEADER_SIZE,
  ABORT_METHOD_ID,
} from "@procwire/protocol";
import { msgpackCodec, type Codec, type Schema, type EmptySchema } from "@procwire/codecs";
import { codecDeserialize } from "@procwire/codecs";
import type {
  MethodDefinition,
  EventDefinition,
  MethodHandler,
  ClientOptions,
  TypedRequestContext,
} from "./client-types.js";
import type { ResponseType } from "./types.js";
import { RequestContextImpl } from "./request-context.js";
import { ClientErrors } from "./client-errors.js";

/**
 * Options for `client.handle()`.
 *
 * Supports three codec patterns:
 * - `{ codec }` — single codec for both request and response
 * - `{ requestCodec, responseCodec }` — dual codecs
 * - neither — uses default codec
 */
export interface HandleOptions {
  response?: ResponseType;
  cancellable?: boolean;
  codec?: Codec;
  requestCodec?: Codec;
  responseCodec?: Codec;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT CORE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ClientCore - shared child-side Client logic.
 *
 * The runtime packages subclass this (`Client` in @procwire/client and
 * @procwire/bun-client), adding only the pipe server, the stdin control
 * reader and shutdown mechanics.
 */
export abstract class ClientCore<S extends Schema = EmptySchema> extends EventEmitter {
  declare readonly __schema: S;

  private _defaultCodec: Codec;
  private readonly _maxPayloadSize?: number;
  private _methods = new Map<string, { def: MethodDefinition; handler: MethodHandler }>();
  private _events = new Map<string, EventDefinition>();

  private _transport: FrameTransport | null = null;
  private _frameBuffer: FrameBuffer | null = null;

  private _methodNameToId = new Map<string, number>();
  private _methodIdToName = new Map<number, string>();
  private _eventNameToId = new Map<string, number>();

  private _abortCallbacks = new Map<number, Set<() => void>>();
  private _activeContexts = new Map<number, RequestContextImpl>();
  private _started = false;

  constructor(options?: ClientOptions) {
    super();
    this._defaultCodec = options?.defaultCodec ?? msgpackCodec;
    if (options?.maxPayloadSize !== undefined) {
      this._maxPayloadSize = options.maxPayloadSize;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RUNTIME ADAPTER HOOKS (abstract)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create the data-plane pipe server at `pipePath` and resolve once it is
   * listening. Accepted connections are handed to _acceptConnection() with
   * their inbound events wired to _handleTransportData/-Error and
   * _handleDisconnect.
   */
  protected abstract _createPipeServer(pipePath: string): Promise<void>;

  /**
   * Start reading the parent's control plane (stdin) line by line, routing
   * each line into _handleControlLine(). EOF means the parent is GONE: the
   * adapter must call shutdown() so the child exits instead of becoming an
   * orphan (Bug W3).
   */
  protected abstract _startControlReader(): void;

  /**
   * Stop the control reader without re-entering shutdown() (a shutdown WE
   * initiated must not be re-triggered by the reader's own close/EOF).
   */
  protected abstract _stopControlReader(): void;

  /**
   * Stop the pipe server.
   */
  protected abstract _closeServer(): void;

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
    const hasRequestCodec = !!(options && "requestCodec" in options && options.requestCodec);
    const hasResponseCodec = !!(options && "responseCodec" in options && options.responseCodec);
    if (hasRequestCodec !== hasResponseCodec) {
      throw new Error("Both requestCodec and responseCodec must be provided together");
    }

    if (
      options &&
      "requestCodec" in options &&
      "responseCodec" in options &&
      options.requestCodec &&
      options.responseCodec
    ) {
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
   * Creates the named pipe server, waits for listen, then sends $init to the
   * parent and starts the control-plane reader.
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

    // Listen for control-plane messages from the parent (e.g. heartbeat $ping).
    this._startControlReader();
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
    if (!this._transport) {
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
    this._stopControlReader();
    this._transport?.close();
    this._closeServer();
    this._transport = null;
  }

  /**
   * Whether client is connected to parent.
   */
  get connected(): boolean {
    return this._transport !== null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL API (called by runtime adapters)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * @internal A connection was accepted by the runtime's pipe server.
   *
   * Single-parent model: the parent connects exactly once. Returns false for
   * any extra or stray connection - the adapter must reject it rather than
   * overwrite (and corrupt) the active connection's in-flight state.
   */
  protected _acceptConnection(transport: FrameTransport): boolean {
    if (this._transport) {
      return false;
    }
    this._transport = transport;
    this._frameBuffer = new FrameBuffer(
      this._maxPayloadSize !== undefined ? { maxPayloadSize: this._maxPayloadSize } : {},
    );
    return true;
  }

  /**
   * @internal Inbound bytes from the runtime adapter.
   *
   * An oversized/invalid frame (e.g. payload exceeds maxPayloadSize) drops
   * the connection instead of letting the throw crash the child process.
   */
  protected _handleTransportData(chunk: Buffer): void {
    // Guard: a late "data" event can fire after _handleDisconnect() niled it.
    if (!this._frameBuffer) return;
    let frames;
    try {
      frames = this._frameBuffer.push(chunk);
    } catch (err) {
      if (this.listenerCount("error") > 0) {
        this.emit("error", err as Error);
      }
      this._transport?.close();
      return;
    }
    for (const frame of frames) {
      this._handleFrame(frame);
    }
  }

  /**
   * @internal Handle a socket error.
   *
   * EventEmitter throws synchronously when "error" is emitted with no
   * listener, which would crash the whole child process. Only emit when
   * someone is listening; "close" -> _handleDisconnect() still runs.
   */
  protected _handleTransportError(err: Error): void {
    if (this.listenerCount("error") > 0) {
      this.emit("error", err);
    }
  }

  /**
   * @internal Tear down all per-connection state when the socket drops.
   *
   * In-flight requests are abandoned by the parent on disconnect, so we abort
   * their contexts, fire their onAbort callbacks (user cleanup: close cursors,
   * kill queries), and drop all references so nothing leaks.
   */
  protected _handleDisconnect(): void {
    // Reject any sender suspended on backpressure against the dead socket.
    this._transport?.close();

    // Abort in-flight requests and fire their cancellation callbacks.
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

    this._transport = null;
    this._frameBuffer = null;

    this.emit("disconnected");
  }

  /**
   * @internal Handle one line from the parent's control plane (stdin).
   *
   * Answers heartbeat pings and shuts down gracefully on request; unknown /
   * non-JSON lines are ignored.
   */
  protected _handleControlLine(line: string): void {
    if (!line.startsWith("{")) return;
    try {
      const msg = JSON.parse(line) as { method?: string };
      if (msg.method === "$ping") {
        this._sendControl({ jsonrpc: "2.0", method: "$pong" });
      } else if (msg.method === "$shutdown") {
        // Parent asked us to stop: shut down cleanly so it doesn't have to
        // force-kill us after its grace period.
        void this.shutdown();
      }
    } catch {
      // Ignore non-JSON / malformed control lines.
    }
  }

  /**
   * Write a JSON-RPC control message to the parent over stdout.
   *
   * Deliberately process.stdout.write, NOT console.log: user code routinely
   * patches/replaces console (loggers, silencers), which must not be able to
   * break or spoof the control plane (D10). The reverse contract holds for
   * embedders: stdout IS the control plane - do not print bare JSON-RPC
   * lines ({"jsonrpc":...}) to stdout from handler code.
   */
  protected _sendControl(message: unknown): void {
    process.stdout.write(`${JSON.stringify(message)}\n`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: Initialization
  // ═══════════════════════════════════════════════════════════════════════════

  protected _generatePipePath(): string {
    const id = Math.random().toString(36).slice(2, 10);
    return process.platform === "win32"
      ? `\\\\.\\pipe\\procwire-${process.pid}-${id}`
      : `/tmp/procwire-${process.pid}-${id}.sock`;
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
        version: "1.0.0",
      },
    };

    // Write to stdout (JSON-RPC control plane)
    this._sendControl(initMessage);
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
      this._transport!,
      this._abortCallbacks,
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
    if (!this._transport) return;

    const payload = this._defaultCodec.serialize(message);
    const headerBuf = Buffer.allocUnsafe(HEADER_SIZE);

    encodeHeaderInto(headerBuf, {
      methodId,
      flags: Flags.IS_RESPONSE | Flags.IS_ERROR | Flags.DIRECTION_TO_PARENT,
      requestId,
      payloadLength: payload.length,
    });

    // Fire-and-forget, but still through the transport so a partial write
    // cannot truncate the frame and desync the parent's framing.
    this._transport.writeFrame(headerBuf, payload).catch(() => {
      /* socket may be closed - the close handler tears the session down */
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: Frame Sending
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Send a frame with proper backpressure handling.
   * Used for emitting events to parent.
   */
  private async _sendFrame(
    methodId: number,
    requestId: number,
    data: unknown,
    codec: Codec,
    flags: number,
  ): Promise<void> {
    if (!this._transport) return;

    const payload = codec.serialize(data);
    const headerBuf = Buffer.allocUnsafe(HEADER_SIZE);

    encodeHeaderInto(headerBuf, {
      methodId,
      flags,
      requestId,
      payloadLength: payload.length,
    });

    await this._transport.writeFrame(headerBuf, payload);
  }
}
