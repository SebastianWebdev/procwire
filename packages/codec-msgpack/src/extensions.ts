/**
 * Extension codecs for common JavaScript types not natively supported by MessagePack.
 *
 * @module extensions
 */

import { ExtensionCodec, encode, decode } from "@msgpack/msgpack";
import { MessagePackCodec } from "./codec.js";
import type { MessagePackCodecOptions } from "./codec.js";

// Extension type IDs (0-127 are user-defined)
const EXT_DATE = 0;
const EXT_MAP = 1;
const EXT_SET = 2;
const EXT_BIGINT = 3;

/**
 * Creates an ExtensionCodec with support for common JavaScript types.
 * Supports: Date, Map, Set, BigInt
 *
 * Extension type IDs used:
 * - 0: Date (milliseconds since epoch as float64)
 * - 1: Map (encoded as array of [key, value] pairs)
 * - 2: Set (encoded as array of values)
 * - 3: BigInt (encoded as string representation)
 *
 * @returns ExtensionCodec configured for common types
 *
 * @example
 * ```ts
 * import { ExtensionCodec } from '@msgpack/msgpack';
 * import { createCommonExtensionCodec } from '@procwire/codec-msgpack';
 *
 * const extensionCodec = createCommonExtensionCodec();
 * const codec = new MessagePackCodec({ extensionCodec });
 * ```
 */
export function createCommonExtensionCodec(): ExtensionCodec {
  const codec = new ExtensionCodec();

  // Date extension - stores milliseconds since epoch as float64
  codec.register({
    type: EXT_DATE,
    encode: (value: unknown): Uint8Array | null => {
      if (value instanceof Date) {
        const buffer = new ArrayBuffer(8);
        new DataView(buffer).setFloat64(0, value.getTime(), false); // big-endian
        return new Uint8Array(buffer);
      }
      return null;
    },
    decode: (data: Uint8Array): Date => {
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      return new Date(view.getFloat64(0, false));
    },
  });

  // Map extension - stores as array of [key, value] pairs
  codec.register({
    type: EXT_MAP,
    encode: (value: unknown): Uint8Array | null => {
      if (value instanceof Map) {
        const entries = Array.from(value.entries());
        // Recursively encode entries using the same extension codec
        return encode(entries, { extensionCodec: codec });
      }
      return null;
    },
    decode: (data: Uint8Array): Map<unknown, unknown> => {
      // Recursively decode entries using the same extension codec
      const entries = decode(data, { extensionCodec: codec }) as [unknown, unknown][];
      return new Map(entries);
    },
  });

  // Set extension - stores as array of values
  codec.register({
    type: EXT_SET,
    encode: (value: unknown): Uint8Array | null => {
      if (value instanceof Set) {
        const values = Array.from(value);
        // Recursively encode values using the same extension codec
        return encode(values, { extensionCodec: codec });
      }
      return null;
    },
    decode: (data: Uint8Array): Set<unknown> => {
      // Recursively decode values using the same extension codec
      const values = decode(data, { extensionCodec: codec }) as unknown[];
      return new Set(values);
    },
  });

  // BigInt extension - stores as string to preserve full precision
  codec.register({
    type: EXT_BIGINT,
    encode: (value: unknown): Uint8Array | null => {
      if (typeof value === "bigint") {
        const str = value.toString();
        return new TextEncoder().encode(str);
      }
      return null;
    },
    decode: (data: Uint8Array): bigint => {
      const str = new TextDecoder().decode(data);
      return BigInt(str);
    },
  });

  return codec;
}

/**
 * Creates a MessagePackCodec with common JavaScript type extensions.
 * Supports: Date, Map, Set, BigInt
 *
 * @template T - Type of data being serialized/deserialized
 * @param options - Additional codec options (extensionCodec will be overwritten)
 * @returns Configured MessagePackCodec
 *
 * @example
 * ```ts
 * import { createExtendedCodec } from '@procwire/codec-msgpack';
 *
 * const codec = createExtendedCodec<MyData>();
 *
 * // Now works with Date, Map, Set, BigInt
 * const data = {
 *   createdAt: new Date(),
 *   tags: new Set(["a", "b"]),
 *   metadata: new Map([["key", "value"]]),
 *   bigNumber: BigInt("9007199254740993")
 * };
 *
 * const buffer = codec.serialize(data);
 * const decoded = codec.deserialize(buffer);
 * // decoded.createdAt instanceof Date === true
 * ```
 */
export function createExtendedCodec<T = unknown>(
  options?: Omit<MessagePackCodecOptions, "extensionCodec">
): MessagePackCodec<T> {
  return new MessagePackCodec<T>({
    ...options,
    extensionCodec: createCommonExtensionCodec(),
  });
}
