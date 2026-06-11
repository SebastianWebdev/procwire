/**
 * MsgPack codec for efficient binary serialization.
 *
 * Features:
 * - Binary format (smaller than JSON)
 * - Supports Buffer and Date as extension types
 * - ~2-3x faster than JSON
 * - Zero-copy Buffer.from(view) in serialize
 *
 * @module
 */

import { encode, decode, ExtensionCodec } from "@msgpack/msgpack";
import type { Codec } from "./types.js";

const extensionCodec = new ExtensionCodec();

// Extension type 1: Buffer
// Encode COPIES the bytes (`new Uint8Array(obj)` is the copying constructor);
// decode is zero-copy (a Buffer view aliasing the input's memory).
extensionCodec.register({
  type: 1,
  encode: (obj: unknown): Uint8Array | null => {
    if (Buffer.isBuffer(obj)) {
      return new Uint8Array(obj);
    }
    return null;
  },
  decode: (data: Uint8Array): Buffer => {
    // Zero-copy: Buffer view over the same memory as the decoded input
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  },
});

// Extension type 2: Date
extensionCodec.register({
  type: 2,
  encode: (obj: unknown): Uint8Array | null => {
    if (obj instanceof Date) {
      const buf = new ArrayBuffer(8);
      new DataView(buf).setFloat64(0, obj.getTime(), false);
      return new Uint8Array(buf);
    }
    return null;
  },
  decode: (data: Uint8Array): Date => {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    return new Date(view.getFloat64(0, false));
  },
});

/**
 * MsgPackCodec - Efficient binary serialization for JavaScript objects.
 *
 * USE CASES:
 * - Simple objects/arrays
 * - Progress events: { percent: 50 }
 * - Error responses: { code: 'ERROR', message: '...' }
 * - Configuration: { batchSize: 100, threshold: 0.5 }
 *
 * FEATURES:
 * - Binary format (smaller than JSON)
 * - Supports Buffer, Date as extension types
 * - ~2-3x faster than JSON
 * - ⚡️ Zero-copy Buffer.from(view) in serialize
 *
 * NOT FOR:
 * - Large numeric arrays (use ArrowCodec)
 * - Raw binary streams (use RawChunksCodec)
 *
 * @example
 * ```typescript
 * const codec = new MsgPackCodec<{ name: string; count: number }>();
 *
 * const buffer = codec.serialize({ name: 'test', count: 42 });
 * const result = codec.deserialize(buffer);
 * // result === { name: 'test', count: 42 }
 * ```
 */
export class MsgPackCodec<TIn = unknown, TOut = TIn> implements Codec<TIn, TOut> {
  readonly name = "msgpack";

  /**
   * Serialize object to MsgPack binary format.
   *
   * ⚡️ OPTIMIZATION: Uses Buffer.from(view) instead of copying data.
   */
  serialize(data: TIn): Buffer {
    const encoded = encode(data, { extensionCodec });

    // ⚡️ Create Buffer VIEW over the Uint8Array's underlying ArrayBuffer
    // This avoids copying the data!
    return Buffer.from(encoded.buffer, encoded.byteOffset, encoded.byteLength);
  }

  /**
   * Deserialize MsgPack binary to object.
   */
  deserialize(buffer: Buffer): TOut {
    return decode(buffer, { extensionCodec }) as TOut;
  }
}

/**
 * Singleton instance of MsgPackCodec.
 * Use this when types don't matter or for convenience.
 */
export const msgpackCodec = new MsgPackCodec();

/**
 * Create a typed MsgPack codec.
 *
 * Returns a new MsgPackCodec instance with the specified type parameters.
 * Use this to get compile-time type safety for request/response data.
 *
 * @example
 * ```typescript
 * // Symmetric (same type for serialize and deserialize)
 * const codec = msgpack<MyData>();
 *
 * // Asymmetric (different request and response types)
 * const codec = msgpack<SearchQuery, SearchResult>();
 * ```
 */
export function msgpack<TReq, TRes = TReq>(): MsgPackCodec<TReq, TRes> {
  return new MsgPackCodec<TReq, TRes>();
}
