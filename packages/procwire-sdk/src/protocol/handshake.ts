/**
 * Handshake protocol handler.
 * @packageDocumentation
 */

import type { ResolvedWorkerOptions } from "../types.js";

/**
 * Parameters received in a handshake request from the manager.
 */
export interface HandshakeParams {
  /** Protocol version string */
  version: string;
  /** Capabilities supported by the manager */
  capabilities: string[];
  /** Data channel configuration (if manager supports it) */
  data_channel?: {
    path: string;
    serialization: string;
  };
}

/**
 * Result returned by the worker in response to handshake.
 */
export interface HandshakeResult {
  /** Protocol version (echoed back) */
  version: string;
  /** Capabilities supported by this worker */
  capabilities: string[];
  /** Information about this worker */
  worker_info: {
    name: string;
    language: string;
    pid: number;
  };
}

/**
 * Create a handshake response based on worker options.
 *
 * @param params - Handshake parameters from manager
 * @param options - Resolved worker options
 * @returns Handshake result to send back
 *
 * @example
 * ```ts
 * const response = createHandshakeResponse(params, resolvedOptions);
 * // { version: '1.0', capabilities: ['heartbeat'], worker_info: { ... } }
 * ```
 */
export function createHandshakeResponse(
  params: HandshakeParams,
  options: ResolvedWorkerOptions,
): HandshakeResult {
  const capabilities = new Set<string>(["heartbeat", ...options.capabilities]);

  if (options.dataChannel) {
    capabilities.add("data_channel");
  }

  return {
    version: params.version,
    capabilities: Array.from(capabilities),
    worker_info: {
      name: options.name,
      language: "nodejs",
      pid: process.pid,
    },
  };
}

/**
 * Validate that handshake parameters are well-formed.
 *
 * @param params - Parameters to validate
 * @throws {Error} If params are invalid
 */
export function validateHandshakeParams(params: unknown): asserts params is HandshakeParams {
  if (!params || typeof params !== "object") {
    throw new Error("Invalid handshake params: expected object");
  }
  const p = params as Record<string, unknown>;
  if (typeof p.version !== "string") {
    throw new Error("Invalid handshake params: version must be a string");
  }
  if (!Array.isArray(p.capabilities)) {
    throw new Error("Invalid handshake params: capabilities must be an array");
  }
}
