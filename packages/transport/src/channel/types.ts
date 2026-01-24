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
}

/**
 * High-level communication channel combining all layers.
 * Provides request/response and notification patterns.
 *
 * @template TReq - Request data type (wire format)
 * @template TRes - Response data type (wire format)
 * @template TNotif - Notification data type (wire format)
 */
export interface Channel<TReq = unknown, TRes = unknown, TNotif = unknown> {
  /**
   * Returns true if channel is connected and ready.
   */
  readonly isConnected: boolean;

  /**
   * Starts the channel (connects transport).
   */
  start(): Promise<void>;

  /**
   * Closes the channel gracefully.
   */
  close(): Promise<void>;

  /**
   * Sends a request and waits for response.
   * @param method - Method name
   * @param params - Optional parameters
   * @param timeout - Optional timeout override (ms)
   * @returns Promise resolving to response result
   * @throws {TimeoutError} if request times out
   * @throws {ProtocolError} if response is an error
   */
  request(method: string, params?: unknown, timeout?: number): Promise<unknown>;

  /**
   * Sends a notification (fire-and-forget, no response expected).
   * @param method - Method name
   * @param params - Optional parameters
   */
  notify(method: string, params?: unknown): Promise<void>;

  /**
   * Registers handler for incoming requests.
   * @returns Unsubscribe function
   */
  onRequest(handler: RequestHandler<TReq, TRes>): Unsubscribe;

  /**
   * Registers handler for incoming notifications.
   * @returns Unsubscribe function
   */
  onNotification(handler: NotificationHandler<TNotif>): Unsubscribe;

  /**
   * Subscribes to channel events.
   * @returns Unsubscribe function
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
