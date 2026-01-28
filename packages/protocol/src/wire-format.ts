/**
 * Binary wire format for Procwire data plane.
 *
 * IMPORTANT: This is a BINARY protocol - ZERO JSON.
 * JSON-RPC is used only for control plane (stdio).
 * Data plane (named pipe) uses this binary format for performance.
 *
 * Wire format:
 * ┌──────────┬───────┬──────────┬──────────┬──────────────────────┐
 * │ Method ID│ Flags │ Req ID   │ Length   │ Payload              │
 * │ 2 bytes  │ 1 byte│ 4 bytes  │ 4 bytes  │ N bytes              │
 * │ uint16 BE│       │ uint32 BE│ uint32 BE│ (codec output)       │
 * └──────────┴───────┴──────────┴──────────┴──────────────────────┘
 *
 * Header: 11 bytes (this file)
 * Payload: variable length (handled by FrameBuffer in TASK-02)
 *
 * @module
 */

/**
 * Header size in bytes.
 * Format: [methodId:2][flags:1][reqId:4][length:4] = 11 bytes
 */
export const HEADER_SIZE = 11;

/**
 * Default maximum payload size (1GB).
 * Can be overridden in FrameBuffer constructor or validateHeader().
 *
 * @see validateHeader for custom limits
 * @see FrameBuffer constructor for runtime configuration
 */
export const DEFAULT_MAX_PAYLOAD_SIZE = 1024 * 1024 * 1024; // 1GB

/**
 * Absolute maximum payload size - Node.js Buffer limitation.
 * Cannot be exceeded regardless of configuration.
 */
export const ABSOLUTE_MAX_PAYLOAD_SIZE = 2 * 1024 * 1024 * 1024 - 1; // ~2GB

/**
 * Flag bits for the flags byte.
 *
 * IMPORTANT: These flags are used in BINARY protocol for DATA PLANE.
 * This is NOT JSON-RPC. This is raw binary for performance.
 *
 * Layout:
 * ```
 * bit 0: DIRECTION_TO_PARENT  (0 = to child, 1 = to parent)
 * bit 1: IS_RESPONSE          (0 = request/event, 1 = response)
 * bit 2: IS_ERROR             (0 = ok, 1 = error)
 * bit 3: IS_STREAM            (0 = single, 1 = stream chunk)
 * bit 4: STREAM_END           (0 = more coming, 1 = final chunk)
 * bit 5: IS_ACK               (0 = full response, 1 = ack only)
 * bit 6-7: reserved (must be 0)
 * ```
 */
export const Flags = {
  /** Message direction: 0 = to child, 1 = to parent */
  DIRECTION_TO_PARENT: 0b00000001,

  /** Is this a response? 0 = request/event, 1 = response */
  IS_RESPONSE: 0b00000010,

  /** Is this an error response? */
  IS_ERROR: 0b00000100,

  /** Is this a stream chunk? */
  IS_STREAM: 0b00001000,

  /** Is this the final stream chunk? */
  STREAM_END: 0b00010000,

  /** Is this just an ACK (not full response)? */
  IS_ACK: 0b00100000,
} as const;

/**
 * Decoded header structure.
 */
export interface FrameHeader {
  /** Method/event ID (assigned during handshake) */
  methodId: number;

  /** Flags byte - use Flags constants to interpret */
  flags: number;

  /** Request ID for correlation. 0 = fire-and-forget/unsolicited */
  requestId: number;

  /** Payload length in bytes */
  payloadLength: number;
}

/**
 * Encode a frame header into an 11-byte buffer.
 *
 * WHY BINARY: JSON-RPC would add ~100 bytes overhead and require
 * JSON.stringify. This header is just 11 bytes, written directly.
 *
 * @example
 * ```typescript
 * const header = encodeHeader({
 *   methodId: 1,
 *   flags: 0,
 *   requestId: 42,
 *   payloadLength: 1024,
 * });
 * // header is Buffer of 11 bytes
 * ```
 */
export function encodeHeader(header: FrameHeader): Buffer {
  const buffer = Buffer.allocUnsafe(HEADER_SIZE);

  // Method ID: 2 bytes, big-endian
  buffer.writeUInt16BE(header.methodId, 0);

  // Flags: 1 byte
  buffer.writeUInt8(header.flags, 2);

  // Request ID: 4 bytes, big-endian
  buffer.writeUInt32BE(header.requestId, 3);

  // Payload length: 4 bytes, big-endian
  buffer.writeUInt32BE(header.payloadLength, 7);

  return buffer;
}

/**
 * Decode an 11-byte buffer into a frame header.
 *
 * @throws {Error} if buffer is smaller than HEADER_SIZE
 *
 * @example
 * ```typescript
 * const header = decodeHeader(buffer);
 * console.log(header.methodId); // 1
 * console.log(header.flags & Flags.IS_STREAM); // check if stream
 * ```
 */
export function decodeHeader(buffer: Buffer): FrameHeader {
  if (buffer.length < HEADER_SIZE) {
    throw new Error(
      `Buffer too small for header. Expected ${HEADER_SIZE} bytes, got ${buffer.length}`,
    );
  }

  return {
    methodId: buffer.readUInt16BE(0),
    flags: buffer.readUInt8(2),
    requestId: buffer.readUInt32BE(3),
    payloadLength: buffer.readUInt32BE(7),
  };
}

/**
 * Check if a flag is set.
 *
 * @example
 * ```typescript
 * if (hasFlag(header.flags, Flags.IS_STREAM)) {
 *   // handle stream chunk
 * }
 * ```
 */
export function hasFlag(flags: number, flag: number): boolean {
  return (flags & flag) !== 0;
}

/**
 * Create flags byte from individual options.
 *
 * @example
 * ```typescript
 * const flags = createFlags({
 *   toParent: true,
 *   isResponse: true,
 *   isStream: true,
 *   streamEnd: false,
 * });
 * ```
 */
export function createFlags(options: {
  toParent?: boolean;
  isResponse?: boolean;
  isError?: boolean;
  isStream?: boolean;
  streamEnd?: boolean;
  isAck?: boolean;
}): number {
  let flags = 0;

  if (options.toParent) flags |= Flags.DIRECTION_TO_PARENT;
  if (options.isResponse) flags |= Flags.IS_RESPONSE;
  if (options.isError) flags |= Flags.IS_ERROR;
  if (options.isStream) flags |= Flags.IS_STREAM;
  if (options.streamEnd) flags |= Flags.STREAM_END;
  if (options.isAck) flags |= Flags.IS_ACK;

  return flags;
}

/**
 * Validate header values.
 *
 * @param header - Header to validate
 * @param maxPayloadSize - Maximum allowed payload size (default: 1GB)
 * @throws {Error} if header values are invalid
 *
 * @example
 * ```typescript
 * // Use default 1GB limit
 * validateHeader(header);
 *
 * // Custom limit for large file transfers
 * validateHeader(header, 4 * 1024 * 1024 * 1024); // 4GB
 *
 * // Strict limit for control messages
 * validateHeader(header, 1024 * 1024); // 1MB
 * ```
 */
export function validateHeader(
  header: FrameHeader,
  maxPayloadSize: number = DEFAULT_MAX_PAYLOAD_SIZE,
): void {
  if (header.methodId === 0) {
    throw new Error("Method ID 0 is reserved");
  }

  // methodId 0xFFFF is reserved for abort signal - OK

  // Check against configured limit
  if (header.payloadLength > maxPayloadSize) {
    throw new Error(
      `Payload too large: ${header.payloadLength} bytes. ` +
        `Configured max: ${maxPayloadSize} bytes`,
    );
  }

  // Also check Node.js absolute limit
  if (header.payloadLength > ABSOLUTE_MAX_PAYLOAD_SIZE) {
    throw new Error(
      `Payload exceeds Node.js Buffer limit: ${header.payloadLength} bytes. ` +
        `Absolute max: ${ABSOLUTE_MAX_PAYLOAD_SIZE} bytes`,
    );
  }

  // Check reserved bits are zero
  const reservedBits = header.flags & 0b11000000;
  if (reservedBits !== 0) {
    throw new Error(`Reserved flag bits must be zero, got: 0b${reservedBits.toString(2)}`);
  }
}
