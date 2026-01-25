/**
 * ResilientProcessHandle implementation.
 *
 * Wraps a ProcessHandle with heartbeat monitoring, auto-reconnect,
 * and graceful shutdown capabilities.
 *
 * @packageDocumentation
 * @module Resilience
 */

import { EventEmitter } from "../utils/events.js";
import { HeartbeatManager, DEFAULT_HEARTBEAT_OPTIONS } from "../heartbeat/index.js";
import { ReconnectManager, DEFAULT_RECONNECT_OPTIONS } from "../reconnect/index.js";
import { ShutdownManager, DEFAULT_SHUTDOWN_OPTIONS } from "../shutdown/index.js";
import { ReservedMethods } from "../protocol/reserved-methods.js";
import type { ProcessHandle, ProcessState } from "../process/types.js";
import type { Channel } from "../channel/types.js";
import type { Unsubscribe } from "../utils/disposables.js";
import type { HeartbeatPongParams, ShutdownReason } from "../protocol/reserved-types.js";
import type { Reconnectable } from "../reconnect/types.js";
import type { Shutdownable } from "../shutdown/types.js";
import type {
  IResilientProcessHandle,
  ResilientProcessEvents,
  ResilientProcessOptions,
} from "./types.js";

/**
 * Creates a Reconnectable adapter from a ProcessHandle.
 */
function createReconnectable(_handle: ProcessHandle): Reconnectable {
  return {
    connect: async () => {
      // For stdio-based handles, we can't truly "reconnect" -
      // the transport would need to be recreated.
      // This is a placeholder for when reconnection is handled at
      // a higher level (ProcessManager).
      throw new Error("Reconnection not implemented for ProcessHandle");
    },
  };
}

/**
 * Creates a Shutdownable adapter from a ProcessHandle and control channel.
 */
function createShutdownable(handle: ProcessHandle, kill: (signal?: string) => void): Shutdownable {
  return {
    id: handle.id,
    pid: handle.pid,
    request: (method, params, timeout) => handle.request(method, params, timeout),
    kill,
    onNotification: (method, handler) => {
      // Subscribe to notifications from the control channel
      // The channel's onNotification returns an unsubscribe function
      const channel = handle.controlChannel;

      // We need to filter notifications by method
      const wrappedHandler = (notification: unknown) => {
        // Check if this notification has the expected method
        // The notification format depends on the protocol
        const notif = notification as { method?: string; params?: unknown };
        if (notif.method === method) {
          handler(notif.params);
        }
      };

      return channel.onNotification(wrappedHandler);
    },
  };
}

/**
 * Default resilient process options.
 */
export const DEFAULT_RESILIENT_OPTIONS: Required<ResilientProcessOptions> = {
  heartbeat: DEFAULT_HEARTBEAT_OPTIONS,
  reconnect: DEFAULT_RECONNECT_OPTIONS,
  shutdown: DEFAULT_SHUTDOWN_OPTIONS,
};

/**
 * A process handle with resilience features.
 *
 * Combines heartbeat monitoring, auto-reconnect, and graceful shutdown
 * with a standard ProcessHandle.
 *
 * @example
 * ```typescript
 * const resilientHandle = new ResilientProcessHandle(processHandle, {
 *   heartbeat: { intervalMs: 5000, timeoutMs: 1000, maxMissed: 3 },
 *   reconnect: { maxAttempts: 5, initialDelay: 100 },
 *   shutdown: { gracefulTimeoutMs: 5000 },
 * });
 *
 * resilientHandle.on('heartbeatDead', () => {
 *   console.log('Worker is unresponsive');
 * });
 *
 * resilientHandle.on('reconnected', ({ attempt }) => {
 *   console.log(`Reconnected after ${attempt} attempts`);
 * });
 *
 * resilientHandle.start();
 *
 * // Later
 * await resilientHandle.shutdown('user_requested');
 * ```
 */
export class ResilientProcessHandle implements IResilientProcessHandle {
  private readonly _handle: ProcessHandle;
  private readonly events = new EventEmitter<ResilientProcessEvents>();

  private heartbeatManager: HeartbeatManager | null = null;
  private reconnectManager: ReconnectManager | null = null;
  private shutdownManager: ShutdownManager | null = null;

  private readonly handleEventSubscriptions: Unsubscribe[] = [];
  private readonly resilienceSubscriptions: Unsubscribe[] = [];
  private _isHealthy = true;
  private killFn: ((signal?: string) => void) | null = null;

  /**
   * Creates a new ResilientProcessHandle.
   *
   * @param handle - The underlying ProcessHandle
   * @param options - Resilience configuration options
   * @param killFn - Function to kill the process (injected for testability)
   */
  constructor(
    handle: ProcessHandle,
    options: ResilientProcessOptions = {},
    killFn?: (signal?: string) => void,
  ) {
    this._handle = handle;
    this.killFn = killFn ?? null;

    // Initialize heartbeat manager if not disabled
    if (options.heartbeat !== false) {
      const heartbeatOptions = {
        ...DEFAULT_HEARTBEAT_OPTIONS,
        ...(options.heartbeat ?? {}),
      };
      this.heartbeatManager = new HeartbeatManager(handle.controlChannel, heartbeatOptions);
      this.setupHeartbeatListeners();
    }

    // Initialize reconnect manager if not disabled
    if (options.reconnect !== false) {
      const reconnectOptions = {
        ...DEFAULT_RECONNECT_OPTIONS,
        ...(options.reconnect ?? {}),
      };
      this.reconnectManager = new ReconnectManager(createReconnectable(handle), reconnectOptions);
      this.setupReconnectListeners();
    }

    // Initialize shutdown manager if not disabled
    if (options.shutdown !== false) {
      const shutdownOptions = {
        ...DEFAULT_SHUTDOWN_OPTIONS,
        ...(options.shutdown ?? {}),
      };
      this.shutdownManager = new ShutdownManager(shutdownOptions);
      this.setupShutdownListeners();
    }

    // Forward base handle events
    this.setupHandleEventForwarding();
  }

  // ProcessHandle interface delegation

  get id(): string {
    return this._handle.id;
  }

  get pid(): number | null {
    return this._handle.pid;
  }

  get state(): ProcessState {
    return this._handle.state;
  }

  get isHealthy(): boolean {
    return this._isHealthy;
  }

  get isReconnecting(): boolean {
    return this.reconnectManager?.isReconnecting() ?? false;
  }

  get controlChannel(): Channel {
    return this._handle.controlChannel;
  }

  get dataChannel(): Channel | null {
    return this._handle.dataChannel;
  }

  get handle(): ProcessHandle {
    return this._handle;
  }

  /**
   * Sends a request, optionally queueing during reconnection.
   */
  async request(method: string, params?: unknown, timeout?: number): Promise<unknown> {
    // If reconnecting and queueing is enabled, queue the request
    if (this.reconnectManager?.isReconnecting()) {
      const queued = this.reconnectManager.queueRequest(method, async () => {
        return this._handle.request(method, params, timeout);
      });

      if (queued !== null) {
        return queued;
      }
    }

    return this._handle.request(method, params, timeout);
  }

  async notify(method: string, params?: unknown): Promise<void> {
    return this._handle.notify(method, params);
  }

  async requestViaData(method: string, params?: unknown, timeout?: number): Promise<unknown> {
    if (!this._handle.dataChannel) {
      throw new Error(`Data channel not available for process '${this.id}'`);
    }
    return this._handle.dataChannel.request(method, params, timeout);
  }

  /**
   * Initiates graceful shutdown of the process.
   */
  async shutdown(reason: ShutdownReason = "user_requested"): Promise<void> {
    if (!this.shutdownManager) {
      // No graceful shutdown - force kill and close
      this.forceKill();
      await this.close();
      return;
    }

    // Stop heartbeat during shutdown
    this.heartbeatManager?.stop();

    const shutdownable = createShutdownable(this._handle, (signal) => {
      if (this.killFn) {
        this.killFn(signal);
      } else if (this._handle.pid !== null) {
        // Fallback to process.kill() if no killFn provided
        try {
          process.kill(this._handle.pid, signal ?? "SIGTERM");
        } catch {
          // Process may already be dead
        }
      }
    });

    await this.shutdownManager.initiateShutdown(shutdownable, reason);
  }

  async close(): Promise<void> {
    this.stop();
    this.cleanupAllSubscriptions();
    await this._handle.close();
  }

  on<K extends keyof ResilientProcessEvents>(
    event: K,
    handler: (data: ResilientProcessEvents[K]) => void,
  ): Unsubscribe {
    return this.events.on(event, handler);
  }

  /**
   * Starts resilience features.
   */
  start(): void {
    if (this.heartbeatManager) {
      this.setupHeartbeatPongListener();
      this.heartbeatManager.start();
    }
  }

  /**
   * Stops resilience features.
   * Note: Base handle event forwarding continues after stop().
   */
  stop(): void {
    this.heartbeatManager?.stop();
    this.reconnectManager?.cancel();

    // Cleanup resilience subscriptions only (not handle event forwarding)
    for (const unsub of this.resilienceSubscriptions) {
      unsub();
    }
    this.resilienceSubscriptions.length = 0;
  }

  // Private methods

  private setupHeartbeatListeners(): void {
    if (!this.heartbeatManager) return;

    this.heartbeatManager.on("heartbeat:missed", ({ missedCount }) => {
      this.events.emit("heartbeatMissed", { missedCount });
    });

    this.heartbeatManager.on("heartbeat:recovered", ({ missedCount }) => {
      this._isHealthy = true;
      this.events.emit("heartbeatRecovered", { missedCount });
    });

    this.heartbeatManager.on("heartbeat:dead", ({ missedCount, lastPongAt }) => {
      this._isHealthy = false;
      this.events.emit("heartbeatDead", { missedCount, lastPongAt });
    });
  }

  private setupReconnectListeners(): void {
    if (!this.reconnectManager) return;

    this.reconnectManager.on("reconnect:attempting", ({ attempt, delay }) => {
      this.events.emit("reconnecting", { attempt, delay });
    });

    this.reconnectManager.on("reconnect:success", ({ attempt, totalTimeMs }) => {
      this.events.emit("reconnected", { attempt, totalTimeMs });
    });

    this.reconnectManager.on("reconnect:failed", ({ attempts, lastError }) => {
      this.events.emit("reconnectFailed", { attempts, lastError });
    });
  }

  private setupShutdownListeners(): void {
    if (!this.shutdownManager) return;

    this.shutdownManager.on("shutdown:start", ({ reason }) => {
      this.events.emit("shutdownStarted", { reason });
    });

    this.shutdownManager.on("shutdown:ack", ({ pendingRequests }) => {
      this.events.emit("shutdownAcknowledged", { pendingRequests });
    });

    this.shutdownManager.on("shutdown:done", ({ graceful, durationMs }) => {
      this.events.emit("shutdownComplete", { graceful, durationMs });
    });
  }

  private setupHandleEventForwarding(): void {
    const unsub1 = this._handle.on("stateChange", (data) => {
      this.events.emit("stateChange", data);
    });

    const unsub2 = this._handle.on("exit", (data) => {
      this.events.emit("exit", data);
    });

    const unsub3 = this._handle.on("error", (error) => {
      this.events.emit("error", error);
    });

    this.handleEventSubscriptions.push(unsub1, unsub2, unsub3);
  }

  private setupHeartbeatPongListener(): void {
    if (!this.heartbeatManager) return;

    // Listen for pong notifications from worker and forward to HeartbeatManager
    const channel = this._handle.controlChannel;
    const unsubPong = channel.onNotification((notification: unknown) => {
      const notif = notification as { method?: string; params?: unknown };
      if (notif.method === ReservedMethods.HEARTBEAT_PONG && this.heartbeatManager) {
        this.heartbeatManager.handlePong(notif.params as HeartbeatPongParams);
      }
    });

    this.resilienceSubscriptions.push(unsubPong);
  }

  /**
   * Force kills the process with SIGKILL.
   */
  private forceKill(): void {
    if (this.killFn) {
      this.killFn("SIGKILL");
    } else if (this._handle.pid !== null) {
      try {
        process.kill(this._handle.pid, "SIGKILL");
      } catch {
        // Process may already be dead
      }
    }
  }

  /**
   * Cleanup all subscriptions (called by close()).
   */
  private cleanupAllSubscriptions(): void {
    for (const unsub of this.resilienceSubscriptions) {
      unsub();
    }
    this.resilienceSubscriptions.length = 0;

    for (const unsub of this.handleEventSubscriptions) {
      unsub();
    }
    this.handleEventSubscriptions.length = 0;
  }
}
