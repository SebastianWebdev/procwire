/**
 * Client - Bun runtime adapter over the shared ClientCore.
 *
 * ALL protocol logic (handler registry, $init schema, frame dispatch, abort
 * bookkeeping, request contexts) lives ONCE in @procwire/runtime-core. This
 * class owns only what is Bun-specific: the Bun.listen pipe server with its
 * connection identity checks, the WHATWG-stream stdin control reader and the
 * cancellable pending read (Bug W7).
 *
 * @module
 */

import * as fs from "node:fs";
import { BunSocketTransport } from "@procwire/protocol";
import type { Schema, EmptySchema } from "@procwire/codecs";
import { ClientCore } from "@procwire/runtime-core";

// Bun types
type BunServer = ReturnType<typeof Bun.listen>;
type BunSocket = Awaited<ReturnType<typeof Bun.connect>>;

/**
 * Minimal reader surface used by the control loop. Structural on purpose:
 * Bun's global ReadableStreamDefaultReader adds readMany(), which a generic
 * web-streams reader (injected in tests) doesn't have.
 */
interface StdinReader {
  read(): Promise<{ value?: Uint8Array | undefined; done: boolean }>;
  cancel(reason?: unknown): Promise<void>;
  releaseLock(): void;
}

/**
 * Client - Child-side API for Procwire IPC.
 *
 * This is the Bun.js version; the API is identical to @procwire/client.
 *
 * @example
 * ```typescript
 * const client = new Client()
 *   .handle('query', async (data, ctx) => {
 *     const results = await search(data);
 *     ctx.respond(results);
 *   })
 *   .handle('insert', async (data, ctx) => {
 *     ctx.ack({ accepted: true });
 *     await processInBackground(data);
 *   })
 *   .event('progress');
 *
 * await client.start();
 *
 * // Emit events to parent
 * client.emitEvent('progress', { percent: 50 });
 * ```
 */
export class Client<S extends Schema = EmptySchema> extends ClientCore<S> {
  private _server: BunServer | null = null;
  private _socket: BunSocket | null = null;
  private _activeTransport: BunSocketTransport | null = null;
  private _controlReaderStopped = false;

  /** Active stdin reader, kept so shutdown() can cancel the pending read. */
  private _stdinReader: StdinReader | null = null;

  // ═══════════════════════════════════════════════════════════════════════════
  // RUNTIME HOOKS: pipe server
  // ═══════════════════════════════════════════════════════════════════════════

  protected _createPipeServer(pipePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Create server using Bun.listen with unix socket
        // Bun.listen shares ONE handler object across ALL connections, so
        // every handler must check WHICH socket fired. Without the identity
        // checks, a stray connection (rejected in _onConnectionOpen) would
        // tear down or poison the ACTIVE parent session: its close event ran
        // the disconnect teardown against the live session, and its data fed
        // the active FrameBuffer.
        this._server = Bun.listen({
          unix: pipePath,
          socket: {
            open: (socket: BunSocket) => {
              this._onConnectionOpen(socket);
            },
            data: (socket: BunSocket, data: Buffer) => {
              this._onSocketData(socket, data);
            },
            error: (socket: BunSocket, err: Error) => {
              if (socket === this._socket) {
                this._handleTransportError(err);
              }
            },
            close: (socket: BunSocket) => {
              if (socket === this._socket) {
                this._onConnectionClose();
              }
            },
            drain: (socket: BunSocket) => {
              // Backpressure released (only the active session's waiter)
              if (socket === this._socket) {
                this._activeTransport?.handleDrain();
              }
            },
          },
        });

        // Server is listening
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * @internal Handle a new parent connection.
   *
   * Single-parent model: the shared core accepts exactly one connection;
   * any extra or stray connection is ended rather than overwriting (and
   * corrupting) the active connection's in-flight state.
   */
  private _onConnectionOpen(socket: BunSocket): void {
    const transport = new BunSocketTransport(socket);
    if (!this._acceptConnection(transport)) {
      socket.end();
      return;
    }
    this._socket = socket;
    this._activeTransport = transport;
  }

  /**
   * @internal Process inbound bytes into frames.
   *
   * Only the active session may feed the frame buffer: bytes from a stray
   * (rejected) connection would desync the framing of the live session.
   */
  private _onSocketData(socket: BunSocket, data: Buffer): void {
    if (socket !== this._socket) return;
    this._handleTransportData(data);
  }

  /**
   * @internal The active parent connection closed: drop the identity
   * references, then run the shared disconnect teardown.
   */
  private _onConnectionClose(): void {
    this._socket = null;
    this._activeTransport = null;
    this._handleDisconnect();
  }

  protected _closeServer(): void {
    this._server?.stop(true);
    this._server = null;
    this._socket = null;
    this._activeTransport = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RUNTIME HOOKS: control plane (stdin)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Write a control line with fs.writeSync instead of the inherited
   * process.stdout.write: Bun's process.stdout wrapper flips fd 1 into
   * NON-blocking mode, after which any synchronous stdout write in handler
   * code (fs.writeSync(1, ...), native print()) fails with EAGAIN once the
   * 64KB pipe fills - pinned by the bun-core W6 canary. writeSync keeps the
   * fd blocking and is equally immune to a patched console (D10).
   */
  protected override _sendControl(message: unknown): void {
    const buf = Buffer.from(`${JSON.stringify(message)}\n`, "utf8");
    let written = 0;
    while (written < buf.length) {
      try {
        written += fs.writeSync(1, buf, written);
      } catch (err) {
        // Embedder code may itself have flipped fd 1 non-blocking via
        // process.stdout: spin until the parent drains the pipe.
        if ((err as NodeJS.ErrnoException).code !== "EAGAIN") throw err;
      }
    }
  }

  protected _startControlReader(): void {
    void this._runControlReader();
  }

  /**
   * @internal Read the parent's control plane (stdin) line by line.
   *
   * Uses an explicit reader (not for-await) so shutdown() can cancel the
   * PENDING read: a suspended read keeps the Bun event loop alive, and the
   * "stopped" flag alone only takes effect when the next chunk arrives -
   * i.e. never, once the parent has said its last word - forcing the parent
   * to force-kill the child after its grace period (Bug W7).
   *
   * EOF (stream done) means the parent is GONE: shut down so the child
   * exits instead of living forever as an orphan (Bug W3 port).
   */
  private async _runControlReader(
    input: ReadableStream<Uint8Array> = Bun.stdin.stream() as ReadableStream<Uint8Array>,
  ): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = "";
    let reader: StdinReader | null = null;
    try {
      // Inside the try: getReader() throws synchronously if the stream is
      // already locked (e.g. a second Client instance in the same process).
      const activeReader = input.getReader();
      reader = activeReader;
      this._stdinReader = activeReader;
      while (!this._controlReaderStopped) {
        const { value, done } = await activeReader.read();
        if (done) {
          // Parent death (or deliberate stdin close): exit cleanly.
          if (!this._controlReaderStopped) {
            void this.shutdown();
          }
          break;
        }
        // stream:true keeps multi-byte characters split across chunks intact.
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          this._handleControlLine(line);
        }
      }
    } catch {
      // stdin closed / unreadable - nothing more to do.
    } finally {
      this._stdinReader = null;
      try {
        reader?.releaseLock();
      } catch {
        /* lock already released */
      }
    }
  }

  protected _stopControlReader(): void {
    this._controlReaderStopped = true;
    // Cancel the pending stdin read: a suspended read keeps the event loop
    // alive and would pin the child until the parent force-kills it (W7).
    void this._stdinReader?.cancel().catch(() => {
      /* reader already closed */
    });
  }
}
