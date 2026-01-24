/**
 * Reserved protocol methods as defined in Wire Protocol Specification v1.0.
 *
 * Reserved methods handle protocol-level concerns (handshake, heartbeat, etc.)
 * and MUST NOT be used by application code.
 *
 * @packageDocumentation
 * @module Protocol
 */

/**
 * Prefix for all reserved protocol methods.
 */
export const RESERVED_PREFIX = "__";

/**
 * Suffix for all reserved protocol methods.
 */
export const RESERVED_SUFFIX = "__";

/**
 * All reserved method names as defined in Wire Protocol Spec v1.0.
 *
 * @example
 * ```typescript
 * import { ReservedMethods } from '@procwire/transport';
 *
 * // Send heartbeat ping
 * await channel.notify(ReservedMethods.HEARTBEAT_PING, { timestamp: Date.now(), seq: 1 });
 * ```
 */
export const ReservedMethods = {
  // Handshake
  /** Initialize connection, negotiate capabilities */
  HANDSHAKE: "__handshake__",

  // Heartbeat
  /** Manager -> Worker: Check if worker is alive */
  HEARTBEAT_PING: "__heartbeat_ping__",
  /** Worker -> Manager: Respond to ping with optional load metrics */
  HEARTBEAT_PONG: "__heartbeat_pong__",

  // Data Channel Lifecycle
  /** Worker -> Manager: Signal that data channel server is listening */
  DATA_CHANNEL_READY: "__data_channel_ready__",
  /** Worker -> Manager: Report data channel error */
  DATA_CHANNEL_ERROR: "__data_channel_error__",

  // Shutdown
  /** Manager -> Worker: Request graceful shutdown */
  SHUTDOWN: "__shutdown__",
  /** Worker -> Manager: Confirm shutdown complete (sent just before exit) */
  SHUTDOWN_COMPLETE: "__shutdown_complete__",

  // Streaming (future)
  /** Open a new stream */
  STREAM_OPEN: "__stream_open__",
  /** Send stream data frame */
  STREAM_DATA: "__stream_data__",
  /** Signal end of stream */
  STREAM_END: "__stream_end__",
  /** Close stream and get final result */
  STREAM_CLOSE: "__stream_close__",
  /** Abort stream due to error */
  STREAM_ABORT: "__stream_abort__",

  // Flow Control (future)
  /** Grant permission to send N frames */
  CREDIT_GRANT: "__credit_grant__",
  /** Notify that producer is waiting for credits */
  CREDIT_EXHAUSTED: "__credit_exhausted__",
} as const;

/**
 * Type representing any reserved method name.
 */
export type ReservedMethod = (typeof ReservedMethods)[keyof typeof ReservedMethods];

/**
 * Check if a method name is reserved (starts and ends with __).
 *
 * @param method - Method name to check
 * @returns true if the method is reserved
 *
 * @example
 * ```typescript
 * isReservedMethod('__handshake__'); // true
 * isReservedMethod('myMethod');      // false
 * isReservedMethod('__partial');     // false (no suffix)
 * ```
 */
export function isReservedMethod(method: string): boolean {
  return method.startsWith(RESERVED_PREFIX) && method.endsWith(RESERVED_SUFFIX);
}

/**
 * Validate that a user method name is not reserved.
 *
 * @param method - Method name to validate
 * @throws {Error} if method name is reserved
 *
 * @example
 * ```typescript
 * validateUserMethod('myMethod');     // OK
 * validateUserMethod('__handshake__'); // throws Error
 * ```
 */
export function validateUserMethod(method: string): void {
  if (isReservedMethod(method)) {
    throw new Error(
      `Method '${method}' is reserved for protocol use. ` +
        `User methods cannot start and end with '__'.`,
    );
  }
}
