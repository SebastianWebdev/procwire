/**
 * @procwire/bun-client - Child-side API for Procwire IPC (Bun.js optimized).
 *
 * This package provides the client-side implementation for child processes
 * to communicate with the parent process using Procwire's binary protocol.
 *
 * @example
 * ```typescript
 * import { Client } from '@procwire/bun-client';
 *
 * const client = new Client()
 *   .handle('query', async (data, ctx) => {
 *     const results = await search(data);
 *     ctx.respond(results);
 *   })
 *   .handle('insert', async (data, ctx) => {
 *     ctx.ack({ accepted: true });
 *     await processInBackground(data);
 *   })
 *   .event('progress');
 *
 * await client.start();
 *
 * // Emit events to parent
 * client.emitEvent('progress', { percent: 50 });
 * ```
 *
 * @module
 */

export { Client } from "./client.js";
export { RequestContextImpl } from "@procwire/runtime-core";
export { BunDrainWaiter } from "@procwire/protocol";
export { ProcwireClientError, ClientErrors } from "@procwire/runtime-core";
export type {
  ResponseType,
  MethodDefinition,
  EventDefinition,
  ClientOptions,
  MethodHandler,
  RequestContext,
  TypedRequestContext,
} from "@procwire/runtime-core";

// Re-export schema types from @procwire/codecs for convenience
export type { Schema, EmptySchema, ExtractSchema } from "@procwire/codecs";
