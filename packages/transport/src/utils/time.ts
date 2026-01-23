import { TimeoutError } from "./errors.js";

/**
 * Sleeps for specified milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Options for withTimeout.
 */
export interface TimeoutOptions {
  /**
   * Custom error message for timeout.
   */
  message?: string;

  /**
   * Cause to attach to timeout error.
   */
  cause?: unknown;
}

/**
 * Wraps a promise with a timeout.
 * Throws TimeoutError if promise doesn't settle within ms.
 *
 * @param promise - Promise to wrap
 * @param ms - Timeout in milliseconds
 * @param options - Optional message and cause for timeout error
 * @returns Promise that rejects with TimeoutError on timeout
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  options?: TimeoutOptions,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      const message = options?.message ?? `Operation timed out after ${ms}ms`;
      reject(new TimeoutError(message, options?.cause));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * Creates a timeout signal that resolves after ms.
 * Useful for race conditions with manual cancellation.
 *
 * @returns Object with promise and cancel function
 */
export function createTimeoutSignal(ms: number): {
  promise: Promise<never>;
  cancel: () => void;
} {
  let timeoutId: NodeJS.Timeout | undefined;

  const promise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(`Timeout after ${ms}ms`));
    }, ms);
  });

  const cancel = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  return { promise, cancel };
}
