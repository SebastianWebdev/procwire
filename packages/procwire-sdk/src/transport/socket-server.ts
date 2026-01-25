/**
 * Socket server for worker data channel.
 *
 * Creates a Unix socket (Linux/macOS) or Named Pipe (Windows) server.
 * The manager connects as a client.
 */

import * as net from "node:net";
import * as fs from "node:fs";
import type { WorkerTransport, TransportState, SocketServerInterface } from "./types.js";

/**
 * Options for SocketServer.
 */
export interface SocketServerOptions {
  /**
   * Timeout for waiting for client connection (ms).
   * @default 30000
   */
  connectionTimeout?: number;
}

/**
 * Socket server for the data channel.
 *
 * Worker creates this server and sends `__data_channel_ready__` to manager.
 * Manager then connects as a client.
 *
 * @remarks
 * This server accepts only one client connection, as each worker has
 * exactly one manager. Additional connection attempts are ignored after
 * the first successful connection is established via `waitForConnection()`.
 *
 * @example
 * ```ts
 * const server = new SocketServer();
 * await server.listen('/tmp/procwire-worker-123.sock');
 *
 * // Notify manager that we're ready (via control channel)
 * await controlChannel.notify('__data_channel_ready__', { path: server.path });
 *
 * // Wait for manager to connect
 * const clientTransport = await server.waitForConnection();
 *
 * // Now use clientTransport for data channel communication
 * ```
 */
export class SocketServer implements SocketServerInterface {
  private server: net.Server | null = null;
  private _path: string | null = null;
  private _isListening = false;
  private timeoutHandle: NodeJS.Timeout | null = null;

  private connectionResolve: ((transport: SocketClientTransport) => void) | null = null;
  private connectionReject: ((error: Error) => void) | null = null;

  private readonly options: Required<SocketServerOptions>;

  constructor(options: SocketServerOptions = {}) {
    this.options = {
      connectionTimeout: options.connectionTimeout ?? 30_000,
    };
  }

  get isListening(): boolean {
    return this._isListening;
  }

  get path(): string | null {
    return this._path;
  }

  async listen(path: string): Promise<void> {
    if (this._isListening) {
      throw new Error("Server already listening");
    }

    this._path = path;

    // Remove existing socket file if present (Unix only)
    // On Windows, named pipes are handled differently
    if (process.platform !== "win32") {
      try {
        fs.unlinkSync(path);
      } catch (error) {
        // Ignore ENOENT (file doesn't exist)
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    }

    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleConnection(socket);
      });

      this.server.on("error", (error) => {
        this._isListening = false;
        reject(error);
      });

      this.server.listen(path, () => {
        this._isListening = true;
        resolve();
      });
    });
  }

  async waitForConnection(timeout?: number): Promise<WorkerTransport> {
    if (!this._isListening) {
      throw new Error("Server not listening. Call listen() first.");
    }

    const timeoutMs = timeout ?? this.options.connectionTimeout;

    return new Promise((resolve, reject) => {
      this.connectionResolve = resolve;
      this.connectionReject = reject;

      // Setup timeout
      this.timeoutHandle = setTimeout(() => {
        this.connectionResolve = null;
        this.connectionReject = null;
        this.timeoutHandle = null;
        reject(new Error(`Connection timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  async close(): Promise<void> {
    // Clear any pending timeout
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }

    // Reject any pending connection wait
    if (this.connectionReject) {
      this.connectionReject(new Error("Server closed"));
      this.connectionResolve = null;
      this.connectionReject = null;
    }

    if (!this.server) {
      return;
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        this._isListening = false;
        this.server = null;

        // Clean up socket file (Unix only)
        if (this._path && process.platform !== "win32") {
          try {
            fs.unlinkSync(this._path);
          } catch {
            // Ignore errors during cleanup
          }
        }

        this._path = null;
        resolve();
      });
    });
  }

  private handleConnection(socket: net.Socket): void {
    // Clear timeout if set
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }

    const transport = new SocketClientTransport(socket);

    if (this.connectionResolve) {
      this.connectionResolve(transport);
      this.connectionResolve = null;
      this.connectionReject = null;
    }
  }
}

/**
 * Transport wrapper for a connected client socket.
 *
 * This class is created by SocketServer when a client connects.
 * It implements the WorkerTransport interface for consistent usage.
 */
export class SocketClientTransport implements WorkerTransport {
  private _state: TransportState = "connected";

  private dataHandler: ((data: Buffer) => void) | null = null;
  private errorHandler: ((error: Error) => void) | null = null;
  private closeHandler: (() => void) | null = null;

  constructor(private readonly socket: net.Socket) {
    this.setupListeners();
  }

  get state(): TransportState {
    return this._state;
  }

  async connect(): Promise<void> {
    // Already connected when constructed
  }

  async disconnect(): Promise<void> {
    if (this._state === "disconnected") {
      return;
    }

    return new Promise((resolve) => {
      this.socket.once("close", () => {
        this._state = "disconnected";
        resolve();
      });

      this.socket.destroy();
    });
  }

  async write(data: Buffer): Promise<void> {
    if (this._state !== "connected") {
      throw new Error("Transport not connected");
    }

    return new Promise((resolve, reject) => {
      const success = this.socket.write(data, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });

      // Handle backpressure
      if (!success) {
        this.socket.once("drain", () => resolve());
      }
    });
  }

  onData(handler: (data: Buffer) => void): () => void {
    this.dataHandler = handler;
    return () => {
      this.dataHandler = null;
    };
  }

  onError(handler: (error: Error) => void): () => void {
    this.errorHandler = handler;
    return () => {
      this.errorHandler = null;
    };
  }

  onClose(handler: () => void): () => void {
    this.closeHandler = handler;
    return () => {
      this.closeHandler = null;
    };
  }

  private setupListeners(): void {
    this.socket.on("data", (data) => {
      this.dataHandler?.(data);
    });

    this.socket.on("error", (error) => {
      this.errorHandler?.(error);
    });

    this.socket.on("close", () => {
      this._state = "disconnected";
      this.closeHandler?.();
    });
  }
}
