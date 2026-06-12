/**
 * FrameTransport - the runtime seam between the shared IPC core and a
 * concrete socket implementation.
 *
 * The shared cores in @procwire/runtime-core (ModuleCore / ClientCore) own
 * all protocol logic: correlation maps, frame dispatch, stream backpressure,
 * abort handling. A FrameTransport owns exactly one thing: moving bytes of a
 * single framed connection in and out of the runtime's socket type.
 *
 * Outbound: the core calls writeFrame(). Inbound stays callback-based - the
 * runtime adapter feeds raw chunks/events back into the core (onData /
 * onClose / onError), because socket event wiring is runtime-specific
 * (per-socket listeners on Node, fixed handler objects on Bun).
 *
 * @module
 */

/**
 * Transport for one framed data-plane connection.
 */
export interface FrameTransport {
  /**
   * Write header+payload contiguously as one wire frame.
   * Resolves once the bytes have been fully handed to the OS (i.e. after
   * any backpressure has drained); rejects if the connection dies first.
   */
  writeFrame(header: Buffer, payload: Buffer): Promise<void>;

  /** Pause inbound data (receive-side backpressure). */
  pause(): void;

  /** Resume inbound data. */
  resume(): void;

  /** Tear the connection down and reject any pending backpressure waits. */
  close(): void;
}
