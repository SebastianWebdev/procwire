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
import { msgpackCodec, type Codec } from "@procwire/codecs";
import type { MethodDefinition, EventDefinition, MethodHandler, ClientOptions } from "./types.js";
import { ClientErrors } from "./errors.js";

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
  private _methods = new Map<string, { def: MethodDefinition; handler: MethodHandler }>();
  private _events = new Map<string, EventDefinition>();

  private _server: BunServer | null = null;
  private _socket: BunSocket | null = null;

  private _methodNameToId = new Map<string, number>();
  private _methodIdToName = new Map<number, string>();
  private _eventNameToId = new Map<string, number>();

  private _abortCallbacks = new Map<number, Set<() => void>>();
  private _started = false;

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
  handle<TData = unknown>(
    method: string,
    handler: MethodHandler<TData>,
    options?: Partial<MethodDefinition>,
  ): this {
    if (this._started) {
      throw ClientErrors.cannotAddHandlerAfterStart();
    }

    this._methods.set(method, {
      def: {
        response: options?.response ?? "result",
        codec: options?.codec ?? this._defaultCodec,
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
    const _pipePath = this._generatePipePath();

    // TODO: Create server using Bun.listen() and wait for connection
    // Will be implemented in TASK-36
    throw new Error("Not implemented: Client.start() - will be implemented in TASK-36");
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
  async emitEvent(eventName: string, _data: unknown): Promise<void> {
    if (!this._socket) {
      throw ClientErrors.notConnected();
    }

    const eventId = this._eventNameToId.get(eventName);
    if (eventId === undefined) {
      throw ClientErrors.unknownEvent(eventName);
    }

    // TODO: Implement event sending using Bun socket
    throw new Error("Not implemented: Client.emitEvent() - will be implemented in TASK-36");
  }

  /**
   * Graceful shutdown.
   */
  async shutdown(): Promise<void> {
    this._socket?.end();
    this._server?.stop(true);
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
  // PRIVATE: Initialization
  // ═══════════════════════════════════════════════════════════════════════════

  private _generatePipePath(): string {
    const id = Math.random().toString(36).slice(2, 10);
    return process.platform === "win32"
      ? `\\\\.\\pipe\\procwire-${process.pid}-${id}`
      : `/tmp/procwire-${process.pid}-${id}.sock`;
  }
}
