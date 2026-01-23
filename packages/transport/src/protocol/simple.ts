import { ProtocolError } from "../utils/errors.js";
import type { Protocol, ParsedMessage, RequestId, ProtocolDataError } from "./types.js";

/**
 * Simple protocol request message.
 */
export interface SimpleRequest {
  type: "request";
  id: RequestId;
  method: string;
  params?: unknown;
}

/**
 * Simple protocol response message (success).
 */
export interface SimpleResponse {
  type: "response";
  id: RequestId;
  result?: unknown;
}

/**
 * Simple protocol error response message.
 */
export interface SimpleErrorResponse {
  type: "response";
  id: RequestId;
  error: ProtocolDataError;
}

/**
 * Simple protocol notification message (no response expected).
 */
export interface SimpleNotification {
  type: "notification";
  method: string;
  params?: unknown;
}

/**
 * Union of all simple protocol message types for responses.
 */
export type SimpleResponseMessage = SimpleResponse | SimpleErrorResponse;

/**
 * Minimal protocol implementation with no JSON-RPC overhead.
 *
 * Provides a lightweight request/response/notification protocol
 * suitable for high-performance or custom IPC scenarios.
 *
 * Message format:
 * - Request: `{ type: 'request', id, method, params? }`
 * - Response: `{ type: 'response', id, result?, error? }`
 * - Notification: `{ type: 'notification', method, params? }`
 *
 * @example
 * ```ts
 * const protocol = new SimpleProtocol();
 * const req = protocol.createRequest('getUser', { id: 42 });
 * const res = protocol.createResponse(req.id, { name: 'Alice' });
 * ```
 */
export class SimpleProtocol
  implements Protocol<SimpleRequest, SimpleResponseMessage, SimpleNotification>
{
  public readonly name = "simple";
  public readonly version = "1.0";

  private idCounter = 0;

  /**
   * Creates a simple protocol request message.
   *
   * @param method - Method name (must be non-empty string)
   * @param params - Optional parameters
   * @param id - Optional request ID (auto-generated if not provided)
   * @returns Simple request object
   * @throws {ProtocolError} if method is invalid
   */
  createRequest(method: string, params?: unknown, id?: RequestId): SimpleRequest {
    if (typeof method !== "string" || method.length === 0) {
      throw new ProtocolError("Method must be a non-empty string");
    }

    const requestId = id ?? this.generateId();

    const request: SimpleRequest = {
      type: "request",
      id: requestId,
      method,
    };

    if (params !== undefined) {
      request.params = params;
    }

    return request;
  }

  /**
   * Creates a simple protocol success response message.
   *
   * @param id - Request ID
   * @param result - Response result
   * @returns Simple response object
   */
  createResponse(id: RequestId, result: unknown): SimpleResponse {
    return {
      type: "response",
      id,
      result,
    };
  }

  /**
   * Creates a simple protocol error response message.
   *
   * @param id - Request ID
   * @param error - Error details
   * @returns Simple error response object
   */
  createErrorResponse(id: RequestId, error: ProtocolDataError): SimpleErrorResponse {
    return {
      type: "response",
      id,
      error,
    };
  }

  /**
   * Creates a simple protocol notification message.
   *
   * @param method - Method name (must be non-empty string)
   * @param params - Optional parameters
   * @returns Simple notification object
   * @throws {ProtocolError} if method is invalid
   */
  createNotification(method: string, params?: unknown): SimpleNotification {
    if (typeof method !== "string" || method.length === 0) {
      throw new ProtocolError("Method must be a non-empty string");
    }

    const notification: SimpleNotification = {
      type: "notification",
      method,
    };

    if (params !== undefined) {
      notification.params = params;
    }

    return notification;
  }

  /**
   * Parses incoming data as simple protocol message.
   * Does not throw - returns 'invalid' kind for malformed messages.
   *
   * @param data - Raw incoming data
   * @returns ParsedMessage discriminated union
   */
  parseMessage(
    data: unknown,
  ): ParsedMessage<SimpleRequest, SimpleResponseMessage, SimpleNotification> {
    // Must be an object
    if (!isObject(data)) {
      return {
        kind: "invalid",
        error: {
          code: -1,
          message: "Message must be an object",
        },
        raw: data,
      };
    }

    // Must have type field
    if (!("type" in data) || typeof data.type !== "string") {
      return {
        kind: "invalid",
        error: {
          code: -1,
          message: "Message must have type field",
        },
        raw: data,
      };
    }

    switch (data.type) {
      case "request":
        return this.parseRequest(data);
      case "response":
        return this.parseResponse(data);
      case "notification":
        return this.parseNotification(data);
      default:
        return {
          kind: "invalid",
          error: {
            code: -1,
            message: `Unknown message type: ${data.type}`,
          },
          raw: data,
        };
    }
  }

  /**
   * Type guard for request messages.
   */
  isRequest(
    msg: ParsedMessage<SimpleRequest, SimpleResponseMessage, SimpleNotification>,
  ): msg is Extract<
    ParsedMessage<SimpleRequest, SimpleResponseMessage, SimpleNotification>,
    { kind: "request" }
  > {
    return msg.kind === "request";
  }

  /**
   * Type guard for response messages.
   */
  isResponse(
    msg: ParsedMessage<SimpleRequest, SimpleResponseMessage, SimpleNotification>,
  ): msg is Extract<
    ParsedMessage<SimpleRequest, SimpleResponseMessage, SimpleNotification>,
    { kind: "response" }
  > {
    return msg.kind === "response";
  }

  /**
   * Type guard for notification messages.
   */
  isNotification(
    msg: ParsedMessage<SimpleRequest, SimpleResponseMessage, SimpleNotification>,
  ): msg is Extract<
    ParsedMessage<SimpleRequest, SimpleResponseMessage, SimpleNotification>,
    { kind: "notification" }
  > {
    return msg.kind === "notification";
  }

  /**
   * Parses a request message.
   */
  private parseRequest(
    data: Record<string, unknown>,
  ): ParsedMessage<SimpleRequest, SimpleResponseMessage, SimpleNotification> {
    // Must have id
    if (!("id" in data)) {
      return {
        kind: "invalid",
        error: {
          code: -1,
          message: "Request must have id",
        },
        raw: data,
      };
    }

    // Validate id type
    if (!isValidId(data.id)) {
      return {
        kind: "invalid",
        error: {
          code: -1,
          message: "Request id must be string or number",
        },
        raw: data,
      };
    }

    // Must have method
    if (!("method" in data) || typeof data.method !== "string" || data.method.length === 0) {
      return {
        kind: "invalid",
        error: {
          code: -1,
          message: "Request must have non-empty method string",
        },
        raw: data,
      };
    }

    return {
      kind: "request",
      message: data as unknown as SimpleRequest,
    };
  }

  /**
   * Parses a response message.
   */
  private parseResponse(
    data: Record<string, unknown>,
  ): ParsedMessage<SimpleRequest, SimpleResponseMessage, SimpleNotification> {
    // Must have id
    if (!("id" in data)) {
      return {
        kind: "invalid",
        error: {
          code: -1,
          message: "Response must have id",
        },
        raw: data,
      };
    }

    // Validate id type
    if (!isValidId(data.id)) {
      return {
        kind: "invalid",
        error: {
          code: -1,
          message: "Response id must be string or number",
        },
        raw: data,
      };
    }

    // Must have either result or error (or both is acceptable in simple protocol)
    if (!("result" in data) && !("error" in data)) {
      return {
        kind: "invalid",
        error: {
          code: -1,
          message: "Response must have result or error",
        },
        raw: data,
      };
    }

    return {
      kind: "response",
      message: data as unknown as SimpleResponseMessage,
    };
  }

  /**
   * Parses a notification message.
   */
  private parseNotification(
    data: Record<string, unknown>,
  ): ParsedMessage<SimpleRequest, SimpleResponseMessage, SimpleNotification> {
    // Must have method
    if (!("method" in data) || typeof data.method !== "string" || data.method.length === 0) {
      return {
        kind: "invalid",
        error: {
          code: -1,
          message: "Notification must have non-empty method string",
        },
        raw: data,
      };
    }

    // Must NOT have id
    if ("id" in data) {
      return {
        kind: "invalid",
        error: {
          code: -1,
          message: "Notification must not have id",
        },
        raw: data,
      };
    }

    return {
      kind: "notification",
      message: data as unknown as SimpleNotification,
    };
  }

  /**
   * Generates a unique request ID.
   */
  private generateId(): RequestId {
    return ++this.idCounter;
  }
}

/**
 * Type guard to check if value is an object (non-null).
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Type guard to validate request ID type.
 */
function isValidId(value: unknown): value is RequestId {
  return typeof value === "string" || typeof value === "number";
}
