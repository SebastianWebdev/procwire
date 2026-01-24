import type { Transport } from "../transport/types.js";
import type { FramingCodec } from "../framing/types.js";
import type { SerializationCodec } from "../serialization/types.js";
import type { Protocol, RequestId, ProtocolDataError } from "../protocol/types.js";
import type {
  Channel,
  ChannelEvents,
  ChannelOptions,
  RequestHandler,
  NotificationHandler,
  ResponseAccessor,
  ChannelMiddleware,
} from "./types.js";
import type { Unsubscribe } from "../utils/disposables.js";
import { EventEmitter } from "../utils/events.js";
import { ProtocolError, toError, SerializationError } from "../utils/errors.js";
import { createTimeoutSignal } from "../utils/time.js";

/**
 * Pending request state.
 */
interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeoutSignal: { cancel: () => void };
}

/**
 * JSON-RPC response accessor implementation.
 */
export class JsonRpcResponseAccessor implements ResponseAccessor {
  getResponseId(message: unknown): RequestId | undefined {
    if (
      typeof message === "object" &&
      message !== null &&
      "id" in message &&
      (typeof message.id === "string" || typeof message.id === "number")
    ) {
      return message.id;
    }
    return undefined;
  }

  isErrorResponse(message: unknown): boolean {
    return typeof message === "object" && message !== null && "error" in message;
  }

  getResult(message: unknown): unknown {
    if (typeof message === "object" && message !== null && "result" in message) {
      return (message as { result: unknown }).result;
    }
    return undefined;
  }

  getError(message: unknown): ProtocolDataError | unknown {
    if (typeof message === "object" && message !== null && "error" in message) {
      return (message as { error: unknown }).error;
    }
    return undefined;
  }
}

/**
 * Simple protocol response accessor implementation.
 */
export class SimpleResponseAccessor implements ResponseAccessor {
  getResponseId(message: unknown): RequestId | undefined {
    if (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      message.type === "response" &&
      "id" in message &&
      (typeof message.id === "string" || typeof message.id === "number")
    ) {
      return message.id;
    }
    return undefined;
  }

  isErrorResponse(message: unknown): boolean {
    return typeof message === "object" && message !== null && "error" in message;
  }

  getResult(message: unknown): unknown {
    if (typeof message === "object" && message !== null && "result" in message) {
      return (message as { result: unknown }).result;
    }
    return undefined;
  }

  getError(message: unknown): ProtocolDataError | unknown {
    if (typeof message === "object" && message !== null && "error" in message) {
      return (message as { error: unknown }).error;
    }
    return undefined;
  }
}

/**
 * Request channel implementation.
 * Combines Transport + Framing + Serialization + Protocol layers
 * to provide high-level request/response and notification patterns.
 *
 * @template TReq - Request message type (wire format)
 * @template TRes - Response message type (wire format)
 * @template TNotif - Notification message type (wire format)
 */
export class RequestChannel<TReq = unknown, TRes = unknown, TNotif = unknown> implements Channel<
  TReq,
  TRes,
  TNotif
> {
  private readonly transport: Transport;
  private readonly framing: FramingCodec;
  private readonly serialization: SerializationCodec;
  private readonly protocol: Protocol<TReq, TRes, TNotif>;
  private readonly defaultTimeout: number;
  private readonly responseAccessor: ResponseAccessor;
  private readonly middleware: ChannelMiddleware[];
  private readonly maxInboundFrames: number | undefined;
  private readonly bufferEarlyNotifications: number;

  private readonly events = new EventEmitter<ChannelEvents>();
  private readonly pendingRequests = new Map<RequestId, PendingRequest>();
  private readonly requestHandlers: RequestHandler<TReq, TRes>[] = [];
  private readonly notificationHandlers: NotificationHandler<TNotif>[] = [];
  private readonly bufferedNotifications: TNotif[] = [];

  private transportDataUnsubscribe: Unsubscribe | undefined;
  private transportErrorUnsubscribe: Unsubscribe | undefined;
  private _isConnected = false;
  private inboundFrameCount = 0;

  constructor(options: ChannelOptions<TReq, TRes, TNotif>) {
    this.transport = options.transport;
    this.framing = options.framing;
    this.serialization = options.serialization;
    this.protocol = options.protocol;
    this.defaultTimeout = options.timeout !== undefined ? options.timeout : 30000;
    this.middleware = options.middleware !== undefined ? options.middleware : [];
    this.maxInboundFrames =
      options.maxInboundFrames !== undefined ? options.maxInboundFrames : undefined;
    this.bufferEarlyNotifications =
      options.bufferEarlyNotifications !== undefined ? options.bufferEarlyNotifications : 10;

    // Auto-detect response accessor if not provided
    this.responseAccessor =
      options.responseAccessor !== undefined
        ? options.responseAccessor
        : this.createDefaultAccessor();
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Starts the channel (connects transport and begins message processing).
   */
  async start(): Promise<void> {
    if (this._isConnected) {
      return;
    }

    // Reset inbound frame count on start (in case of retry after previous failure)
    this.inboundFrameCount = 0;

    // Subscribe to transport events BEFORE connecting to avoid race conditions
    // where the child process might emit data before we're listening
    this.transportDataUnsubscribe = this.transport.onData((chunk) => {
      this.handleChunk(chunk).catch((error) => {
        this.emitError(toError(error));
      });
    });

    this.transportErrorUnsubscribe = this.transport.on("error", (error) => {
      this.emitError(error);
    });

    // Connect transport if not already connected (e.g., server-accepted connections)
    if (this.transport.state !== "connected") {
      try {
        await this.transport.connect();
      } catch (error) {
        // Cleanup subscriptions on connection failure to prevent memory leaks
        // and ensure clean state for potential retry
        if (this.transportDataUnsubscribe !== undefined) {
          this.transportDataUnsubscribe();
          this.transportDataUnsubscribe = undefined;
        }
        if (this.transportErrorUnsubscribe !== undefined) {
          this.transportErrorUnsubscribe();
          this.transportErrorUnsubscribe = undefined;
        }
        throw error;
      }
    }

    this._isConnected = true;
    this.events.emit("start", undefined);
  }

  /**
   * Closes the channel gracefully.
   */
  async close(): Promise<void> {
    if (!this._isConnected) {
      return;
    }

    this._isConnected = false;

    // Unsubscribe from transport
    if (this.transportDataUnsubscribe !== undefined) {
      this.transportDataUnsubscribe();
      this.transportDataUnsubscribe = undefined;
    }
    if (this.transportErrorUnsubscribe !== undefined) {
      this.transportErrorUnsubscribe();
      this.transportErrorUnsubscribe = undefined;
    }

    // Reject all pending requests
    const channelClosedError = new Error("Channel closed");
    for (const pending of this.pendingRequests.values()) {
      pending.timeoutSignal.cancel();
      pending.reject(channelClosedError);
    }
    this.pendingRequests.clear();

    // Reset framing state and inbound frame count
    this.framing.reset();
    this.inboundFrameCount = 0;

    // Disconnect transport
    await this.transport.disconnect();

    this.events.emit("close", undefined);
  }

  /**
   * Sends a request and waits for response.
   */
  async request(method: string, params?: unknown, timeout?: number): Promise<unknown> {
    if (!this._isConnected) {
      throw new Error("Channel is not connected");
    }

    // Generate request ID and create request message
    const request = this.protocol.createRequest(method, params);
    const id = this.extractRequestId(request as TReq);
    if (id === undefined) {
      throw new ProtocolError("Failed to extract request ID from created request");
    }

    // Call middleware
    await this.runMiddlewareHook("onOutgoingRequest", request);

    // Setup pending request promise
    const resultPromise = new Promise<unknown>((resolve, reject) => {
      const effectiveTimeout = timeout ?? this.defaultTimeout;
      const timeoutSignal = createTimeoutSignal(effectiveTimeout);

      // Store pending request
      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeoutSignal,
      });

      // Race between response and timeout
      timeoutSignal.promise.catch((error) => {
        // Timeout occurred
        const pending = this.pendingRequests.get(id);
        if (pending) {
          this.pendingRequests.delete(id);
          reject(error);
        }
      });
    });

    // Serialize and frame
    const serialized = this.serialization.serialize(request);
    const framed = this.framing.encode(serialized);

    // Write to transport
    try {
      await this.transport.write(framed);
    } catch (error) {
      // Write failed, clean up pending request
      const pending = this.pendingRequests.get(id);
      if (pending) {
        pending.timeoutSignal.cancel();
        this.pendingRequests.delete(id);
      }
      throw error;
    }

    return resultPromise;
  }

  /**
   * Sends a notification (fire-and-forget).
   */
  async notify(method: string, params?: unknown): Promise<void> {
    if (!this._isConnected) {
      throw new Error("Channel is not connected");
    }

    // Create notification message
    const notification = this.protocol.createNotification(method, params);

    // Call middleware
    await this.runMiddlewareHook("onOutgoingRequest", notification);

    // Serialize and frame
    const serialized = this.serialization.serialize(notification);
    const framed = this.framing.encode(serialized);

    // Write to transport
    await this.transport.write(framed);
  }

  /**
   * Registers handler for incoming requests.
   */
  onRequest(handler: RequestHandler<TReq, TRes>): Unsubscribe {
    this.requestHandlers.push(handler);
    return () => {
      const index = this.requestHandlers.indexOf(handler);
      if (index !== -1) {
        this.requestHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Registers handler for incoming notifications.
   * If notifications were buffered before this handler was registered,
   * they will be delivered immediately.
   */
  onNotification(handler: NotificationHandler<TNotif>): Unsubscribe {
    this.notificationHandlers.push(handler);

    // Deliver any buffered notifications to the new handler
    for (const notification of this.bufferedNotifications) {
      try {
        handler(notification);
      } catch (error) {
        this.emitError(toError(error));
      }
    }

    return () => {
      const index = this.notificationHandlers.indexOf(handler);
      if (index !== -1) {
        this.notificationHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Subscribes to channel events.
   */
  on<K extends keyof ChannelEvents>(
    event: K,
    handler: (data: ChannelEvents[K]) => void,
  ): Unsubscribe {
    return this.events.on(event, handler);
  }

  /**
   * Handles incoming chunk from transport.
   */
  private async handleChunk(chunk: Buffer): Promise<void> {
    let frames: Buffer[];
    try {
      frames = this.framing.decode(chunk);
    } catch (error) {
      this.emitError(toError(error));
      return;
    }

    // Process each frame, checking limit before each one
    for (const frame of frames) {
      // Check max inbound frames limit BEFORE processing
      if (this.maxInboundFrames !== undefined) {
        this.inboundFrameCount++;
        if (this.inboundFrameCount > this.maxInboundFrames) {
          this.emitError(
            new Error(
              `Exceeded max inbound frames limit (${this.maxInboundFrames}). Closing channel.`,
            ),
          );
          await this.close();
          return;
        }
      }

      try {
        await this.processFrame(frame);
      } catch (error) {
        // Emit error but continue processing other frames
        this.emitError(toError(error));
      }
    }
  }

  /**
   * Processes a single frame.
   */
  private async processFrame(frame: Buffer): Promise<void> {
    // Deserialize
    let obj: unknown;
    try {
      obj = this.serialization.deserialize(frame);
    } catch (error) {
      throw new SerializationError("Failed to deserialize frame", error);
    }

    // Parse message
    const parsed = this.protocol.parseMessage(obj);

    if (parsed.kind === "invalid") {
      await this.runMiddlewareHook("onError", new ProtocolError(parsed.error.message));
      this.emitError(new ProtocolError(`Invalid message: ${parsed.error.message}`));
      return;
    }

    if (this.protocol.isResponse(parsed)) {
      await this.handleResponse(parsed.message);
    } else if (this.protocol.isRequest(parsed)) {
      await this.handleRequest(parsed.message);
    } else if (this.protocol.isNotification(parsed)) {
      await this.handleNotification(parsed.message);
    }
  }

  /**
   * Handles incoming response message.
   */
  private async handleResponse(response: TRes): Promise<void> {
    await this.runMiddlewareHook("onIncomingResponse", response);

    const id = this.responseAccessor.getResponseId(response);
    if (id === undefined) {
      this.emitError(new ProtocolError("Response missing id"));
      return;
    }

    const pending = this.pendingRequests.get(id);
    if (!pending) {
      // Unsolicited response, ignore
      return;
    }

    // Remove from pending
    this.pendingRequests.delete(id);
    pending.timeoutSignal.cancel();

    // Check if error response
    if (this.responseAccessor.isErrorResponse(response)) {
      const error = this.responseAccessor.getError(response);
      pending.reject(new ProtocolError("Request failed", error));
    } else {
      const result = this.responseAccessor.getResult(response);
      pending.resolve(result);
    }
  }

  /**
   * Handles incoming request message.
   */
  private async handleRequest(request: TReq): Promise<void> {
    await this.runMiddlewareHook("onIncomingRequest", request);

    // Extract request ID (protocol-specific)
    // We need a way to get the ID from the request message
    // This is also protocol-specific, so we need a RequestAccessor similar to ResponseAccessor
    // For now, let's assume the message has an `id` field (common for both jsonrpc and simple)
    const id = this.extractRequestId(request);
    if (id === undefined) {
      this.emitError(new ProtocolError("Request missing id"));
      return;
    }

    // Call all request handlers (FIFO order)
    // Note: Multiple handlers is unusual, but supported per spec
    // Typically, only one handler should be registered
    if (this.requestHandlers.length === 0) {
      // No handler registered, send error response
      const errorResponse = this.protocol.createErrorResponse(id, {
        code: -32601,
        message: "No request handler registered",
      });
      await this.sendResponse(errorResponse);
      return;
    }

    try {
      // Call first handler (or could call all and use last result)
      const handler = this.requestHandlers[0];
      if (handler === undefined) {
        throw new Error("No handler available");
      }
      const result = await handler(request);

      // Create success response
      const response = this.protocol.createResponse(id, result);
      await this.sendResponse(response);
    } catch (error) {
      // Create error response
      const err = toError(error);
      const errorResponse = this.protocol.createErrorResponse(id, {
        code: -32603,
        message: err.message,
        data: err,
      });
      await this.sendResponse(errorResponse);
    }
  }

  /**
   * Handles incoming notification message.
   */
  private async handleNotification(notification: TNotif): Promise<void> {
    // If no handlers registered yet, buffer the notification for later delivery
    if (this.notificationHandlers.length === 0) {
      if (this.bufferedNotifications.length < this.bufferEarlyNotifications) {
        this.bufferedNotifications.push(notification);
      }
      return;
    }

    // Call all notification handlers
    for (const handler of this.notificationHandlers) {
      try {
        handler(notification);
      } catch (error) {
        // Log error but don't stop processing other handlers
        this.emitError(toError(error));
      }
    }
  }

  /**
   * Sends a response message.
   */
  private async sendResponse(response: TRes): Promise<void> {
    await this.runMiddlewareHook("onOutgoingResponse", response);

    const serialized = this.serialization.serialize(response);
    const framed = this.framing.encode(serialized);
    await this.transport.write(framed);
  }

  /**
   * Extracts request ID from request message (protocol-specific).
   */
  private extractRequestId(request: TReq): RequestId | undefined {
    if (typeof request === "object" && request !== null && "id" in request) {
      const id = (request as { id: unknown }).id;
      if (typeof id === "string" || typeof id === "number") {
        return id;
      }
    }
    return undefined;
  }

  /**
   * Creates default response accessor based on protocol name.
   */
  private createDefaultAccessor(): ResponseAccessor {
    const protocolName = this.protocol.name.toLowerCase();

    if (protocolName === "jsonrpc") {
      return new JsonRpcResponseAccessor();
    }

    if (protocolName === "simple") {
      return new SimpleResponseAccessor();
    }

    throw new Error(
      `Unknown protocol '${this.protocol.name}'. Please provide a custom responseAccessor.`,
    );
  }

  /**
   * Runs middleware hook for all registered middleware.
   */
  private async runMiddlewareHook(hook: keyof ChannelMiddleware, data: unknown): Promise<void> {
    for (const mw of this.middleware) {
      const fn = mw[hook];
      if (fn !== undefined) {
        const typedFn = fn as (data: unknown) => void | Promise<void>;
        try {
          await typedFn.call(mw, data);
        } catch (error) {
          // Log but don't throw - middleware errors shouldn't break the channel
          console.error(`Error in middleware hook '${hook}':`, error);
        }
      }
    }
  }

  /**
   * Emits error event.
   */
  private emitError(error: Error): void {
    this.events.emit("error", error);
  }
}
