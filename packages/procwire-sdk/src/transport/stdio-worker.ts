/**
 * Stdio transport for worker side.
 *
 * Reads from process.stdin, writes to process.stdout.
 * This is the worker-side counterpart to StdioTransport in @procwire/transport.
 */

import type { WorkerTransport, TransportState } from "./types.js";

/**
 * Options for StdioWorkerTransport.
 */
export interface StdioWorkerTransportOptions {
  /**
   * Stream to read from.
   * @default process.stdin
   */
  stdin?: NodeJS.ReadableStream;

  /**
   * Stream to write to.
   * @default process.stdout
   */
  stdout?: NodeJS.WritableStream;
}

/**
 * Stdio transport for worker processes.
 *
 * Reads incoming data from stdin and writes outgoing data to stdout.
 * Used for the control channel between manager and worker.
 *
 * @example
 * ```ts
 * const transport = new StdioWorkerTransport();
 * await transport.connect();
 *
 * transport.onData((data) => {
 *   console.error('Received:', data.toString());
 * });
 *
 * await transport.write(Buffer.from('Hello'));
 * ```
 */
export class StdioWorkerTransport implements WorkerTransport {
  private _state: TransportState = "disconnected";
  private readonly stdin: NodeJS.ReadableStream;
  private readonly stdout: NodeJS.WritableStream;

  private dataHandler: ((data: Buffer) => void) | null = null;
  private errorHandler: ((error: Error) => void) | null = null;
  private closeHandler: (() => void) | null = null;

  private stdinDataListener: ((chunk: Buffer | string) => void) | null = null;
  private stdinErrorListener: ((error: Error) => void) | null = null;
  private stdinEndListener: (() => void) | null = null;

  constructor(options: StdioWorkerTransportOptions = {}) {
    this.stdin = options.stdin ?? process.stdin;
    this.stdout = options.stdout ?? process.stdout;
  }

  get state(): TransportState {
    return this._state;
  }

  async connect(): Promise<void> {
    if (this._state === "connected") {
      return;
    }

    this._state = "connecting";

    // Setup stdin listeners
    this.stdinDataListener = (chunk: Buffer | string) => {
      const buffer = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
      this.dataHandler?.(buffer);
    };

    this.stdinErrorListener = (error: Error) => {
      this.errorHandler?.(error);
    };

    this.stdinEndListener = () => {
      this._state = "disconnected";
      this.closeHandler?.();
    };

    this.stdin.on("data", this.stdinDataListener);
    this.stdin.on("error", this.stdinErrorListener);
    this.stdin.on("end", this.stdinEndListener);

    // Ensure stdin is in flowing mode
    if ("resume" in this.stdin && typeof this.stdin.resume === "function") {
      this.stdin.resume();
    }

    this._state = "connected";
  }

  async disconnect(): Promise<void> {
    if (this._state === "disconnected") {
      return;
    }

    // Remove listeners
    if (this.stdinDataListener) {
      this.stdin.off("data", this.stdinDataListener);
      this.stdinDataListener = null;
    }
    if (this.stdinErrorListener) {
      this.stdin.off("error", this.stdinErrorListener);
      this.stdinErrorListener = null;
    }
    if (this.stdinEndListener) {
      this.stdin.off("end", this.stdinEndListener);
      this.stdinEndListener = null;
    }

    this._state = "disconnected";
  }

  async write(data: Buffer): Promise<void> {
    if (this._state !== "connected") {
      throw new Error("Transport not connected");
    }

    return new Promise((resolve, reject) => {
      const success = this.stdout.write(data, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });

      // Handle backpressure - wait for drain if needed
      if (!success) {
        this.stdout.once("drain", () => resolve());
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
}
