/**
 * Type definitions for reserved protocol method parameters and results.
 *
 * These types correspond to the Wire Protocol Specification v1.0 reserved methods.
 *
 * @packageDocumentation
 * @module Protocol
 */

// ============================================================================
// Handshake Types
// ============================================================================

/**
 * Parameters for `__handshake__` request (Manager -> Worker).
 */
export interface HandshakeParams {
  /** Protocol version (e.g., "1.0") */
  version: string;

  /** Capabilities supported by the manager */
  capabilities: string[];

  /** Data channel configuration (if data_channel capability is enabled) */
  data_channel?: {
    /** Path to named pipe/unix socket */
    path: string;
    /** Serialization codec name (e.g., "msgpack", "json") */
    serialization: string;
  };
}

/**
 * Result from `__handshake__` response (Worker -> Manager).
 */
export interface HandshakeResult {
  /** Protocol version (e.g., "1.0") */
  version: string;

  /** Capabilities supported by the worker */
  capabilities: string[];

  /** Optional worker information */
  worker_info?: {
    /** Worker name/identifier */
    name: string;
    /** Implementation language (e.g., "rust", "node", "python") */
    language: string;
    /** Worker process ID */
    pid: number;
  };
}

// ============================================================================
// Heartbeat Types
// ============================================================================

/**
 * Parameters for `__heartbeat_ping__` notification (Manager -> Worker).
 */
export interface HeartbeatPingParams {
  /** Unix timestamp (milliseconds) when ping was sent */
  timestamp: number;

  /** Sequence number for ping/pong matching */
  seq: number;
}

/**
 * Parameters for `__heartbeat_pong__` notification (Worker -> Manager).
 */
export interface HeartbeatPongParams {
  /** Unix timestamp (milliseconds) from the ping */
  timestamp: number;

  /** Sequence number (must match ping seq) */
  seq: number;

  /** Optional worker load metrics */
  load?: WorkerLoad;
}

/**
 * Worker load metrics included in heartbeat pong.
 */
export interface WorkerLoad {
  /** CPU usage percentage (0-100) */
  cpu_percent?: number;

  /** Memory usage in megabytes */
  memory_mb?: number;

  /** Number of pending requests */
  pending_requests?: number;

  /** Custom application-specific metrics */
  custom?: Record<string, unknown>;
}

// ============================================================================
// Shutdown Types
// ============================================================================

/**
 * Parameters for `__shutdown__` request (Manager -> Worker).
 */
export interface ShutdownParams {
  /** Timeout for graceful shutdown in milliseconds */
  timeout_ms: number;

  /** Reason for shutdown */
  reason: ShutdownReason;
}

/**
 * Result from `__shutdown__` response (Worker -> Manager).
 */
export interface ShutdownResult {
  /** Acknowledgment status */
  status: "shutting_down";

  /** Number of pending requests that will be drained */
  pending_requests: number;
}

/**
 * Parameters for `__shutdown_complete__` notification (Worker -> Manager).
 * Sent just before the worker process exits.
 */
export interface ShutdownCompleteParams {
  /** Exit code the worker will use */
  exit_code: number;
}

/**
 * Shutdown reasons as defined in Wire Protocol Spec.
 */
export type ShutdownReason =
  | "user_requested"
  | "manager_shutdown"
  | "idle_timeout"
  | "error_threshold"
  | "restart"
  | "heartbeat_dead";

// ============================================================================
// Data Channel Types
// ============================================================================

/**
 * Parameters for `__data_channel_ready__` notification (Worker -> Manager).
 */
export interface DataChannelReadyParams {
  /** Path to the named pipe/unix socket that is now listening */
  path: string;
}

/**
 * Parameters for `__data_channel_error__` notification (Worker -> Manager).
 */
export interface DataChannelErrorParams {
  /** Error code (e.g., "EADDRINUSE") */
  error: string;

  /** Human-readable error message */
  message: string;

  /** Path that failed */
  path: string;
}

// ============================================================================
// Stream Types (Future)
// ============================================================================

/**
 * Direction of stream data flow.
 */
export type StreamDirection = "push" | "pull";

/**
 * Parameters for `__stream_open__` request.
 */
export interface StreamOpenParams {
  /** Unique stream identifier */
  stream_id: string;

  /** Method name for the stream operation */
  method: string;

  /** Stream direction */
  direction: StreamDirection;

  /** Method-specific parameters */
  params?: unknown;

  /** Initial credits to grant */
  initial_credits?: number;
}

/**
 * Result from `__stream_open__` response.
 */
export interface StreamOpenResult {
  /** Stream identifier (echoed back) */
  stream_id: string;

  /** Whether the stream was accepted */
  accepted: boolean;

  /** Credits granted (if accepted) */
  initial_credits?: number;

  /** Rejection reason (if not accepted) */
  reason?: string;
}

/**
 * Parameters for `__stream_data__` notification.
 */
export interface StreamDataParams {
  /** Stream identifier */
  stream_id: string;

  /** Sequence number */
  seq: number;

  /** Payload data (unless Arrow payload) */
  payload?: unknown;

  /** Arrow IPC offset in frame (for hybrid serialization) */
  _arrow_offset?: number;

  /** Arrow IPC length in bytes (for hybrid serialization) */
  _arrow_length?: number;
}

/**
 * Parameters for `__stream_end__` notification.
 */
export interface StreamEndParams {
  /** Stream identifier */
  stream_id: string;

  /** Final sequence number */
  final_seq: number;

  /** Optional checksum for verification */
  checksum?: string;
}

/**
 * Parameters for `__stream_close__` request.
 */
export interface StreamCloseParams {
  /** Stream identifier */
  stream_id: string;
}

/**
 * Result from `__stream_close__` response.
 */
export interface StreamCloseResult {
  /** Stream identifier (echoed back) */
  stream_id: string;

  /** Number of frames sent */
  frames_sent: number;

  /** Number of frames received */
  frames_received: number;

  /** Final result from the stream operation */
  result?: unknown;
}

/**
 * Parameters for `__stream_abort__` notification.
 */
export interface StreamAbortParams {
  /** Stream identifier */
  stream_id: string;

  /** Abort reason */
  reason: string;

  /** Human-readable message */
  message?: string;
}

// ============================================================================
// Flow Control Types (Future)
// ============================================================================

/**
 * Parameters for `__credit_grant__` notification.
 */
export interface CreditGrantParams {
  /** Stream identifier */
  stream_id: string;

  /** Number of credits (frames) granted */
  credits: number;
}

/**
 * Parameters for `__credit_exhausted__` notification.
 */
export interface CreditExhaustedParams {
  /** Stream identifier */
  stream_id: string;

  /** Number of frames waiting to be sent */
  pending_frames: number;
}
