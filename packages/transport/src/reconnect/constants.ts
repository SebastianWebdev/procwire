/**
 * Auto-reconnect manager constants.
 *
 * @packageDocumentation
 * @module Reconnect
 */

import type { ReconnectOptions } from "./types.js";

/**
 * Default reconnect configuration options.
 */
export const DEFAULT_RECONNECT_OPTIONS: Readonly<Required<ReconnectOptions>> = {
  enabled: true,
  initialDelay: 100,
  maxDelay: 30_000,
  multiplier: 2,
  jitter: 0.1,
  maxAttempts: Infinity,
  queueRequests: true,
  maxQueueSize: 100,
  queueTimeout: 60_000,
};
