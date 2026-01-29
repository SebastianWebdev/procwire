/**
 * RequestContext implementation for method handlers.
 *
 * @module
 */

import type { Socket } from "node:net";
import { Flags, encodeHeaderInto } from "@procwire/protocol";
import type { Codec } from "@procwire/codecs";
import type { RequestContext } from "./types.js";

/**
 * Internal implementation of RequestContext.
 *
 * Passed to method handlers to allow sending responses.
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
    private readonly _setDraining: (v: boolean) => void,
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

  respond(data: unknown): void {
    this._ensureNotResponded();
    this._responded = true;
    this._sendResponse(data, Flags.IS_RESPONSE | Flags.DIRECTION_TO_PARENT);
    this._cleanup();
  }

  ack(data?: unknown): void {
    this._ensureNotResponded();
    this._responded = true;
    this._sendResponse(data ?? null, Flags.IS_RESPONSE | Flags.IS_ACK | Flags.DIRECTION_TO_PARENT);
    this._cleanup();
  }

  chunk(data: unknown): void {
    this._sendResponse(data, Flags.IS_RESPONSE | Flags.IS_STREAM | Flags.DIRECTION_TO_PARENT);
  }

  end(): void {
    this._ensureNotResponded();
    this._responded = true;
    this._sendResponse(
      null,
      Flags.IS_RESPONSE | Flags.IS_STREAM | Flags.STREAM_END | Flags.DIRECTION_TO_PARENT,
    );
    this._cleanup();
  }

  error(err: Error | string): void {
    this._ensureNotResponded();
    this._responded = true;
    const message = err instanceof Error ? err.message : err;
    this._sendResponse(message, Flags.IS_RESPONSE | Flags.IS_ERROR | Flags.DIRECTION_TO_PARENT);
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
      throw new Error("Response already sent");
    }
  }

  private _sendResponse(data: unknown, flags: number): void {
    const payload = this._codec.serialize(data);
    const headerBuf = this._acquireHeader();

    encodeHeaderInto(headerBuf, {
      methodId: this._methodId,
      flags,
      requestId: this.requestId,
      payloadLength: payload.length,
    });

    this._socket.cork();
    this._socket.write(Buffer.from(headerBuf));
    const canContinue = this._socket.write(payload);
    this._socket.uncork();

    if (!canContinue) {
      this._setDraining(true);
    }
  }

  private _cleanup(): void {
    this._abortCallbacks.delete(this.requestId);
  }
}
