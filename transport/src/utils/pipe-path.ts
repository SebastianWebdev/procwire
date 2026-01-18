import * as fs from "node:fs/promises";
import * as path from "node:path";
import { isWindows } from "./platform.js";

/**
 * Cross-platform pipe path utilities for Named Pipes (Windows) and Unix Domain Sockets.
 *
 * Provides consistent path generation and cleanup across platforms.
 */
export class PipePath {
  /**
   * Generates a platform-specific pipe/socket path for a module.
   *
   * Windows: `\\.\pipe\<namespace>-<moduleId>`
   * Unix: `/tmp/<namespace>-<moduleId>.sock`
   *
   * @param namespace - Application namespace (e.g., 'procwire')
   * @param moduleId - Module identifier (e.g., 'worker-1')
   * @returns Platform-specific pipe/socket path
   *
   * @example
   * ```ts
   * // Windows: \\.\pipe\procwire-worker-1
   * // Unix: /tmp/procwire-worker-1.sock
   * const path = PipePath.forModule('procwire', 'worker-1');
   * ```
   */
  static forModule(namespace: string, moduleId: string): string {
    // Sanitize inputs to remove problematic characters
    const sanitizedNamespace = this.sanitize(namespace);
    const sanitizedModuleId = this.sanitize(moduleId);
    const name = `${sanitizedNamespace}-${sanitizedModuleId}`;

    if (isWindows()) {
      // Windows Named Pipe: \\.\pipe\<name>
      return `\\\\.\\pipe\\${name}`;
    } else {
      // Unix Domain Socket: /tmp/<name>.sock
      return path.join("/tmp", `${name}.sock`);
    }
  }

  /**
   * Cleans up a pipe/socket path (Unix only).
   *
   * On Unix, removes the socket file if it exists.
   * On Windows, this is a no-op (Named Pipes are virtual).
   *
   * @param pipePath - Path to clean up
   *
   * @example
   * ```ts
   * await PipePath.cleanup('/tmp/my-socket.sock');
   * ```
   */
  static async cleanup(pipePath: string): Promise<void> {
    if (isWindows()) {
      // Windows Named Pipes are virtual, no cleanup needed
      return;
    }

    try {
      // Check if file exists and is a socket
      const stats = await fs.stat(pipePath);
      if (stats.isSocket()) {
        await fs.unlink(pipePath);
      }
    } catch (error) {
      // Ignore errors (file doesn't exist, permission issues, etc.)
      // This is expected and safe
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        // Log unexpected errors but don't throw
        // (we don't have a logger yet, so silently ignore)
      }
    }
  }

  /**
   * Sanitizes a string to be safe for use in pipe/socket names.
   * Removes or replaces characters that could cause issues.
   *
   * @param input - String to sanitize
   * @returns Sanitized string
   */
  private static sanitize(input: string): string {
    return input
      .replace(/[^a-zA-Z0-9_-]/g, "_") // Replace non-alphanumeric (except _ and -) with _
      .replace(/_{2,}/g, "_") // Replace multiple underscores with single
      .replace(/^_+|_+$/g, ""); // Trim underscores from start/end
  }
}
