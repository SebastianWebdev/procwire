/**
 * Debug logger for worker
 */

/**
 * Logger interface.
 */
export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/**
 * Create a logger that writes to stderr.
 *
 * @param name - Worker name for prefix
 * @param enabled - Whether logging is enabled
 * @returns Logger instance
 */
export function createLogger(name: string, enabled: boolean): Logger {
  const prefix = `[${name}]`;

  if (!enabled) {
    // No-op logger
    return {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };
  }

  return {
    debug: (...args) => console.error(prefix, "[DEBUG]", ...args),
    info: (...args) => console.error(prefix, "[INFO]", ...args),
    warn: (...args) => console.error(prefix, "[WARN]", ...args),
    error: (...args) => console.error(prefix, "[ERROR]", ...args),
  };
}
