/**
 * Shutdown protocol handler.
 * @packageDocumentation
 */

/**
 * Reason for shutdown.
 */
export type ShutdownReason =
  | "user_requested"
  | "manager_shutdown"
  | "idle_timeout"
  | "error_threshold"
  | "restart"
  | "heartbeat_dead";

/**
 * Parameters received in a shutdown request from the manager.
 */
export interface ShutdownParams {
  /** Timeout for draining pending requests (ms) */
  timeout_ms: number;
  /** Reason for shutdown */
  reason: ShutdownReason;
}

/**
 * Result returned by the worker acknowledging shutdown.
 */
export interface ShutdownResult {
  /** Status indicating shutdown is in progress */
  status: "shutting_down";
  /** Number of pending requests to drain */
  pending_requests: number;
}

/**
 * Parameters sent by worker when shutdown is complete.
 */
export interface ShutdownCompleteParams {
  /** Exit code the worker will use */
  exit_code: number;
}

/**
 * Create a shutdown acknowledgment response.
 *
 * @param pendingRequests - Number of currently pending requests
 * @returns Shutdown result to send back
 *
 * @example
 * ```ts
 * const response = createShutdownResponse(3);
 * // { status: 'shutting_down', pending_requests: 3 }
 * ```
 */
export function createShutdownResponse(pendingRequests: number): ShutdownResult {
  return {
    status: "shutting_down",
    pending_requests: pendingRequests,
  };
}

/**
 * Create parameters for shutdown complete notification.
 *
 * @param exitCode - Exit code the worker will use
 * @returns Shutdown complete params to send
 *
 * @example
 * ```ts
 * const params = createShutdownCompleteParams(0);
 * // { exit_code: 0 }
 * ```
 */
export function createShutdownCompleteParams(exitCode: number): ShutdownCompleteParams {
  return { exit_code: exitCode };
}

/**
 * Validate that shutdown parameters are well-formed.
 *
 * @param params - Parameters to validate
 * @throws {Error} If params are invalid
 */
export function validateShutdownParams(params: unknown): asserts params is ShutdownParams {
  if (!params || typeof params !== "object") {
    throw new Error("Invalid shutdown params: expected object");
  }
  const p = params as Record<string, unknown>;
  if (typeof p.timeout_ms !== "number") {
    throw new Error("Invalid shutdown params: timeout_ms must be a number");
  }
  if (typeof p.reason !== "string") {
    throw new Error("Invalid shutdown params: reason must be a string");
  }
}
