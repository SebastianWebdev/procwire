/**
 * Process management layer - manages child process lifecycle with restart policies.
 *
 * Key features:
 * - Spawn and manage multiple child processes
 * - Dual-channel architecture: control (stdio) + data (pipe/socket)
 * - Automatic restart with exponential backoff
 * - Graceful termination with force-kill fallback
 * - Event-driven lifecycle management
 *
 * @example
 * ```ts
 * const manager = new ProcessManager({
 *   restartPolicy: {
 *     enabled: true,
 *     maxRestarts: 3,
 *     backoffMs: 1000,
 *     maxBackoffMs: 30000
 *   }
 * });
 *
 * const handle = await manager.spawn('worker-1', {
 *   executablePath: 'node',
 *   args: ['worker.js'],
 *   dataChannel: { enabled: true }
 * });
 *
 * const result = await handle.request('compute', { task: 'heavy' });
 * await manager.terminate('worker-1');
 * ```
 *
 * @module process
 */

// Core classes
export { ProcessManager } from "./manager.js";
export { ProcessHandle } from "./handle.js";

// Type exports
export type {
  ProcessState,
  RestartPolicy,
  ChannelConfig,
  DataChannelConfig,
  SpawnOptions,
  ProcessManagerConfig,
  ProcessManagerEvents,
  ProcessHandleEvents,
  ProcessHandle as IProcessHandle,
  ProcessManager as IProcessManager,
} from "./types.js";
