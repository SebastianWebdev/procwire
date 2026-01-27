/**
 * Worker channel - handles message framing and JSON-RPC
 */

import type { SerializationCodec } from "@procwire/transport";
import { JsonCodec } from "@procwire/transport";
import type { WorkerTransport } from "../transport/types.js";
import type { JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from "./types.js";
import {
  isRequest,
  isNotification,
  createResponse,
  createErrorResponse,
  createNotification,
  JsonRpcErrorCodes,
} from "./types.js";
import type { Logger } from "../utils/logger.js";

/**
 * Framing type for the channel.
 */
export type FramingType = "line-delimited" | "length-prefixed";

/**
 * Handler for incoming requests.
 */
export type RequestHandler = (
  method: string,
  params: unknown,
  id: string | number,
) => Promise<unknown>;

/**
 * Handler for incoming notifications.
 */
export type NotificationHandler = (method: string, params: unknown) => Promise<void>;

/**
 * Options for WorkerChannel.
 */
export interface WorkerChannelOptions {
  transport: WorkerTransport;
  framing: FramingType;
  logger: Logger;
  onRequest: RequestHandler;
  onNotification: NotificationHandler;
  /** Serialization codec for encoding/decoding messages. @default JsonCodec */
  serialization?: SerializationCodec;
}

/**
 * Worker channel - wraps transport with framing and JSON-RPC handling.
 */
export class WorkerChannel {
  private readonly transport: WorkerTransport;
  private readonly framing: FramingType;
  private readonly logger: Logger;
  private readonly onRequest: RequestHandler;
  private readonly onNotification: NotificationHandler;
  private readonly serialization: SerializationCodec;

  private buffer = Buffer.alloc(0);
  private isRunning = false;
  private unsubscribers: Array<() => void> = [];

  constructor(options: WorkerChannelOptions) {
    this.transport = options.transport;
    this.framing = options.framing;
    this.logger = options.logger;
    this.onRequest = options.onRequest;
    this.onNotification = options.onNotification;
    this.serialization = options.serialization ?? new JsonCodec();
  }

  /**
   * Start processing messages.
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;

    // Connect transport
    await this.transport.connect();

    // Setup data handler
    this.unsubscribers.push(
      this.transport.onData((data) => {
        this.handleData(data);
      }),
    );

    this.unsubscribers.push(
      this.transport.onError((error) => {
        this.logger.error("Transport error:", error);
      }),
    );

    this.unsubscribers.push(
      this.transport.onClose(() => {
        this.logger.debug("Transport closed");
        this.isRunning = false;
      }),
    );
  }

  /**
   * Stop processing messages.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    // Unsubscribe from all events
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];

    await this.transport.disconnect();
  }

  /**
   * Send a notification.
   */
  async notify(method: string, params?: unknown): Promise<void> {
    const msg = createNotification(method, params);
    await this.send(msg);
  }

  /**
   * Send a response.
   */
  async respond(id: string | number, result: unknown): Promise<void> {
    const msg = createResponse(id, result);
    await this.send(msg);
  }

  /**
   * Send an error response.
   */
  async respondError(
    id: string | number,
    code: number,
    message: string,
    data?: unknown,
  ): Promise<void> {
    const msg = createErrorResponse(id, code, message, data);
    await this.send(msg);
  }

  /**
   * Handle incoming data.
   */
  private handleData(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);
    this.processBuffer();
  }

  /**
   * Process buffered data to extract complete messages.
   */
  private processBuffer(): void {
    if (this.framing === "line-delimited") {
      this.processLineDelimited();
    } else {
      this.processLengthPrefixed();
    }
  }

  /**
   * Process line-delimited messages (control channel).
   */
  private processLineDelimited(): void {
    while (true) {
      const newlineIndex = this.buffer.indexOf(0x0a); // \n
      if (newlineIndex === -1) break;

      const line = this.buffer.subarray(0, newlineIndex);
      this.buffer = this.buffer.subarray(newlineIndex + 1);

      if (line.length === 0) continue; // Skip empty lines

      void this.handleMessage(line);
    }
  }

  /**
   * Process length-prefixed messages (data channel).
   */
  private processLengthPrefixed(): void {
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32BE(0);

      if (this.buffer.length < 4 + length) {
        break; // Wait for more data
      }

      const payload = this.buffer.subarray(4, 4 + length);
      this.buffer = this.buffer.subarray(4 + length);

      void this.handleMessage(payload);
    }
  }

  /**
   * Handle a complete message.
   */
  private async handleMessage(data: Buffer): Promise<void> {
    try {
      // Use configured serialization codec instead of hardcoded JSON
      const msg: unknown = this.serialization.deserialize(data);

      if (isRequest(msg)) {
        await this.handleRequest(msg);
      } else if (isNotification(msg)) {
        await this.handleNotificationMessage(msg);
      } else {
        this.logger.warn("Unknown message type:", msg);
      }
    } catch (error) {
      this.logger.error("Failed to deserialize message:", error);
    }
  }

  /**
   * Handle a request message.
   */
  private async handleRequest(request: JsonRpcRequest): Promise<void> {
    const { id, method, params } = request;

    if (id === undefined) {
      this.logger.warn("Request missing id");
      return;
    }

    try {
      const result = await this.onRequest(method, params, id);
      // Convert undefined to null for JSON serialization compatibility
      // JSON.stringify omits undefined values, which would create invalid JSON-RPC response
      await this.respond(id, result === undefined ? null : result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.respondError(id, JsonRpcErrorCodes.INTERNAL_ERROR, message);
    }
  }

  /**
   * Handle a notification message.
   */
  private async handleNotificationMessage(notification: JsonRpcNotification): Promise<void> {
    const { method, params } = notification;

    try {
      await this.onNotification(method, params);
    } catch (error) {
      this.logger.error(`Error handling notification '${method}':`, error);
    }
  }

  /**
   * Send a message.
   */
  private async send(msg: JsonRpcResponse | JsonRpcNotification): Promise<void> {
    // Use configured serialization codec instead of hardcoded JSON
    const payload = this.serialization.serialize(msg);

    let data: Buffer;
    if (this.framing === "line-delimited") {
      // Line-delimited: append newline to serialized payload
      data = Buffer.concat([payload, Buffer.from("\n", "utf8")]);
    } else {
      // Length-prefixed: prepend 4-byte length header
      data = Buffer.alloc(4 + payload.length);
      data.writeUInt32BE(payload.length, 0);
      payload.copy(data, 4);
    }

    await this.transport.write(data);
  }
}
