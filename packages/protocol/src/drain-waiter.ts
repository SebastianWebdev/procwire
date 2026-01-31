/**
 * DrainWaiter - Singleton pattern for socket drain waiting.
 *
 * PROBLEM: When multiple concurrent requests await `once(socket, "drain")`,
 * Node.js emits MaxListenersExceededWarning because each request adds
 * a separate listener.
 *
 * SOLUTION: This class maintains a single drain listener and notifies
 * all waiters when drain fires.
 *
 * @example
 * ```typescript
 * const drainWaiter = new DrainWaiter(socket);
 *
 * // Multiple concurrent requests can call this
 * await drainWaiter.waitForDrain();
 * ```
 *
 * @module
 */

import type { Socket } from "node:net";

/**
 * Singleton drain waiter for a socket.
 *
 * Allows multiple concurrent requests to wait for drain
 * with only a single event listener on the socket.
 */
export class DrainWaiter {
  private _waiters: Set<() => void> = new Set();
  private _listening = false;
  private _closed = false;

  private readonly _onDrain = (): void => {
    this._listening = false;
    // Resolve all waiters
    for (const resolve of this._waiters) {
      resolve();
    }
    this._waiters.clear();
  };

  private readonly _onClose = (): void => {
    this._closed = true;
    this._listening = false;
    // All pending waiters will be left hanging - but their socket
    // operations will fail anyway since socket is closed
    this._waiters.clear();
    this._socket.off("drain", this._onDrain);
  };

  constructor(private readonly _socket: Socket) {
    // Register close handler once in constructor
    this._socket.once("close", this._onClose);
  }

  /**
   * Wait for socket drain if needed.
   *
   * If socket doesn't need drain, returns immediately.
   * Otherwise, registers a waiter and returns when drain fires.
   *
   * @throws {Error} If socket is destroyed while waiting
   */
  async waitForDrain(): Promise<void> {
    // Fast path: no backpressure
    if (!this._socket.writableNeedDrain) {
      return;
    }

    // Socket closed check
    if (this._socket.destroyed || this._closed) {
      throw new Error("Socket closed during backpressure wait");
    }

    // Start listening if not already
    if (!this._listening) {
      this._listening = true;
      this._socket.once("drain", this._onDrain);
    }

    // Add this request to waiters
    return new Promise<void>((resolve) => {
      this._waiters.add(resolve);
    });
  }

  /**
   * Clear all pending waiters and listener state.
   * Call this on socket close/disconnect.
   */
  clear(): void {
    this._listening = false;
    this._closed = true;
    this._waiters.clear();
    this._socket.off("drain", this._onDrain);
    this._socket.off("close", this._onClose);
  }
}
