import type { EventMap } from "../utils/events.js";
import type { Unsubscribe } from "../utils/disposables.js";

/**
 * Transport connection state.
 */
export type TransportState = "disconnected" | "connecting" | "connected" | "error";

/**
 * Transport events map.
 */
export interface TransportEvents extends EventMap {
  /**
   * Fired when transport successfully connects.
   */
  connect: void;

  /**
   * Fired when transport disconnects (graceful or error).
   */
  disconnect: void;

  /**
   * Fired when an error occurs.
   */
  error: Error;

  /**
   * Fired when data is received.
   */
  data: Buffer;
}

/**
 * Base transport interface for bidirectional byte streams.
 * Implementations: stdio, named pipes, unix sockets, TCP, etc.
 */
export interface Transport {
  /**
   * Current connection state.
   */
  readonly state: TransportState;

  /**
   * Initiates connection.
   * @throws {TransportError} if already connected or invalid state
   */
  connect(): Promise<void>;

  /**
   * Closes the connection gracefully.
   * @throws {TransportError} if not connected
   */
  disconnect(): Promise<void>;

  /**
   * Writes data to the transport.
   * @throws {TransportError} if not connected or write fails
   */
  write(data: Buffer): Promise<void>;

  /**
   * Subscribes to data events.
   * @returns Unsubscribe function
   */
  onData(handler: (data: Buffer) => void): Unsubscribe;

  /**
   * Subscribes to transport events.
   * @returns Unsubscribe function
   */
  on<K extends keyof TransportEvents>(
    event: K,
    handler: (data: TransportEvents[K]) => void,
  ): Unsubscribe;
}

/**
 * Server address information.
 */
export interface ServerAddress {
  /**
   * Address type (pipe name, unix socket path, TCP port, etc.)
   */
  type: "pipe" | "unix" | "tcp";

  /**
   * Address value (platform-specific).
   */
  value: string | number;
}

/**
 * Transport server events map.
 */
export interface TransportServerEvents extends EventMap {
  /**
   * Fired when server starts listening.
   */
  listening: ServerAddress;

  /**
   * Fired when new client connection is established.
   */
  connection: Transport;

  /**
   * Fired when server closes.
   */
  close: void;

  /**
   * Fired when server error occurs.
   */
  error: Error;
}

/**
 * Transport server interface for accepting client connections.
 * Implementations: named pipe server, unix socket server, TCP server.
 */
export interface TransportServer {
  /**
   * Returns true if server is currently listening.
   */
  readonly isListening: boolean;

  /**
   * Server address (only available when listening).
   */
  readonly address: ServerAddress | null;

  /**
   * Starts listening for connections.
   * @param address - Platform-specific address (pipe name, socket path, port)
   * @throws {TransportError} if already listening
   */
  listen(address: string | number): Promise<ServerAddress>;

  /**
   * Stops the server and closes all active connections.
   */
  close(): Promise<void>;

  /**
   * Subscribes to new connection events.
   * @returns Unsubscribe function
   */
  onConnection(handler: (transport: Transport) => void): Unsubscribe;

  /**
   * Subscribes to server events.
   * @returns Unsubscribe function
   */
  on<K extends keyof TransportServerEvents>(
    event: K,
    handler: (data: TransportServerEvents[K]) => void,
  ): Unsubscribe;
}
