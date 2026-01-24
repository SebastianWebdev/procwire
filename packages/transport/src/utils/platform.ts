/**
 * Platform detection utilities for cross-platform transport implementation.
 */

/**
 * Returns true if running on Windows platform.
 */
export function isWindows(): boolean {
  return process.platform === "win32";
}

/**
 * Returns true if running on Unix-like platform (Linux, macOS, BSD).
 */
export function isUnix(): boolean {
  return (
    process.platform === "darwin" || process.platform === "linux" || process.platform === "freebsd"
  );
}

/**
 * Returns current platform identifier.
 */
export function getPlatform(): NodeJS.Platform {
  return process.platform;
}
