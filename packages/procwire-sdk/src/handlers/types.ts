/**
 * Handler-specific types for @procwire/sdk
 * @packageDocumentation
 */

import type { Handler, NotificationHandler } from "../types.js";

/**
 * Internal handler wrapper that includes metadata.
 * @internal
 */
export interface RegisteredHandler<TParams = unknown, TResult = unknown> {
  handler: Handler<TParams, TResult>;
  method: string;
  registeredAt: number;
}

/**
 * Internal notification handler wrapper.
 * @internal
 */
export interface RegisteredNotificationHandler<TParams = unknown> {
  handler: NotificationHandler<TParams>;
  method: string;
  registeredAt: number;
}
