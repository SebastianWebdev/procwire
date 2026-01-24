import * as childProcess from "node:child_process";
import { EventEmitter } from "../utils/events.js";
import { TransportError, TimeoutError } from "../utils/errors.js";
import { transitionState } from "../utils/assert.js";
import type { Transport, TransportState, TransportEvents } from "./types.js";
import type { Unsubscribe } from "../utils/disposables.js";
import type { MetricsCollector } from "../utils/metrics.js";

/**
 * Stdio transport options for child process communication.
 */
export interface StdioTransportOptions {
  /**
   * Path to executable to spawn.
   */
  executablePath: string;

  /**
   * Command line arguments.
   */
  args?: string[];

  /**
   * Working directory for child process.
   */
  cwd?: string;

  /**
   * Environment variables.
   */
  env?: Record<string, string>;

  /**
   * Timeout for process startup in milliseconds.
   * @default 10000
   */
  startupTimeout?: number;

  /**
   * Maximum stdout buffer size in bytes.
   * If exceeded, transport will emit error and disconnect.
   * @default 10MB
   */
  maxStdoutBuffer?: number;

  /**
   * Maximum stderr buffer size in bytes.
   * If exceeded, transport will emit error and disconnect.
   * @default 1MB
   */
  maxStderrBuffer?: number;

  /**
   * Optional metrics collector for transport events.
   */
  metrics?: MetricsCollector;
}

/**
 * Extended transport events for stdio transport (includes stderr and exit events).
 */
export interface StdioTransportEvents extends TransportEvents {
  /**
   * Fired when stderr data is received.
   */
  stderr: string;

  /**
   * Fired when child process exits.
   */
  exit: { code: number | null; signal: NodeJS.Signals | null };
}

/**
 * Stdio-based transport for parent-child process communication.
 *
 * Spawns a child process and communicates via stdin/stdout.
 * Stderr is exposed via separate 'stderr' event.
 *
 * @example
 * ```ts
 * const transport = new StdioTransport({
 *   executablePath: 'node',
 *   args: ['worker.js']
 * });
 *
 * await transport.connect(); // Spawns process
 * await transport.write(Buffer.from('hello'));
 * transport.onData(data => console.log('received:', data));
 * transport.on('stderr', line => console.error('stderr:', line));
 * ```
 */
export class StdioTransport implements Transport {
  private readonly emitter = new EventEmitter<StdioTransportEvents>();
  private readonly options: Required<StdioTransportOptions>;
  private process: childProcess.ChildProcess | null = null;
  private _state: TransportState = "disconnected";
  private startupTimer: NodeJS.Timeout | null = null;
  private stdoutBytesReceived = 0;
  private stderrBytesReceived = 0;

  constructor(options: StdioTransportOptions) {
    this.options = {
      executablePath: options.executablePath,
      args: options.args ?? [],
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? (process.env as Record<string, string>),
      startupTimeout: options.startupTimeout ?? 10000,
      maxStdoutBuffer: options.maxStdoutBuffer ?? 10 * 1024 * 1024, // 10MB
      maxStderrBuffer: options.maxStderrBuffer ?? 1 * 1024 * 1024, // 1MB
      metrics: options.metrics,
    };
  }

  get state(): TransportState {
    return this._state;
  }

  get pid(): number | null {
    return this.process?.pid ?? null;
  }

  /**
   * Transitions to a new state with validation.
   * Throws TransportError if the transition is invalid.
   */
  private setState(newState: TransportState): void {
    this._state = transitionState(this._state, newState);
  }

  async connect(): Promise<void> {
    if (this._state === "connected") {
      throw new TransportError("Already connected");
    }

    if (this._state === "connecting") {
      throw new TransportError("Connection already in progress");
    }

    this.setState("connecting");

    return new Promise((resolve, reject) => {
      try {
        const proc = childProcess.spawn(this.options.executablePath, this.options.args, {
          cwd: this.options.cwd,
          env: this.options.env,
          stdio: ["pipe", "pipe", "pipe"],
        });

        this.process = proc;

        // Startup timeout
        this.startupTimer = setTimeout(() => {
          proc.kill();
          this.setState("error");
          const error = new TransportError(
            `Process startup timeout after ${this.options.startupTimeout}ms`,
            new TimeoutError(`Startup timeout`),
          );
          this.recordError(error);
          this.emitter.emit("error", error);
          reject(error);
        }, this.options.startupTimeout);

        // Wait for spawn event (process started successfully)
        proc.once("spawn", () => {
          if (this.startupTimer) {
            clearTimeout(this.startupTimer);
            this.startupTimer = null;
          }

          this.setState("connected");
          this.options.metrics?.incrementCounter("transport.connect", 1, { transport: "stdio" });
          this.setupProcessListeners(proc);
          this.emitter.emit("connect", undefined);
          resolve();
        });

        // Handle spawn errors
        proc.once("error", (err) => {
          if (this.startupTimer) {
            clearTimeout(this.startupTimer);
            this.startupTimer = null;
          }

          this.setState("error");
          const error = new TransportError(`Failed to spawn process: ${err.message}`, err);
          this.recordError(error);
          this.emitter.emit("error", error);
          reject(error);
        });
      } catch (err) {
        this.setState("error");
        const error = new TransportError(
          `Failed to create process: ${(err as Error).message}`,
          err as Error,
        );
        this.recordError(error);
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this._state === "disconnected") {
      return;
    }

    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }

    if (this.process) {
      return new Promise((resolve) => {
        const proc = this.process!;

        // Close stdin first (graceful signal)
        if (proc.stdin && !proc.stdin.destroyed) {
          proc.stdin.end();
        }

        // Wait for exit
        proc.once("exit", () => {
          this.cleanup();
          resolve();
        });

        // Force kill after timeout
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill("SIGKILL");
          }
        }, 2000);

        // Try graceful first
        proc.kill();
      });
    } else {
      this.cleanup();
    }
  }

  async write(data: Buffer): Promise<void> {
    if (this._state !== "connected" || !this.process || !this.process.stdin) {
      throw new TransportError("Not connected");
    }

    return new Promise((resolve, reject) => {
      const stdin = this.process!.stdin!;

      if (stdin.destroyed) {
        reject(new TransportError("Stdin is closed"));
        return;
      }

      // The callback is invoked when data has been written to the kernel buffer.
      // This provides implicit backpressure handling - callers using await will
      // naturally wait for each write to complete before sending more data.
      // If the kernel buffer is full, the callback will be delayed until space
      // is available (after 'drain' event internally).
      stdin.write(data, (err) => {
        if (err) {
          const error = new TransportError(`Write to stdin failed: ${err.message}`, err);
          this.recordError(error);
          this.emitter.emit("error", error);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  onData(handler: (data: Buffer) => void): Unsubscribe {
    return this.emitter.on("data", handler);
  }

  on<K extends keyof StdioTransportEvents>(
    event: K,
    handler: (data: StdioTransportEvents[K]) => void,
  ): Unsubscribe {
    return this.emitter.on(event, handler);
  }

  private setupProcessListeners(proc: childProcess.ChildProcess): void {
    // Stdout data
    if (proc.stdout) {
      proc.stdout.on("data", (data: Buffer) => {
        this.stdoutBytesReceived += data.length;

        if (this.stdoutBytesReceived > this.options.maxStdoutBuffer) {
          const error = new TransportError(
            `Stdout buffer exceeded limit of ${this.options.maxStdoutBuffer} bytes`,
          );
          this.recordError(error);
          this.emitter.emit("error", error);
          this.disconnect();
          return;
        }

        this.emitter.emit("data", data);
      });
    }

    // Stderr data (as strings/lines)
    if (proc.stderr) {
      proc.stderr.setEncoding("utf8");
      proc.stderr.on("data", (data: string) => {
        this.stderrBytesReceived += Buffer.byteLength(data);

        if (this.stderrBytesReceived > this.options.maxStderrBuffer) {
          const error = new TransportError(
            `Stderr buffer exceeded limit of ${this.options.maxStderrBuffer} bytes`,
          );
          this.recordError(error);
          this.emitter.emit("error", error);
          this.disconnect();
          return;
        }

        this.emitter.emit("stderr", data);
      });
    }

    // Process exit
    proc.on("exit", (code, signal) => {
      this.emitter.emit("exit", { code, signal });
      this.cleanup();
    });

    // Process errors
    proc.on("error", (err) => {
      this.setState("error");
      const error = new TransportError(`Process error: ${err.message}`, err);
      this.recordError(error);
      this.emitter.emit("error", error);
    });
  }

  private cleanup(): void {
    if (this.process) {
      this.process.removeAllListeners();

      // Close streams
      if (this.process.stdin && !this.process.stdin.destroyed) {
        this.process.stdin.destroy();
      }
      if (this.process.stdout && !this.process.stdout.destroyed) {
        this.process.stdout.destroy();
      }
      if (this.process.stderr && !this.process.stderr.destroyed) {
        this.process.stderr.destroy();
      }

      // Kill if still alive
      if (!this.process.killed) {
        this.process.kill();
      }

      this.process = null;
    }

    if (this._state !== "disconnected") {
      this.setState("disconnected");
      this.options.metrics?.incrementCounter("transport.disconnect", 1, { transport: "stdio" });
      this.emitter.emit("disconnect", undefined);
    }

    this.stdoutBytesReceived = 0;
    this.stderrBytesReceived = 0;
  }

  private recordError(error: Error): void {
    this.options.metrics?.incrementCounter("transport.error", 1, {
      transport: "stdio",
      type: error.name,
    });
  }
}
