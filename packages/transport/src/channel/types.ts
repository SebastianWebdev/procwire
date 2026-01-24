import type { EventMap } from "../utils/events.js";
import type { Unsubscribe } from "../utils/disposables.js";
import type { Transport, TransportServer } from "../transport/types.js";
import type { FramingCodec } from "../framing/types.js";
import type { SerializationCodec } from "../serialization/types.js";
import type { Protocol, RequestId, ProtocolDataError } from "../protocol/types.js";
import type { MetricsCollector } from "../utils/metrics.js";

/**
 * Request handler function.
 * @template TReq - Request data type
 * @template TRes - Response data type
 */
export type RequestHandler<TReq = unknown, TRes = unknown> = (
  request: TReq,
) => TRes | Promise<TRes>;

/**
 * Notification handler function.
 * @template TNotif - Notification data type
 */
export type NotificationHandler<TNotif = unknown> = (notification: TNotif) => void;

/**
 * Response accessor for interpreting protocol-specific response messages.
 * Abstracts away protocol differences for generic channel implementation.
 */
export interface ResponseAccessor {
  /**
   * Extracts request ID from a response message.
   * @returns Request ID or undefined if message is not a response
   */
  getResponseId(message: unknown): RequestId | undefined;

  /**
   * Checks if response message represents an error.
   */
  isErrorResponse(message: unknown): boolean;

  /**
   * Extracts result data from success response.
   */
  getResult(message: unknown): unknown;

  /**
   * Extracts error data from error response.
   */
  getError(message: unknown): ProtocolDataError | unknown;
}

/**
 * Middleware hook for channel operations.
 * Useful for logging, metrics, debugging, and transformation.
 */
export interface ChannelMiddleware {
  /**
   * Called before sending a request.
   */
  onOutgoingRequest?(request: unknown): void | Promise<void>;

  /**
   * Called after receiving a response.
   */
  onIncomingResponse?(response: unknown): void | Promise<void>;

  /**
   * Called when receiving an incoming request.
   */
  onIncomingRequest?(request: unknown): void | Promise<void>;

  /**
   * Called before sending a response.
   */
  onOutgoingResponse?(response: unknown): void | Promise<void>;

  /**
   * Called when an error occurs.
   */
  onError?(error: Error): void | Promise<void>;
}

/**
 * Channel events map.
 */
export interface ChannelEvents extends EventMap {
  /**
   * Fired when channel starts (connects).
   */
  start: void;

  /**
   * Fired when channel closes.
   */
  close: void;

  /**
   * Fired when channel error occurs.
   */
  error: Error;
}

/**
 * Channel options for configuration.
 * @template TReq - Request data type
 * @template TRes - Response data type
 * @template TNotif - Notification data type
 */
export interface ChannelOptions<TReq = unknown, TRes = unknown, TNotif = unknown> {
  /**
   * Underlying transport.
   */
  transport: Transport;

  /**
   * Framing codec for message boundaries.
   */
  framing: FramingCodec;

  /**
   * Serialization codec for data encoding.
   */
  serialization: SerializationCodec;

  /**
   * Protocol layer for request/response.
   */
  protocol: Protocol<TReq, TRes, TNotif>;

  /**
   * Default request timeout in milliseconds (default: 30000).
   */
  timeout?: number;

  /**
   * Response accessor for interpreting response messages.
   * If not provided, auto-detected based on protocol name.
   */
  responseAccessor?: ResponseAccessor;

  /**
   * Middleware hooks for logging, metrics, debugging.
   */
  middleware?: ChannelMiddleware[];

  /**
   * Optional metrics collector for channel instrumentation.
   */
  metrics?: MetricsCollector;

  /**
   * Maximum number of inbound frames to buffer before backpressure (optional).
   */
  maxInboundFrames?: number;

  /**
   * Buffer early notifications received before handlers are registered.
   * Useful when child processes send notifications immediately after spawn.
   * Default: 10
   */
  bufferEarlyNotifications?: number;

  /**
   * Maximum size of pending request pool (0 disables pooling).
   * Default: 100
   */
  pendingRequestPoolSize?: number;

  /**
   * Callback for middleware errors.
   * Called when a middleware hook throws an error.
   * If not provided, errors are silently ignored (not logged).
   * @param hook - Name of the middleware hook that failed
   * @param error - The error that was thrown
   */
  onMiddlewareError?: (hook: string, error: Error) => void;
}

/**
 * High-level communication channel combining all layers.
 * Provides request/response and notification patterns.
 *
 * @template TReq - Request data type (wire format)
 * @template TRes - Response data type (wire format)
 * @template TNotif - Notification data type (wire format)
 *
 * @example
 * ```typescript
 * // Create and start a channel
 * const channel = new ChannelBuilder()
 *   .withTransport(transport)
 *   .withFraming(new LengthPrefixedFraming())
 *   .withSerialization(new JsonCodec())
 *   .withProtocol(new JsonRpcProtocol())
 *   .build();
 *
 * await channel.start();
 *
 * // Send request
 * const result = await channel.request("add", { a: 1, b: 2 });
 *
 * // Handle incoming requests
 * channel.onRequest((req) => {
 *   return { result: "processed" };
 * });
 *
 * // Cleanup
 * await channel.close();
 * ```
 *
 * @see {@link ChannelBuilder} for fluent channel construction
 * @see {@link ChannelOptions} for configuration options
 */
export interface Channel<TReq = unknown, TRes = unknown, TNotif = unknown> {
  /**
   * Returns true if channel is connected and ready.
   */
  readonly isConnected: boolean;

  /**
   * Starts the channel (connects transport and begins message processing).
   *
   * @throws {TransportError} if transport connection fails
   *
   * @example
   * ```typescript
   * await channel.start();
   * console.log(channel.isConnected); // true
   * ```
   */
  start(): Promise<void>;

  /**
   * Closes the channel gracefully.
   * Rejects all pending requests and disconnects the transport.
   *
   * @example
   * ```typescript
   * await channel.close();
   * console.log(channel.isConnected); // false
   * ```
   */
  close(): Promise<void>;

  /**
   * Sends a request and waits for response.
   *
   * @param method - Method name to call
   * @param params - Optional parameters to pass
   * @param timeout - Optional timeout override in milliseconds
   * @returns Promise resolving to response result
   *
   * @throws {TimeoutError} if request times out
   * @throws {ProtocolError} if response contains an error
   * @throws {Error} if channel is not connected
   *
   * @example
   * ```typescript
   * // Basic request
   * const result = await channel.request("add", { a: 1, b: 2 });
   *
   * // With custom timeout
   * const result = await channel.request("slowOperation", {}, 60000);
   * ```
   *
   * @see {@link notify} for fire-and-forget messages
   */
  request(method: string, params?: unknown, timeout?: number): Promise<unknown>;

  /**
   * Sends a notification (fire-and-forget, no response expected).
   *
   * @param method - Method name
   * @param params - Optional parameters
   *
   * @throws {Error} if channel is not connected
   *
   * @example
   * ```typescript
   * await channel.notify("log", { message: "Something happened" });
   * ```
   *
   * @see {@link request} for request/response pattern
   */
  notify(method: string, params?: unknown): Promise<void>;

  /**
   * Registers handler for incoming requests.
   *
   * @param handler - Function to handle incoming requests
   * @returns Unsubscribe function to remove the handler
   *
   * @example
   * ```typescript
   * const unsubscribe = channel.onRequest((request) => {
   *   if (request.method === "ping") {
   *     return { pong: true };
   *   }
   *   throw new Error("Unknown method");
   * });
   *
   * // Later: remove handler
   * unsubscribe();
   * ```
   */
  onRequest(handler: RequestHandler<TReq, TRes>): Unsubscribe;

  /**
   * Registers handler for incoming notifications.
   *
   * @param handler - Function to handle incoming notifications
   * @returns Unsubscribe function to remove the handler
   *
   * @example
   * ```typescript
   * channel.onNotification((notification) => {
   *   console.log("Received:", notification);
   * });
   * ```
   */
  onNotification(handler: NotificationHandler<TNotif>): Unsubscribe;

  /**
   * Subscribes to channel events.
   *
   * @param event - Event name ('start', 'close', 'error')
   * @param handler - Event handler function
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * channel.on("error", (error) => {
   *   console.error("Channel error:", error);
   * });
   *
   * channel.on("close", () => {
   *   console.log("Channel closed");
   * });
   * ```
   */
  on<K extends keyof ChannelEvents>(
    event: K,
    handler: (data: ChannelEvents[K]) => void,
  ): Unsubscribe;
}

/**
 * Server-side channel factory options.
 */
export interface ChannelServerOptions<TReq = unknown, TRes = unknown, TNotif = unknown> {
  /**
   * Transport server for accepting connections.
   */
  server: TransportServer;

  /**
   * Framing codec factory (creates instance per connection).
   */
  createFraming: () => FramingCodec;

  /**
   * Serialization codec (can be shared across connections).
   */
  serialization: SerializationCodec;

  /**
   * Protocol factory (creates instance per connection).
   */
  createProtocol: () => Protocol<TReq, TRes, TNotif>;

  /**
   * Default request timeout in milliseconds (optional).
   */
  timeout?: number;
}

/**
 * Server-side channel manager.
 * Accepts connections and creates Channel instances.
 */
export interface ChannelServer<TReq = unknown, TRes = unknown, TNotif = unknown> {
  /**
   * Returns true if server is listening.
   */
  readonly isListening: boolean;

  /**
   * Starts listening for connections.
   */
  listen(address: string | number): Promise<void>;

  /**
   * Stops the server and closes all channels.
   */
  close(): Promise<void>;

  /**
   * Subscribes to new channel connections.
   * @returns Unsubscribe function
   */
  onConnection(handler: (channel: Channel<TReq, TRes, TNotif>) => void): Unsubscribe;
}
