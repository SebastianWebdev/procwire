import type { SerializationCodec } from "./types.js";

/**
 * Raw binary passthrough codec (zero-copy).
 *
 * Performs no serialization - simply passes Buffer instances through unchanged.
 * Useful for binary protocols or when pre-serialized data is available.
 *
 * **Important**: This codec does not copy buffers. Mutations to the returned
 * buffer will affect the original data. If you need isolation, copy the buffer
 * yourself using `Buffer.from(buffer)`.
 *
 * @example
 * ```ts
 * const codec = new RawCodec();
 * const buffer = Buffer.from([1, 2, 3]);
 * const serialized = codec.serialize(buffer);
 * console.log(serialized === buffer); // true (no copy)
 * ```
 */
export class RawCodec implements SerializationCodec<Buffer> {
  public readonly name = "raw";
  public readonly contentType = "application/octet-stream";

  /**
   * Returns the buffer unchanged (passthrough, no copy).
   *
   * @param value - Buffer to serialize
   * @returns The same buffer instance
   */
  serialize(value: Buffer): Buffer {
    return value;
  }

  /**
   * Returns the buffer unchanged (passthrough, no copy).
   *
   * @param buffer - Buffer to deserialize
   * @returns The same buffer instance
   */
  deserialize(buffer: Buffer): Buffer {
    return buffer;
  }
}
