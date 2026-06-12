/**
 * @procwire/core - Core module system for Procwire binary protocol.
 *
 * This package provides the Module class for defining and communicating
 * with worker processes using the binary data plane.
 *
 * @example
 * ```typescript
 * import { Module } from '@procwire/core';
 * import { msgpackCodec, arrowCodec } from '@procwire/codecs';
 *
 * // Define a module
 * const worker = new Module('worker')
 *   .executable('python', ['worker.py'])
 *   .method('process', { codec: msgpackCodec })
 *   .method('batch', { codec: arrowCodec, response: 'stream' })
 *   .event('progress');
 *
 * // After manager.spawn():
 * const result = await worker.send('process', data);
 *
 * for await (const chunk of worker.stream('batch', items)) {
 *   console.log(chunk);
 * }
 *
 * worker.onEvent('progress', (p) => console.log(`${p}%`));
 * ```
 *
 * @module @procwire/core
 */

export { Module } from "./module.js";
export { ModuleManager, SpawnError } from "./manager.js";
export { ProcwireError, ModuleErrors, ManagerErrors } from "@procwire/runtime-core";
export {
  ManagerEvents,
  ModuleEvents,
  type ManagerEvent,
  type ModuleEvent,
} from "@procwire/runtime-core";

export type {
  ModuleState,
  ExecutableConfig,
  MethodConfig,
  EventConfig,
  SpawnPolicy,
  RetryDelayConfig,
  RestartLimitConfig,
  ModuleSchema,
  ResponseType,
  InitMessage,
} from "@procwire/runtime-core";

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
} from "@procwire/runtime-core";

// Re-export schema types from @procwire/codecs for convenience
export type {
  Schema,
  EmptySchema,
  ExtractSchema,
  MethodDescriptor,
  EventDescriptor,
  InferCodecInput,
  InferCodecOutput,
  ParentRequestType,
  ParentResponseType,
  ChildRequestType,
  ChildResponseType,
  ParentEventType,
  ChildEventType,
} from "@procwire/codecs";
