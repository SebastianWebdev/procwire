/**
 * Event name constants for @procwire-bun/core.
 *
 * Using constants instead of string literals provides:
 * - Autocomplete in IDEs
 * - Compile-time typo detection
 * - Single source of truth for event names
 *
 * @module
 */

// ═══════════════════════════════════════════════════════════════════════════
// MANAGER EVENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Event names emitted by ModuleManager.
 *
 * @example
 * ```typescript
 * manager.on(ManagerEvents.READY, (name) => console.log(`${name} ready`));
 * manager.on(ManagerEvents.ERROR, (name, err) => console.error(err));
 * ```
 */
export const ManagerEvents = {
  /** Module is retrying spawn after failure */
  RETRYING: "module:retrying",

  /** Module spawn failed (may retry) */
  SPAWN_FAILED: "module:spawnFailed",

  /** Module is fully ready and operational */
  READY: "module:ready",

  /** Module encountered an error */
  ERROR: "module:error",

  /** Module is being restarted after crash */
  RESTARTING: "module:restarting",

  /** Module has been fully closed */
  CLOSED: "module:closed",
} as const;

/** Type for ManagerEvents values */
export type ManagerEvent = (typeof ManagerEvents)[keyof typeof ManagerEvents];

// ═══════════════════════════════════════════════════════════════════════════
// MODULE EVENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Event names emitted by Module.
 *
 * @example
 * ```typescript
 * module.on(ModuleEvents.STATE, (state) => console.log(`State: ${state}`));
 * module.on(ModuleEvents.ERROR, (err) => console.error(err));
 * ```
 */
export const ModuleEvents = {
  /** Module state changed */
  STATE: "state",

  /** Socket error occurred */
  ERROR: "error",

  /** Socket disconnected */
  DISCONNECTED: "disconnected",
} as const;

/** Type for ModuleEvents values */
export type ModuleEvent = (typeof ModuleEvents)[keyof typeof ModuleEvents];
