import { ProtocolError } from "../utils/errors.js";
import type { Protocol, ParsedMessage, RequestId, ProtocolDataError } from "./types.js";

/**
 * JSON-RPC 2.0 error codes.
 * @see https://www.jsonrpc.org/specification#error_object
 */
export const JsonRpcErrorCodes = {
  /** Invalid JSON was received by the server. */
  PARSE_ERROR: -32700,
  /** The JSON sent is not a valid Request object. */
  INVALID_REQUEST: -32600,
  /** The method does not exist / is not available. */
  METHOD_NOT_FOUND: -32601,
  /** Invalid method parameter(s). */
  INVALID_PARAMS: -32602,
  /** Internal JSON-RPC error. */
  INTERNAL_ERROR: -32603,
  // Server errors: -32000 to -32099 are reserved for implementation-defined server errors
} as const;

/**
 * JSON-RPC 2.0 request message.
 */
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: RequestId;
  method: string;
  params?: unknown;
}

/**
 * JSON-RPC 2.0 response message (success).
 */
export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: RequestId;
  result: unknown;
}

/**
 * JSON-RPC 2.0 error response message.
 */
export interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  id: RequestId;
  error: ProtocolDataError;
}

/**
 * JSON-RPC 2.0 notification message (no response expected).
 */
export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

/**
 * Union of all JSON-RPC message types for responses.
 */
export type JsonRpcResponseMessage = JsonRpcResponse | JsonRpcErrorResponse;

/**
 * JSON-RPC 2.0 protocol implementation.
 *
 * Follows the JSON-RPC 2.0 specification for request/response messaging.
 * Provides strict validation and automatic ID generation.
 *
 * @example
 * ```ts
 * const protocol = new JsonRpcProtocol();
 * const req = protocol.createRequest('getUser', { id: 42 });
 * const res = protocol.createResponse(req.id, { name: 'Alice' });
 * ```
 */
export class JsonRpcProtocol
  implements Protocol<JsonRpcRequest, JsonRpcResponseMessage, JsonRpcNotification>
{
  public readonly name = "jsonrpc";
  public readonly version = "2.0";

  private idCounter = 0;

  /**
   * Creates a JSON-RPC 2.0 request message.
   *
   * @param method - Method name (must be non-empty string)
   * @param params - Optional parameters
   * @param id - Optional request ID (auto-generated if not provided)
   * @returns JSON-RPC request object
   * @throws {ProtocolError} if method is invalid
   */
  createRequest(method: string, params?: unknown, id?: RequestId): JsonRpcRequest {
    if (typeof method !== "string" || method.length === 0) {
      throw new ProtocolError("Method must be a non-empty string");
    }

    const requestId = id ?? this.generateId();

    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: requestId,
      method,
    };

    if (params !== undefined) {
      request.params = params;
    }

    return request;
  }

  /**
   * Creates a JSON-RPC 2.0 success response message.
   *
   * @param id - Request ID
   * @param result - Response result
   * @returns JSON-RPC response object
   */
  createResponse(id: RequestId, result: unknown): JsonRpcResponse {
    return {
      jsonrpc: "2.0",
      id,
      result,
    };
  }

  /**
   * Creates a JSON-RPC 2.0 error response message.
   *
   * @param id - Request ID
   * @param error - Error details
   * @returns JSON-RPC error response object
   */
  createErrorResponse(id: RequestId, error: ProtocolDataError): JsonRpcErrorResponse {
    return {
      jsonrpc: "2.0",
      id,
      error,
    };
  }

  /**
   * Creates a JSON-RPC 2.0 notification message.
   *
   * @param method - Method name (must be non-empty string)
   * @param params - Optional parameters
   * @returns JSON-RPC notification object
   * @throws {ProtocolError} if method is invalid
   */
  createNotification(method: string, params?: unknown): JsonRpcNotification {
    if (typeof method !== "string" || method.length === 0) {
      throw new ProtocolError("Method must be a non-empty string");
    }

    const notification: JsonRpcNotification = {
      jsonrpc: "2.0",
      method,
    };

    if (params !== undefined) {
      notification.params = params;
    }

    return notification;
  }

  /**
   * Parses incoming data as JSON-RPC 2.0 message.
   * Does not throw - returns 'invalid' kind for malformed messages.
   *
   * @param data - Raw incoming data
   * @returns ParsedMessage discriminated union
   */
  parseMessage(
    data: unknown,
  ): ParsedMessage<JsonRpcRequest, JsonRpcResponseMessage, JsonRpcNotification> {
    // Must be an object
    if (!isObject(data)) {
      return {
        kind: "invalid",
        error: {
          code: JsonRpcErrorCodes.INVALID_REQUEST,
          message: "Message must be an object",
        },
        raw: data,
      };
    }

    // Must have jsonrpc: "2.0"
    if (data.jsonrpc !== "2.0") {
      return {
        kind: "invalid",
        error: {
          code: JsonRpcErrorCodes.INVALID_REQUEST,
          message: 'Message must have jsonrpc: "2.0"',
        },
        raw: data,
      };
    }

    // Check if it's a response (has result or error, plus id)
    if ("result" in data || "error" in data) {
      return this.parseResponse(data);
    }

    // Check if it has a method (request or notification)
    if ("method" in data) {
      return this.parseRequestOrNotification(data);
    }

    // Invalid: no method, result, or error
    return {
      kind: "invalid",
      error: {
        code: JsonRpcErrorCodes.INVALID_REQUEST,
        message: "Message must have method, result, or error",
      },
      raw: data,
    };
  }

  /**
   * Type guard for request messages.
   */
  isRequest(
    msg: ParsedMessage<JsonRpcRequest, JsonRpcResponseMessage, JsonRpcNotification>,
  ): msg is Extract<
    ParsedMessage<JsonRpcRequest, JsonRpcResponseMessage, JsonRpcNotification>,
    { kind: "request" }
  > {
    return msg.kind === "request";
  }

  /**
   * Type guard for response messages.
   */
  isResponse(
    msg: ParsedMessage<JsonRpcRequest, JsonRpcResponseMessage, JsonRpcNotification>,
  ): msg is Extract<
    ParsedMessage<JsonRpcRequest, JsonRpcResponseMessage, JsonRpcNotification>,
    { kind: "response" }
  > {
    return msg.kind === "response";
  }

  /**
   * Type guard for notification messages.
   */
  isNotification(
    msg: ParsedMessage<JsonRpcRequest, JsonRpcResponseMessage, JsonRpcNotification>,
  ): msg is Extract<
    ParsedMessage<JsonRpcRequest, JsonRpcResponseMessage, JsonRpcNotification>,
    { kind: "notification" }
  > {
    return msg.kind === "notification";
  }

  /**
   * Parses a response message (success or error).
   */
  private parseResponse(
    data: Record<string, unknown>,
  ): ParsedMessage<JsonRpcRequest, JsonRpcResponseMessage, JsonRpcNotification> {
    // Must have id
    if (!("id" in data)) {
      return {
        kind: "invalid",
        error: {
          code: JsonRpcErrorCodes.INVALID_REQUEST,
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
          code: JsonRpcErrorCodes.INVALID_REQUEST,
          message: "Response id must be string or number",
        },
        raw: data,
      };
    }

    const hasResult = "result" in data;
    const hasError = "error" in data;

    // Must have exactly one of result or error
    if (hasResult && hasError) {
      return {
        kind: "invalid",
        error: {
          code: JsonRpcErrorCodes.INVALID_REQUEST,
          message: "Response must have either result or error, not both",
        },
        raw: data,
      };
    }

    if (!hasResult && !hasError) {
      return {
        kind: "invalid",
        error: {
          code: JsonRpcErrorCodes.INVALID_REQUEST,
          message: "Response must have either result or error",
        },
        raw: data,
      };
    }

    // Valid response
    return {
      kind: "response",
      message: data as unknown as JsonRpcResponseMessage,
    };
  }

  /**
   * Parses a request or notification message.
   */
  private parseRequestOrNotification(
    data: Record<string, unknown>,
  ): ParsedMessage<JsonRpcRequest, JsonRpcResponseMessage, JsonRpcNotification> {
    // Validate method
    if (typeof data.method !== "string" || data.method.length === 0) {
      return {
        kind: "invalid",
        error: {
          code: JsonRpcErrorCodes.INVALID_REQUEST,
          message: "Method must be a non-empty string",
        },
        raw: data,
      };
    }

    // If has id, it's a request
    if ("id" in data) {
      // Validate id type
      if (!isValidId(data.id)) {
        return {
          kind: "invalid",
          error: {
            code: JsonRpcErrorCodes.INVALID_REQUEST,
            message: "Request id must be string or number",
          },
          raw: data,
        };
      }

      return {
        kind: "request",
        message: data as unknown as JsonRpcRequest,
      };
    }

    // No id, it's a notification
    return {
      kind: "notification",
      message: data as unknown as JsonRpcNotification,
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
