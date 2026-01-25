/**
 * Worker options utilities
 */

import type { WorkerOptions, ResolvedWorkerOptions } from "../types.js";
import * as path from "node:path";

/**
 * Default worker options.
 */
export const DEFAULT_WORKER_OPTIONS: ResolvedWorkerOptions = {
  name: "worker",
  dataChannel: undefined,
  debug: false,
  capabilities: [],
  drainTimeout: 5000,
};

/**
 * Resolve worker options with defaults.
 *
 * @param options - User-provided options
 * @returns Fully resolved options
 */
export function resolveWorkerOptions(options: WorkerOptions = {}): ResolvedWorkerOptions {
  return {
    name: options.name ?? getDefaultWorkerName(),
    dataChannel: options.dataChannel,
    debug: options.debug ?? DEFAULT_WORKER_OPTIONS.debug,
    capabilities: options.capabilities ?? DEFAULT_WORKER_OPTIONS.capabilities,
    drainTimeout: options.drainTimeout ?? DEFAULT_WORKER_OPTIONS.drainTimeout,
  };
}

/**
 * Get default worker name from process argv.
 */
function getDefaultWorkerName(): string {
  const scriptPath = process.argv[1];
  if (!scriptPath) {
    return "worker";
  }

  const basename = path.basename(scriptPath);
  // Remove extension
  return basename.replace(/\.[^/.]+$/, "");
}
