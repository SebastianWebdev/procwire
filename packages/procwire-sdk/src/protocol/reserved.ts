/**
 * Reserved method constants and validation.
 * @packageDocumentation
 */

export const RESERVED_PREFIX = "__";
export const RESERVED_SUFFIX = "__";

/**
 * Reserved protocol method names.
 * These methods are handled automatically by the SDK and cannot be overridden by user code.
 */
export const ReservedMethods = {
  HANDSHAKE: "__handshake__",
  HEARTBEAT_PING: "__heartbeat_ping__",
  HEARTBEAT_PONG: "__heartbeat_pong__",
  DATA_CHANNEL_READY: "__data_channel_ready__",
  DATA_CHANNEL_ERROR: "__data_channel_error__",
  SHUTDOWN: "__shutdown__",
  SHUTDOWN_COMPLETE: "__shutdown_complete__",
  // Streaming (v0.5.0)
  STREAM_OPEN: "__stream_open__",
  STREAM_DATA: "__stream_data__",
  STREAM_END: "__stream_end__",
  STREAM_CLOSE: "__stream_close__",
  STREAM_ABORT: "__stream_abort__",
  // Flow Control (v0.5.0)
  CREDIT_GRANT: "__credit_grant__",
  CREDIT_EXHAUSTED: "__credit_exhausted__",
} as const;

/**
 * Type representing any reserved method name.
 */
export type ReservedMethod = (typeof ReservedMethods)[keyof typeof ReservedMethods];

/**
 * Check if a method name is reserved.
 * Reserved methods start and end with `__`.
 *
 * @param method - Method name to check
 * @returns `true` if the method is reserved
 *
 * @example
 * ```ts
 * isReservedMethod('__handshake__'); // true
 * isReservedMethod('echo'); // false
 * isReservedMethod('__partial'); // false
 * ```
 */
export function isReservedMethod(method: string): boolean {
  return method.startsWith(RESERVED_PREFIX) && method.endsWith(RESERVED_SUFFIX);
}

/**
 * Validate that a method name is not reserved.
 * User-defined methods cannot start and end with `__`.
 *
 * @param method - Method name to validate
 * @throws {Error} If method name is reserved
 *
 * @example
 * ```ts
 * validateUserMethod('echo'); // OK
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

/**
 * Methods that are automatically handled by the worker.
 * These respond to manager protocol messages without user intervention.
 */
export const WORKER_AUTO_HANDLED_METHODS: readonly ReservedMethod[] = [
  ReservedMethods.HANDSHAKE,
  ReservedMethods.HEARTBEAT_PING,
  ReservedMethods.SHUTDOWN,
];
