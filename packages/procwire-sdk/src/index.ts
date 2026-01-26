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
// Factory Functions
// ─────────────────────────────────────────────────────────────────────────────

export { createWorker } from "./worker.js";
export { createTypedWorker } from "./typed-worker.js";
export type { DefineWorkerMethods } from "./typed-worker.js";

// ─────────────────────────────────────────────────────────────────────────────
// Handler Registry (for advanced use cases)
// ─────────────────────────────────────────────────────────────────────────────

export { HandlerRegistry, HandlerRegistrationError } from "./handlers/index.js";
export type { RegisteredHandler, RegisteredNotificationHandler } from "./handlers/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Protocol (for advanced use cases)
// ─────────────────────────────────────────────────────────────────────────────

export {
  // Reserved methods
  RESERVED_PREFIX,
  RESERVED_SUFFIX,
  ReservedMethods,
  isReservedMethod,
  validateUserMethod,
  WORKER_AUTO_HANDLED_METHODS,
  // Handshake
  createHandshakeResponse,
  validateHandshakeParams,
  // Heartbeat
  createHeartbeatPong,
  collectLoadMetrics,
  validateHeartbeatPingParams,
  // Shutdown
  createShutdownResponse,
  createShutdownCompleteParams,
  validateShutdownParams,
} from "./protocol/index.js";

export type {
  ReservedMethod,
  HandshakeParams,
  HandshakeResult,
  HeartbeatPingParams,
  HeartbeatPongParams,
  WorkerLoadMetrics,
  ShutdownReason,
  ShutdownParams,
  ShutdownResult,
  ShutdownCompleteParams,
} from "./protocol/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Transport Layer (for advanced use cases)
// ─────────────────────────────────────────────────────────────────────────────

export type { WorkerTransport, TransportState, SocketServerInterface } from "./transport/index.js";

export { StdioWorkerTransport } from "./transport/index.js";
export { SocketServer, SocketClientTransport } from "./transport/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Channel Types (for advanced use cases)
// ─────────────────────────────────────────────────────────────────────────────

export type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcError,
  JsonRpcNotification,
} from "./channel/types.js";

export { JsonRpcErrorCodes } from "./channel/types.js";
