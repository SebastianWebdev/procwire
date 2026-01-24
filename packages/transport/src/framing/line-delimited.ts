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
  private buffers: Buffer[];
  private totalLength: number;

  constructor(options: LineDelimitedFramingOptions = {}) {
    // Validate options
    if (options.delimiter !== undefined && (options.delimiter < 0 || options.delimiter > 255)) {
      throw new Error("LineDelimitedFraming: delimiter must be a byte value (0-255)");
    }
    if (options.maxBufferSize !== undefined && options.maxBufferSize <= 0) {
      throw new Error("LineDelimitedFraming: maxBufferSize must be positive");
    }

    this.delimiter = options.delimiter ?? 0x0a; // '\n'
    this.maxBufferSize = options.maxBufferSize ?? 8 * 1024 * 1024; // 8MB
    this.stripDelimiter = options.stripDelimiter ?? true;
    this.buffers = [];
    this.totalLength = 0;
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
    // Append chunk to buffer list
    if (chunk.length > 0) {
      this.buffers.push(chunk);
      this.totalLength += chunk.length;
    }

    // Check buffer size limit
    if (this.totalLength > this.maxBufferSize) {
      const error = new FramingError(
        `Buffer size ${this.totalLength} exceeds maximum ${this.maxBufferSize}`,
      );
      this.reset();
      throw error;
    }

    const frames: Buffer[] = [];
    let frameStartBufferIndex = 0;
    let frameStartOffset = 0;
    let bufferIndex = 0;
    let searchOffset = 0;

    // Find all complete frames (terminated by delimiter)
    while (bufferIndex < this.buffers.length) {
      const buffer = this.buffers[bufferIndex]!;
      const delimiterIndex = buffer.indexOf(this.delimiter, searchOffset);

      if (delimiterIndex === -1) {
        bufferIndex++;
        searchOffset = 0;
        continue;
      }

      const frameEndOffset = this.stripDelimiter ? delimiterIndex : delimiterIndex + 1;
      frames.push(
        this.buildFrame(
          frameStartBufferIndex,
          frameStartOffset,
          bufferIndex,
          frameEndOffset,
        ),
      );

      // Move past delimiter
      if (delimiterIndex + 1 < buffer!.length) {
        frameStartBufferIndex = bufferIndex;
        frameStartOffset = delimiterIndex + 1;
        searchOffset = frameStartOffset;
      } else {
        frameStartBufferIndex = bufferIndex + 1;
        frameStartOffset = 0;
        bufferIndex = frameStartBufferIndex;
        searchOffset = 0;
      }
    }

    this.compactBuffers(frameStartBufferIndex, frameStartOffset);

    return frames;
  }

  /**
   * Resets internal buffer state.
   */
  reset(): void {
    this.buffers = [];
    this.totalLength = 0;
  }

  /**
   * Returns true if there is buffered partial data.
   */
  hasBufferedData(): boolean {
    return this.totalLength > 0;
  }

  /**
   * Returns current buffer size in bytes.
   */
  getBufferSize(): number {
    return this.totalLength;
  }

  private buildFrame(
    startIndex: number,
    startOffset: number,
    endIndex: number,
    endOffset: number,
  ): Buffer {
    if (startIndex === endIndex) {
      return this.buffers[startIndex]!.subarray(startOffset, endOffset);
    }

    const parts: Buffer[] = [];
    let totalLength = 0;

    const first = this.buffers[startIndex]!.subarray(startOffset);
    parts.push(first);
    totalLength += first.length;

    for (let i = startIndex + 1; i < endIndex; i++) {
      const buffer = this.buffers[i]!;
      parts.push(buffer);
      totalLength += buffer.length;
    }

    const last = this.buffers[endIndex]!.subarray(0, endOffset);
    parts.push(last);
    totalLength += last.length;

    return Buffer.concat(parts, totalLength);
  }

  private compactBuffers(startIndex: number, startOffset: number): void {
    if (startIndex === 0 && startOffset === 0) {
      return;
    }

    if (startIndex >= this.buffers.length) {
      this.buffers = [];
      this.totalLength = 0;
      return;
    }

    const nextBuffers: Buffer[] = [];
    let nextLength = 0;

    for (let i = startIndex; i < this.buffers.length; i++) {
      let buffer = this.buffers[i]!;
      if (i === startIndex && startOffset > 0) {
        buffer = buffer.subarray(startOffset);
      }
      if (buffer.length > 0) {
        nextBuffers.push(buffer);
        nextLength += buffer.length;
      }
    }

    this.buffers = nextBuffers;
    this.totalLength = nextLength;
  }
}
