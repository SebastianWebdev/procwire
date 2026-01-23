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
  private buffer: Buffer;
  private expectedLength: number | null;

  constructor(options: LengthPrefixedFramingOptions = {}) {
    this.maxMessageSize = options.maxMessageSize ?? 32 * 1024 * 1024; // 32MB
    this.buffer = Buffer.allocUnsafe(0);
    this.expectedLength = null;
  }

  /**
   * Encodes a payload with length prefix.
   */
  encode(payload: Buffer): Buffer {
    const header = Buffer.allocUnsafe(LengthPrefixedFraming.HEADER_SIZE);
    header.writeUInt32BE(payload.length, 0);
    return Buffer.concat([header, payload]);
  }

  /**
   * Decodes incoming chunk and extracts complete frames.
   * Buffers partial headers and payloads.
   */
  decode(chunk: Buffer): Buffer[] {
    // Append chunk to buffer
    this.buffer = Buffer.concat([this.buffer, chunk]);

    const frames: Buffer[] = [];

    // Process all complete frames in buffer
    while (true) {
      // Do we need to read the header?
      if (this.expectedLength === null) {
        // Need at least HEADER_SIZE bytes
        if (this.buffer.length < LengthPrefixedFraming.HEADER_SIZE) {
          break; // Wait for more data
        }

        // Read length from header
        const length = this.buffer.readUInt32BE(0);

        // Validate length
        if (length > this.maxMessageSize) {
          const error = new FramingError(
            `Message length ${length} exceeds maximum ${this.maxMessageSize}`,
          );
          this.reset();
          throw error;
        }

        this.expectedLength = length;
        this.buffer = this.buffer.subarray(LengthPrefixedFraming.HEADER_SIZE);
      }

      // Do we have the complete payload?
      if (this.buffer.length < this.expectedLength) {
        break; // Wait for more data
      }

      // Extract frame
      const frame = this.buffer.subarray(0, this.expectedLength);
      frames.push(frame);

      // Move past this frame
      this.buffer = this.buffer.subarray(this.expectedLength);
      this.expectedLength = null;
    }

    // Validate buffer doesn't grow unbounded
    const maxBufferSize = LengthPrefixedFraming.HEADER_SIZE + this.maxMessageSize;
    if (this.buffer.length > maxBufferSize) {
      const error = new FramingError(
        `Buffer size ${this.buffer.length} exceeds maximum ${maxBufferSize}`,
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
    this.buffer = Buffer.allocUnsafe(0);
    this.expectedLength = null;
  }

  /**
   * Returns true if there is buffered partial data.
   */
  hasBufferedData(): boolean {
    return this.buffer.length > 0 || this.expectedLength !== null;
  }

  /**
   * Returns current buffer size in bytes.
   */
  getBufferSize(): number {
    return this.buffer.length;
  }
}
