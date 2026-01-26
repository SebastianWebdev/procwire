/**
 * Typed worker factory with full type inference
 */

import type {
  TypedWorker,
  WorkerOptions,
  MethodNames,
  MethodParams,
  MethodResult,
  HandlerContext,
} from "./types.js";
import { createWorker } from "./worker.js";

/**
 * Create a typed worker with full type inference for method handlers.
 *
 * The generic parameter `TMethods` defines the API contract - all methods
 * with their params and result types. This enables full autocomplete and
 * type checking for handlers.
 *
 * @typeParam TMethods - Interface defining all methods with their types
 * @param options - Worker configuration
 * @returns Typed worker instance
 *
 * @example Define method types
 * ```ts
 * // This can be in a shared package used by both manager and worker
 * interface VectorDBMethods {
 *   similarity_search: {
 *     params: { query: number[]; top_k: number; threshold?: number };
 *     result: { matches: Array<{ id: string; score: number }> };
 *   };
 *   insert: {
 *     params: { id: string; vector: number[]; metadata?: Record<string, unknown> };
 *     result: { success: boolean; indexed_at: string };
 *   };
 *   delete: {
 *     params: { id: string };
 *     result: { deleted: boolean };
 *   };
 * }
 * ```
 *
 * @example Create typed worker
 * ```ts
 * import { createTypedWorker } from '@procwire/sdk';
 * import type { VectorDBMethods } from './shared-types.js';
 *
 * const worker = createTypedWorker<VectorDBMethods>({
 *   name: 'vector-db',
 * });
 *
 * // Full type inference - params.query is number[], params.top_k is number
 * worker.handle('similarity_search', async (params) => {
 *   const results = await searchIndex(params.query, params.top_k);
 *   return { matches: results }; // Must match result type
 * });
 *
 * // TypeScript error if handler signature doesn't match
 * worker.handle('insert', (params) => {
 *   // params.id is string, params.vector is number[]
 *   return { success: true, indexed_at: new Date().toISOString() };
 * });
 *
 * worker.start();
 * ```
 *
 * @example With context for advanced use cases
 * ```ts
 * worker.handle('similarity_search', async (params, ctx) => {
 *   // ctx.requestId - unique request ID
 *   // ctx.method - 'similarity_search'
 *   // ctx.channel - 'control' | 'data'
 *   // ctx.signal - AbortSignal for cancellation
 *
 *   if (ctx.signal.aborted) {
 *     throw new Error('Request cancelled');
 *   }
 *
 *   return { matches: [] };
 * });
 * ```
 */
export function createTypedWorker<TMethods>(options: WorkerOptions = {}): TypedWorker<TMethods> {
  // The underlying worker implementation is the same
  // We just cast to the typed interface for type inference
  const worker = createWorker(options);

  return worker as unknown as TypedWorker<TMethods>;
}

/**
 * Helper type to define a methods interface.
 *
 * @example
 * ```ts
 * type MyMethods = DefineWorkerMethods<{
 *   greet: { params: { name: string }; result: { message: string } };
 *   add: { params: { a: number; b: number }; result: { sum: number } };
 * }>;
 * ```
 */
export type DefineWorkerMethods<T extends Record<string, { params: unknown; result: unknown }>> = T;

// Re-export types for convenience
export type { MethodNames, MethodParams, MethodResult, HandlerContext };
