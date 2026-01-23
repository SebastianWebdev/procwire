import * as net from "node:net";
import { EventEmitter } from "../utils/events.js";
import { TransportError } from "../utils/errors.js";
import type { Transport, TransportState, TransportEvents } from "./types.js";
import type { Unsubscribe } from "../utils/disposables.js";

/**
 * Socket transport options (Named Pipes on Windows, Unix Domain Sockets on Unix).
 */
export interface SocketTransportOptions {
  /**
   * Pipe/socket path to connect to.
   * Windows: `\\.\pipe\<name>`
   * Unix: `/tmp/<name>.sock`
   */
  path: string;

  /**
   * Connection timeout in milliseconds.
   * @default 5000
   */
  connectionTimeout?: number;

  /**
   * Enable automatic reconnection on disconnect.
   * @default false
   */
  autoReconnect?: boolean;

  /**
   * Initial reconnect delay in milliseconds.
   * @default 1000
   */
  reconnectDelay?: number;

  /**
   * Maximum reconnect delay in milliseconds (for exponential backoff).
   * @default 30000
   */
  maxReconnectDelay?: number;
}

/**
 * Socket-based transport implementation for Named Pipes (Windows) and Unix Domain Sockets.
 *
 * Provides bidirectional byte stream communication over local sockets.
 *
 * @example
 * ```ts
 * const transport = new SocketTransport({ path: '/tmp/my-socket.sock' });
 * await transport.connect();
 * await transport.write(Buffer.from('hello'));
 * transport.onData(data => console.log('received:', data));
 * ```
 */
export class SocketTransport implements Transport {
  private readonly emitter = new EventEmitter<TransportEvents>();
  private readonly options: Required<SocketTransportOptions>;
  private socket: net.Socket | null = null;
  private _state: TransportState = "disconnected";
  private connectTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private manualDisconnect = false;

  constructor(options: SocketTransportOptions) {
    this.options = {
      path: options.path,
      connectionTimeout: options.connectionTimeout ?? 5000,
      autoReconnect: options.autoReconnect ?? false,
      reconnectDelay: options.reconnectDelay ?? 1000,
      maxReconnectDelay: options.maxReconnectDelay ?? 30000,
    };
  }

  get state(): TransportState {
    return this._state;
  }

  async connect(): Promise<void> {
    if (this._state === "connected") {
      throw new TransportError("Already connected");
    }

    if (this._state === "connecting") {
      throw new TransportError("Connection already in progress");
    }

    this.manualDisconnect = false;
    this._state = "connecting";

    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ path: this.options.path });
      this.socket = socket;

      // Connection timeout
      this.connectTimer = setTimeout(() => {
        socket.destroy();
        this._state = "error";
        const error = new TransportError(
          `Connection timeout after ${this.options.connectionTimeout}ms`,
        );
        this.emitter.emit("error", error);
        reject(error);
      }, this.options.connectionTimeout);

      socket.once("connect", () => {
        if (this.connectTimer) {
          clearTimeout(this.connectTimer);
          this.connectTimer = null;
        }

        this._state = "connected";
        this.reconnectAttempts = 0;
        this.setupSocketListeners(socket);
        this.emitter.emit("connect", undefined);
        resolve();
      });

      socket.once("error", (err) => {
        if (this.connectTimer) {
          clearTimeout(this.connectTimer);
          this.connectTimer = null;
        }

        this._state = "error";
        const error = new TransportError(`Connection failed: ${err.message}`, err);
        this.emitter.emit("error", error);
        reject(error);

        // Try reconnecting if enabled and not manual disconnect
        if (this.options.autoReconnect && !this.manualDisconnect) {
          this.scheduleReconnect();
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this._state === "disconnected") {
      return;
    }

    this.manualDisconnect = true;

    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      return new Promise((resolve) => {
        const socket = this.socket!;

        socket.once("close", () => {
          this.cleanup();
          resolve();
        });

        socket.end();

        // Force close after timeout
        setTimeout(() => {
          if (!socket.destroyed) {
            socket.destroy();
          }
        }, 1000);
      });
    } else {
      this.cleanup();
    }
  }

  async write(data: Buffer): Promise<void> {
    if (this._state !== "connected" || !this.socket) {
      throw new TransportError("Not connected");
    }

    return new Promise((resolve, reject) => {
      const socket = this.socket!;

      const canContinue = socket.write(data, (err) => {
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
        socket.once("drain", () => {
          // Buffer drained, can continue writing
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

  private setupSocketListeners(socket: net.Socket): void {
    socket.on("data", (data: Buffer) => {
      this.emitter.emit("data", data);
    });

    socket.on("close", () => {
      this.cleanup();

      // Try reconnecting if enabled and not manual disconnect
      if (this.options.autoReconnect && !this.manualDisconnect) {
        this.scheduleReconnect();
      }
    });

    socket.on("error", (err) => {
      this._state = "error";
      const error = new TransportError(`Socket error: ${err.message}`, err);
      this.emitter.emit("error", error);
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.manualDisconnect) {
      return;
    }

    // Exponential backoff: min(reconnectDelay * 2^attempts, maxReconnectDelay)
    const delay = Math.min(
      this.options.reconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.options.maxReconnectDelay,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempts++;
      this.connect().catch(() => {
        // Error already emitted, will schedule next attempt
      });
    }, delay);
  }

  private cleanup(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      if (!this.socket.destroyed) {
        this.socket.destroy();
      }
      this.socket = null;
    }

    if (this._state !== "disconnected") {
      this._state = "disconnected";
      this.emitter.emit("disconnect", undefined);
    }
  }
}
