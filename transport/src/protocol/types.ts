export type RequestId = string | number;

export type ProtocolError = {
  code: number;
  message: string;
  data?: unknown;
};

export type ParsedMessage =
  | { kind: "request"; id: RequestId; method: string; params?: unknown }
  | { kind: "response"; id: RequestId; result?: unknown; error?: ProtocolError }
  | { kind: "notification"; method: string; params?: unknown };

export interface Protocol<TRequest, TResponse, TNotification> {
  readonly name: string;
  readonly version: string;

  createRequest(method: string, params?: unknown, id?: RequestId): TRequest;
  createResponse(id: RequestId, result: unknown): TResponse;
  createErrorResponse(id: RequestId, error: ProtocolError): TResponse;
  createNotification(method: string, params?: unknown): TNotification;

  parseMessage(data: unknown): ParsedMessage;
  isRequest(msg: unknown): msg is TRequest;
  isResponse(msg: unknown): msg is TResponse;
  isNotification(msg: unknown): msg is TNotification;
}
