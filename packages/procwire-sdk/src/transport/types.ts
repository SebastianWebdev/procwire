/**
 * Transport layer types for @procwire/sdk
 *
 * These types define the worker-side transport interfaces that mirror
 * the manager-side transports in @procwire/transport.
 */

/**
 * Transport connection state.
 */
export type TransportState = "disconnected" | "connecting" | "connected";

/**
 * Base transport interface for workers.
 *
 * Workers implement this interface for their transports.
 * This mirrors the transport interface in @procwire/transport for consistency.
 */
export interface WorkerTransport {
  /**
   * Current connection state.
   */
  readonly state: TransportState;

  /**
   * Connect/start the transport.
   * For stdio, this starts listening on stdin.
   * For sockets, this is already connected when received from server.
   */
  connect(): Promise<void>;

  /**
   * Disconnect/stop the transport.
   * Cleans up resources and stops listening for data.
   */
  disconnect(): Promise<void>;

  /**
   * Write data to the transport.
   * @param data - Buffer to write
   * @throws Error if transport is not connected
   */
  write(data: Buffer): Promise<void>;

  /**
   * Register handler for incoming data.
   * @param handler - Callback invoked when data arrives
   * @returns Unsubscribe function to remove the handler
   */
  onData(handler: (data: Buffer) => void): () => void;

  /**
   * Register handler for errors.
   * @param handler - Callback invoked on transport errors
   * @returns Unsubscribe function to remove the handler
   */
  onError(handler: (error: Error) => void): () => void;

  /**
   * Register handler for connection close.
   * @param handler - Callback invoked when connection closes
   * @returns Unsubscribe function to remove the handler
   */
  onClose(handler: () => void): () => void;
}

/**
 * Socket server interface for the data channel.
 *
 * Worker creates this server and waits for the manager to connect.
 * This is the worker-side counterpart to SocketTransport in @procwire/transport.
 */
export interface SocketServerInterface {
  /**
   * Start listening on the given path.
   * @param path - Unix socket path or Named Pipe path
   */
  listen(path: string): Promise<void>;

  /**
   * Wait for a client (manager) to connect.
   * @param timeout - Optional timeout in milliseconds
   * @returns Transport for the connected client
   * @throws Error if server is not listening or timeout occurs
   */
  waitForConnection(timeout?: number): Promise<WorkerTransport>;

  /**
   * Close the server and disconnect any clients.
   * Cleans up the socket file on Unix systems.
   */
  close(): Promise<void>;

  /**
   * Whether the server is currently listening for connections.
   */
  readonly isListening: boolean;

  /**
   * Path the server is listening on, or null if not listening.
   */
  readonly path: string | null;
}
