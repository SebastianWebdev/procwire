/**
 * Type definitions for graceful shutdown management.
 *
 * @packageDocumentation
 * @module Shutdown
 */

import type { EventMap } from "../utils/events.js";
import type { ShutdownReason } from "../protocol/reserved-types.js";

/**
 * Options for the ShutdownManager.
 */
export interface ShutdownOptions {
  /**
   * Whether graceful shutdown is enabled.
   * If disabled, processes are killed immediately.
   * @default true
   */
  enabled?: boolean;

  /**
   * Timeout for graceful shutdown in milliseconds.
   * After this time, SIGKILL is sent.
   * @default 5000
   */
  gracefulTimeoutMs?: number;

  /**
   * Additional time to wait after __shutdown_complete__ for process exit.
   * @default 1000
   */
  exitWaitMs?: number;
}

/**
 * Shutdown request payload sent to the worker.
 */
export interface ShutdownRequest {
  /** Shutdown reason */
  reason: ShutdownReason;

  /** Timeout for graceful shutdown in milliseconds */
  timeoutMs: number;
}

/**
 * State of a shutdown operation.
 */
export interface ShutdownState {
  /** Process ID being shut down */
  processId: string;

  /** Current phase of shutdown */
  phase: ShutdownPhase;

  /** When shutdown started */
  startedAt: number;

  /** Number of pending requests reported by worker */
  pendingRequests: number | null;

  /** Worker's reported exit code (from __shutdown_complete__) */
  exitCode: number | null;
}

/**
 * Phases of the shutdown process.
 */
export type ShutdownPhase =
  | "sending_request" // Sending __shutdown__ request
  | "awaiting_ack" // Waiting for __shutdown__ response
  | "draining" // Worker is draining pending requests
  | "awaiting_complete" // Waiting for __shutdown_complete__ notification
  | "force_killing" // Graceful timeout exceeded, sending SIGKILL
  | "completed"; // Shutdown completed

/**
 * Shutdown event map for event emitter.
 */
export interface ShutdownEventMap extends EventMap {
  /**
   * Fired when shutdown starts.
   */
  "shutdown:start": {
    processId: string;
    reason: ShutdownReason;
  };

  /**
   * Fired when worker acknowledges shutdown.
   */
  "shutdown:ack": {
    processId: string;
    pendingRequests: number;
  };

  /**
   * Fired when worker sends __shutdown_complete__.
   */
  "shutdown:complete": {
    processId: string;
    exitCode: number;
  };

  /**
   * Fired when graceful timeout is exceeded and force kill is triggered.
   */
  "shutdown:force": {
    processId: string;
    reason: "timeout" | "no_response";
  };

  /**
   * Fired when shutdown is fully done (process exited).
   */
  "shutdown:done": {
    processId: string;
    graceful: boolean;
    durationMs: number;
  };

  /**
   * Fired when an error occurs during shutdown.
   */
  "shutdown:error": {
    processId: string;
    error: Error;
  };
}

/**
 * Interface for objects that can be gracefully shut down.
 * This is typically a ProcessHandle or similar object.
 */
export interface Shutdownable {
  /**
   * Unique identifier for the process.
   */
  readonly id: string;

  /**
   * Process ID (OS-level).
   */
  readonly pid: number | null;

  /**
   * Sends a request to the process.
   */
  request(method: string, params?: unknown, timeout?: number): Promise<unknown>;

  /**
   * Force kills the process.
   */
  kill(signal?: string): void;

  /**
   * Subscribes to notifications from the process.
   */
  onNotification(method: string, handler: (params: unknown) => void): () => void;
}
