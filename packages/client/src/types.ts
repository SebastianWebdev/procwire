/**
 * Type definitions for @procwire/client.
 *
 * @module
 */

import type { Codec } from "@procwire/codecs";

/**
 * Response type for methods.
 */
export type ResponseType = "result" | "stream" | "ack" | "none";

/**
 * Method definition for registration.
 */
export interface MethodDefinition {
  /** Expected response type */
  response: ResponseType;
  /** Codec for serialization (defaults to msgpack) */
  codec?: Codec;
  /** Can be cancelled via AbortSignal? */
  cancellable?: boolean;
}

/**
 * Event definition for registration.
 */
export interface EventDefinition {
  /** Codec for serialization (defaults to msgpack) */
  codec?: Codec;
}

/**
 * Client configuration options.
 */
export interface ClientOptions {
  /** Default codec for methods and events */
  defaultCodec?: Codec;
}

/**
 * Method handler function type.
 */
export type MethodHandler<TData = unknown> = (
  data: TData,
  ctx: RequestContext,
) => void | Promise<void>;

/**
 * Request context passed to method handlers.
 *
 * Provides methods to send responses back to parent.
 */
export interface RequestContext {
  /** Request ID for correlation */
  readonly requestId: number;

  /** Method name being handled */
  readonly method: string;

  /** Was request aborted by parent? */
  readonly aborted: boolean;

  /**
   * Register callback to be called when request is aborted.
   */
  onAbort(callback: () => void): void;

  /**
   * Send full response to parent.
   * Sets IS_RESPONSE flag.
   */
  respond(data: unknown): void;

  /**
   * Send acknowledgment to parent.
   * Sets IS_RESPONSE | IS_ACK flags.
   */
  ack(data?: unknown): void;

  /**
   * Send stream chunk to parent.
   * Sets IS_RESPONSE | IS_STREAM flags.
   */
  chunk(data: unknown): void;

  /**
   * End stream.
   * Sets IS_RESPONSE | IS_STREAM | STREAM_END flags.
   */
  end(): void;

  /**
   * Send error response to parent.
   * Sets IS_RESPONSE | IS_ERROR flags.
   */
  error(err: Error | string): void;
}
