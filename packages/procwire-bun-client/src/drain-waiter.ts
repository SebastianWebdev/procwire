/**
 * BunDrainWaiter - Singleton pattern for Bun socket drain waiting.
 *
 * PROBLEM: In Bun, socket.write() returns a boolean indicating if more data
 * can be written. When it returns false, you need to wait for the drain
 * callback before writing more data.
 *
 * SOLUTION: This class maintains pending drain waiters and resolves them
 * when the drain callback is called.
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
 * const canContinue = socket.write(data);
 * if (!canContinue) {
 *   drainWaiter.markNeedsDrain();
 *   await drainWaiter.waitForDrain();
 * }
 * ```
 *
 * @module
 */

/**
 * Singleton drain waiter for Bun sockets.
 *
 * Allows multiple concurrent requests to wait for drain
 * with a simple callback-based pattern.
 */
export class BunDrainWaiter {
  private _waiters: Set<() => void> = new Set();
  private _needsDrain = false;
  private _closed = false;

  /**
   * Call this from the socket's drain handler.
   * Resolves all pending waiters.
   */
  onDrain(): void {
    this._needsDrain = false;
    // Resolve all waiters
    for (const resolve of this._waiters) {
      resolve();
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
    return new Promise<void>((resolve) => {
      this._waiters.add(resolve);
    });
  }

  /**
   * Clear all pending waiters.
   * Call this on socket close/disconnect.
   */
  clear(): void {
    this._needsDrain = false;
    this._closed = true;
    // Resolve all waiters so they don't hang
    for (const resolve of this._waiters) {
      resolve();
    }
    this._waiters.clear();
  }

  /**
   * Mark socket as closed but don't clear waiters yet.
   * They will be cleared when they complete.
   */
  markClosed(): void {
    this._closed = true;
  }
}
