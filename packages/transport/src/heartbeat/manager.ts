/**
 * HeartbeatManager implementation.
 *
 * @packageDocumentation
 * @module Heartbeat
 */

import type { Channel } from "../channel/types.js";
import { ReservedMethods } from "../protocol/reserved-methods.js";
import type { HeartbeatPingParams, HeartbeatPongParams } from "../protocol/reserved-types.js";
import { EventEmitter } from "../utils/events.js";
import { DEFAULT_HEARTBEAT_OPTIONS } from "./constants.js";
import type { HeartbeatOptions, HeartbeatState, HeartbeatEventMap } from "./types.js";

/**
 * Manages heartbeat ping/pong cycle to detect unresponsive workers.
 *
 * The HeartbeatManager sends periodic `__heartbeat_ping__` notifications via the
 * control channel and expects `__heartbeat_pong__` responses within the configured
 * timeout. After `maxMissed` consecutive missed pongs, the worker is declared dead.
 *
 * @example
 * ```typescript
 * const heartbeat = new HeartbeatManager(controlChannel, {
 *   interval: 30000,
 *   timeout: 5000,
 *   maxMissed: 3,
 * });
 *
 * heartbeat.on('heartbeat:pong', ({ latencyMs }) => {
 *   console.log(`Pong received with ${latencyMs}ms latency`);
 * });
 *
 * heartbeat.on('heartbeat:dead', ({ missedCount }) => {
 *   console.log(`Worker dead after ${missedCount} missed pongs`);
 *   // Trigger restart or cleanup
 * });
 *
 * heartbeat.start();
 *
 * // When done
 * heartbeat.stop();
 * ```
 */
export class HeartbeatManager extends EventEmitter<HeartbeatEventMap> {
  private readonly options: Required<HeartbeatOptions>;
  private readonly channel: Channel;

  private state: HeartbeatState = {
    seq: 0,
    lastPongAt: null,
    consecutiveMissed: 0,
    isRunning: false,
    pendingPing: null,
  };

  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  /**
   * Creates a new HeartbeatManager.
   *
   * @param channel - Control channel to send heartbeat notifications on
   * @param options - Configuration options (merged with defaults)
   */
  constructor(channel: Channel, options: Partial<HeartbeatOptions> = {}) {
    super();
    this.channel = channel;
    this.options = { ...DEFAULT_HEARTBEAT_OPTIONS, ...options };
  }

  /**
   * Start heartbeat monitoring.
   * Sends first ping immediately, then at configured interval.
   */
  start(): void {
    if (!this.options.enabled || this.state.isRunning) {
      return;
    }

    this.state.isRunning = true;
    this.emit("heartbeat:start", undefined);

    // Send first ping immediately
    this.sendPing();

    // Schedule recurring pings
    this.intervalHandle = setInterval(() => {
      this.sendPing();
    }, this.options.interval);
  }

  /**
   * Stop heartbeat monitoring.
   * Clears all timers and resets state.
   */
  stop(): void {
    if (!this.state.isRunning) {
      return;
    }

    this.clearTimers();
    this.state.isRunning = false;
    this.state.pendingPing = null;
    this.emit("heartbeat:stop", undefined);
  }

  /**
   * Call when any activity occurs on the channel.
   * If implicitHeartbeat is enabled, resets the missed counter, clears pending ping,
   * and emits heartbeat:recovered if the worker was previously considered unhealthy.
   */
  onActivity(): void {
    if (this.options.implicitHeartbeat) {
      const previousMissed = this.state.consecutiveMissed;
      this.state.consecutiveMissed = 0;

      // Clear pending ping and timeout since we received activity
      if (this.state.pendingPing) {
        this.state.pendingPing = null;
        if (this.timeoutHandle) {
          clearTimeout(this.timeoutHandle);
          this.timeoutHandle = null;
        }
      }

      // Always update lastPongAt on activity
      this.state.lastPongAt = Date.now();

      // Emit recovered if we had missed pongs before (same behavior as handlePong)
      // This ensures ResilientProcessHandle._isHealthy returns to true
      if (previousMissed > 0) {
        this.emit("heartbeat:recovered", {
          missedCount: previousMissed,
        });
      }
    }
  }

  /**
   * Handle incoming pong notification.
   * Should be called by the channel when `__heartbeat_pong__` is received.
   *
   * @param params - The pong notification parameters
   */
  handlePong(params: HeartbeatPongParams): void {
    const { pendingPing } = this.state;

    // Ignore if no ping is pending or seq doesn't match
    if (!pendingPing || params.seq !== pendingPing.seq) {
      return;
    }

    // Clear timeout
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }

    // Calculate latency and update state
    const latencyMs = Date.now() - pendingPing.sentAt;
    this.state.pendingPing = null;
    const previousMissed = this.state.consecutiveMissed;
    this.state.consecutiveMissed = 0;
    this.state.lastPongAt = Date.now();

    this.emit("heartbeat:pong", {
      seq: params.seq,
      latencyMs,
      ...(params.load !== undefined && { load: params.load }),
    });

    // Emit recovered if we had missed pongs before
    if (previousMissed > 0) {
      this.emit("heartbeat:recovered", {
        missedCount: previousMissed,
      });
    }
  }

  /**
   * Get current heartbeat state (readonly).
   */
  getState(): Readonly<HeartbeatState> {
    return { ...this.state };
  }

  /**
   * Get current options (readonly).
   */
  getOptions(): Readonly<Required<HeartbeatOptions>> {
    return { ...this.options };
  }

  /**
   * Check if heartbeat is currently running.
   */
  isRunning(): boolean {
    return this.state.isRunning;
  }

  /**
   * Reset state for restart scenarios.
   * Clears timers and resets all counters.
   */
  reset(): void {
    this.clearTimers();
    this.state = {
      seq: 0,
      lastPongAt: null,
      consecutiveMissed: 0,
      isRunning: false,
      pendingPing: null,
    };
  }

  /**
   * Sends a heartbeat ping notification.
   */
  private sendPing(): void {
    // Don't send new ping if one is already pending
    if (this.state.pendingPing) {
      return;
    }

    const seq = ++this.state.seq;
    const timestamp = Date.now();

    this.state.pendingPing = { seq, sentAt: timestamp };

    // Send ping notification (fire-and-forget)
    const params: HeartbeatPingParams = { timestamp, seq };

    this.channel.notify(ReservedMethods.HEARTBEAT_PING, params).catch(() => {
      // If we can't even send, treat as missed
      this.handleMissed();
    });

    // Schedule timeout check
    this.timeoutHandle = setTimeout(() => {
      if (this.state.pendingPing?.seq === seq) {
        this.handleMissed();
      }
    }, this.options.timeout);
  }

  /**
   * Handles a missed pong (timeout or send failure).
   */
  private handleMissed(): void {
    const seq = this.state.pendingPing?.seq ?? this.state.seq;

    // Clear pending state
    this.state.pendingPing = null;
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }

    // Increment missed counter
    this.state.consecutiveMissed++;

    this.emit("heartbeat:missed", {
      seq,
      missedCount: this.state.consecutiveMissed,
    });

    // Check if dead threshold reached
    if (this.state.consecutiveMissed >= this.options.maxMissed) {
      this.emit("heartbeat:dead", {
        missedCount: this.state.consecutiveMissed,
        lastPongAt: this.state.lastPongAt,
      });
    }
  }

  /**
   * Clears all active timers.
   */
  private clearTimers(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }
}
