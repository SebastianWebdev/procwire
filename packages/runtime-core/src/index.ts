/**
 * @procwire/runtime-core - Shared runtime-agnostic building blocks for the
 * Procwire runtime packages.
 *
 * Single source of truth for the types, error factories and event-name
 * constants that were previously duplicated between the Node packages
 * (@procwire/core, @procwire/client) and their Bun counterparts
 * (@procwire/bun-core, @procwire/bun-client).
 *
 * This package is internal plumbing: applications should keep importing
 * from the runtime packages, which re-export everything here.
 *
 * @module @procwire/runtime-core
 */

// Parent side (core / bun-core)
export type {
  ModuleState,
  ExecutableConfig,
  ResponseType,
  MethodConfig,
  EventConfig,
  RetryDelayConfig,
  RestartLimitConfig,
  HeartbeatConfig,
  SpawnPolicy,
  ModuleSchema,
  InitMessage,
} from "./types.js";

export { ProcwireError, ModuleErrors, ManagerErrors } from "./errors.js";

export { ManagerEvents, ModuleEvents, type ManagerEvent, type ModuleEvent } from "./events.js";

// Child side (client / bun-client)
export type {
  MethodDefinition,
  EventDefinition,
  ClientOptions,
  MethodHandler,
  RequestContext,
  TypedRequestContext,
} from "./client-types.js";

export { ProcwireClientError, ClientErrors } from "./client-errors.js";

// Schema accumulation types for the Module builder pattern
export type {
  AddMethod,
  AddMethodSymmetric,
  AddEvent,
  SendReturn,
  MethodsWithResponseType,
  MethodsWithoutResponseType,
  DualCodecMethodConfig,
  SingleCodecMethodConfig,
  TypedEventConfig,
} from "./schema-types.js";

// Shared runtime cores (consumed by the four runtime packages)
export { ModuleCore } from "./module-core.js";
export { ModuleManagerCore, SpawnError, type ManagedModule } from "./manager-core.js";
export { ClientCore, type HandleOptions } from "./client-core.js";
export { RequestContextImpl } from "./request-context.js";
