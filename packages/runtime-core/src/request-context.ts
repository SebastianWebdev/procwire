/**
 * RequestContext implementation for method handlers.
 *
 * Runtime-agnostic: all socket specifics live behind the FrameTransport,
 * so this single implementation serves both the Node and Bun clients.
 *
 * @module
 */

import { Flags, encodeHeaderInto, HEADER_SIZE } from "@procwire/protocol";
import type { FrameTransport } from "@procwire/protocol";
import { msgpackCodec, type Codec } from "@procwire/codecs";
import type { RequestContext } from "./client-types.js";
import type { ResponseType } from "./types.js";
import { ClientErrors } from "./client-errors.js";

/**
 * Fixed codec for error-message payloads.
 *
 * An error is always a string message, encoded independently of the method's
 * data codec: a binary data codec (raw/rawChunks/arrow) throws on a string, and
 * since error() has already set `_responded`, the ClientCore catch swallows the
 * throw — so no frame is ever sent and the consumer hangs forever (streams have
 * no timeout). The parent decodes IS_ERROR payloads with this same codec, so the
 * two sides MUST stay in sync (see ModuleCore's ERROR_CODEC).
 */
const ERROR_CODEC = msgpackCodec;

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
    private readonly _transport: FrameTransport,
    private readonly _abortCallbacks: Map<number, Set<() => void>>,
    /**
     * The method's response type. Only "stream" changes behaviour: it makes
     * error() tag the error frame with IS_STREAM so the parent routes it to the
     * stream (see error()). Defaults to "result" for older call sites.
     */
    private readonly _responseType: ResponseType = "result",
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
    // Stream methods must answer errors on the stream channel. Without IS_STREAM
    // the parent routes the frame to _handleResponse (pending REQUESTS) rather
    // than _handleStreamChunk (pending STREAMS); the lookup misses and the
    // consumer's `for await` hangs forever. Tag stream errors so the parent's
    // stream-chunk path (which already handles IS_ERROR) receives them.
    const streamFlag = this._responseType === "stream" ? Flags.IS_STREAM : 0;
    // Encode the message with the fixed ERROR_CODEC, not the method's data
    // codec: a binary codec would throw on a string and strand the consumer.
    await this._sendResponse(
      message,
      Flags.IS_RESPONSE | Flags.IS_ERROR | streamFlag | Flags.DIRECTION_TO_PARENT,
      ERROR_CODEC,
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
   * Send response data; the transport resolves once the frame has been fully
   * handed to the OS (after any backpressure drained).
   */
  private async _sendResponse(data: unknown, flags: number, codec?: Codec): Promise<void> {
    // Empty payload cases:
    // 1. STREAM_END frames (null data)
    // 2. ACK without data (null/undefined data with IS_ACK flag)
    // Don't serialize null - just use empty buffer (required for rawCodec compatibility)
    const isStreamEnd = (flags & Flags.STREAM_END) !== 0;
    const isEmptyAck = (flags & Flags.IS_ACK) !== 0 && data == null;
    // Defaults to the method's data codec; error() overrides with ERROR_CODEC.
    const serializer = codec ?? this._codec;
    const payload = isStreamEnd || isEmptyAck ? Buffer.alloc(0) : serializer.serialize(data);

    // The header buffer is owned by this call (never pooled), so the
    // transport may hold it across a backpressure wait.
    const headerBuf = Buffer.allocUnsafe(HEADER_SIZE);
    encodeHeaderInto(headerBuf, {
      methodId: this._methodId,
      flags,
      requestId: this.requestId,
      payloadLength: payload.length,
    });

    await this._transport.writeFrame(headerBuf, payload);
  }

  private _cleanup(): void {
    this._abortCallbacks.delete(this.requestId);
  }
}
