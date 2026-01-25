/**
 * @procwire/sdk - Procwire SDK for Node.js
 *
 * Build IPC workers with ease. This package provides a simple API for creating
 * workers that communicate with a Procwire manager.
 *
 * @example
 * ```ts
 * import { createWorker } from '@procwire/sdk';
 *
 * const worker = createWorker({ name: 'my-worker' });
 *
 * worker.handle('echo', (params) => params);
 *
 * worker.start();
 * ```
 *
 * @packageDocumentation
 */

// ─────────────────────────────────────────────────────────────────────────────
// Type Exports
// ─────────────────────────────────────────────────────────────────────────────

export type {
  // Worker options
  WorkerOptions,
  DataChannelOptions,

  // Handler types
  Handler,
  NotificationHandler,
  HandlerContext,

  // Lifecycle
  WorkerHooks,
  WorkerState,

  // Worker interfaces
  Worker,
  TypedWorker,

  // Method definitions (for typed workers)
  MethodDefinition,
  MethodNames,
  MethodParams,
  MethodResult,
} from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Factory Functions (implemented in later tasks)
// ─────────────────────────────────────────────────────────────────────────────

// These will be implemented in Task A.4
// For now, export placeholder functions that throw

import type { Worker, TypedWorker, WorkerOptions } from "./types.js";

/**
 * Create a new Procwire worker.
 *
 * @param options - Worker configuration
 * @returns Worker instance
 *
 * @example
 * ```ts
 * const worker = createWorker({ name: 'my-worker' });
 *
 * worker.handle('echo', (params) => params);
 * worker.start();
 * ```
 */
export function createWorker(_options?: WorkerOptions): Worker {
  // TODO: Implement in Task A.4
  throw new Error("createWorker is not yet implemented. " + "This will be completed in Task A.4.");
}

/**
 * Create a typed worker with full type inference.
 *
 * @typeParam TMethods - Interface defining all methods
 * @param options - Worker configuration
 * @returns Typed worker instance
 *
 * @example
 * ```ts
 * interface MyMethods {
 *   greet: { params: { name: string }; result: { message: string } };
 * }
 *
 * const worker = createTypedWorker<MyMethods>();
 *
 * worker.handle('greet', (params) => ({
 *   message: `Hello, ${params.name}!`
 * }));
 *
 * worker.start();
 * ```
 */
export function createTypedWorker<TMethods>(_options?: WorkerOptions): TypedWorker<TMethods> {
  // TODO: Implement in Task A.5
  throw new Error(
    "createTypedWorker is not yet implemented. " + "This will be completed in Task A.5.",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Transport Layer (for advanced use cases)
// ─────────────────────────────────────────────────────────────────────────────

export type {
  WorkerTransport,
  TransportState,
  SocketServerInterface,
} from "./transport/index.js";

export { StdioWorkerTransport } from "./transport/index.js";
export { SocketServer, SocketClientTransport } from "./transport/index.js";
