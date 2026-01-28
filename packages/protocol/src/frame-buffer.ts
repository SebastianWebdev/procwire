/**
 * High-performance frame buffer for binary protocol.
 *
 * IMPORTANT: This is a BINARY protocol - ZERO JSON.
 * This module handles framing of the binary wire format,
 * accumulating bytes and extracting complete frames.
 *
 * Two modes of operation:
 * 1. BATCH MODE: Accumulates chunks, returns Frame[] when complete
 * 2. STREAMING MODE: Delivers payload chunks via callbacks as they arrive
 *
 * @module
 */

import {
  HEADER_SIZE,
  DEFAULT_MAX_PAYLOAD_SIZE,
  ABSOLUTE_MAX_PAYLOAD_SIZE,
  decodeHeader,
  encodeHeader,
  type FrameHeader,
} from "./wire-format.js";

/**
 * Configuration options for FrameBuffer.
 */
export interface FrameBufferOptions {
  /**
   * Maximum allowed payload size in bytes.
   *
   * Defaults to DEFAULT_MAX_PAYLOAD_SIZE (1GB).
   * Cannot exceed ABSOLUTE_MAX_PAYLOAD_SIZE (~2GB, Node.js limit).
   *
   * Use cases:
   * - Lower limit for control messages: 1MB
   * - Default for data plane: 1GB
   * - Higher for large file transfers: up to 2GB
   *
   * @example
   * ```typescript
   * // Strict limit for small messages
   * new FrameBuffer({ maxPayloadSize: 1024 * 1024 }) // 1MB
   *
   * // Allow large files
   * new FrameBuffer({ maxPayloadSize: 2 * 1024 * 1024 * 1024 - 1 }) // ~2GB
   * ```
   */
  maxPayloadSize?: number;
}

/**
 * Complete frame extracted from the stream.
 *
 * PERFORMANCE OPTIMIZATION:
 * Payload is stored as an array of chunks (Zero-Copy) to avoid
 * premature memory allocation and copying for large payloads.
 *
 * Use `payloadChunks` for streaming/piping (zero-copy).
 * Use `payload` only when codec requires contiguous buffer.
 *
 * MEMORY WARNING:
 * The chunks are subarrays of original socket buffers. Due to Node.js
 * Slab Allocation, holding a small Frame for long time may prevent GC
 * of larger memory blocks. If you need to store frames long-term,
 * copy the payload: `Buffer.from(frame.payload)`
 */
export class Frame {
  constructor(
    public readonly header: FrameHeader,
    private readonly _chunks: Buffer[],
    private readonly _totalLength: number,
  ) {}

  /**
   * Returns the payload as raw chunks (ZERO-COPY).
   *
   * BEST PERFORMANCE for:
   * - Streaming to another socket
   * - Writing to file (fs.writev)
   * - Raw binary processing
   * - When you can process chunk-by-chunk
   */
  get payloadChunks(): readonly Buffer[] {
    return this._chunks;
  }

  /**
   * Returns the payload as a single contiguous Buffer.
   *
   * ⚠️ WARNING: This performs memory allocation + copy!
   *
   * Use ONLY when the codec requires a contiguous block.
   * For large payloads (100MB+), this is EXPENSIVE.
   * Prefer `payloadChunks` when possible.
   */
  get payload(): Buffer {
    if (this._chunks.length === 0) return Buffer.alloc(0);
    if (this._chunks.length === 1) return this._chunks[0]!;
    return Buffer.concat(this._chunks, this._totalLength);
  }

  /**
   * Total payload length in bytes.
   */
  get payloadLength(): number {
    return this._totalLength;
  }
}

/**
 * Callback interface for streaming mode.
 *
 * Use streaming mode when:
 * - Payloads are very large (100MB+)
 * - You want to write directly to disk as data arrives
 * - You want to pipe to another socket
 * - You need minimal memory footprint
 * - You need lowest possible latency
 */
export interface FrameStreamHandler {
  /**
   * Called when frame header is parsed.
   * You know the methodId, requestId, flags, and total payload size.
   *
   * Use this to:
   * - Open output file
   * - Prepare destination buffer
   * - Initialize processing state
   *
   * @param header - Decoded frame header
   */
  onFrameStart(header: FrameHeader): void;

  /**
   * Called for each payload chunk as it arrives.
   *
   * IMPORTANT: Process immediately or copy!
   * The chunk buffer may be reused after this call returns.
   *
   * @param chunk - Raw payload bytes (process or copy immediately!)
   * @param offset - Byte offset within total payload (for tracking progress)
   * @param isLast - True if this is the final chunk of the frame
   */
  onPayloadChunk(chunk: Buffer, offset: number, isLast: boolean): void;

  /**
   * Called when frame is complete.
   * All payload chunks have been delivered.
   *
   * Use this to:
   * - Close output file
   * - Finalize processing
   * - Emit completion event
   *
   * @param header - The frame header (same as onFrameStart)
   */
  onFrameEnd(header: FrameHeader): void;

  /**
   * Called when an error occurs during frame parsing.
   *
   * IMPORTANT: After onError, the stream is in an undefined state.
   * Binary protocol errors (malformed header, size mismatch) typically
   * mean the stream is corrupted and cannot be recovered.
   *
   * Recommended action: Close the connection!
   * ```typescript
   * onError(error, header) {
   *   console.error('Frame error:', error);
   *   socket.destroy();  // Cannot recover from binary corruption
   * }
   * ```
   *
   * @param error - The error that occurred
   * @param header - Partial header if available (undefined if error during header parse)
   */
  onError?(error: Error, header?: FrameHeader): void;
}

/**
 * High-Performance FrameBuffer with Streaming Support.
 *
 * TWO MODES OF OPERATION:
 *
 * 1. BATCH MODE (default):
 *    - Accumulates chunks in memory (zero-copy list)
 *    - Returns Frame[] when complete frame(s) available
 *    - Good for small/medium payloads
 *    - Simple API: frames = buffer.push(chunk)
 *
 * 2. STREAMING MODE:
 *    - Delivers payload chunks via callbacks AS THEY ARRIVE
 *    - Minimal memory footprint (only one chunk at a time)
 *    - Good for large payloads (100MB+), file transfers
 *    - Callback API: buffer.setStreamHandler(handler)
 *
 * PERFORMANCE:
 * - Accumulation is O(1) per chunk (no Buffer.concat!)
 * - Memory usage in batch mode: O(payload size)
 * - Memory usage in streaming mode: O(chunk size) = ~64KB
 *
 * @example Batch mode (default)
 * ```typescript
 * const buffer = new FrameBuffer();
 *
 * socket.on('data', (chunk) => {
 *   const frames = buffer.push(chunk);
 *   for (const frame of frames) {
 *     // Process complete frame
 *     const data = codec.deserialize(frame.payload);
 *   }
 * });
 * ```
 *
 * @example Streaming mode (large payloads)
 * ```typescript
 * const buffer = new FrameBuffer();
 *
 * buffer.setStreamHandler({
 *   onFrameStart(header) {
 *     this.fd = fs.openSync('output.bin', 'w');
 *   },
 *   onPayloadChunk(chunk, offset, isLast) {
 *     fs.writeSync(this.fd, chunk);  // Write immediately!
 *   },
 *   onFrameEnd(header) {
 *     fs.closeSync(this.fd);
 *   },
 * });
 *
 * socket.on('data', (chunk) => buffer.push(chunk));
 * ```
 */
export class FrameBuffer {
  /** List of accumulated chunks (NOT concatenated - zero copy) */
  private chunks: Buffer[] = [];

  /** Total bytes in chunks list */
  private _bufferedBytes: number = 0;

  /** Cached header while waiting for full payload */
  private pendingHeader: FrameHeader | null = null;

  /** Streaming mode handler */
  private streamHandler: FrameStreamHandler | null = null;

  /** Bytes of payload delivered so far in streaming mode */
  private streamPayloadOffset: number = 0;

  /** Partial header buffer for streaming mode */
  private partialHeaderBytes: Buffer | null = null;

  /** Configured maximum payload size */
  private readonly maxPayloadSize: number;

  /**
   * Create a new FrameBuffer.
   *
   * @param options - Configuration options
   *
   * @example
   * ```typescript
   * // Default 1GB limit
   * const buffer = new FrameBuffer();
   *
   * // Custom limit for large transfers
   * const buffer = new FrameBuffer({ maxPayloadSize: 2 * 1024 * 1024 * 1024 - 1 });
   *
   * // Strict limit for control channel
   * const buffer = new FrameBuffer({ maxPayloadSize: 1024 * 1024 }); // 1MB
   * ```
   */
  constructor(options: FrameBufferOptions = {}) {
    const requested = options.maxPayloadSize ?? DEFAULT_MAX_PAYLOAD_SIZE;

    // Clamp to Node.js absolute limit
    if (requested > ABSOLUTE_MAX_PAYLOAD_SIZE) {
      this.maxPayloadSize = ABSOLUTE_MAX_PAYLOAD_SIZE;
    } else {
      this.maxPayloadSize = requested;
    }
  }

  /**
   * Enable streaming mode.
   *
   * In streaming mode:
   * - Payload chunks are delivered via callbacks AS THEY ARRIVE
   * - Memory footprint is minimal (one chunk at a time)
   * - push() always returns [] (frames delivered via callbacks)
   *
   * Call with null to disable streaming mode and return to batch mode.
   *
   * @param handler - Streaming callbacks, or null to disable
   */
  setStreamHandler(handler: FrameStreamHandler | null): void {
    if (handler && this._bufferedBytes > 0) {
      throw new Error(
        "Cannot enable streaming mode with buffered data. " +
          "Call clear() first or enable before receiving data.",
      );
    }
    this.streamHandler = handler;
  }

  /**
   * Check if streaming mode is enabled.
   */
  get isStreaming(): boolean {
    return this.streamHandler !== null;
  }

  /**
   * Push a chunk of bytes and extract any complete frames.
   *
   * BATCH MODE: Returns Frame[] when complete frame(s) available.
   * STREAMING MODE: Calls handler callbacks, always returns [].
   *
   * @param chunk - Bytes received from socket
   * @returns Array of complete frames (empty in streaming mode)
   */
  push(chunk: Buffer): Frame[] {
    if (chunk.length === 0) return [];

    if (this.streamHandler) {
      this.pushStreaming(chunk);
      return [];
    } else {
      return this.pushBatch(chunk);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STREAMING MODE IMPLEMENTATION
  // ═══════════════════════════════════════════════════════════════════════════

  private pushStreaming(chunk: Buffer): void {
    let offset = 0;

    try {
      while (offset < chunk.length) {
        // State 1: Need to parse header
        if (!this.pendingHeader) {
          offset = this.parseHeaderStreaming(chunk, offset);
          if (!this.pendingHeader) {
            break; // Need more header bytes
          }
        }

        // State 2: Delivering payload chunks
        if (this.pendingHeader) {
          offset = this.deliverPayloadStreaming(chunk, offset);
        }
      }
    } catch (error) {
      if (this.streamHandler?.onError) {
        this.streamHandler.onError(
          error instanceof Error ? error : new Error(String(error)),
          this.pendingHeader ?? undefined,
        );
      } else {
        throw error;
      }
    }
  }

  /**
   * Parse header bytes in streaming mode.
   * Returns new offset after consuming header bytes.
   */
  private parseHeaderStreaming(chunk: Buffer, offset: number): number {
    const existingHeaderBytes = this.partialHeaderBytes?.length ?? 0;
    const headerBytesNeeded = HEADER_SIZE - existingHeaderBytes;
    const availableBytes = chunk.length - offset;
    const bytesToTake = Math.min(headerBytesNeeded, availableBytes);

    if (existingHeaderBytes === 0 && availableBytes >= HEADER_SIZE) {
      // Fast path: entire header in this chunk
      const headerBuffer = chunk.subarray(offset, offset + HEADER_SIZE);
      this.pendingHeader = decodeHeader(headerBuffer);
      this.validatePayloadSize(this.pendingHeader.payloadLength);
      this.streamPayloadOffset = 0;
      this.streamHandler!.onFrameStart(this.pendingHeader);
      return offset + HEADER_SIZE;
    }

    // Slow path: header split across chunks
    if (!this.partialHeaderBytes) {
      // Use alloc() not allocUnsafe() - 11 bytes is negligible,
      // and we avoid any risk of leaking uninitialized memory
      // if there's a bug in the copy logic.
      this.partialHeaderBytes = Buffer.alloc(HEADER_SIZE);
    }

    chunk.copy(this.partialHeaderBytes, existingHeaderBytes, offset, offset + bytesToTake);

    if (existingHeaderBytes + bytesToTake === HEADER_SIZE) {
      // Header complete
      this.pendingHeader = decodeHeader(this.partialHeaderBytes);
      this.validatePayloadSize(this.pendingHeader.payloadLength);
      this.partialHeaderBytes = null;
      this.streamPayloadOffset = 0;
      this.streamHandler!.onFrameStart(this.pendingHeader);
    }

    return offset + bytesToTake;
  }

  /**
   * Deliver payload chunks in streaming mode.
   * Returns new offset after consuming payload bytes.
   */
  private deliverPayloadStreaming(chunk: Buffer, offset: number): number {
    const payloadRemaining = this.pendingHeader!.payloadLength - this.streamPayloadOffset;

    // Empty payload case
    if (payloadRemaining === 0) {
      this.streamHandler!.onFrameEnd(this.pendingHeader!);
      this.pendingHeader = null;
      return offset;
    }

    const availableBytes = chunk.length - offset;
    const bytesToDeliver = Math.min(availableBytes, payloadRemaining);

    if (bytesToDeliver > 0) {
      const payloadChunk = chunk.subarray(offset, offset + bytesToDeliver);
      const isLast = bytesToDeliver >= payloadRemaining;

      this.streamHandler!.onPayloadChunk(payloadChunk, this.streamPayloadOffset, isLast);

      this.streamPayloadOffset += bytesToDeliver;

      if (isLast) {
        this.streamHandler!.onFrameEnd(this.pendingHeader!);
        this.pendingHeader = null;
        this.streamPayloadOffset = 0;
      }
    }

    return offset + bytesToDeliver;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BATCH MODE IMPLEMENTATION
  // ═══════════════════════════════════════════════════════════════════════════

  private pushBatch(chunk: Buffer): Frame[] {
    // O(1) accumulation - just add reference, no copy
    this.chunks.push(chunk);
    this._bufferedBytes += chunk.length;

    const frames: Frame[] = [];

    while (true) {
      // Try to read header if we don't have one pending
      if (!this.pendingHeader) {
        if (this._bufferedBytes < HEADER_SIZE) {
          break; // Wait for more data
        }

        // Peek header bytes (minimal copy only if split across chunks)
        const headerBytes = this.peekBytes(HEADER_SIZE);
        const header = decodeHeader(headerBytes);

        this.validatePayloadSize(header.payloadLength);
        this.pendingHeader = header;
      }

      // Check if we have the full frame
      const totalFrameSize = HEADER_SIZE + this.pendingHeader.payloadLength;

      if (this._bufferedBytes < totalFrameSize) {
        break; // Wait for rest of payload
      }

      // Extract frame chunks (zero-copy where possible)
      const frameChunks = this.consumeBytes(totalFrameSize);

      // Strip header from chunks to get payload
      const payloadChunks = this.stripLeadingBytes(frameChunks, HEADER_SIZE);

      frames.push(new Frame(this.pendingHeader, payloadChunks, this.pendingHeader.payloadLength));

      // Reset for next frame
      this.pendingHeader = null;
    }

    return frames;
  }

  /**
   * Validate payload size against configured maximum.
   */
  private validatePayloadSize(size: number): void {
    if (size > this.maxPayloadSize) {
      throw new Error(
        `Frame payload too large: ${size} bytes. ` +
          `Configured max: ${this.maxPayloadSize} bytes. ` +
          `Possible protocol error or attack.`,
      );
    }
  }

  /**
   * Peek N bytes from the start without consuming.
   */
  private peekBytes(size: number): Buffer {
    // Fast path: all needed bytes in first chunk (common case)
    if (this.chunks.length > 0 && this.chunks[0]!.length >= size) {
      return this.chunks[0]!.subarray(0, size);
    }

    // Slow path: bytes split across chunks (rare for 11-byte header)
    const result = Buffer.allocUnsafe(size);
    let copied = 0;

    for (const chunk of this.chunks) {
      const remaining = size - copied;
      const toCopy = Math.min(chunk.length, remaining);
      chunk.copy(result, copied, 0, toCopy);
      copied += toCopy;
      if (copied === size) break;
    }

    return result;
  }

  /**
   * Consume N bytes from the internal chunk list.
   */
  private consumeBytes(size: number): Buffer[] {
    const result: Buffer[] = [];
    let collected = 0;

    while (collected < size && this.chunks.length > 0) {
      const chunk = this.chunks[0]!;
      const needed = size - collected;

      if (chunk.length <= needed) {
        result.push(chunk);
        collected += chunk.length;
        this.chunks.shift();
      } else {
        const part1 = chunk.subarray(0, needed);
        const part2 = chunk.subarray(needed);
        result.push(part1);
        this.chunks[0] = part2;
        collected += needed;
      }
    }

    this._bufferedBytes -= size;
    return result;
  }

  /**
   * Strip leading N bytes from a list of chunks.
   */
  private stripLeadingBytes(chunks: Buffer[], bytesToStrip: number): Buffer[] {
    const result: Buffer[] = [];
    let stripped = 0;

    for (const chunk of chunks) {
      if (stripped >= bytesToStrip) {
        result.push(chunk);
        continue;
      }

      const toStripFromThis = Math.min(chunk.length, bytesToStrip - stripped);

      if (toStripFromThis < chunk.length) {
        result.push(chunk.subarray(toStripFromThis));
      }

      stripped += toStripFromThis;
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Number of bytes currently buffered.
   */
  get bufferedBytes(): number {
    return this._bufferedBytes;
  }

  /**
   * Check if there's a partial frame in the buffer.
   */
  get hasPartialFrame(): boolean {
    return this._bufferedBytes > 0 || this.partialHeaderBytes !== null;
  }

  /**
   * Clear the buffer. Use when connection resets.
   */
  clear(): void {
    this.chunks = [];
    this._bufferedBytes = 0;
    this.pendingHeader = null;
    this.streamPayloadOffset = 0;
    this.partialHeaderBytes = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FRAME BUILDING (for sending)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a complete frame (header + payload) for sending.
 *
 * @example
 * ```typescript
 * const frame = buildFrame({
 *   methodId: 1,
 *   flags: 0,
 *   requestId: 42,
 * }, payload);
 *
 * socket.write(frame);
 * ```
 */
export function buildFrame(header: Omit<FrameHeader, "payloadLength">, payload: Buffer): Buffer {
  const fullHeader: FrameHeader = {
    ...header,
    payloadLength: payload.length,
  };

  return Buffer.concat([encodeHeader(fullHeader), payload]);
}

/**
 * Build frame as separate buffers for writev/cork usage.
 *
 * Use for maximum performance with large payloads:
 * ```typescript
 * const [header, payload] = buildFrameBuffers({
 *   methodId: 1,
 *   flags: 0,
 *   requestId: 42,
 * }, largePayload);
 *
 * socket.cork();
 * socket.write(header);
 * socket.write(payload);  // No copy of large payload!
 * socket.uncork();
 * ```
 */
export function buildFrameBuffers(
  header: Omit<FrameHeader, "payloadLength">,
  payload: Buffer,
): [Buffer, Buffer] {
  const fullHeader: FrameHeader = {
    ...header,
    payloadLength: payload.length,
  };

  return [encodeHeader(fullHeader), payload];
}
