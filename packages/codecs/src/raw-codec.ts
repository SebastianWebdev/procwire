/**
 * Raw codecs for binary data pass-through.
 *
 * Two variants:
 * - `RawCodec`: Returns single Buffer (may merge chunks)
 * - `RawChunksCodec`: Returns Buffer[] (TRUE ZERO-COPY)
 *
 * @module
 */

import type { Codec } from "./types.js";

/**
 * RawCodec - Standard pass-through.
 * Returns a single Buffer.
 *
 * ⚠️ WARNING: For large payloads (100MB+), this codec WILL allocate memory
 * to concatenate chunks. Use `RawChunksCodec` for large files!
 *
 * @example
 * ```typescript
 * const codec = new RawCodec();
 *
 * // Serialize
 * const payload = codec.serialize(Buffer.from('data'));
 *
 * // Deserialize
 * const data = codec.deserialize(payload);
 * ```
 */
export class RawCodec implements Codec<Buffer, Buffer> {
  readonly name = "raw";

  serialize(data: Buffer): Buffer {
    if (!Buffer.isBuffer(data)) {
      throw new TypeError(`RawCodec expects Buffer, got ${typeof data}`);
    }
    return data;
  }

  deserialize(buffer: Buffer): Buffer {
    return buffer;
  }

  /**
   * ⚠️ PERFORMANCE WARNING: This performs Buffer.concat()!
   * For large payloads, consider using RawChunksCodec instead.
   */
  deserializeChunks(chunks: readonly Buffer[]): Buffer {
    if (chunks.length === 0) return Buffer.alloc(0);
    if (chunks.length === 1) return chunks[0]!;
    return Buffer.concat(chunks as Buffer[]);
  }
}

/**
 * RawChunksCodec - TRUE ZERO-COPY.
 * Returns Buffer[] (array of chunks).
 *
 * ✅ BEST FOR:
 * - Streaming large files to disk
 * - Piping to other sockets
 * - Processing huge datasets chunk-by-chunk
 * - Any scenario where you want to avoid memory allocation
 *
 * @example
 * ```typescript
 * const codec = new RawChunksCodec();
 *
 * // Serialize (accepts multiple buffers)
 * const payload = codec.serialize([chunk1, chunk2]);
 *
 * // Deserialize - returns chunks without copying!
 * const chunks = codec.deserializeChunks(receivedChunks);
 * // chunks[0] === receivedChunks[0] (same reference!)
 * ```
 */
export class RawChunksCodec implements Codec<Buffer[], Buffer[]> {
  readonly name = "raw-chunks";

  serialize(data: Buffer[]): Buffer {
    if (!Array.isArray(data)) {
      throw new TypeError(`RawChunksCodec expects Buffer[], got ${typeof data}`);
    }
    if (data.length === 0) return Buffer.alloc(0);
    if (data.length === 1) return data[0]!;
    return Buffer.concat(data);
  }

  deserialize(buffer: Buffer): Buffer[] {
    return [buffer];
  }

  /**
   * ✅ ZERO-COPY: Returns the array with the same Buffer references.
   * No data is copied - only the array wrapper is new!
   */
  deserializeChunks(chunks: readonly Buffer[]): Buffer[] {
    return [...chunks]; // Shallow copy - Buffer references are preserved
  }
}

/**
 * Singleton instance of RawCodec.
 * Use this when you need to pass a codec instance.
 */
export const rawCodec = new RawCodec();

/**
 * Singleton instance of RawChunksCodec.
 * Use this when you need zero-copy for large binary data.
 */
export const rawChunksCodec = new RawChunksCodec();
