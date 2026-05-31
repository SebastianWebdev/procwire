/**
 * RequestContext implementation for method handlers.
 *
 * @module
 */

import type { Socket } from "node:net";
import { Flags, encodeHeaderInto } from "@procwire/protocol";
import type { DrainWaiter } from "@procwire/protocol";
import type { Codec } from "@procwire/codecs";
import type { RequestContext } from "./types.js";
import { ClientErrors } from "./errors.js";

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
    private readonly _codec: Codec,
    private readonly _socket: Socket,
    private readonly _abortCallbacks: Map<number, Set<() => void>>,
    private readonly _acquireHeader: () => Buffer,
    private readonly _drainWaiter: DrainWaiter,
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

  async respond(data: unknown): Promise<void> {
    this._ensureNotResponded();
    this._responded = true;
    await this._sendResponse(data, Flags.IS_RESPONSE | Flags.DIRECTION_TO_PARENT);
    this._cleanup();
  }

  async ack(data?: unknown): Promise<void> {
    this._ensureNotResponded();
    this._responded = true;
    await this._sendResponse(
      data ?? null,
      Flags.IS_RESPONSE | Flags.IS_ACK | Flags.DIRECTION_TO_PARENT,
    );
    this._cleanup();
  }

  async chunk(data: unknown): Promise<void> {
    await this._sendResponse(data, Flags.IS_RESPONSE | Flags.IS_STREAM | Flags.DIRECTION_TO_PARENT);
  }

  async end(): Promise<void> {
    this._ensureNotResponded();
    this._responded = true;
    await this._sendResponse(
      null,
      Flags.IS_RESPONSE | Flags.IS_STREAM | Flags.STREAM_END | Flags.DIRECTION_TO_PARENT,
    );
    this._cleanup();
  }

  async error(err: Error | string): Promise<void> {
    this._ensureNotResponded();
    this._responded = true;
    const message = err instanceof Error ? err.message : err;
    await this._sendResponse(
      message,
      Flags.IS_RESPONSE | Flags.IS_ERROR | Flags.DIRECTION_TO_PARENT,
    );
    this._cleanup();
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

  /**
   * Send response data with proper backpressure handling.
   *
   * Uses RING+SYNC pattern: write BEFORE await for allocation-free headers.
   * DrainWaiter singleton prevents MaxListenersExceededWarning.
   */
  private async _sendResponse(data: unknown, flags: number): Promise<void> {
    // Empty payload cases:
    // 1. STREAM_END frames (null data)
    // 2. ACK without data (null/undefined data with IS_ACK flag)
    // Don't serialize null - just use empty buffer (required for rawCodec compatibility)
    const isStreamEnd = (flags & Flags.STREAM_END) !== 0;
    const isEmptyAck = (flags & Flags.IS_ACK) !== 0 && data == null;
    const payload = isStreamEnd || isEmptyAck ? Buffer.alloc(0) : this._codec.serialize(data);
    const headerBuf = this._acquireHeader();

    encodeHeaderInto(headerBuf, {
      methodId: this._methodId,
      flags,
      requestId: this.requestId,
      payloadLength: payload.length,
    });

    // Write BEFORE await to prevent deadlock. headerBuf is freshly allocated
    // and owned by this call, so it can be written without an extra copy.
    this._socket.cork();
    this._socket.write(headerBuf);
    const canContinue = this._socket.write(payload);
    this._socket.uncork();

    // OPT-04: Wait AFTER write if backpressure - ring buffer no longer needed
    if (!canContinue) {
      await this._drainWaiter.waitForDrain();
    }
  }

  private _cleanup(): void {
    this._abortCallbacks.delete(this.requestId);
  }
}
