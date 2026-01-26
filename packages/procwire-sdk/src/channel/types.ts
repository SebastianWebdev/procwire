/**
 * Channel types for worker
 */

/**
 * JSON-RPC request message.
 */
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: unknown;
}

/**
 * JSON-RPC response message.
 */
export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

/**
 * JSON-RPC error object.
 */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * JSON-RPC notification (no id).
 */
export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

/**
 * Standard JSON-RPC error codes.
 */
export const JsonRpcErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

/**
 * Check if a message is a request (has id and method).
 */
export function isRequest(msg: unknown): msg is JsonRpcRequest {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as Record<string, unknown>;
  return m.jsonrpc === "2.0" && "method" in m && "id" in m;
}

/**
 * Check if a message is a notification (has method, no id).
 */
export function isNotification(msg: unknown): msg is JsonRpcNotification {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as Record<string, unknown>;
  return m.jsonrpc === "2.0" && "method" in m && !("id" in m);
}

/**
 * Create a success response.
 */
export function createResponse(id: string | number, result: unknown): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

/**
 * Create an error response.
 */
export function createErrorResponse(
  id: string | number,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, data },
  };
}

/**
 * Create a notification message.
 */
export function createNotification(method: string, params?: unknown): JsonRpcNotification {
  return {
    jsonrpc: "2.0",
    method,
    params,
  };
}
