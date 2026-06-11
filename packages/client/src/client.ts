/**
 * Client - Node.js runtime adapter over the shared ClientCore.
 *
 * ALL protocol logic (handler registry, $init schema, frame dispatch, abort
 * bookkeeping, request contexts) lives ONCE in @procwire/runtime-core. This
 * class owns only what is Node-specific: the net.createServer pipe server,
 * per-socket listener wiring into the shared core, and the readline-based
 * stdin control reader.
 *
 * @module
 */

import { createServer, type Server, type Socket } from "node:net";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import { NodeSocketTransport } from "@procwire/protocol";
import type { Schema, EmptySchema } from "@procwire/codecs";
import { ClientCore } from "@procwire/runtime-core";

/**
 * Client - Child-side API for Procwire IPC.
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
  private _server: Server | null = null;
  private _socket: Socket | null = null;
  private _controlReader: ReadlineInterface | null = null;

  // ═══════════════════════════════════════════════════════════════════════════
  // RUNTIME HOOKS: pipe server
  // ═══════════════════════════════════════════════════════════════════════════

  protected _createPipeServer(pipePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this._server = createServer((socket) => this._handleConnection(socket));

      this._server.on("error", reject);
      this._server.listen(pipePath, () => resolve());
    });
  }

  /**
   * @internal Wire up a freshly accepted connection.
   *
   * Single-parent model: the shared core accepts exactly one connection;
   * any extra or stray connection is destroyed rather than overwriting (and
   * corrupting) the active connection's in-flight state.
   */
  private _handleConnection(socket: Socket): void {
    if (!this._acceptConnection(new NodeSocketTransport(socket))) {
      socket.destroy();
      return;
    }

    this._socket = socket;

    socket.on("data", (chunk: Buffer) => this._handleTransportData(chunk));
    socket.on("error", (err) => this._handleTransportError(err));
    socket.on("close", () => {
      this._socket = null;
      this._handleDisconnect();
    });
  }

  protected _closeServer(): void {
    this._server?.close();
    this._server = null;
    this._socket = null;
  }

  /**
   * Whether client is connected to parent.
   */
  override get connected(): boolean {
    return this._socket !== null && !this._socket.destroyed && super.connected;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RUNTIME HOOKS: control plane (stdin)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Wire the control-plane reader over stdin.
   *
   * unref() so reading stdin doesn't by itself keep the child alive: the pipe
   * server keeps the event loop running during normal operation, and once it
   * closes (e.g. on $shutdown) the child can exit instead of being force-killed.
   *
   * EOF/close on the stream means the parent is GONE (it holds the other end
   * of the pipe): without shutting down here, the still-listening pipe server
   * keeps the orphaned child alive forever (Bug W3).
   */
  protected _startControlReader(input: NodeJS.ReadableStream = process.stdin): void {
    this._controlReader = createInterface({ input });
    this._controlReader.on("line", (line) => this._handleControlLine(line));
    this._controlReader.on("close", this._onControlClose);
    (input as { unref?: () => void }).unref?.();
  }

  /**
   * The control stream ended: the parent process is dead (or closed our
   * stdin). Shut down so the child exits instead of becoming an orphan.
   * Bound property so _stopControlReader can detach it before closing the
   * reader (a shutdown WE initiated must not re-enter itself).
   */
  private readonly _onControlClose = (): void => {
    void this.shutdown();
  };

  protected _stopControlReader(): void {
    // Detach the EOF handler first: closing the reader below fires "close",
    // which must not re-enter shutdown().
    this._controlReader?.off("close", this._onControlClose);
    this._controlReader?.close();
    this._controlReader = null;
  }
}
