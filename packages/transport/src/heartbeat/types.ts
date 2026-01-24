/**
 * Heartbeat manager types.
 *
 * @packageDocumentation
 * @module Heartbeat
 */

import type { WorkerLoad } from "../protocol/reserved-types.js";
import type { EventMap } from "../utils/events.js";

/**
 * Configuration options for HeartbeatManager.
 */
export interface HeartbeatOptions {
  /**
   * Enable heartbeat monitoring.
   * @default true
   */
  enabled: boolean;

  /**
   * Interval between heartbeat pings in milliseconds.
   * @default 30000
   */
  interval: number;

  /**
   * Timeout waiting for pong response in milliseconds.
   * @default 5000
   */
  timeout: number;

  /**
   * Number of consecutive missed pongs before declaring worker dead.
   * @default 3
   */
  maxMissed: number;

  /**
   * Treat any successful request/response as implicit heartbeat.
   * Resets missed counter on activity.
   * @default true
   */
  implicitHeartbeat: boolean;
}

/**
 * Internal state of the HeartbeatManager.
 */
export interface HeartbeatState {
  /** Current sequence number */
  seq: number;

  /** Timestamp of last successful pong */
  lastPongAt: number | null;

  /** Number of consecutive missed pongs */
  consecutiveMissed: number;

  /** Whether heartbeat is currently running */
  isRunning: boolean;

  /** Pending ping awaiting pong */
  pendingPing: {
    seq: number;
    sentAt: number;
  } | null;
}

/**
 * Event map for HeartbeatManager events.
 */
export interface HeartbeatEventMap extends EventMap {
  /**
   * Emitted when a pong is received.
   */
  "heartbeat:pong": {
    seq: number;
    latencyMs: number;
    load?: WorkerLoad;
  };

  /**
   * Emitted when a pong times out.
   */
  "heartbeat:missed": {
    seq: number;
    missedCount: number;
  };

  /**
   * Emitted when heartbeat recovers after missed pongs.
   */
  "heartbeat:recovered": {
    missedCount: number;
  };

  /**
   * Emitted when worker is declared dead (maxMissed reached).
   */
  "heartbeat:dead": {
    missedCount: number;
    lastPongAt: number | null;
  };

  /**
   * Emitted when heartbeat starts.
   */
  "heartbeat:start": undefined;

  /**
   * Emitted when heartbeat stops.
   */
  "heartbeat:stop": undefined;
}
