/**
 * @procwire/client - Child-side API for Procwire IPC.
 *
 * This package provides the client-side implementation for child processes
 * to communicate with the parent process using Procwire's binary protocol.
 *
 * @example
 * ```typescript
 * import { Client } from '@procwire/client';
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
export { RequestContextImpl } from "./request-context.js";
export { ProcwireClientError, ClientErrors } from "./errors.js";
export type {
  ResponseType,
  MethodDefinition,
  EventDefinition,
  ClientOptions,
  MethodHandler,
  RequestContext,
} from "./types.js";
