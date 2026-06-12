/**
 * Module - Bun runtime adapter over the shared ModuleCore.
 *
 * ALL protocol logic (frame dispatch, correlation, stream backpressure,
 * abort handling, builder/schema accumulation) lives ONCE in
 * @procwire/runtime-core. This class owns only what is Bun-specific:
 * wrapping the Bun socket in a BunSocketTransport (single-write concat path
 * + BunDrainWaiter) and the connection identity checks.
 *
 * Bun socket handlers are fixed at connect time (one handler object for the
 * connection's lifetime), so a late event from a previous (crashed/replaced)
 * connection must be ignored instead of poisoning the fresh session (Node
 * fixed this as Bug C8; Bug W8 is the Bun port).
 *
 * @module
 */

import { BunSocketTransport } from "@procwire/protocol";
import type { Codec, Schema, EmptySchema } from "@procwire/codecs";
import type { ResponseType } from "@procwire/runtime-core";
import type {
  AddMethod,
  AddMethodSymmetric,
  AddEvent,
  DualCodecMethodConfig,
  SingleCodecMethodConfig,
  TypedEventConfig,
} from "@procwire/runtime-core";
import { ModuleCore } from "@procwire/runtime-core";

// ═══════════════════════════════════════════════════════════════════════════
// BUN TYPES (will be available at runtime)
// ═══════════════════════════════════════════════════════════════════════════

// Bun.spawn() subprocess type
type BunSubprocess = ReturnType<typeof Bun.spawn>;

// Bun socket type from Bun.connect()
type BunSocket = Awaited<ReturnType<typeof Bun.connect>>;

/**
 * Module - Represents a worker process with configuration and communication.
 *
 * This is the Bun.js version; the API is identical to @procwire/core.
 *
 * @example
 * ```typescript
 * const worker = new Module('worker')
 *   .executable('python', ['worker.py'])
 *   .method('process', { codec: msgpackCodec })
 *   .event('progress');
 *
 * // After manager.spawn():
 * const result = await worker.send('process', data);
 * worker.onEvent('progress', console.log);
 * ```
 */
export class Module<S extends Schema = EmptySchema> extends ModuleCore<S, BunSubprocess> {
  // Active socket + its transport, kept for the identity checks above and
  // for routing drain events into the transport's waiter.
  private _socket: BunSocket | null = null;
  private _bunTransport: BunSocketTransport | null = null;

  /**
   * Register a method with dual codecs (full control).
   */
  override method<
    const N extends string,
    CReq extends Codec,
    CRes extends Codec,
    const RT extends ResponseType = "result",
  >(
    name: N,
    config: DualCodecMethodConfig<CReq, CRes> & { response?: RT },
  ): Module<AddMethod<S, N, CReq, CRes, RT>>;

  /**
   * Register a method with a single codec (symmetric shorthand).
   */
  override method<
    const N extends string,
    C extends Codec = Codec,
    const RT extends ResponseType = "result",
  >(
    name: N,
    config?: SingleCodecMethodConfig<C> & { response?: RT },
  ): Module<AddMethodSymmetric<S, N, C, RT>>;

  /**
   * Register a method (implementation: shared core).
   */
  override method(
    name: string,
    config?:
      | (DualCodecMethodConfig & { response?: ResponseType })
      | (SingleCodecMethodConfig & { response?: ResponseType }),
  ): Module<Schema> {
    return super.method(name, config) as Module<Schema>;
  }

  /**
   * Register an event.
   */
  override event<const N extends string, C extends Codec = Codec>(
    name: N,
    config?: TypedEventConfig<C>,
  ): Module<AddEvent<S, N, C>> {
    return super.event(name, config) as unknown as Module<AddEvent<S, N, C>>;
  }

  /**
   * @internal Called by ModuleManager to attach the data channel.
   * Bun socket handlers are set up at connect time in the manager; this
   * stores the socket identity and creates the transport.
   */
  _attachDataChannel(socket: BunSocket): void {
    this._socket = socket;
    this._bunTransport = new BunSocketTransport(socket);
    this._attachTransport(this._bunTransport);
  }

  /**
   * @internal Called by socket data handler from ModuleManager.
   */
  _onSocketData(socket: BunSocket, data: Buffer): void {
    if (socket !== this._socket) return; // stale connection
    this._handleTransportData(data);
  }

  /**
   * @internal Called by socket error handler from ModuleManager.
   */
  _onSocketError(socket: BunSocket, err: Error): void {
    if (socket !== this._socket) return; // stale connection
    this._handleTransportError(err);
  }

  /**
   * @internal Called by socket close handler from ModuleManager.
   */
  _onSocketClose(socket: BunSocket): void {
    if (socket !== this._socket) return; // stale connection
    this._handleTransportClose();
  }

  /**
   * @internal Called by socket drain handler from ModuleManager.
   */
  _onSocketDrain(socket: BunSocket): void {
    if (socket !== this._socket) return; // stale connection
    this._bunTransport?.handleDrain();
  }

  /**
   * @internal Drop the identity references; the shared core closes the
   * transport right after.
   */
  protected override _teardownDataChannel(): void {
    this._socket = null;
    this._bunTransport = null;
  }
}
