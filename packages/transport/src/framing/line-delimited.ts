import { FramingError } from "../utils/errors.js";
import type { FramingCodec } from "./types.js";

/**
 * Options for LineDelimitedFraming.
 */
export interface LineDelimitedFramingOptions {
  /**
   * Delimiter byte (default: 0x0A = '\n').
   */
  delimiter?: number;

  /**
   * Maximum buffer size before throwing error (default: 8MB).
   * Prevents DoS from infinitely long lines without delimiter.
   */
  maxBufferSize?: number;

  /**
   * Whether to strip delimiter from decoded frames (default: true).
   */
  stripDelimiter?: boolean;
}

/**
 * Line-delimited framing codec.
 * Format: {payload}{delimiter}
 *
 * Each frame is terminated by a delimiter byte (default newline).
 * Handles partial chunks and multiple frames per chunk.
 *
 * @example
 * const framing = new LineDelimitedFraming();
 * const encoded = framing.encode(Buffer.from('hello')); // Buffer<'hello\n'>
 * const frames = framing.decode(Buffer.from('world\n')); // [Buffer<'world'>]
 */
export class LineDelimitedFraming implements FramingCodec {
  private readonly delimiter: number;
  private readonly maxBufferSize: number;
  private readonly stripDelimiter: boolean;
  private buffer: Buffer;

  constructor(options: LineDelimitedFramingOptions = {}) {
    this.delimiter = options.delimiter ?? 0x0a; // '\n'
    this.maxBufferSize = options.maxBufferSize ?? 8 * 1024 * 1024; // 8MB
    this.stripDelimiter = options.stripDelimiter ?? true;
    this.buffer = Buffer.allocUnsafe(0);
  }

  /**
   * Encodes a payload with delimiter.
   * If payload already ends with delimiter, does not add another one.
   */
  encode(payload: Buffer): Buffer {
    // Check if payload already ends with delimiter
    if (payload.length > 0 && payload[payload.length - 1] === this.delimiter) {
      return payload;
    }

    // Add delimiter
    const result = Buffer.allocUnsafe(payload.length + 1);
    payload.copy(result, 0);
    result[payload.length] = this.delimiter;
    return result;
  }

  /**
   * Decodes incoming chunk and extracts complete frames.
   * Buffers partial data until delimiter is found.
   */
  decode(chunk: Buffer): Buffer[] {
    // Append chunk to buffer
    this.buffer = Buffer.concat([this.buffer, chunk]);

    // Check buffer size limit
    if (this.buffer.length > this.maxBufferSize) {
      const error = new FramingError(
        `Buffer size ${this.buffer.length} exceeds maximum ${this.maxBufferSize}`,
      );
      this.reset();
      throw error;
    }

    const frames: Buffer[] = [];
    let searchStart = 0;

    // Find all complete frames (terminated by delimiter)
    while (searchStart < this.buffer.length) {
      const delimiterIndex = this.buffer.indexOf(this.delimiter, searchStart);

      if (delimiterIndex === -1) {
        // No more delimiters found
        break;
      }

      // Extract frame
      const frameEnd = this.stripDelimiter ? delimiterIndex : delimiterIndex + 1;
      const frame = this.buffer.subarray(searchStart, frameEnd);
      frames.push(frame);

      // Move past delimiter
      searchStart = delimiterIndex + 1;
    }

    // Keep remaining data in buffer
    if (searchStart > 0) {
      this.buffer = this.buffer.subarray(searchStart);
    }

    return frames;
  }

  /**
   * Resets internal buffer state.
   */
  reset(): void {
    this.buffer = Buffer.allocUnsafe(0);
  }

  /**
   * Returns true if there is buffered partial data.
   */
  hasBufferedData(): boolean {
    return this.buffer.length > 0;
  }

  /**
   * Returns current buffer size in bytes.
   */
  getBufferSize(): number {
    return this.buffer.length;
  }
}
