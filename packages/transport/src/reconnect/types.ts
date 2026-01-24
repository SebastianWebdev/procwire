/**
 * Auto-reconnect manager types.
 *
 * @packageDocumentation
 * @module Reconnect
 */

import type { EventMap } from "../utils/events.js";

/**
 * Configuration options for ReconnectManager.
 */
export interface ReconnectOptions {
  /**
   * Enable auto-reconnect for data channel.
   * @default true
   */
  enabled: boolean;

  /**
   * Initial delay before first retry in milliseconds.
   * @default 100
   */
  initialDelay: number;

  /**
   * Maximum delay between retries in milliseconds.
   * @default 30000
   */
  maxDelay: number;

  /**
   * Backoff multiplier. Delay doubles each retry by default.
   * @default 2
   */
  multiplier: number;

  /**
   * Jitter factor (0-1) to randomize retry timing.
   * Helps prevent thundering herd when multiple connections retry.
   * @default 0.1
   */
  jitter: number;

  /**
   * Maximum number of retry attempts. Use Infinity for unlimited.
   * @default Infinity
   */
  maxAttempts: number;

  /**
   * Queue requests while reconnecting instead of failing immediately.
   * @default true
   */
  queueRequests: boolean;

  /**
   * Maximum number of requests to queue during reconnect.
   * @default 100
   */
  maxQueueSize: number;

  /**
   * Timeout for queued requests in milliseconds.
   * Requests waiting longer than this will be rejected.
   * @default 60000
   */
  queueTimeout: number;
}

/**
 * Internal state of the ReconnectManager.
 */
export interface ReconnectState {
  /** Current attempt number (1-based) */
  attempt: number;

  /** Whether currently attempting to reconnect */
  isReconnecting: boolean;

  /** Timestamp when reconnection started */
  reconnectStartedAt: number | null;

  /** Number of requests currently queued */
  queueSize: number;

  /** Last error that caused disconnect */
  lastError: Error | null;
}

/**
 * Event map for ReconnectManager events.
 */
export interface ReconnectEventMap extends EventMap {
  /**
   * Emitted before each reconnection attempt.
   */
  "reconnect:attempting": {
    attempt: number;
    delay: number;
    error: Error;
  };

  /**
   * Emitted after successful reconnection.
   */
  "reconnect:success": {
    attempt: number;
    totalTimeMs: number;
  };

  /**
   * Emitted when max attempts exceeded or unrecoverable error.
   */
  "reconnect:failed": {
    attempts: number;
    lastError: Error;
  };

  /**
   * Emitted when a request is queued during reconnection.
   */
  "reconnect:request-queued": {
    method: string;
    queueSize: number;
  };

  /**
   * Emitted when a queued request times out.
   */
  "reconnect:request-timeout": {
    method: string;
    waitedMs: number;
  };
}

/**
 * Internal queued request representation.
 */
export interface QueuedRequest<T = unknown> {
  method: string;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  queuedAt: number;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

/**
 * Interface for objects that can be reconnected.
 * Used by ReconnectManager to abstract over different transport types.
 */
export interface Reconnectable {
  /**
   * Attempt to establish connection.
   */
  connect(): Promise<void>;
}
