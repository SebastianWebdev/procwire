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
 * Minimal reader surface used by the control loop. Structural on purpose:
 * Bun's global ReadableStreamDefaultReader adds readMany(), which a generic
 * web-streams reader (injected in tests) doesn't have.
 */
interface StdinReader {
  read(): Promise<{ value?: Uint8Array | undefined; done: boolean }>;
  cancel(reason?: unknown): Promise<void>;
  releaseLock(): void;
}

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
  private _controlReaderStopped = false;

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

    // Listen for control-plane messages from the parent (e.g. heartbeat $ping).
    void this._startControlReader();
  }

  /** Active stdin reader, kept so shutdown() can cancel the pending read. */
  private _stdinReader: StdinReader | null = null;

  /**
   * @internal Read the parent's control plane (stdin) line by line.
   *
   * Uses an explicit reader (not for-await) so shutdown() can cancel the
   * PENDING read: a suspended read keeps the Bun event loop alive, and the
   * "stopped" flag alone only takes effect when the next chunk arrives -
   * i.e. never, once the parent has said its last word - forcing the parent
   * to force-kill the child after its grace period (Bug W7).
   *
   * EOF (stream done) means the parent is GONE: shut down so the child
   * exits instead of living forever as an orphan (Bug W3 port).
   */
  private async _startControlReader(
    input: ReadableStream<Uint8Array> = Bun.stdin.stream() as ReadableStream<Uint8Array>,
  ): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = "";
    let reader: StdinReader | null = null;
    try {
      // Inside the try: getReader() throws synchronously if the stream is
      // already locked (e.g. a second Client instance in the same process).
      const activeReader = input.getReader();
      reader = activeReader;
      this._stdinReader = activeReader;
      while (!this._controlReaderStopped) {
        const { value, done } = await activeReader.read();
        if (done) {
          // Parent death (or deliberate stdin close): exit cleanly.
          if (!this._controlReaderStopped) {
            void this.shutdown();
          }
          break;
        }
        // stream:true keeps multi-byte characters split across chunks intact.
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          this._handleControlLine(line);
        }
      }
    } catch {
      // stdin closed / unreadable - nothing more to do.
    } finally {
      this._stdinReader = null;
      try {
        reader?.releaseLock();
      } catch {
        /* lock already released */
      }
    }
  }

  /**
   * @internal Handle one line from the parent's control plane (stdin).
   *
   * Currently answers heartbeat pings; unknown/non-JSON lines are ignored.
   */
  private _handleControlLine(line: string): void {
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

  /** Write a JSON-RPC control message to the parent over stdout. */
  private _sendControl(message: unknown): void {
    console.log(JSON.stringify(message));
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
    this._controlReaderStopped = true;
    // Cancel the pending stdin read: a suspended read keeps the event loop
    // alive and would pin the child until the parent force-kills it (W7).
    void this._stdinReader?.cancel().catch(() => {
      /* reader already closed */
    });
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
        // Bun.listen shares ONE handler object across ALL connections, so
        // every handler must check WHICH socket fired. Without the identity
        // checks, a stray connection (rejected in _onConnectionOpen) would
        // tear down or poison the ACTIVE parent session: its close event ran
        // _onConnectionClose() against the live session, and its data fed the
        // active FrameBuffer.
        this._server = Bun.listen({
          unix: pipePath,
          socket: {
            open: (socket: BunSocket) => {
              this._onConnectionOpen(socket);
            },
            data: (socket: BunSocket, data: Buffer) => {
              this._onSocketData(socket, data);
            },
            error: (socket: BunSocket, err: Error) => {
              if (socket === this._socket) {
                this._onSocketError(err);
              }
            },
            close: (socket: BunSocket) => {
              if (socket === this._socket) {
                this._onConnectionClose();
              }
            },
            drain: (socket: BunSocket) => {
              // Backpressure released (only the active session's waiter)
              if (socket === this._socket) {
                this._drainWaiter?.onDrain();
              }
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
    // Only the active session may feed the frame buffer: bytes from a stray
    // (rejected) connection would desync the framing of the live session.
    if (socket !== this._socket) return;
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
        version: "1.0.0",
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
    if (!this._socket || !this._drainWaiter) return;

    const payload = this._defaultCodec.serialize(message);
    const headerBuf = this._acquireHeaderBuffer();

    encodeHeaderInto(headerBuf, {
      methodId,
      flags: Flags.IS_RESPONSE | Flags.IS_ERROR | Flags.DIRECTION_TO_PARENT,
      requestId,
      payloadLength: payload.length,
    });

    // Bun doesn't have cork/uncork, concatenate for atomic write.
    // Fire-and-forget, but still via writeAll so a partial write cannot
    // truncate the frame and desync the parent's framing.
    const combined = Buffer.concat([headerBuf, payload]);
    this._drainWaiter.writeAll(this._socket, combined).catch(() => {
      /* socket may be closed - the close handler tears the session down */
    });
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

    // Bun doesn't have cork/uncork, concatenate for atomic write.
    // writeAll honors Bun's numeric write() return: partial writes are
    // re-sent after drain instead of being silently dropped.
    const combined = Buffer.concat([headerBuf, payload]);
    await this._drainWaiter.writeAll(this._socket, combined);
  }
}
