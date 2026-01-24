/**
 * Extension codecs for common JavaScript types not natively supported by MessagePack.
 *
 * @remarks
 * This is an internal module. Import from `@procwire/codec-msgpack` instead.
 *
 * @internal
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
 *
 * This function creates a pre-configured ExtensionCodec that handles types
 * not natively supported by MessagePack: `Date`, `Map`, `Set`, and `BigInt`.
 * Use this when you need fine-grained control over codec configuration,
 * or use {@link createExtendedCodec} for a simpler API.
 *
 * ## Extension Type IDs
 *
 * The following type IDs are used (from the user-defined range 0-127):
 *
 * | Type ID | JavaScript Type | Encoding Format |
 * |---------|-----------------|-----------------|
 * | 0 | `Date` | Milliseconds since epoch as float64 (big-endian) |
 * | 1 | `Map` | Array of `[key, value]` pairs (recursive) |
 * | 2 | `Set` | Array of values (recursive) |
 * | 3 | `BigInt` | String representation (preserves full precision) |
 *
 * @returns A configured ExtensionCodec instance ready for use with MessagePackCodec.
 *
 * @example Basic usage with MessagePackCodec
 * ```ts
 * import { MessagePackCodec, createCommonExtensionCodec } from '@procwire/codec-msgpack';
 *
 * const extensionCodec = createCommonExtensionCodec();
 * const codec = new MessagePackCodec({
 *   extensionCodec,
 *   sortKeys: true, // Additional options can be combined
 * });
 *
 * const data = {
 *   timestamp: new Date('2024-01-15'),
 *   config: new Map([['debug', true]]),
 *   tags: new Set(['production', 'stable']),
 *   largeId: BigInt('9007199254740993'),
 * };
 *
 * const buffer = codec.serialize(data);
 * const decoded = codec.deserialize(buffer);
 * // All types are preserved
 * ```
 *
 * @example Combining with custom extensions
 * ```ts
 * import { ExtensionCodec } from '@msgpack/msgpack';
 * import { createCommonExtensionCodec } from '@procwire/codec-msgpack';
 *
 * // Start with common types, then add your own
 * const codec = createCommonExtensionCodec();
 *
 * // Add custom type (use ID > 3 to avoid conflicts)
 * codec.register({
 *   type: 10,
 *   encode: (value) => {
 *     if (value instanceof MyCustomType) {
 *       return new TextEncoder().encode(value.toString());
 *     }
 *     return null;
 *   },
 *   decode: (data) => MyCustomType.fromString(new TextDecoder().decode(data)),
 * });
 * ```
 *
 * @see {@link createExtendedCodec} for a simpler one-liner API
 * @see {@link MessagePackCodecOptions.extensionCodec} for usage with MessagePackCodec
 * @see {@link https://github.com/msgpack/msgpack-javascript#extension-types | @msgpack/msgpack Extension Types}
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
 * Creates a MessagePackCodec with built-in support for common JavaScript types.
 *
 * This is a convenience function that creates a {@link MessagePackCodec} pre-configured
 * with extension type support for `Date`, `Map`, `Set`, and `BigInt`. It's the
 * recommended way to get extended type support with minimal setup.
 *
 * @typeParam T - Type of data being serialized/deserialized. Defaults to `unknown`.
 *
 * @param options - Optional codec configuration. The `extensionCodec` option will be
 *                  overwritten with the common extension codec, but all other options
 *                  (like `sortKeys`, `initialBufferSize`) are preserved.
 *
 * @returns A configured MessagePackCodec instance with Date, Map, Set, BigInt support.
 *
 * @example Basic usage
 * ```ts
 * import { createExtendedCodec } from '@procwire/codec-msgpack';
 *
 * const codec = createExtendedCodec();
 *
 * const data = {
 *   createdAt: new Date(),
 *   updatedAt: new Date(),
 *   tags: new Set(['important', 'urgent']),
 *   metadata: new Map([
 *     ['author', 'Alice'],
 *     ['version', '1.0.0'],
 *   ]),
 *   largeNumber: BigInt('9007199254740993'),
 * };
 *
 * const buffer = codec.serialize(data);
 * const decoded = codec.deserialize(buffer);
 *
 * console.log(decoded.createdAt instanceof Date);  // true
 * console.log(decoded.tags instanceof Set);        // true
 * console.log(decoded.metadata instanceof Map);    // true
 * console.log(typeof decoded.largeNumber);         // 'bigint'
 * ```
 *
 * @example Type-safe usage
 * ```ts
 * interface MyData {
 *   id: bigint;
 *   createdAt: Date;
 *   tags: Set<string>;
 *   config: Map<string, unknown>;
 * }
 *
 * const codec = createExtendedCodec<MyData>();
 *
 * const data: MyData = {
 *   id: BigInt('123456789012345678'),
 *   createdAt: new Date(),
 *   tags: new Set(['alpha', 'beta']),
 *   config: new Map([['debug', true]]),
 * };
 *
 * const buffer = codec.serialize(data);
 * const decoded = codec.deserialize(buffer);
 * // TypeScript knows all the correct types
 * ```
 *
 * @example With additional options
 * ```ts
 * const codec = createExtendedCodec({
 *   sortKeys: true,           // Deterministic output
 *   initialBufferSize: 8192,  // Larger buffer for big payloads
 * });
 * ```
 *
 * @example Nested complex types
 * ```ts
 * const codec = createExtendedCodec();
 *
 * // Maps and Sets can contain Date, BigInt, and nested Maps/Sets
 * const data = {
 *   events: new Map<Date, Set<string>>([
 *     [new Date('2024-01-01'), new Set(['event1', 'event2'])],
 *     [new Date('2024-02-01'), new Set(['event3'])],
 *   ]),
 *   bigNumbers: new Set([BigInt(1), BigInt(2), BigInt(3)]),
 * };
 *
 * const buffer = codec.serialize(data);
 * const decoded = codec.deserialize(buffer);
 * // All nested types are properly preserved
 * ```
 *
 * @see {@link createCommonExtensionCodec} for more control over the extension codec
 * @see {@link MessagePackCodec} for the underlying codec class
 * @see {@link MessagePackCodecOptions} for available configuration options
 */
export function createExtendedCodec<T = unknown>(
  options?: Omit<MessagePackCodecOptions, "extensionCodec">,
): MessagePackCodec<T> {
  return new MessagePackCodec<T>({
    ...options,
    extensionCodec: createCommonExtensionCodec(),
  });
}
