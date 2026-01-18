/**
 * Function that performs cleanup/unsubscribe when called.
 */
export type Unsubscribe = () => void;

/**
 * Object that can be disposed (has dispose method).
 */
export interface DisposableLike {
  dispose(): void;
}

/**
 * Converts a function to an Unsubscribe function.
 * Ensures idempotency (can be called multiple times safely).
 */
export function createUnsubscribe(fn: () => void): Unsubscribe {
  let disposed = false;
  return () => {
    if (!disposed) {
      disposed = true;
      fn();
    }
  };
}

/**
 * Collects multiple unsubscribe functions and disposes them all at once.
 * Useful for cleanup in components/channels that manage multiple subscriptions.
 */
export class CompositeDisposable {
  private readonly disposables: Unsubscribe[] = [];
  private disposed = false;

  /**
   * Adds an unsubscribe function to the composite.
   * If already disposed, calls it immediately.
   */
  add(unsubscribe: Unsubscribe): void {
    if (this.disposed) {
      unsubscribe();
      return;
    }
    this.disposables.push(unsubscribe);
  }

  /**
   * Disposes all collected unsubscribe functions.
   * Safe to call multiple times (idempotent).
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const unsubscribe of this.disposables) {
      try {
        unsubscribe();
      } catch (error) {
        // Log but don't throw - we want to dispose all
        console.error("Error during disposal:", error);
      }
    }
    this.disposables.length = 0;
  }

  /**
   * Returns true if already disposed.
   */
  isDisposed(): boolean {
    return this.disposed;
  }
}
