/**
 * ReconnectManager implementation.
 *
 * @packageDocumentation
 * @module Reconnect
 */

import { EventEmitter } from "../utils/events.js";
import { DEFAULT_RECONNECT_OPTIONS } from "./constants.js";
import type {
  ReconnectOptions,
  ReconnectState,
  ReconnectEventMap,
  QueuedRequest,
  Reconnectable,
} from "./types.js";

/**
 * Manages automatic reconnection with exponential backoff and request queueing.
 *
 * The ReconnectManager implements exponential backoff with jitter to handle
 * transient connection failures. It can optionally queue requests during
 * reconnection and execute them once the connection is restored.
 *
 * @example
 * ```typescript
 * const reconnect = new ReconnectManager(dataTransport, {
 *   initialDelay: 100,
 *   maxDelay: 30000,
 *   maxAttempts: 10,
 * });
 *
 * reconnect.on('reconnect:success', ({ attempt }) => {
 *   console.log(`Reconnected after ${attempt} attempts`);
 * });
 *
 * reconnect.on('reconnect:failed', ({ lastError }) => {
 *   console.error('Reconnection failed:', lastError);
 * });
 *
 * // When disconnect is detected:
 * const success = await reconnect.handleDisconnect(error);
 * if (!success) {
 *   // Handle permanent failure
 * }
 * ```
 */
export class ReconnectManager extends EventEmitter<ReconnectEventMap> {
  private readonly options: Required<ReconnectOptions>;
  private readonly target: Reconnectable;
  private readonly requestQueue: QueuedRequest[] = [];

  private state: ReconnectState = {
    attempt: 0,
    isReconnecting: false,
    reconnectStartedAt: null,
    queueSize: 0,
    lastError: null,
  };

  private cancelled = false;

  /**
   * Creates a new ReconnectManager.
   *
   * @param target - Object that can be reconnected (has connect() method)
   * @param options - Configuration options (merged with defaults)
   */
  constructor(target: Reconnectable, options: Partial<ReconnectOptions> = {}) {
    super();
    this.target = target;
    this.options = { ...DEFAULT_RECONNECT_OPTIONS, ...options };
  }

  /**
   * Handle unexpected disconnect. Initiates reconnection if enabled.
   *
   * @param error - The error that caused the disconnect
   * @returns Promise that resolves to true if reconnected, false if failed
   */
  async handleDisconnect(error: Error): Promise<boolean> {
    if (!this.options.enabled || this.state.isReconnecting) {
      return false;
    }

    this.cancelled = false;
    this.state.isReconnecting = true;
    this.state.reconnectStartedAt = Date.now();
    this.state.attempt = 0;
    this.state.lastError = error;

    while (this.state.attempt < this.options.maxAttempts && !this.cancelled) {
      this.state.attempt++;
      const delay = this.calculateDelay();

      this.emit("reconnect:attempting", {
        attempt: this.state.attempt,
        delay,
        error: this.state.lastError!,
      });

      await this.sleep(delay);

      // Check if cancelled during sleep
      if (this.cancelled) {
        break;
      }

      try {
        // Check cancellation again right before connect
        if (this.cancelled) {
          break;
        }
        await this.target.connect();

        const totalTimeMs = Date.now() - this.state.reconnectStartedAt!;

        this.emit("reconnect:success", {
          attempt: this.state.attempt,
          totalTimeMs,
        });

        this.state.isReconnecting = false;
        await this.flushQueue();
        return true;
      } catch (connectError) {
        this.state.lastError = connectError as Error;
        // Continue to next attempt
      }
    }

    // Max attempts exceeded or cancelled
    this.emit("reconnect:failed", {
      attempts: this.state.attempt,
      lastError: this.state.lastError!,
    });

    this.state.isReconnecting = false;
    this.rejectQueue(this.state.lastError!);
    return false;
  }

  /**
   * Queue a request to be executed after reconnection.
   * Returns null if not currently reconnecting or queueing is disabled.
   *
   * @param method - Method name for logging
   * @param execute - Function that executes the request
   * @returns Promise that resolves with request result, or null if not queued
   */
  queueRequest<T>(method: string, execute: () => Promise<T>): Promise<T> | null {
    if (!this.state.isReconnecting || !this.options.queueRequests) {
      return null;
    }

    if (this.requestQueue.length >= this.options.maxQueueSize) {
      throw new Error(
        `Request queue full (max ${this.options.maxQueueSize}). ` +
          `Consider increasing maxQueueSize or reducing request rate.`,
      );
    }

    return new Promise<T>((resolve, reject) => {
      const queuedAt = Date.now();

      const timeoutHandle = setTimeout(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.removeFromQueue(request as any);
        const waitedMs = Date.now() - queuedAt;

        this.emit("reconnect:request-timeout", { method, waitedMs });

        reject(
          new Error(`Request '${method}' timed out after ${waitedMs}ms waiting for reconnection`),
        );
      }, this.options.queueTimeout);

      const request: QueuedRequest<T> = {
        method,
        execute,
        resolve,
        reject,
        queuedAt,
        timeoutHandle,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.requestQueue.push(request as any);
      this.state.queueSize = this.requestQueue.length;

      this.emit("reconnect:request-queued", {
        method,
        queueSize: this.state.queueSize,
      });
    });
  }

  /**
   * Get current reconnection state (readonly).
   */
  getState(): Readonly<ReconnectState> {
    return { ...this.state, queueSize: this.requestQueue.length };
  }

  /**
   * Get current options (readonly).
   */
  getOptions(): Readonly<Required<ReconnectOptions>> {
    return { ...this.options };
  }

  /**
   * Check if currently reconnecting.
   */
  isReconnecting(): boolean {
    return this.state.isReconnecting;
  }

  /**
   * Cancel ongoing reconnection attempt.
   * Rejects all queued requests.
   */
  cancel(): void {
    if (!this.state.isReconnecting) {
      return;
    }

    this.cancelled = true;
    // Note: isReconnecting will be set to false when the loop exits
  }

  /**
   * Reset state for restart scenarios.
   */
  reset(): void {
    this.cancelled = false;
    this.rejectQueue(new Error("ReconnectManager reset"));
    this.state = {
      attempt: 0,
      isReconnecting: false,
      reconnectStartedAt: null,
      queueSize: 0,
      lastError: null,
    };
  }

  /**
   * Calculate delay for current attempt using exponential backoff with jitter.
   */
  private calculateDelay(): number {
    // Exponential backoff: initialDelay * multiplier^(attempt-1)
    const exponentialDelay =
      this.options.initialDelay * Math.pow(this.options.multiplier, this.state.attempt - 1);

    // Cap at maxDelay
    const cappedDelay = Math.min(exponentialDelay, this.options.maxDelay);

    // Add jitter: delay * (1 + random(-jitter, +jitter))
    const jitterRange = cappedDelay * this.options.jitter;
    const jitter = (Math.random() * 2 - 1) * jitterRange;

    return Math.round(cappedDelay + jitter);
  }

  /**
   * Flush queued requests after successful reconnection.
   */
  private async flushQueue(): Promise<void> {
    const queue = [...this.requestQueue];
    this.requestQueue.length = 0;
    this.state.queueSize = 0;

    for (const request of queue) {
      clearTimeout(request.timeoutHandle);

      try {
        const result = await request.execute();
        request.resolve(result);
      } catch (error) {
        request.reject(error as Error);
      }
    }
  }

  /**
   * Reject all queued requests with given error.
   */
  private rejectQueue(error: Error): void {
    const queue = [...this.requestQueue];
    this.requestQueue.length = 0;
    this.state.queueSize = 0;

    for (const request of queue) {
      clearTimeout(request.timeoutHandle);
      request.reject(error);
    }
  }

  /**
   * Remove a specific request from the queue.
   */
  private removeFromQueue(request: QueuedRequest): void {
    const index = this.requestQueue.indexOf(request);
    if (index !== -1) {
      this.requestQueue.splice(index, 1);
      this.state.queueSize = this.requestQueue.length;
    }
  }

  /**
   * Sleep for specified milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
