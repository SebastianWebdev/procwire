import { FramingError } from "../utils/errors.js";
import type { FramingCodec } from "./types.js";

/**
 * Options for LengthPrefixedFraming.
 */
export interface LengthPrefixedFramingOptions {
  /**
   * Maximum message size in bytes (default: 32MB).
   * Prevents DoS from malicious large length headers.
   */
  maxMessageSize?: number;
}

/**
 * Length-prefixed framing codec.
 * Format: [4-byte length (uint32 BE)][payload]
 *
 * Each frame starts with a 4-byte big-endian unsigned integer
 * indicating the payload length, followed by the payload itself.
 *
 * Handles partial headers, partial payloads, and multiple frames per chunk.
 * Supports zero-length frames.
 *
 * @example
 * const framing = new LengthPrefixedFraming();
 * const encoded = framing.encode(Buffer.from('hello')); // [0,0,0,5,'h','e','l','l','o']
 * const frames = framing.decode(encoded); // [Buffer<'hello'>]
 */
export class LengthPrefixedFraming implements FramingCodec {
  private static readonly HEADER_SIZE = 4;

  private readonly maxMessageSize: number;
  private buffers: Buffer[];
  private totalLength: number;
  private expectedLength: number | null;

  constructor(options: LengthPrefixedFramingOptions = {}) {
    // Validate options
    if (options.maxMessageSize !== undefined && options.maxMessageSize <= 0) {
      throw new Error("LengthPrefixedFraming: maxMessageSize must be positive");
    }

    this.maxMessageSize = options.maxMessageSize ?? 32 * 1024 * 1024; // 32MB
    this.buffers = [];
    this.totalLength = 0;
    this.expectedLength = null;
  }

  /**
   * Encodes a payload with length prefix.
   * Uses pre-allocated buffer to avoid Buffer.concat overhead.
   */
  encode(payload: Buffer): Buffer {
    const frame = Buffer.allocUnsafe(LengthPrefixedFraming.HEADER_SIZE + payload.length);
    frame.writeUInt32BE(payload.length, 0);
    payload.copy(frame, LengthPrefixedFraming.HEADER_SIZE);
    return frame;
  }

  /**
   * Decodes incoming chunk and extracts complete frames.
   * Buffers partial headers and payloads.
   */
  decode(chunk: Buffer): Buffer[] {
    // Append chunk to buffer list
    if (chunk.length > 0) {
      this.buffers.push(chunk);
      this.totalLength += chunk.length;
    }

    const frames: Buffer[] = [];

    // Process all complete frames in buffer
    while (true) {
      // Do we need to read the header?
      if (this.expectedLength === null) {
        // Need at least HEADER_SIZE bytes
        if (this.totalLength < LengthPrefixedFraming.HEADER_SIZE) {
          break; // Wait for more data
        }

        // Read length from header
        const header = this.peekBytes(LengthPrefixedFraming.HEADER_SIZE);
        if (!header) {
          break;
        }
        const length = header.readUInt32BE(0);

        // Validate length
        if (length > this.maxMessageSize) {
          const error = new FramingError(
            `Message length ${length} exceeds maximum ${this.maxMessageSize}`,
          );
          this.reset();
          throw error;
        }

        this.expectedLength = length;
        this.consumeBytes(LengthPrefixedFraming.HEADER_SIZE);
      }

      // Do we have the complete payload?
      if (this.totalLength < this.expectedLength) {
        break; // Wait for more data
      }

      // Extract frame
      const frame = this.takeBytes(this.expectedLength);
      frames.push(frame);

      // Move past this frame
      this.expectedLength = null;
    }

    // Validate buffer doesn't grow unbounded
    const maxBufferSize = LengthPrefixedFraming.HEADER_SIZE + this.maxMessageSize;
    if (this.totalLength > maxBufferSize) {
      const error = new FramingError(
        `Buffer size ${this.totalLength} exceeds maximum ${maxBufferSize}`,
      );
      this.reset();
      throw error;
    }

    return frames;
  }

  /**
   * Resets internal buffer state.
   */
  reset(): void {
    this.buffers = [];
    this.totalLength = 0;
    this.expectedLength = null;
  }

  /**
   * Returns true if there is buffered partial data.
   */
  hasBufferedData(): boolean {
    return this.totalLength > 0 || this.expectedLength !== null;
  }

  /**
   * Returns current buffer size in bytes.
   */
  getBufferSize(): number {
    return this.totalLength;
  }

  private peekBytes(length: number): Buffer | null {
    if (length > this.totalLength || this.buffers.length === 0) {
      return null;
    }

    const first = this.buffers[0]!;
    // Fast path: entire requested bytes in first buffer (common case)
    if (first.length >= length) {
      return first.subarray(0, length);
    }

    // Slow path: need to gather from multiple buffers
    // Pre-allocate output buffer and copy into it (avoids Buffer.concat overhead)
    const result = Buffer.allocUnsafe(length);
    let offset = 0;
    let remaining = length;

    for (const buffer of this.buffers) {
      const toCopy = Math.min(buffer.length, remaining);
      buffer.copy(result, offset, 0, toCopy);
      offset += toCopy;
      remaining -= toCopy;
      if (remaining === 0) {
        break;
      }
    }

    return result;
  }

  private takeBytes(length: number): Buffer {
    if (length === 0) {
      return Buffer.allocUnsafe(0);
    }

    if (length > this.totalLength) {
      return Buffer.allocUnsafe(0);
    }

    const first = this.buffers[0]!;
    // Fast path: entire payload is in first buffer (common case)
    if (first.length >= length) {
      const slice = first.subarray(0, length);
      this.consumeBytes(length);
      return slice;
    }

    // Slow path: need to gather from multiple buffers
    // Pre-allocate output buffer and copy into it (avoids Buffer.concat overhead)
    const result = Buffer.allocUnsafe(length);
    let offset = 0;
    let remaining = length;

    while (remaining > 0 && this.buffers.length > 0) {
      const buffer = this.buffers[0]!;
      if (remaining >= buffer.length) {
        // Copy entire buffer
        buffer.copy(result, offset);
        offset += buffer.length;
        remaining -= buffer.length;
        this.buffers.shift();
      } else {
        // Copy partial buffer
        buffer.copy(result, offset, 0, remaining);
        this.buffers[0] = buffer.subarray(remaining);
        remaining = 0;
      }
    }

    this.totalLength -= length;
    return result;
  }

  private consumeBytes(length: number): void {
    let remaining = length;

    while (remaining > 0 && this.buffers.length > 0) {
      const buffer = this.buffers[0]!;
      if (remaining >= buffer.length) {
        this.buffers.shift();
        remaining -= buffer.length;
      } else {
        this.buffers[0] = buffer.subarray(remaining);
        remaining = 0;
      }
    }

    this.totalLength -= length;
  }
}
