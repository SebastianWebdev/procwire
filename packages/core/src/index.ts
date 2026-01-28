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
 * @module
 */

export { Module } from "./module.js";
export { ModuleManager, SpawnError } from "./manager.js";

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
