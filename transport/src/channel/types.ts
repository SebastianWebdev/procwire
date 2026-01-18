import type { Unsubscribe } from "../transport/types.js";

export type RequestHandler = (method: string, params: unknown) => unknown | Promise<unknown>;
export type NotificationHandler = (method: string, params: unknown) => void;

export interface Channel<TRequest = unknown, TResponse = unknown> {
  readonly isConnected: boolean;

  start(): Promise<void>;
  close(): Promise<void>;

  request<TParams, TResult>(method: string, params?: TParams): Promise<TResult>;
  notify<TParams>(method: string, params?: TParams): void;

  onRequest(handler: RequestHandler): Unsubscribe;
  onNotification(handler: NotificationHandler): Unsubscribe;
}
