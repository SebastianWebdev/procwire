/**
 * RequestContext implementation for method handlers.
 *
 * This is the Bun.js optimized version using Bun socket API.
 *
 * @module
 */

import type { RequestContext } from "./types.js";
import { ClientErrors } from "./errors.js";

// Bun socket type
type BunSocket = Awaited<ReturnType<typeof Bun.connect>>;

/**
 * Internal implementation of RequestContext.
 *
 * Passed to method handlers to allow sending responses.
 * All response methods are async to properly handle socket backpressure.
 */
export class RequestContextImpl implements RequestContext {
  private _aborted = false;
  private _responded = false;

  constructor(
    public readonly requestId: number,
    public readonly method: string,
    private readonly _methodId: number,
    private readonly _socket: BunSocket,
    private readonly _abortCallbacks: Map<number, Set<() => void>>,
  ) {}

  get aborted(): boolean {
    return this._aborted;
  }

  /**
   * Whether a response has been sent.
   * @internal
   */
  get responded(): boolean {
    return this._responded;
  }

  onAbort(callback: () => void): void {
    let callbacks = this._abortCallbacks.get(this.requestId);
    if (!callbacks) {
      callbacks = new Set();
      this._abortCallbacks.set(this.requestId, callbacks);
    }
    callbacks.add(callback);
  }

  async respond(_data: unknown): Promise<void> {
    this._ensureNotResponded();
    this._responded = true;
    // TODO: Implement response sending using Bun socket
    throw new Error("Not implemented: RequestContext.respond() - will be implemented in TASK-37");
  }

  async ack(_data?: unknown): Promise<void> {
    this._ensureNotResponded();
    this._responded = true;
    // TODO: Implement ack sending using Bun socket
    throw new Error("Not implemented: RequestContext.ack() - will be implemented in TASK-37");
  }

  async chunk(_data: unknown): Promise<void> {
    // TODO: Implement chunk sending using Bun socket
    throw new Error("Not implemented: RequestContext.chunk() - will be implemented in TASK-37");
  }

  async end(): Promise<void> {
    this._ensureNotResponded();
    this._responded = true;
    // TODO: Implement stream end using Bun socket
    throw new Error("Not implemented: RequestContext.end() - will be implemented in TASK-37");
  }

  async error(_err: Error | string): Promise<void> {
    this._ensureNotResponded();
    this._responded = true;
    // TODO: Implement error sending using Bun socket
    throw new Error("Not implemented: RequestContext.error() - will be implemented in TASK-37");
  }

  /**
   * Mark context as aborted.
   * @internal Called by Client when abort frame received.
   */
  _markAborted(): void {
    this._aborted = true;
  }

  private _ensureNotResponded(): void {
    if (this._responded) {
      throw ClientErrors.responseAlreadySent();
    }
  }

  private _cleanup(): void {
    this._abortCallbacks.delete(this.requestId);
  }
}
