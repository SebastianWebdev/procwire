/**
 * Request identifier (string or number).
 */
export type RequestId = string | number;

/**
 * Protocol error data structure (not the runtime error class).
 * Used in error responses at protocol level.
 */
export interface ProtocolErrorData {
  /**
   * Error code (e.g., -32600 for JSON-RPC, or custom codes).
   */
  code: number;

  /**
   * Human-readable error message.
   */
  message: string;

  /**
   * Optional additional error data.
   */
  data?: unknown;
}

/**
 * Parsed message discriminated union.
 */
export type ParsedMessage<TReq = unknown, TRes = unknown, TNotif = unknown> =
  | { type: "request"; id: RequestId; data: TReq }
  | { type: "response"; id: RequestId; data: TRes }
  | { type: "error"; id: RequestId; error: ProtocolErrorData }
  | { type: "notification"; data: TNotif }
  | { type: "invalid"; reason: string };

/**
 * Protocol layer interface for request/response messaging.
 * Implementations: JSON-RPC 2.0, custom protocols.
 *
 * @template TReq - Request data type
 * @template TRes - Response data type
 * @template TNotif - Notification data type
 */
export interface Protocol<TReq = unknown, TRes = unknown, TNotif = unknown> {
  /**
   * Creates a request message.
   */
  createRequest(id: RequestId, data: TReq): unknown;

  /**
   * Creates a success response message.
   */
  createResponse(id: RequestId, data: TRes): unknown;

  /**
   * Creates an error response message.
   */
  createErrorResponse(id: RequestId, error: ProtocolErrorData): unknown;

  /**
   * Creates a notification message (no response expected).
   */
  createNotification(data: TNotif): unknown;

  /**
   * Parses incoming message and determines its type.
   * @returns ParsedMessage discriminated union
   */
  parseMessage(data: unknown): ParsedMessage<TReq, TRes, TNotif>;

  /**
   * Type guard for request messages.
   */
  isRequest(
    msg: ParsedMessage<TReq, TRes, TNotif>,
  ): msg is Extract<ParsedMessage<TReq, TRes, TNotif>, { type: "request" }>;

  /**
   * Type guard for response messages (success or error).
   */
  isResponse(
    msg: ParsedMessage<TReq, TRes, TNotif>,
  ): msg is Extract<ParsedMessage<TReq, TRes, TNotif>, { type: "response" | "error" }>;

  /**
   * Type guard for notification messages.
   */
  isNotification(
    msg: ParsedMessage<TReq, TRes, TNotif>,
  ): msg is Extract<ParsedMessage<TReq, TRes, TNotif>, { type: "notification" }>;
}
