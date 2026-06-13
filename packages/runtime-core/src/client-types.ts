/**
 * Type definitions for the child side
 * (@procwire/client and @procwire/bun-client).
 *
 * @module
 */

import type { Codec } from "@procwire/codecs";
import type { ResponseType } from "./types.js";

/**
 * Method definition for registration.
 *
 * Stores both codecs for dual-codec support:
 * - `requestCodec` — for deserializing incoming requests (parent→child)
 * - `responseCodec` — for serializing outgoing responses (child→parent)
 */
export interface MethodDefinition {
  /** Expected response type */
  response: ResponseType;
  /** Codec for deserializing requests (parent→child direction) */
  requestCodec: Codec;
  /** Codec for serializing responses (child→parent direction) */
  responseCodec: Codec;
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
  /**
   * Maximum accepted inbound payload size in bytes. A frame declaring a larger
   * payload is rejected and the connection is dropped (guards against a hostile
   * or buggy parent exhausting memory). Defaults to the FrameBuffer default.
   */
  maxPayloadSize?: number;

  /**
   * Shared data-plane authentication token. When set, the child requires the
   * FIRST frame on an accepted connection to be an AUTH frame carrying this
   * exact token before adopting the connection; a missing or mismatched token
   * drops the connection. Defaults to `process.env.PROCWIRE_TOKEN` (the parent
   * sets that env var when it enables auth), so embedders normally never set
   * this explicitly. When neither is present, auth is disabled and connections
   * are adopted on accept (backward compatible).
   */
  authToken?: string;
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
 *
 * All response methods are async to properly handle backpressure.
 * Always await these methods to prevent deadlocks with large payloads.
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
   *
   * @returns Promise that resolves when the response has been written
   *          and socket buffer has drained (if backpressure occurred).
   */
  respond(data: unknown): Promise<void>;

  /**
   * Send acknowledgment to parent.
   * Sets IS_RESPONSE | IS_ACK flags.
   *
   * @returns Promise that resolves when the response has been written
   *          and socket buffer has drained (if backpressure occurred).
   */
  ack(data?: unknown): Promise<void>;

  /**
   * Send stream chunk to parent.
   * Sets IS_RESPONSE | IS_STREAM flags.
   *
   * @returns Promise that resolves when the chunk has been written
   *          and socket buffer has drained (if backpressure occurred).
   */
  chunk(data: unknown): Promise<void>;

  /**
   * End stream.
   * Sets IS_RESPONSE | IS_STREAM | STREAM_END flags.
   *
   * @returns Promise that resolves when the end marker has been written
   *          and socket buffer has drained (if backpressure occurred).
   */
  end(): Promise<void>;

  /**
   * Send error response to parent.
   * Sets IS_RESPONSE | IS_ERROR flags.
   *
   * @returns Promise that resolves when the error has been written
   *          and socket buffer has drained (if backpressure occurred).
   */
  error(err: Error | string): Promise<void>;
}

/**
 * Type-safe request context.
 *
 * Response methods (`respond`, `ack`, `chunk`) are typed to `TRes`,
 * providing compile-time safety that the handler sends the correct response type.
 *
 * @typeParam TRes - Expected response data type
 */
export interface TypedRequestContext<TRes = unknown> {
  readonly requestId: number;
  readonly method: string;
  readonly aborted: boolean;
  onAbort(callback: () => void): void;
  respond(data: TRes): Promise<void>;
  ack(data?: TRes): Promise<void>;
  chunk(data: TRes): Promise<void>;
  end(): Promise<void>;
  error(err: Error | string): Promise<void>;
}
