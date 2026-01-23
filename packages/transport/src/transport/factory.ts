import { TransportError } from "../utils/errors.js";
import { isWindows } from "../utils/platform.js";
import { StdioTransport, type StdioTransportOptions } from "./stdio-transport.js";
import { SocketTransport, type SocketTransportOptions } from "./socket-transport.js";
import { SocketServer, type SocketServerOptions } from "./socket-server.js";
import type { Transport, TransportServer } from "./types.js";

/**
 * Factory for creating transport instances.
 *
 * Provides convenient methods for creating different types of transports
 * with platform-specific optimizations.
 *
 * @example
 * ```ts
 * // Create stdio transport for child process
 * const transport = TransportFactory.createStdio({
 *   executablePath: 'node',
 *   args: ['worker.js']
 * });
 *
 * // Create pipe/socket client
 * const client = TransportFactory.createPipeClient({
 *   path: '/tmp/my-socket.sock'
 * });
 *
 * // Create pipe/socket server
 * const server = TransportFactory.createPipeServer();
 * await server.listen('/tmp/my-socket.sock');
 * ```
 */
export class TransportFactory {
  /**
   * Creates a stdio transport for child process communication.
   *
   * @param options - Stdio transport options
   * @returns StdioTransport instance
   *
   * @example
   * ```ts
   * const transport = TransportFactory.createStdio({
   *   executablePath: 'node',
   *   args: ['worker.js'],
   *   cwd: '/path/to/project'
   * });
   * await transport.connect();
   * ```
   */
  static createStdio(options: StdioTransportOptions): StdioTransport {
    return new StdioTransport(options);
  }

  /**
   * Creates a pipe/socket client transport.
   *
   * Automatically uses the appropriate implementation for the current platform:
   * - Windows: Named Pipes
   * - Unix: Unix Domain Sockets
   *
   * @param options - Socket transport options
   * @returns SocketTransport instance
   *
   * @example
   * ```ts
   * const transport = TransportFactory.createPipeClient({
   *   path: isWindows() ? '\\\\.\\pipe\\my-pipe' : '/tmp/my-socket.sock',
   *   connectionTimeout: 5000
   * });
   * await transport.connect();
   * ```
   */
  static createPipeClient(options: SocketTransportOptions): Transport {
    return new SocketTransport(options);
  }

  /**
   * Creates a pipe/socket server.
   *
   * Automatically uses the appropriate implementation for the current platform:
   * - Windows: Named Pipe Server
   * - Unix: Unix Domain Socket Server
   *
   * @param options - Socket server options
   * @returns SocketServer instance
   *
   * @example
   * ```ts
   * const server = TransportFactory.createPipeServer();
   * await server.listen('/tmp/my-socket.sock');
   *
   * server.onConnection(transport => {
   *   console.log('Client connected');
   *   transport.onData(data => {
   *     transport.write(data); // Echo back
   *   });
   * });
   * ```
   */
  static createPipeServer(options?: SocketServerOptions): TransportServer {
    return new SocketServer(options);
  }

  /**
   * Creates an optimal transport based on options and platform.
   *
   * Automatically selects:
   * - Stdio transport if executablePath is provided
   * - Pipe/socket transport if path is provided
   *
   * @param options - Mixed transport options
   * @returns Transport instance
   * @throws {TransportError} if options are invalid or ambiguous
   *
   * @example
   * ```ts
   * // Stdio transport
   * const stdio = TransportFactory.createOptimal({
   *   executablePath: 'node',
   *   args: ['worker.js']
   * });
   *
   * // Pipe transport
   * const pipe = TransportFactory.createOptimal({
   *   path: '/tmp/my-socket.sock'
   * });
   * ```
   */
  static createOptimal(
    options: (StdioTransportOptions | SocketTransportOptions) & {
      executablePath?: string;
      path?: string;
    },
  ): Transport {
    // Check for stdio (has executablePath)
    if ("executablePath" in options && options.executablePath) {
      return this.createStdio(options as StdioTransportOptions);
    }

    // Check for pipe/socket (has path)
    if ("path" in options && options.path) {
      return this.createPipeClient(options as SocketTransportOptions);
    }

    throw new TransportError(
      "Invalid transport options: must provide either 'executablePath' (stdio) or 'path' (pipe/socket)",
    );
  }

  /**
   * Validates if a path is valid for the current platform.
   *
   * @param path - Path to validate
   * @returns true if path is valid for current platform
   *
   * @example
   * ```ts
   * // Windows
   * TransportFactory.isValidPath('\\\\.\\pipe\\my-pipe'); // true
   * TransportFactory.isValidPath('/tmp/socket.sock'); // false (Unix path on Windows)
   *
   * // Unix
   * TransportFactory.isValidPath('/tmp/socket.sock'); // true
   * TransportFactory.isValidPath('\\\\.\\pipe\\my-pipe'); // false (Windows path on Unix)
   * ```
   */
  static isValidPath(path: string): boolean {
    if (isWindows()) {
      // Windows Named Pipe: must start with \\.\pipe\
      return path.startsWith("\\\\.\\pipe\\");
    } else {
      // Unix: should be absolute path
      return path.startsWith("/");
    }
  }
}
