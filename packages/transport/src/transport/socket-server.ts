import * as net from "node:net";
import { EventEmitter } from "../utils/events.js";
import { TransportError } from "../utils/errors.js";
import { PipePath } from "../utils/pipe-path.js";
import { isWindows } from "../utils/platform.js";
import type {
  TransportServer,
  TransportServerEvents,
  ServerAddress,
  Transport,
  TransportEvents,
  TransportState,
} from "./types.js";
import type { Unsubscribe } from "../utils/disposables.js";

/**
 * Socket server options.
 */
export interface SocketServerOptions {
  /**
   * Optional: cleanup stale socket files before listening (Unix only).
   * @default true
   */
  cleanupBeforeListen?: boolean;
}

/**
 * Socket server implementation for Named Pipes (Windows) and Unix Domain Sockets.
 *
 * Accepts client connections and creates Transport instances for each connection.
 *
 * @example
 * ```ts
 * const server = new SocketServer();
 * const address = await server.listen('/tmp/my-server.sock');
 *
 * server.onConnection(transport => {
 *   console.log('Client connected');
 *   transport.onData(data => {
 *     console.log('received:', data);
 *     transport.write(data); // Echo back
 *   });
 * });
 * ```
 */
export class SocketServer implements TransportServer {
  private readonly emitter = new EventEmitter<TransportServerEvents>();
  private readonly options: Required<SocketServerOptions>;
  private server: net.Server | null = null;
  private _address: ServerAddress | null = null;
  private readonly connections = new Set<ConnectedSocketTransport>();

  constructor(options: SocketServerOptions = {}) {
    this.options = {
      cleanupBeforeListen: options.cleanupBeforeListen ?? true,
    };
  }

  get isListening(): boolean {
    return this.server !== null && this.server.listening;
  }

  get address(): ServerAddress | null {
    return this._address;
  }

  async listen(address: string | number): Promise<ServerAddress> {
    if (this.isListening) {
      throw new TransportError("Server is already listening");
    }

    // Address must be string (path) for socket server
    if (typeof address !== "string") {
      throw new TransportError("Socket server requires path address (string)");
    }

    const path = address;

    // Cleanup stale socket file (Unix only)
    if (this.options.cleanupBeforeListen) {
      await PipePath.cleanup(path);
    }

    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => {
        this.handleConnection(socket);
      });

      this.server = server;

      server.once("listening", () => {
        const type = isWindows() ? "pipe" : "unix";
        this._address = { type, value: path };
        this.emitter.emit("listening", this._address);
        resolve(this._address);
      });

      server.once("error", (err) => {
        const error = new TransportError(`Failed to listen: ${err.message}`, err);
        this.emitter.emit("error", error);
        reject(error);
      });

      server.on("error", (err) => {
        const error = new TransportError(`Server error: ${err.message}`, err);
        this.emitter.emit("error", error);
      });

      server.listen(path);
    });
  }

  async close(): Promise<void> {
    if (!this.server) {
      return;
    }

    return new Promise((resolve, reject) => {
      const server = this.server!;

      // Close all active connections
      const closePromises = Array.from(this.connections).map((transport) =>
        transport.disconnect().catch(() => {
          // Ignore errors during connection cleanup
        }),
      );

      Promise.all(closePromises).finally(() => {
        server.close((err) => {
          if (err) {
            const error = new TransportError(`Failed to close server: ${err.message}`, err);
            this.emitter.emit("error", error);
            reject(error);
          } else {
            this.cleanup();
            resolve();
          }
        });
      });
    });
  }

  onConnection(handler: (transport: Transport) => void): Unsubscribe {
    return this.emitter.on("connection", handler);
  }

  on<K extends keyof TransportServerEvents>(
    event: K,
    handler: (data: TransportServerEvents[K]) => void,
  ): Unsubscribe {
    return this.emitter.on(event, handler);
  }

  private handleConnection(socket: net.Socket): void {
    const transport = new ConnectedSocketTransport(socket);
    this.connections.add(transport);

    // Remove from set when disconnected
    transport.on("disconnect", () => {
      this.connections.delete(transport);
    });

    this.emitter.emit("connection", transport);
  }

  private cleanup(): void {
    this.server?.removeAllListeners();
    this.server = null;
    this._address = null;
    this.connections.clear();
    this.emitter.emit("close", undefined);
  }
}

/**
 * Transport wrapper for an already-connected socket (used by server for incoming connections).
 * Implements Transport interface for server-accepted connections.
 */
class ConnectedSocketTransport implements Transport {
  private readonly emitter = new EventEmitter<TransportEvents>();
  private readonly socket: net.Socket;
  private _state: TransportState = "connected";

  constructor(socket: net.Socket) {
    this.socket = socket;
    this.setupSocketListeners();
  }

  get state(): TransportState {
    return this._state;
  }

  async connect(): Promise<void> {
    throw new TransportError("Already connected (server-accepted connection)");
  }

  async disconnect(): Promise<void> {
    if (this._state === "disconnected") {
      return;
    }

    return new Promise((resolve) => {
      this.socket.once("close", () => {
        this.cleanup();
        resolve();
      });

      this.socket.end();

      // Force close after timeout
      setTimeout(() => {
        if (!this.socket.destroyed) {
          this.socket.destroy();
        }
      }, 1000);
    });
  }

  async write(data: Buffer): Promise<void> {
    if (this._state !== "connected") {
      throw new TransportError("Not connected");
    }

    return new Promise((resolve, reject) => {
      const canContinue = this.socket.write(data, (err) => {
        if (err) {
          const error = new TransportError(`Write failed: ${err.message}`, err);
          this.emitter.emit("error", error);
          reject(error);
        } else {
          resolve();
        }
      });

      // Handle backpressure
      if (!canContinue) {
        this.socket.once("drain", () => {
          // Buffer drained
        });
      }
    });
  }

  onData(handler: (data: Buffer) => void): Unsubscribe {
    return this.emitter.on("data", handler);
  }

  on<K extends keyof TransportEvents>(
    event: K,
    handler: (data: TransportEvents[K]) => void,
  ): Unsubscribe {
    return this.emitter.on(event, handler);
  }

  private setupSocketListeners(): void {
    this.socket.on("data", (data: Buffer) => {
      this.emitter.emit("data", data);
    });

    this.socket.on("close", () => {
      this.cleanup();
    });

    this.socket.on("error", (err) => {
      this._state = "error";
      const error = new TransportError(`Socket error: ${err.message}`, err);
      this.emitter.emit("error", error);
    });
  }

  private cleanup(): void {
    this.socket.removeAllListeners();
    if (!this.socket.destroyed) {
      this.socket.destroy();
    }

    if (this._state !== "disconnected") {
      this._state = "disconnected";
      this.emitter.emit("disconnect", undefined);
    }
  }
}
