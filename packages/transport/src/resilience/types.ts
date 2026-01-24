/**
 * Type definitions for the Resilience module.
 *
 * @packageDocumentation
 * @module Resilience
 */

import type { Unsubscribe } from "../utils/disposables.js";
import type { HeartbeatOptions } from "../heartbeat/types.js";
import type { ReconnectOptions } from "../reconnect/types.js";
import type { ShutdownOptions } from "../shutdown/types.js";
import type { ShutdownReason } from "../protocol/reserved-types.js";
import type { ProcessHandle, ProcessState, ProcessHandleEvents } from "../process/types.js";
import type { Channel } from "../channel/types.js";

/**
 * Options for creating a ResilientProcessHandle.
 */
export interface ResilientProcessOptions {
  /**
   * Heartbeat configuration.
   * Set to false to disable heartbeat.
   * Partial options will be merged with defaults.
   */
  heartbeat?: Partial<HeartbeatOptions> | false;

  /**
   * Reconnect configuration.
   * Set to false to disable auto-reconnect.
   * Partial options will be merged with defaults.
   */
  reconnect?: Partial<ReconnectOptions> | false;

  /**
   * Shutdown configuration.
   * Set to false to disable graceful shutdown.
   * Partial options will be merged with defaults.
   */
  shutdown?: Partial<ShutdownOptions> | false;
}

/**
 * Extended events for resilient process handle.
 */
export interface ResilientProcessEvents extends ProcessHandleEvents {
  /**
   * Fired when heartbeat is missed (worker may be unresponsive).
   */
  heartbeatMissed: { missedCount: number };

  /**
   * Fired when heartbeat recovers after misses.
   */
  heartbeatRecovered: { missedCount: number };

  /**
   * Fired when worker is determined dead (max misses exceeded).
   */
  heartbeatDead: { missedCount: number; lastPongAt: number | null };

  /**
   * Fired when reconnection is attempting.
   */
  reconnecting: { attempt: number; delay: number };

  /**
   * Fired when reconnection succeeds.
   */
  reconnected: { attempt: number; totalTimeMs: number };

  /**
   * Fired when reconnection fails permanently.
   */
  reconnectFailed: { attempts: number; lastError: Error };

  /**
   * Fired when graceful shutdown starts.
   */
  shutdownStarted: { reason: ShutdownReason };

  /**
   * Fired when worker acknowledges shutdown.
   */
  shutdownAcknowledged: { pendingRequests: number };

  /**
   * Fired when shutdown completes (graceful or forced).
   */
  shutdownComplete: { graceful: boolean; durationMs: number };
}

/**
 * Interface for a resilient process handle with heartbeat, reconnect, and shutdown.
 */
export interface IResilientProcessHandle {
  /**
   * Unique process identifier.
   */
  readonly id: string;

  /**
   * Process ID (OS-level).
   */
  readonly pid: number | null;

  /**
   * Current process state.
   */
  readonly state: ProcessState;

  /**
   * Whether the process is currently healthy (responding to heartbeats).
   */
  readonly isHealthy: boolean;

  /**
   * Whether the process is currently reconnecting.
   */
  readonly isReconnecting: boolean;

  /**
   * Control channel (stdio-based, always available).
   */
  readonly controlChannel: Channel;

  /**
   * Data channel (pipe-based, optional).
   */
  readonly dataChannel: Channel | null;

  /**
   * Underlying process handle.
   */
  readonly handle: ProcessHandle;

  /**
   * Sends a request via control channel.
   * Requests are queued during reconnection if enabled.
   *
   * @param method - Method name
   * @param params - Optional parameters
   * @param timeout - Optional timeout override
   * @returns Promise resolving to response result
   */
  request(method: string, params?: unknown, timeout?: number): Promise<unknown>;

  /**
   * Sends a notification via control channel.
   *
   * @param method - Method name
   * @param params - Optional parameters
   */
  notify(method: string, params?: unknown): Promise<void>;

  /**
   * Sends a request via data channel.
   *
   * @param method - Method name
   * @param params - Optional parameters
   * @param timeout - Optional timeout override
   * @returns Promise resolving to response result
   * @throws {Error} if data channel is not available
   */
  requestViaData(method: string, params?: unknown, timeout?: number): Promise<unknown>;

  /**
   * Initiates graceful shutdown of the process.
   *
   * @param reason - Reason for shutdown
   * @returns Promise that resolves when shutdown is complete
   */
  shutdown(reason?: ShutdownReason): Promise<void>;

  /**
   * Closes the handle and its channels.
   * Does not terminate the process - use shutdown() for that.
   */
  close(): Promise<void>;

  /**
   * Subscribes to handle events.
   *
   * @returns Unsubscribe function
   */
  on<K extends keyof ResilientProcessEvents>(
    event: K,
    handler: (data: ResilientProcessEvents[K]) => void,
  ): Unsubscribe;

  /**
   * Starts the resilience features (heartbeat monitoring, etc.).
   */
  start(): void;

  /**
   * Stops the resilience features.
   */
  stop(): void;
}
