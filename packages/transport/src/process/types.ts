import type { EventMap } from "../utils/events.js";
import type { Unsubscribe } from "../utils/disposables.js";
import type { FramingCodec } from "../framing/types.js";
import type { SerializationCodec } from "../serialization/types.js";
import type { Protocol } from "../protocol/types.js";
import type { ResponseAccessor } from "../channel/types.js";
import type { Channel } from "../channel/types.js";
import type { MetricsCollector } from "../utils/metrics.js";

/**
 * Process lifecycle states.
 */
export type ProcessState = "starting" | "running" | "stopping" | "stopped" | "crashed" | "error";

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
   * @default 'procwire'
   */
  namespace?: string;

  /**
   * Graceful shutdown timeout in milliseconds.
   * @default 5000
   */
  gracefulShutdownMs?: number;

  /**
   * Optional metrics collector shared by managed transports and channels.
   */
  metrics?: MetricsCollector;

  /**
   * Enable automatic handling of SIGTERM/SIGINT signals.
   * When enabled, the process manager will call terminateAll() on these signals
   * and then exit the process.
   * @default false
   */
  handleSignals?: boolean;
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
 * Manages the lifecycle of multiple child processes with restart capability.
 *
 * @example
 * ```typescript
 * const manager = new ProcessManager({
 *   restartPolicy: { enabled: true, maxRestarts: 3 },
 *   handleSignals: true, // Graceful shutdown on SIGTERM/SIGINT
 * });
 *
 * // Spawn a worker process
 * const handle = await manager.spawn("worker", {
 *   executablePath: "node",
 *   args: ["worker.js"],
 * });
 *
 * // Communicate via control channel
 * const result = await handle.request("doWork", { data: "..." });
 *
 * // Clean shutdown
 * await manager.terminateAll();
 * ```
 *
 * @see {@link ProcessManagerConfig} for configuration options
 * @see {@link SpawnOptions} for spawn options
 * @see {@link ProcessHandle} for process handle interface
 */
export interface ProcessManager {
  /**
   * Spawns a new managed process.
   *
   * @param id - Unique process identifier
   * @param options - Spawn options
   * @returns Promise resolving to process handle
   *
   * @throws {Error} if process with this ID already exists
   * @throws {Error} if spawning fails
   *
   * @example
   * ```typescript
   * const handle = await manager.spawn("worker-1", {
   *   executablePath: "node",
   *   args: ["worker.js"],
   *   env: { NODE_ENV: "production" },
   * });
   * ```
   */
  spawn(id: string, options: SpawnOptions): Promise<ProcessHandle>;

  /**
   * Terminates a managed process.
   *
   * @param id - Process identifier
   *
   * @throws {Error} if process doesn't exist
   *
   * @example
   * ```typescript
   * await manager.terminate("worker-1");
   * ```
   */
  terminate(id: string): Promise<void>;

  /**
   * Terminates all managed processes.
   * Uses Promise.allSettled to attempt termination of all processes
   * even if some fail.
   *
   * @example
   * ```typescript
   * await manager.terminateAll();
   * ```
   */
  terminateAll(): Promise<void>;

  /**
   * Gets a process handle by ID.
   *
   * @param id - Process identifier
   * @returns Process handle or null if not found
   *
   * @example
   * ```typescript
   * const handle = manager.getHandle("worker-1");
   * if (handle) {
   *   console.log("State:", handle.state);
   * }
   * ```
   */
  getHandle(id: string): ProcessHandle | null;

  /**
   * Checks if a process is running.
   *
   * @param id - Process identifier
   * @returns true if process exists and is in 'running' state
   *
   * @example
   * ```typescript
   * if (manager.isRunning("worker-1")) {
   *   await manager.terminate("worker-1");
   * }
   * ```
   */
  isRunning(id: string): boolean;

  /**
   * Subscribes to manager events.
   *
   * @param event - Event name
   * @param handler - Event handler function
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * manager.on("spawn", ({ id, pid }) => {
   *   console.log(`Process ${id} spawned with PID ${pid}`);
   * });
   *
   * manager.on("crash", ({ id, error }) => {
   *   console.error(`Process ${id} crashed:`, error);
   * });
   * ```
   */
  on<K extends keyof ProcessManagerEvents>(
    event: K,
    handler: (data: ProcessManagerEvents[K]) => void,
  ): Unsubscribe;

  /**
   * Removes signal handlers registered by handleSignals option.
   * Useful for cleanup in tests or when you want to handle signals differently.
   *
   * @example
   * ```typescript
   * const manager = new ProcessManager({ handleSignals: true });
   *
   * // Later, if you need custom signal handling:
   * manager.removeSignalHandlers();
   * process.on("SIGTERM", () => {
   *   // Custom shutdown logic
   * });
   * ```
   */
  removeSignalHandlers(): void;
}
