/**
 * Default options for ShutdownManager.
 *
 * @packageDocumentation
 * @module Shutdown
 */

import type { ShutdownOptions } from "./types.js";

/**
 * Default shutdown options.
 */
export const DEFAULT_SHUTDOWN_OPTIONS: Required<ShutdownOptions> = {
  enabled: true,
  gracefulTimeoutMs: 5000,
  exitWaitMs: 1000,
};
