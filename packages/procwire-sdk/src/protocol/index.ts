/**
 * Protocol module exports.
 * @packageDocumentation
 */

export {
  RESERVED_PREFIX,
  RESERVED_SUFFIX,
  ReservedMethods,
  isReservedMethod,
  validateUserMethod,
  WORKER_AUTO_HANDLED_METHODS,
  type ReservedMethod,
} from "./reserved.js";

export {
  createHandshakeResponse,
  validateHandshakeParams,
  type HandshakeParams,
  type HandshakeResult,
} from "./handshake.js";

export {
  createHeartbeatPong,
  collectLoadMetrics,
  validateHeartbeatPingParams,
  type HeartbeatPingParams,
  type HeartbeatPongParams,
  type WorkerLoadMetrics,
} from "./heartbeat.js";

export {
  createShutdownResponse,
  createShutdownCompleteParams,
  validateShutdownParams,
  type ShutdownReason,
  type ShutdownParams,
  type ShutdownResult,
  type ShutdownCompleteParams,
} from "./shutdown.js";
