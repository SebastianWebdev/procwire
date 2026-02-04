/**
 * @procwire/bun-core - Core module system for Procwire binary protocol (Bun.js optimized).
 *
 * This package provides the Module class for defining and communicating
 * with worker processes using the binary data plane, optimized for Bun.js runtime.
 *
 * @example
 * ```typescript
 * import { Module } from '@procwire/bun-core';
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
 * @module
 */

export { Module } from "./module.js";
export { ModuleManager, SpawnError } from "./manager.js";
export { BunDrainWaiter } from "./drain-waiter.js";
export { ProcwireError, ModuleErrors, ManagerErrors } from "./errors.js";
export { ManagerEvents, ModuleEvents, type ManagerEvent, type ModuleEvent } from "./events.js";

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
} from "./types.js";
