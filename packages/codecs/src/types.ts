/**
 * Codec interface for serializing/deserializing payloads.
 *
 * IMPORTANT: Codecs operate ONLY on the payload portion of frames.
 * They know nothing about headers, wire format, or transport.
 *
 * PERFORMANCE NOTE:
 * The framework tries to avoid merging TCP chunks.
 * Implement `deserializeChunks` to handle data scattered across multiple buffers.
 * If not implemented, framework will call `deserialize(Buffer.concat(chunks))`.
 *
 * @module
 */

/**
 * Core codec interface.
 *
 * @typeParam TInput - Type accepted by serialize()
 * @typeParam TOutput - Type returned by deserialize() (defaults to TInput)
 *
 * @example
 * ```typescript
 * // Simple object codec
 * const jsonCodec: Codec<MyData> = {
 *   name: 'json',
 *   serialize: (data) => Buffer.from(JSON.stringify(data)),
 *   deserialize: (buf) => JSON.parse(buf.toString()),
 * };
 *
 * // Zero-copy raw codec
 * const rawCodec: Codec<Buffer[], Buffer[]> = {
 *   name: 'raw-chunks',
 *   serialize: (chunks) => Buffer.concat(chunks),
 *   deserialize: (buf) => [buf],
 *   deserializeChunks: (chunks) => [...chunks], // Zero-copy!
 * };
 * ```
 */
export interface Codec<TInput = unknown, TOutput = TInput> {
  /**
   * Serialize data to binary format.
   *
   * @param data - Data to serialize
   * @returns Binary representation as Buffer
   */
  serialize(data: TInput): Buffer;

  /**
   * Deserialize from a single merged buffer.
   *
   * ⚠️ WARNING: If called for large payloads, this implies a memory
   * copy happened earlier (chunks were merged).
   *
   * @param buffer - Binary data to deserialize
   * @returns Deserialized data
   */
  deserialize(buffer: Buffer): TOutput;

  /**
   * Deserialize from raw chunks (Zero-Copy potential).
   *
   * Implement this to process data without merging buffers.
   * If not implemented, framework defaults to `deserialize(Buffer.concat(chunks))`.
   *
   * @param chunks - Array of buffer chunks from FrameBuffer
   * @returns Deserialized data
   */
  deserializeChunks?(chunks: readonly Buffer[]): TOutput;

  /**
   * Human-readable codec name for debugging/logging.
   */
  readonly name: string;
}

/**
 * Helper to deserialize using codec, preferring chunks if available.
 *
 * This function automatically chooses the most efficient deserialization path:
 * 1. If codec has `deserializeChunks`, use it (zero-copy potential)
 * 2. Otherwise, merge payload and use `deserialize`
 *
 * @example
 * ```typescript
 * const frame = frameBuffer.push(chunk)[0];
 * const data = codecDeserialize(myCodec, frame);
 * ```
 */
export function codecDeserialize<T>(
  codec: Codec<unknown, T>,
  frame: { payload: Buffer; payloadChunks: readonly Buffer[] },
): T {
  if (codec.deserializeChunks) {
    return codec.deserializeChunks(frame.payloadChunks);
  }
  return codec.deserialize(frame.payload);
}

/**
 * Type alias for codecs that work with raw binary data.
 * Input and output are both Buffer.
 */
export type RawCodecType = Codec<Buffer, Buffer>;

/**
 * Type alias for codecs that work with chunked binary data (zero-copy).
 * Input and output are both Buffer[].
 */
export type RawChunksCodecType = Codec<Buffer[], Buffer[]>;

/**
 * Type alias for codecs that work with typed objects.
 * Input and output are the same type T.
 */
export type ObjectCodecType<T = unknown> = Codec<T, T>;
