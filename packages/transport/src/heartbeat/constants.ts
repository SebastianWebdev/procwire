/**
 * Heartbeat manager constants.
 *
 * @packageDocumentation
 * @module Heartbeat
 */

import type { HeartbeatOptions } from "./types.js";

/**
 * Default heartbeat configuration options.
 */
export const DEFAULT_HEARTBEAT_OPTIONS: Readonly<Required<HeartbeatOptions>> = {
  enabled: true,
  interval: 30_000,
  timeout: 5_000,
  maxMissed: 3,
  implicitHeartbeat: true,
};
