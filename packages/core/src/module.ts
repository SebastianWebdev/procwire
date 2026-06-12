/**
 * Module - Node.js runtime adapter over the shared ModuleCore.
 *
 * ALL protocol logic (frame dispatch, correlation, stream backpressure,
 * abort handling, builder/schema accumulation) lives ONCE in
 * @procwire/runtime-core. This class owns only what is Node-specific:
 * wrapping the net.Socket in a NodeSocketTransport (zero-copy cork/uncork
 * writes + DrainWaiter) and the per-socket event listener lifecycle.
 *
 * @module
 */

import type { Socket } from "node:net";
import type { ChildProcess } from "node:child_process";
import { NodeSocketTransport } from "@procwire/protocol";
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

/**
 * Module - Represents a worker process with configuration and communication.
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
export class Module<S extends Schema = EmptySchema> extends ModuleCore<S, ChildProcess> {
  // Active socket + bound listeners, kept so they can be removed in
  // _teardownDataChannel() to avoid leaks and late-event crashes across
  // reconnect/restart cycles.
  private _socket: Socket | null = null;
  private _socketHandlers: {
    data: (chunk: Buffer) => void;
    error: (err: Error) => void;
    close: () => void;
  } | null = null;

  /**
   * Register a method with dual codecs (full control).
   *
   * Use when request and response need different codecs,
   * or when using asymmetric codecs like Arrow.
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
   *
   * Wraps the socket in the Node transport and wires its events into the
   * shared core. Handlers are stored so _teardownDataChannel() can remove
   * them before the transport destroys the socket.
   */
  _attachDataChannel(socket: Socket): void {
    this._socket = socket;
    this._attachTransport(new NodeSocketTransport(socket));

    const handlers = {
      data: (chunk: Buffer): void => this._handleTransportData(chunk),
      error: (err: Error): void => this._handleTransportError(err),
      close: (): void => this._handleTransportClose(),
    };

    this._socketHandlers = handlers;
    socket.on("data", handlers.data);
    socket.on("error", handlers.error);
    socket.on("close", handlers.close);
  }

  /**
   * @internal Remove our listeners BEFORE the transport destroys the socket,
   * so a late "data"/"error"/"close" event cannot fire against torn-down
   * state and the closures don't leak on the old socket across restarts.
   */
  protected override _teardownDataChannel(): void {
    if (this._socket && this._socketHandlers) {
      this._socket.off("data", this._socketHandlers.data);
      this._socket.off("error", this._socketHandlers.error);
      this._socket.off("close", this._socketHandlers.close);
    }
    this._socketHandlers = null;
    this._socket = null;
  }
}
