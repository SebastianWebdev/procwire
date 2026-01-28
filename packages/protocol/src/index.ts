/**
 * @procwire/protocol - Binary wire format for Procwire data plane.
 *
 * This package provides the binary protocol for the data plane.
 * Control plane uses JSON-RPC (separate package).
 * Data plane uses THIS binary protocol for ~80x better performance.
 *
 * @example
 * ```typescript
 * import {
 *   encodeHeader,
 *   decodeHeader,
 *   createFlags,
 *   hasFlag,
 *   Flags,
 *   HEADER_SIZE,
 * } from '@procwire/protocol';
 *
 * // Encode a request header
 * const header = encodeHeader({
 *   methodId: 1,
 *   flags: createFlags({ toParent: false }),
 *   requestId: 42,
 *   payloadLength: 1024,
 * });
 *
 * // Decode received header
 * const decoded = decodeHeader(buffer);
 * if (hasFlag(decoded.flags, Flags.IS_STREAM)) {
 *   // handle stream chunk
 * }
 * ```
 *
 * @module
 */

export {
  HEADER_SIZE,
  DEFAULT_MAX_PAYLOAD_SIZE,
  ABSOLUTE_MAX_PAYLOAD_SIZE,
  Flags,
  type FrameHeader,
  encodeHeader,
  decodeHeader,
  hasFlag,
  createFlags,
  validateHeader,
} from "./wire-format.js";

export {
  FrameBuffer,
  Frame,
  buildFrame,
  buildFrameBuffers,
  type FrameBufferOptions,
  type FrameStreamHandler,
} from "./frame-buffer.js";
