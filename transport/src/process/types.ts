import type { EventMap } from "../utils/events.js";
import type { Unsubscribe } from "../utils/disposables.js";
import type { FramingCodec } from "../framing/types.js";
import type { SerializationCodec } from "../serialization/types.js";
import type { Protocol } from "../protocol/types.js";
import type { ResponseAccessor } from "../channel/types.js";
import type { Channel } from "../channel/types.js";

/**
 * Process lifecycle states.
 */
export type ProcessState =
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "crashed"
  | "error";

/**
 * Restart policy configuration.
 */
export interface RestartPolicy {
  /**
   * Whether automatic restart is enabled.
   */
  enabled: boolean;

  /**
   * Maximum number of restart attempts.
   */
  maxRestarts: number;

  /**
   * Initial backoff delay in milliseconds.
   */
  backoffMs: number;

  /**
   * Maximum backoff delay in milliseconds (optional).
   * Caps exponential backoff growth.
   */
  maxBackoffMs?: number;
}

/**
 * Channel configuration for control or data channels.
 */
export interface ChannelConfig {
  /**
   * Framing codec: predefined name or custom codec.
   * @default 'line-delimited' for control, 'length-prefixed' for data
   */
  framing?: "line-delimited" | "length-prefixed" | FramingCodec;

  /**
   * Serialization codec: predefined name or custom codec.
   * @default 'json'
   */
  serialization?: "json" | "raw" | SerializationCodec;

  /**
   * Protocol: predefined name or custom protocol.
   * @default 'jsonrpc'
   */
  protocol?: "jsonrpc" | "simple" | Protocol;

  /**
   * Request timeout in milliseconds.
   * @default 30000
   */
  timeoutMs?: number;

  /**
   * Custom response accessor for protocol-specific response handling.
   */
  responseAccessor?: ResponseAccessor;
}

/**
 * Data channel configuration.
 */
export interface DataChannelConfig {
  /**
   * Whether data channel is enabled.
   * @default false
   */
  enabled?: boolean;

  /**
   * Named pipe/unix socket path for data channel.
   * If not provided, auto-generated using PipePath.forModule(namespace, processId).
   */
  path?: string;

  /**
   * Transport type (currently only 'pipe' is supported).
   * @default 'pipe'
   */
  transport?: "pipe";

  /**
   * Channel configuration for data channel.
   */
  channel?: ChannelConfig;
}

/**
 * Options for spawning a managed process.
 */
export interface SpawnOptions {
  /**
   * Path to executable to spawn.
   */
  executablePath: string;

  /**
   * Command line arguments.
   */
  args?: string[];

  /**
   * Working directory for the process.
   */
  cwd?: string;

  /**
   * Environment variables.
   */
  env?: Record<string, string>;

  /**
   * Startup timeout in milliseconds.
   * @default 10000
   */
  startupTimeout?: number;

  /**
   * Control channel configuration.
   * Control channel uses stdio transport.
   */
  controlChannel?: ChannelConfig;

  /**
   * Data channel configuration (optional secondary channel).
   */
  dataChannel?: DataChannelConfig;

  /**
   * Custom restart policy for this process.
   * Overrides manager default.
   */
  restartPolicy?: RestartPolicy;
}

/**
 * Process manager configuration.
 */
export interface ProcessManagerConfig {
  /**
   * Default request timeout for all channels.
   * @default 30000
   */
  defaultTimeout?: number;

  /**
   * Default restart policy for all processes.
   */
  restartPolicy?: RestartPolicy;

  /**
   * Namespace for auto-generated pipe paths.
   * @default 'aspect-ipc'
   */
  namespace?: string;

  /**
   * Graceful shutdown timeout in milliseconds.
   * @default 5000
   */
  gracefulShutdownMs?: number;
}

/**
 * Process manager events.
 */
export interface ProcessManagerEvents extends EventMap {
  /**
   * Fired when a process is spawned.
   */
  spawn: { id: string; pid: number };

  /**
   * Fired when a process exits.
   */
  exit: { id: string; code: number | null; signal: string | null };

  /**
   * Fired when a process crashes.
   */
  crash: { id: string; error: Error };

  /**
   * Fired when a process restart is attempted.
   */
  restart: { id: string; attempt: number; delayMs: number };

  /**
   * Fired when a process is ready (channels connected).
   */
  ready: { id: string };

  /**
   * Fired when an error occurs.
   */
  error: { id: string; error: Error };
}

/**
 * Process handle events.
 */
export interface ProcessHandleEvents extends EventMap {
  /**
   * Fired when process state changes.
   */
  stateChange: { from: ProcessState; to: ProcessState };

  /**
   * Fired when process exits.
   */
  exit: { code: number | null; signal: string | null };

  /**
   * Fired when an error occurs.
   */
  error: Error;
}

/**
 * Process handle interface.
 * Provides access to a managed process and its channels.
 */
export interface ProcessHandle {
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
   * Control channel (stdio-based, always available).
   */
  readonly controlChannel: Channel;

  /**
   * Data channel (pipe-based, optional).
   */
  readonly dataChannel: Channel | null;

  /**
   * Sends a request via control channel.
   * @param method - Method name
   * @param params - Optional parameters
   * @param timeout - Optional timeout override
   * @returns Promise resolving to response result
   */
  request(method: string, params?: unknown, timeout?: number): Promise<unknown>;

  /**
   * Sends a notification via control channel.
   * @param method - Method name
   * @param params - Optional parameters
   */
  notify(method: string, params?: unknown): Promise<void>;

  /**
   * Sends a request via data channel.
   * @param method - Method name
   * @param params - Optional parameters
   * @param timeout - Optional timeout override
   * @returns Promise resolving to response result
   * @throws {Error} if data channel is not enabled
   */
  requestViaData(method: string, params?: unknown, timeout?: number): Promise<unknown>;

  /**
   * Closes the handle and its channels.
   * Does not terminate the process - use ProcessManager.terminate() for that.
   */
  close(): Promise<void>;

  /**
   * Subscribes to handle events.
   * @returns Unsubscribe function
   */
  on<K extends keyof ProcessHandleEvents>(
    event: K,
    handler: (data: ProcessHandleEvents[K]) => void,
  ): Unsubscribe;
}

/**
 * Process manager interface.
 * Manages the lifecycle of multiple child processes.
 */
export interface ProcessManager {
  /**
   * Spawns a new managed process.
   * @param id - Unique process identifier
   * @param options - Spawn options
   * @returns Promise resolving to process handle
   * @throws {Error} if process with this ID already exists
   */
  spawn(id: string, options: SpawnOptions): Promise<ProcessHandle>;

  /**
   * Terminates a managed process.
   * @param id - Process identifier
   * @throws {Error} if process doesn't exist
   */
  terminate(id: string): Promise<void>;

  /**
   * Terminates all managed processes.
   */
  terminateAll(): Promise<void>;

  /**
   * Gets a process handle by ID.
   * @param id - Process identifier
   * @returns Process handle or null if not found
   */
  getHandle(id: string): ProcessHandle | null;

  /**
   * Checks if a process is running.
   * @param id - Process identifier
   * @returns true if process exists and is in 'running' state
   */
  isRunning(id: string): boolean;

  /**
   * Subscribes to manager events.
   * @returns Unsubscribe function
   */
  on<K extends keyof ProcessManagerEvents>(
    event: K,
    handler: (data: ProcessManagerEvents[K]) => void,
  ): Unsubscribe;
}
