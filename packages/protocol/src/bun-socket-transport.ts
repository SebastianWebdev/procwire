/**
 * BunSocketTransport - FrameTransport over a Bun socket.
 *
 * Bun sockets have no cork/uncork, so header+payload are concatenated and
 * handed to the kernel in ONE write() call on the fast path (hard perf
 * requirement). Bun's numeric write() return (partial writes, -1 on close)
 * is honored by BunDrainWaiter.writeAll: tails are re-sent after drain and
 * concurrent frames are FIFO-serialized so they cannot interleave.
 *
 * The socket type is structural: Bun.listen and Bun.connect sockets share
 * this shape, and tests can drive the transport with a plain object.
 *
 * @module
 */

import { BunDrainWaiter, type BunWritableSocket } from "./bun-drain-waiter.js";
import type { FrameTransport } from "./transport.js";

/** Structural view of a Bun socket as needed by the transport. */
export interface BunTransportSocket extends BunWritableSocket {
  end(): void;
  pause?(): void;
  resume?(): void;
}

export class BunSocketTransport implements FrameTransport {
  private readonly _drainWaiter = new BunDrainWaiter();

  constructor(private readonly _socket: BunTransportSocket) {}

  /**
   * Call from the runtime's socket `drain` handler. Bun delivers drain
   * through the fixed handler object passed to Bun.listen/Bun.connect, so
   * the adapter owns the wiring and forwards the event here.
   */
  handleDrain(): void {
    this._drainWaiter.onDrain();
  }

  writeFrame(header: Buffer, payload: Buffer): Promise<void> {
    // The concat happens synchronously, so the header buffer may be reused
    // by the caller as soon as this returns. Empty payloads (abort frames,
    // stream end) skip the concat entirely.
    const frame = payload.length > 0 ? Buffer.concat([header, payload]) : header;
    return this._drainWaiter.writeAll(this._socket, frame);
  }

  pause(): void {
    this._socket.pause?.();
  }

  resume(): void {
    this._socket.resume?.();
  }

  close(): void {
    this._socket.end();
    this._drainWaiter.clear();
  }
}
