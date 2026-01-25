/**
 * ShutdownManager implementation.
 *
 * Provides graceful shutdown capabilities for managed processes.
 * Follows the Wire Protocol Specification for shutdown sequence:
 * 1. Send __shutdown__ request with timeout
 * 2. Wait for __shutdown__ response (ack with pending_requests count)
 * 3. Wait for __shutdown_complete__ notification
 * 4. If timeout exceeded, escalate to SIGKILL
 *
 * @packageDocumentation
 * @module Shutdown
 */

import { EventEmitter } from "../utils/events.js";
import { ReservedMethods } from "../protocol/reserved-methods.js";
import type {
  ShutdownParams,
  ShutdownResult,
  ShutdownCompleteParams,
} from "../protocol/reserved-types.js";
import { DEFAULT_SHUTDOWN_OPTIONS } from "./constants.js";
import type {
  ShutdownOptions,
  ShutdownState,
  ShutdownEventMap,
  Shutdownable,
  ShutdownPhase,
} from "./types.js";
import type { ShutdownReason } from "../protocol/reserved-types.js";

/**
 * Manages graceful shutdown of processes with protocol-level coordination.
 *
 * The ShutdownManager implements the Wire Protocol shutdown sequence:
 * 1. Sends `__shutdown__` request to the worker with a timeout
 * 2. Worker responds with pending request count
 * 3. Worker drains pending requests and sends `__shutdown_complete__`
 * 4. If graceful timeout is exceeded, SIGKILL is sent
 *
 * @example
 * ```typescript
 * const shutdown = new ShutdownManager({
 *   gracefulTimeoutMs: 5000,
 * });
 *
 * shutdown.on('shutdown:complete', ({ processId, exitCode }) => {
 *   console.log(`Process ${processId} completed with exit code ${exitCode}`);
 * });
 *
 * shutdown.on('shutdown:force', ({ processId, reason }) => {
 *   console.warn(`Process ${processId} force killed: ${reason}`);
 * });
 *
 * // Initiate graceful shutdown
 * await shutdown.initiateShutdown(processHandle, 'user_requested');
 * ```
 */
export class ShutdownManager extends EventEmitter<ShutdownEventMap> {
  private readonly options: Required<ShutdownOptions>;
  private readonly activeShutdowns = new Map<string, ShutdownState>();

  /**
   * Creates a new ShutdownManager.
   *
   * @param options - Configuration options (merged with defaults)
   */
  constructor(options: Partial<ShutdownOptions> = {}) {
    super();
    this.options = { ...DEFAULT_SHUTDOWN_OPTIONS, ...options };
  }

  /**
   * Initiates graceful shutdown of a process.
   *
   * @param target - The process to shut down
   * @param reason - Reason for shutdown
   * @returns Promise that resolves when shutdown is complete (graceful or forced)
   */
  async initiateShutdown(target: Shutdownable, reason: ShutdownReason): Promise<void> {
    const processId = target.id;

    // Check if already shutting down
    if (this.activeShutdowns.has(processId)) {
      throw new Error(`Process '${processId}' is already being shut down`);
    }

    // If graceful shutdown is disabled, just kill
    if (!this.options.enabled) {
      this.forceKill(target, "no_response");
      return;
    }

    const state: ShutdownState = {
      processId,
      phase: "sending_request",
      startedAt: Date.now(),
      pendingRequests: null,
      exitCode: null,
    };

    this.activeShutdowns.set(processId, state);

    this.emit("shutdown:start", { processId, reason });

    try {
      await this.performGracefulShutdown(target, reason, state);
    } finally {
      this.activeShutdowns.delete(processId);
    }
  }

  /**
   * Gets the current shutdown state for a process.
   */
  getState(processId: string): Readonly<ShutdownState> | null {
    const state = this.activeShutdowns.get(processId);
    return state ? { ...state } : null;
  }

  /**
   * Checks if a process is currently being shut down.
   */
  isShuttingDown(processId: string): boolean {
    return this.activeShutdowns.has(processId);
  }

  /**
   * Get current options (readonly).
   */
  getOptions(): Readonly<Required<ShutdownOptions>> {
    return { ...this.options };
  }

  /**
   * Performs the graceful shutdown sequence.
   *
   * The gracefulTimeoutMs is enforced as a single overall limit for the entire
   * shutdown sequence (ack + drain + complete), not as separate timeouts for each phase.
   */
  private async performGracefulShutdown(
    target: Shutdownable,
    reason: ShutdownReason,
    state: ShutdownState,
  ): Promise<void> {
    const processId = target.id;

    // Set up __shutdown_complete__ notification listener
    let shutdownCompleteReceived = false;
    let resolveComplete: () => void;
    const completePromise = new Promise<void>((resolve) => {
      resolveComplete = resolve;
    });

    const unsubscribe = target.onNotification(
      ReservedMethods.SHUTDOWN_COMPLETE,
      (params: unknown) => {
        const completeParams = params as ShutdownCompleteParams;
        state.exitCode = completeParams.exit_code;
        state.phase = "completed";
        shutdownCompleteReceived = true;

        this.emit("shutdown:complete", {
          processId,
          exitCode: completeParams.exit_code,
        });

        resolveComplete();
      },
    );

    try {
      // Phase 1: Send __shutdown__ request
      state.phase = "awaiting_ack";

      const shutdownParams: ShutdownParams = {
        timeout_ms: this.options.gracefulTimeoutMs,
        reason,
      };

      let ackReceived = false;

      // Calculate remaining time for ack phase
      const ackTimeout = this.getRemainingTime(state.startedAt);
      if (ackTimeout <= 0) {
        this.forceKill(target, "timeout");
        return;
      }

      try {
        const response = (await target.request(
          ReservedMethods.SHUTDOWN,
          shutdownParams,
          ackTimeout,
        )) as ShutdownResult;

        ackReceived = true;
        state.pendingRequests = response.pending_requests;
        state.phase = "draining";

        this.emit("shutdown:ack", {
          processId,
          pendingRequests: response.pending_requests,
        });
      } catch (error) {
        // Worker didn't respond to shutdown request - force kill
        this.emit("shutdown:error", {
          processId,
          error: error instanceof Error ? error : new Error(String(error)),
        });
        this.forceKill(target, "no_response");
        return;
      }

      // Phase 2: Wait for __shutdown_complete__ or timeout
      if (ackReceived) {
        state.phase = "awaiting_complete";

        // Calculate remaining time for complete phase
        const completeTimeout = this.getRemainingTime(state.startedAt);
        if (completeTimeout <= 0) {
          state.phase = "force_killing";
          this.forceKill(target, "timeout");
          return;
        }

        const timeoutPromise = this.createTimeout(completeTimeout);

        const result = await Promise.race([
          completePromise.then(() => "complete" as const),
          timeoutPromise.then(() => "timeout" as const),
        ]);

        if (result === "timeout" && !shutdownCompleteReceived) {
          // Graceful timeout exceeded - force kill
          state.phase = "force_killing";
          this.forceKill(target, "timeout");
          return;
        }

        // Wait a bit for process to actually exit
        await this.sleep(this.options.exitWaitMs);

        const durationMs = Date.now() - state.startedAt;
        this.emit("shutdown:done", {
          processId,
          graceful: true,
          durationMs,
        });
      }
    } finally {
      unsubscribe();
    }
  }

  /**
   * Force kills a process with SIGKILL.
   */
  private forceKill(target: Shutdownable, reason: "timeout" | "no_response"): void {
    const processId = target.id;
    const state = this.activeShutdowns.get(processId);
    const startedAt = state?.startedAt ?? Date.now();

    this.emit("shutdown:force", { processId, reason });

    try {
      target.kill("SIGKILL");
    } catch {
      // Process may already be dead
    }

    const durationMs = Date.now() - startedAt;
    this.emit("shutdown:done", {
      processId,
      graceful: false,
      durationMs,
    });
  }

  /**
   * Updates the phase of an active shutdown.
   */
  private updatePhase(processId: string, phase: ShutdownPhase): void {
    const state = this.activeShutdowns.get(processId);
    if (state) {
      state.phase = phase;
    }
  }

  /**
   * Calculates remaining time from the overall graceful timeout.
   * Returns 0 if the timeout has already been exceeded.
   */
  private getRemainingTime(startedAt: number): number {
    return Math.max(0, this.options.gracefulTimeoutMs - (Date.now() - startedAt));
  }

  /**
   * Creates a timeout promise.
   */
  private createTimeout(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Sleep for specified milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
