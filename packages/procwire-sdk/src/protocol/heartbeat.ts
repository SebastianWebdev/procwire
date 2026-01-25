/**
 * Heartbeat protocol handler.
 * @packageDocumentation
 */

/**
 * Parameters received in a heartbeat ping from the manager.
 */
export interface HeartbeatPingParams {
  /** Timestamp when the ping was sent (ms since epoch) */
  timestamp: number;
  /** Sequence number for tracking */
  seq: number;
}

/**
 * Parameters sent in a heartbeat pong response.
 */
export interface HeartbeatPongParams {
  /** Echoed timestamp from ping */
  timestamp: number;
  /** Echoed sequence number */
  seq: number;
  /** Optional worker load metrics */
  load?: WorkerLoadMetrics;
}

/**
 * Worker load metrics included in heartbeat responses.
 */
export interface WorkerLoadMetrics {
  /** CPU usage percentage (if available) */
  cpu_percent?: number;
  /** Memory usage in MB */
  memory_mb?: number;
  /** Number of pending requests */
  pending_requests?: number;
  /** Custom metrics from user code */
  custom?: Record<string, unknown>;
}

/**
 * Collect current worker load metrics.
 *
 * @param pendingRequests - Number of currently pending requests
 * @returns Current load metrics
 *
 * @example
 * ```ts
 * const metrics = collectLoadMetrics(5);
 * // { memory_mb: 48, pending_requests: 5 }
 * ```
 */
export function collectLoadMetrics(pendingRequests: number): WorkerLoadMetrics {
  const memUsage = process.memoryUsage();
  return {
    memory_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
    pending_requests: pendingRequests,
  };
}

/**
 * Create a heartbeat pong response.
 *
 * @param ping - The ping parameters received
 * @param pendingRequests - Number of currently pending requests
 * @returns Pong parameters to send back
 *
 * @example
 * ```ts
 * const pong = createHeartbeatPong(ping, 3);
 * // { timestamp: 1234567890, seq: 42, load: { memory_mb: 48, pending_requests: 3 } }
 * ```
 */
export function createHeartbeatPong(
  ping: HeartbeatPingParams,
  pendingRequests: number,
): HeartbeatPongParams {
  return {
    timestamp: ping.timestamp,
    seq: ping.seq,
    load: collectLoadMetrics(pendingRequests),
  };
}

/**
 * Validate that heartbeat ping parameters are well-formed.
 *
 * @param params - Parameters to validate
 * @throws {Error} If params are invalid
 */
export function validateHeartbeatPingParams(
  params: unknown,
): asserts params is HeartbeatPingParams {
  if (!params || typeof params !== "object") {
    throw new Error("Invalid heartbeat ping params: expected object");
  }
  const p = params as Record<string, unknown>;
  if (typeof p.timestamp !== "number" || typeof p.seq !== "number") {
    throw new Error("Invalid heartbeat ping params: timestamp and seq must be numbers");
  }
}
