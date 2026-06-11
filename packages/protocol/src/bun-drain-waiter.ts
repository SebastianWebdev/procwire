/**
 * BunDrainWaiter - Singleton pattern for Bun socket drain waiting.
 *
 * PROBLEM: In Bun, socket.write() returns the NUMBER of bytes written - not
 * a boolean. It can be less than data.length when the kernel send buffer is
 * full (backpressure) and -1 when the socket is closed. Unwritten bytes are
 * NOT buffered by Bun: the caller must wait for the drain callback and
 * re-write the remaining tail itself.
 *
 * SOLUTION: This class maintains pending drain waiters, resolves them when
 * the drain callback fires, and provides writeAll() which loops until every
 * byte has actually been handed to the kernel.
 *
 * @example
 * ```typescript
 * const drainWaiter = new BunDrainWaiter();
 *
 * // In socket handlers:
 * socket: {
 *   drain(socket) {
 *     drainWaiter.onDrain();
 *   }
 * }
 *
 * // When writing:
 * await drainWaiter.writeAll(socket, data);
 * ```
 *
 * @module
 */

/** Minimal structural view of a writable Bun socket. */
export interface BunWritableSocket {
  write(data: Buffer | Uint8Array): number;
}

/**
 * Singleton drain waiter for Bun sockets.
 *
 * Allows multiple concurrent requests to wait for drain
 * with a simple callback-based pattern.
 */
export class BunDrainWaiter {
  private _waiters: Set<{ resolve: () => void; reject: (err: Error) => void }> = new Set();
  private _needsDrain = false;
  private _closed = false;

  /**
   * Tail of the FIFO write queue. writeAll() calls are serialized through
   * this chain: a partial write suspends mid-frame waiting for drain, and a
   * concurrently submitted frame must not slip between the written prefix
   * and the pending tail (prefix(A) + frame(B) + tail(A) would corrupt the
   * framing). Uncontended cost is a single resolved-promise hop.
   */
  private _writeQueue: Promise<void> = Promise.resolve();

  /**
   * Call this from the socket's drain handler.
   * Resolves all pending waiters.
   */
  onDrain(): void {
    this._needsDrain = false;
    // Resolve all waiters
    for (const waiter of this._waiters) {
      waiter.resolve();
    }
    this._waiters.clear();
  }

  /**
   * Mark that drain is needed (socket.write returned false).
   */
  markNeedsDrain(): void {
    this._needsDrain = true;
  }

  /**
   * Check if drain is needed.
   */
  get needsDrain(): boolean {
    return this._needsDrain;
  }

  /**
   * Wait for socket drain.
   *
   * Call markNeedsDrain() before calling this if socket.write returned false.
   *
   * @throws {Error} If socket is closed while waiting
   */
  async waitForDrain(): Promise<void> {
    // Fast path: no backpressure
    if (!this._needsDrain) {
      return;
    }

    // Socket closed check
    if (this._closed) {
      throw new Error("Socket closed during backpressure wait");
    }

    // Add this request to waiters
    return new Promise<void>((resolve, reject) => {
      this._waiters.add({ resolve, reject });
    });
  }

  /**
   * Write a buffer FULLY to a Bun socket, honoring partial writes.
   *
   * socket.write() returns how many bytes were written: a partial result
   * (including 0) means the kernel buffer is full and the unwritten tail
   * must be re-sent after the next drain event; -1 means the socket is
   * closed. Treating the number as a boolean drops frame tails and corrupts
   * the wire protocol under backpressure.
   *
   * Calls on the same waiter are serialized in FIFO order so concurrent
   * senders cannot interleave bytes inside one frame. Fast path (no
   * backpressure, no contention) costs a single write() call plus one
   * resolved-promise hop - no extra allocation.
   *
   * @throws {Error} If the socket closes before all bytes are written
   */
  writeAll(socket: BunWritableSocket, data: Buffer): Promise<void> {
    const task = this._writeQueue.then(() => this._writeAllSerialized(socket, data));
    // Keep the queue alive after a failed write; the error still reaches
    // this caller through `task`.
    this._writeQueue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  private async _writeAllSerialized(socket: BunWritableSocket, data: Buffer): Promise<void> {
    let remaining: Buffer = data;
    while (remaining.length > 0) {
      const written = socket.write(remaining);

      if (written < 0) {
        throw new Error("Socket closed during write");
      }
      if (written >= remaining.length) {
        return; // fully written
      }

      // Partial write: wait for drain, then send the rest.
      // waitForDrain rejects if the socket is cleared while suspended.
      remaining = remaining.subarray(written);
      this.markNeedsDrain();
      await this.waitForDrain();
    }
  }

  /**
   * Clear all pending waiters and mark the socket closed.
   * Call this on socket close/disconnect.
   *
   * Pending waiters are REJECTED (matching Node's DrainWaiter): a sender
   * suspended on backpressure must not "succeed" against a dead socket.
   */
  clear(): void {
    this._needsDrain = false;
    this._closed = true;
    // Reject all pending waiters so they don't hang
    const error = new Error("Socket closed during backpressure wait");
    for (const waiter of this._waiters) {
      waiter.reject(error);
    }
    this._waiters.clear();
  }
}
