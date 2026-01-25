/**
 * @procwire/sdk - Type definitions
 * @packageDocumentation
 */

import type { SerializationCodec } from "@procwire/transport";

// ─────────────────────────────────────────────────────────────────────────────
// Worker Options
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options for creating a worker.
 */
export interface WorkerOptions {
  /**
   * Worker name for identification in logs and handshake.
   * @default Derived from process.argv[1] basename
   */
  name?: string;

  /**
   * Data channel configuration.
   * If omitted, only control channel (stdio) is used.
   */
  dataChannel?: DataChannelOptions;

  /**
   * Enable debug logging to stderr.
   * @default false
   */
  debug?: boolean;

  /**
   * Custom capabilities to advertise in handshake.
   * Built-in capabilities (heartbeat, data_channel) are added automatically.
   * @default []
   */
  capabilities?: string[];

  /**
   * Timeout for draining pending requests during shutdown (ms).
   * @default 5000
   */
  drainTimeout?: number;
}

/**
 * Resolved worker options with all defaults applied.
 * @internal
 */
export interface ResolvedWorkerOptions {
  name: string;
  dataChannel: DataChannelOptions | undefined;
  debug: boolean;
  capabilities: string[];
  drainTimeout: number;
}

/**
 * Data channel configuration for worker.
 */
export interface DataChannelOptions {
  /**
   * Serialization codec for data channel.
   * Reuse codecs from @procwire/codec-* packages.
   * Must match the codec used by manager.
   *
   * @default JsonCodec (built-in, zero dependencies)
   *
   * @example Using MessagePack
   * ```ts
   * import { MessagePackCodec } from '@procwire/codec-msgpack';
   *
   * const worker = createWorker({
   *   dataChannel: {
   *     serialization: new MessagePackCodec(),
   *   },
   * });
   * ```
   */
  serialization?: SerializationCodec;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Context passed to request handlers.
 * Provides metadata about the incoming request.
 */
export interface HandlerContext {
  /**
   * Unique request ID from the JSON-RPC message.
   */
  readonly requestId: string | number;

  /**
   * Method name being called.
   */
  readonly method: string;

  /**
   * Channel the request came from.
   */
  readonly channel: "control" | "data";

  /**
   * Abort signal - triggered if request is cancelled or worker is shutting down.
   * Handlers should check this for long-running operations.
   *
   * @example
   * ```ts
   * worker.handle('long_task', async (params, ctx) => {
   *   for (const item of items) {
   *     if (ctx.signal.aborted) {
   *       throw new Error('Request cancelled');
   *     }
   *     await processItem(item);
   *   }
   *   return { done: true };
   * });
   * ```
   */
  readonly signal: AbortSignal;
}

/**
 * Request handler function type.
 * Receives params and context, returns result (sync or async).
 *
 * @typeParam TParams - Type of request parameters
 * @typeParam TResult - Type of response result
 *
 * @example Sync handler
 * ```ts
 * const addHandler: Handler<{ a: number; b: number }, { sum: number }> =
 *   (params) => ({ sum: params.a + params.b });
 * ```
 *
 * @example Async handler
 * ```ts
 * const fetchHandler: Handler<{ url: string }, { data: unknown }> =
 *   async (params) => {
 *     const response = await fetch(params.url);
 *     return { data: await response.json() };
 *   };
 * ```
 */
export type Handler<TParams = unknown, TResult = unknown> = (
  params: TParams,
  context: HandlerContext,
) => TResult | Promise<TResult>;

/**
 * Notification handler function type (fire-and-forget, no return value).
 *
 * @typeParam TParams - Type of notification parameters
 */
export type NotificationHandler<TParams = unknown> = (params: TParams) => void | Promise<void>;

// ─────────────────────────────────────────────────────────────────────────────
// Worker Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Worker lifecycle hooks.
 */
export interface WorkerHooks {
  /**
   * Called after handshake is complete and worker is ready to receive requests.
   * Use this to perform initialization that depends on the connection being established.
   *
   * @example
   * ```ts
   * worker.hooks({
   *   onReady: () => {
   *     console.log('Worker is ready!');
   *     loadDatabase();
   *   },
   * });
   * ```
   */
  onReady?: () => void | Promise<void>;

  /**
   * Called when shutdown is requested by the manager.
   * Perform cleanup here. Pending requests will be drained after this returns.
   *
   * @param reason - Reason for shutdown (e.g., 'user_requested', 'heartbeat_dead')
   *
   * @example
   * ```ts
   * worker.hooks({
   *   onShutdown: async (reason) => {
   *     console.log(`Shutting down: ${reason}`);
   *     await database.close();
   *     await cache.flush();
   *   },
   * });
   * ```
   */
  onShutdown?: (reason: string) => void | Promise<void>;

  /**
   * Called on unhandled errors in handlers or internal worker errors.
   * Use this for error reporting/logging.
   *
   * @param error - The error that occurred
   *
   * @example
   * ```ts
   * worker.hooks({
   *   onError: (error) => {
   *     Sentry.captureException(error);
   *   },
   * });
   * ```
   */
  onError?: (error: Error) => void;
}

/**
 * Current state of the worker.
 */
export type WorkerState =
  | "created" // Worker created but not started
  | "starting" // Worker is initializing transports
  | "handshaking" // Waiting for handshake from manager
  | "ready" // Worker is ready to process requests
  | "draining" // Shutdown requested, draining pending requests
  | "stopped"; // Worker has stopped

/**
 * Internal worker state for tracking.
 * @internal
 */
export interface WorkerInternalState {
  state: WorkerState;
  pendingRequests: number;
  startedAt: number | null;
  handshakeCompletedAt: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Worker interface - main API for building Procwire workers.
 *
 * @example Basic usage
 * ```ts
 * import { createWorker } from '@procwire/sdk';
 *
 * const worker = createWorker({ name: 'my-worker' });
 *
 * worker.handle('echo', (params) => params);
 * worker.handle('add', ({ a, b }) => ({ sum: a + b }));
 *
 * worker.hooks({
 *   onReady: () => console.log('Ready!'),
 *   onShutdown: () => console.log('Goodbye!'),
 * });
 *
 * worker.start();
 * ```
 */
export interface Worker {
  /**
   * Register a request handler for a method.
   * Handler receives params and returns result (sync or async).
   *
   * @param method - Method name (cannot start/end with __)
   * @param handler - Handler function
   * @returns this (for chaining)
   * @throws {Error} If method name is reserved (starts and ends with __)
   * @throws {Error} If handler already registered for this method
   *
   * @example
   * ```ts
   * worker.handle('greet', (params: { name: string }) => {
   *   return { message: `Hello, ${params.name}!` };
   * });
   * ```
   */
  handle<TParams = unknown, TResult = unknown>(
    method: string,
    handler: Handler<TParams, TResult>,
  ): this;

  /**
   * Register a notification handler (fire-and-forget, no response sent).
   *
   * @param method - Method name (cannot start/end with __)
   * @param handler - Handler function
   * @returns this (for chaining)
   */
  onNotification<TParams = unknown>(method: string, handler: NotificationHandler<TParams>): this;

  /**
   * Send a notification to the manager (fire-and-forget).
   *
   * @param method - Method name
   * @param params - Notification params
   *
   * @example
   * ```ts
   * // Notify manager of progress
   * await worker.notify('progress', { percent: 50 });
   * ```
   */
  notify(method: string, params?: unknown): Promise<void>;

  /**
   * Register lifecycle hooks.
   *
   * @param hooks - Lifecycle hook functions
   * @returns this (for chaining)
   */
  hooks(hooks: WorkerHooks): this;

  /**
   * Start the worker.
   * Initializes transports, performs handshake, and begins processing requests.
   * This method blocks until shutdown is complete.
   *
   * @returns Promise that resolves when worker shuts down
   * @throws {Error} If worker is already running
   */
  start(): Promise<void>;

  /**
   * Request graceful shutdown.
   * Drains pending requests before exiting.
   *
   * @param exitCode - Process exit code (default: 0)
   */
  shutdown(exitCode?: number): Promise<void>;

  /**
   * Get current worker state.
   */
  readonly state: WorkerState;
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed Worker (for full type inference)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Method definition for typed workers.
 * Define your API contract using this shape.
 *
 * @example
 * ```ts
 * interface MyMethods {
 *   greet: {
 *     params: { name: string };
 *     result: { message: string };
 *   };
 *   add: {
 *     params: { a: number; b: number };
 *     result: { sum: number };
 *   };
 * }
 * ```
 */
export interface MethodDefinition<TParams = unknown, TResult = unknown> {
  params: TParams;
  result: TResult;
}

/**
 * Extract method names from a methods interface.
 * @internal
 */
export type MethodNames<TMethods> = keyof TMethods & string;

/**
 * Extract params type for a method.
 * @internal
 */
export type MethodParams<TMethods, M extends MethodNames<TMethods>> =
  TMethods[M] extends MethodDefinition<infer P, unknown> ? P : never;

/**
 * Extract result type for a method.
 * @internal
 */
export type MethodResult<TMethods, M extends MethodNames<TMethods>> =
  TMethods[M] extends MethodDefinition<unknown, infer R> ? R : never;

/**
 * Typed worker interface with full type inference for method handlers.
 *
 * @typeParam TMethods - Interface defining all methods with their params/result types
 *
 * @example
 * ```ts
 * // Define shared types (can be in a shared package)
 * interface VectorDBMethods {
 *   search: {
 *     params: { query: number[]; topK: number };
 *     result: { matches: Array<{ id: string; score: number }> };
 *   };
 *   insert: {
 *     params: { id: string; vector: number[] };
 *     result: { success: boolean };
 *   };
 * }
 *
 * // Create typed worker
 * const worker = createTypedWorker<VectorDBMethods>();
 *
 * // Full autocomplete and type checking!
 * worker.handle('search', async (params) => {
 *   // params.query is number[]
 *   // params.topK is number
 *   return { matches: [] }; // Must match result type
 * });
 * ```
 */
export interface TypedWorker<TMethods> extends Omit<Worker, "handle"> {
  /**
   * Register a typed handler for a method.
   * Provides full type inference for params and result.
   */
  handle<M extends MethodNames<TMethods>>(
    method: M,
    handler: (
      params: MethodParams<TMethods, M>,
      context: HandlerContext,
    ) => MethodResult<TMethods, M> | Promise<MethodResult<TMethods, M>>,
  ): this;
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory Function Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Factory function to create a worker.
 */
export type CreateWorkerFn = (options?: WorkerOptions) => Worker;

/**
 * Factory function to create a typed worker.
 */
export type CreateTypedWorkerFn = <TMethods>(options?: WorkerOptions) => TypedWorker<TMethods>;
