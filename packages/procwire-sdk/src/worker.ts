/**
 * Worker factory function
 */

import type { Worker, WorkerOptions } from "./types.js";
import { WorkerImpl } from "./worker-impl.js";

/**
 * Create a new Procwire worker.
 *
 * @param options - Worker configuration
 * @returns Worker instance
 *
 * @example Basic worker
 * ```ts
 * import { createWorker } from '@procwire/sdk';
 *
 * const worker = createWorker({ name: 'my-worker' });
 *
 * worker.handle('echo', (params) => {
 *   return { message: params.message };
 * });
 *
 * worker.start();
 * ```
 *
 * @example Worker with data channel
 * ```ts
 * import { createWorker } from '@procwire/sdk';
 * import { MessagePackCodec } from '@procwire/codec-msgpack';
 *
 * const worker = createWorker({
 *   name: 'vector-db',
 *   dataChannel: {
 *     serialization: new MessagePackCodec(),
 *   },
 * });
 *
 * worker.handle('similarity_search', async (params) => {
 *   return { matches: [] };
 * });
 *
 * worker.start();
 * ```
 */
export function createWorker(options: WorkerOptions = {}): Worker {
  return new WorkerImpl(options);
}
