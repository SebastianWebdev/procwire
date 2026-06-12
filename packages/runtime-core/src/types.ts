/**
 * Core types for the Module system — parent side
 * (@procwire/core and @procwire/bun-core).
 *
 * @module
 */

import type { Codec } from "@procwire/codecs";

/**
 * Module lifecycle state.
 */
export type ModuleState =
  | "created" // Defined but not spawned
  | "initializing" // Process started, waiting for $init
  | "connecting" // Connecting data channel
  | "ready" // Fully operational
  | "disconnected" // Lost connection (may restart)
  | "closed"; // Terminated

/**
 * Executable configuration.
 */
export interface ExecutableConfig {
  command: string;
  args: string[];
  cwd?: string | undefined;
  env?: Record<string, string> | undefined;
}

/**
 * Response type for methods.
 */
export type ResponseType =
  | "result" // Single response
  | "stream" // Multiple chunks
  | "ack" // Acknowledgment only
  | "none"; // Fire-and-forget

/**
 * Method configuration.
 *
 * Stores both codecs for full dual-codec support:
 * - `requestCodec` — used for parent→child direction (parent serialize, child deserialize)
 * - `responseCodec` — used for child→parent direction (child serialize, parent deserialize)
 *
 * For single-codec shorthand, both point to the same codec instance.
 */
export interface MethodConfig {
  requestCodec: Codec;
  responseCodec: Codec;
  response: ResponseType;
  timeout?: number | undefined;
  cancellable: boolean;
}

/**
 * Event configuration.
 */
export interface EventConfig {
  codec: Codec;
}

/**
 * Retry delay configuration.
 */
export type RetryDelayConfig =
  | { type: "fixed"; delay: number }
  | { type: "exponential"; base: number; max: number };

/**
 * Restart limit to prevent infinite loops.
 */
export interface RestartLimitConfig {
  maxRestarts: number;
  windowMs: number;
}

/**
 * Control-plane heartbeat (liveness) configuration.
 *
 * When enabled, the parent periodically pings the child over the control plane
 * and treats it as dead (triggering the crash/restart path) if no pong is seen
 * within `timeoutMs`. Detects a hung child that hasn't exited.
 */
export interface HeartbeatConfig {
  /** How often to ping the child (ms). */
  intervalMs: number;
  /** Treat the child as dead if no pong arrives within this window (ms). */
  timeoutMs: number;
}

/**
 * Spawn and restart policy.
 */
export interface SpawnPolicy {
  /** Timeout for $init (default: 30s) */
  initTimeout?: number;

  /** Max spawn retries (default: 3) */
  maxRetries?: number;

  /** Delay between retries */
  retryDelay?: RetryDelayConfig;

  /** Auto-restart on crash (default: false) */
  restartOnCrash?: boolean;

  /** Restart limit */
  restartLimit?: RestartLimitConfig;

  /**
   * Control-plane heartbeat for liveness detection. Disabled by default.
   * @example { intervalMs: 5000, timeoutMs: 15000 }
   */
  heartbeat?: HeartbeatConfig | null;

  /**
   * Socket buffer size in bytes for data channel.
   * Higher values improve throughput for large payloads.
   *
   * Node runtimes only: Bun.connect() exposes no socket buffer sizing API,
   * so @procwire/bun-core accepts this option for parity but ignores it
   * (kernel defaults apply).
   *
   * @default undefined (uses OS default, typically 64KB)
   * @example 4 * 1024 * 1024 // 4MB for large Arrow transfers
   */
  socketBufferSize?: number;
}

/**
 * Schema sent in $init message.
 */
export interface ModuleSchema {
  methods: Record<
    string,
    {
      id: number;
      response: ResponseType;
      timeout?: number;
    }
  >;
  events: Record<
    string,
    {
      id: number;
    }
  >;
}

/**
 * $init message from child.
 */
export interface InitMessage {
  jsonrpc: "2.0";
  method: "$init";
  params: {
    pipe: string;
    schema: ModuleSchema;
    version: string;
  };
}
