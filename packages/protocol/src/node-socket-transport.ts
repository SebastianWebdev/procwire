/**
 * NodeSocketTransport - FrameTransport over a node:net Socket.
 *
 * Keeps the zero-copy large-payload path: header and payload are written as
 * two separate buffers inside a cork()/uncork() pair (one TCP flush, no
 * Buffer.concat). Backpressure is awaited through the shared DrainWaiter so
 * concurrent writers don't stack "drain" listeners.
 *
 * @module
 */

import type { Socket } from "node:net";
import { DrainWaiter } from "./drain-waiter.js";
import type { FrameTransport } from "./transport.js";

export class NodeSocketTransport implements FrameTransport {
  private readonly _drainWaiter: DrainWaiter;

  constructor(private readonly _socket: Socket) {
    this._drainWaiter = new DrainWaiter(_socket);
  }

  /**
   * Write header+payload as one frame.
   *
   * Write BEFORE await to prevent deadlock: the buffers are handed to the
   * socket synchronously (the header buffer is owned by the caller and never
   * reused, so no defensive copy is needed), and only then do we wait out
   * any backpressure.
   */
  async writeFrame(header: Buffer, payload: Buffer): Promise<void> {
    this._socket.cork();
    this._socket.write(header);
    const canContinue = this._socket.write(payload);
    this._socket.uncork();

    if (!canContinue) {
      await this._drainWaiter.waitForDrain();
    }
  }

  pause(): void {
    this._socket.pause();
  }

  resume(): void {
    this._socket.resume();
  }

  close(): void {
    this._socket.destroy();
    this._drainWaiter.clear();
  }
}
