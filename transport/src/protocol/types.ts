/**
 * Request identifier (string or number).
 */
export type RequestId = string | number;

/**
 * Protocol error data structure (not the runtime error class).
 * Used in error responses at protocol level.
 */
export interface ProtocolDataError {
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
 * Represents the result of parsing an incoming protocol message.
 */
export type ParsedMessage<TReq = unknown, TRes = unknown, TNotif = unknown> =
  | { kind: "request"; message: TReq }
  | { kind: "response"; message: TRes }
  | { kind: "notification"; message: TNotif }
  | { kind: "invalid"; error: ProtocolDataError; raw: unknown };

/**
 * Protocol layer interface for request/response messaging.
 * Implementations: JSON-RPC 2.0, SimpleProtocol.
 *
 * Generic type parameters represent the wire format of messages,
 * not application-level data types.
 *
 * @template TReq - Request message type (wire format)
 * @template TRes - Response message type (wire format)
 * @template TNotif - Notification message type (wire format)
 */
export interface Protocol<TReq = unknown, TRes = unknown, TNotif = unknown> {
  /**
   * Protocol name identifier.
   */
  readonly name: string;

  /**
   * Protocol version.
   */
  readonly version: string;

  /**
   * Creates a request message.
   * @param method - Method name
   * @param params - Optional parameters
   * @param id - Optional request ID (auto-generated if not provided)
   * @returns Wire format request message
   */
  createRequest(method: string, params?: unknown, id?: RequestId): TReq;

  /**
   * Creates a success response message.
   * @param id - Request ID this response corresponds to
   * @param result - Response result data
   * @returns Wire format response message
   */
  createResponse(id: RequestId, result: unknown): TRes;

  /**
   * Creates an error response message.
   * @param id - Request ID this error corresponds to
   * @param error - Error details
   * @returns Wire format error response message
   */
  createErrorResponse(id: RequestId, error: ProtocolDataError): TRes;

  /**
   * Creates a notification message (no response expected).
   * @param method - Method name
   * @param params - Optional parameters
   * @returns Wire format notification message
   */
  createNotification(method: string, params?: unknown): TNotif;

  /**
   * Parses incoming message and determines its type.
   * Does not throw - returns 'invalid' kind for malformed messages.
   *
   * @param data - Raw incoming data
   * @returns ParsedMessage discriminated union
   */
  parseMessage(data: unknown): ParsedMessage<TReq, TRes, TNotif>;

  /**
   * Type guard for request messages.
   */
  isRequest(
    msg: ParsedMessage<TReq, TRes, TNotif>,
  ): msg is Extract<ParsedMessage<TReq, TRes, TNotif>, { kind: "request" }>;

  /**
   * Type guard for response messages.
   */
  isResponse(
    msg: ParsedMessage<TReq, TRes, TNotif>,
  ): msg is Extract<ParsedMessage<TReq, TRes, TNotif>, { kind: "response" }>;

  /**
   * Type guard for notification messages.
   */
  isNotification(
    msg: ParsedMessage<TReq, TRes, TNotif>,
  ): msg is Extract<ParsedMessage<TReq, TRes, TNotif>, { kind: "notification" }>;
}
