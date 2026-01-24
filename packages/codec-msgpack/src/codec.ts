/**
 * MessagePack codec implementation for @procwire/transport.
 *
 * @remarks
 * This is an internal module. Import from `@procwire/codec-msgpack` instead.
 *
 * @internal
 */

import type { ExtensionCodec } from "@msgpack/msgpack";
import { encode, decode } from "@msgpack/msgpack";
import type { SerializationCodec } from "@procwire/transport/serialization";
import { SerializationError } from "@procwire/transport";

/**
 * Configuration options for {@link MessagePackCodec}.
 *
 * All options are optional and have sensible defaults. For most use cases,
 * creating a codec with no options is sufficient.
 *
 * @example Default configuration
 * ```ts
 * const codec = new MessagePackCodec();
 * ```
 *
 * @example Custom configuration
 * ```ts
 * const codec = new MessagePackCodec({
 *   initialBufferSize: 8192,  // 8KB initial buffer
 *   sortKeys: true,           // Deterministic output
 * });
 * ```
 *
 * @example With extension types
 * ```ts
 * import { createCommonExtensionCodec } from '@procwire/codec-msgpack';
 *
 * const codec = new MessagePackCodec({
 *   extensionCodec: createCommonExtensionCodec(),
 * });
 * ```
 *
 * @see {@link MessagePackCodec} for the main codec class
 * @see {@link createCommonExtensionCodec} for built-in extension type support
 */
export interface MessagePackCodecOptions {
  /**
   * Custom extension codec for handling non-standard types.
   *
   * MessagePack supports extension types (type IDs 0-127) for custom serialization.
   * Use {@link createCommonExtensionCodec} for pre-built support of Date, Map, Set, and BigInt,
   * or create a custom ExtensionCodec for other types.
   *
   * @example
   * ```ts
   * import { createCommonExtensionCodec } from '@procwire/codec-msgpack';
   *
   * const codec = new MessagePackCodec({
   *   extensionCodec: createCommonExtensionCodec(),
   * });
   * // Now supports Date, Map, Set, BigInt
   * ```
   *
   * @see {@link https://github.com/msgpack/msgpack-javascript#extension-types | @msgpack/msgpack Extension Types}
   */
  extensionCodec?: ExtensionCodec;

  /**
   * Initial buffer size in bytes for encoding.
   *
   * Larger values reduce reallocations when serializing large payloads,
   * improving performance at the cost of initial memory usage.
   *
   * @default 2048
   *
   * @example
   * ```ts
   * // For large payloads (e.g., megabytes of data)
   * const codec = new MessagePackCodec({
   *   initialBufferSize: 1024 * 1024, // 1MB
   * });
   * ```
   */
  initialBufferSize?: number;

  /**
   * Sort object keys alphabetically during encoding.
   *
   * Enable this option when you need deterministic/reproducible output,
   * such as for content-addressable storage or signature verification.
   * Has a slight performance cost due to key sorting.
   *
   * @default false
   *
   * @example
   * ```ts
   * const codec = new MessagePackCodec({ sortKeys: true });
   *
   * // Always produces the same byte sequence for equivalent objects
   * const buf1 = codec.serialize({ b: 2, a: 1 });
   * const buf2 = codec.serialize({ a: 1, b: 2 });
   * // buf1 and buf2 are byte-identical
   * ```
   */
  sortKeys?: boolean;

  /**
   * Force float numbers that are integers to be encoded as integers.
   *
   * When true, values like `1.0` are encoded as integer `1` instead of float.
   * This can reduce output size but may affect type preservation.
   *
   * @default false
   *
   * @example
   * ```ts
   * const codec = new MessagePackCodec({ forceIntegerToFloat: true });
   * // 1.0 will be encoded as integer 1 (smaller)
   * ```
   */
  forceIntegerToFloat?: boolean;

  /**
   * Custom context passed to extension codec encode/decode functions.
   *
   * Use this to pass application-specific state to your custom extension
   * codecs during serialization and deserialization.
   *
   * @example
   * ```ts
   * const codec = new MessagePackCodec({
   *   extensionCodec: myCustomCodec,
   *   context: { schema: mySchema },
   * });
   * ```
   */
  context?: unknown;
}

/**
 * MessagePack binary serialization codec.
 *
 * Implements the {@link SerializationCodec} interface for use with
 * @procwire/transport channels. Provides efficient binary serialization
 * that is typically 20-50% smaller and 2-5x faster than JSON.
 *
 * @typeParam T - Type of data being serialized/deserialized. Defaults to `unknown`
 *               for maximum flexibility. Use a specific type for type-safe operations.
 *
 * @remarks
 * This codec uses zero-copy optimization where possible, wrapping the underlying
 * ArrayBuffer instead of copying data. The @msgpack/msgpack library returns
 * owned Uint8Arrays without buffer pooling, making this safe.
 *
 * @example Basic usage
 * ```ts
 * import { MessagePackCodec } from '@procwire/codec-msgpack';
 *
 * const codec = new MessagePackCodec();
 *
 * // Serialize any JSON-compatible value
 * const buffer = codec.serialize({
 *   users: [
 *     { id: 1, name: 'Alice', active: true },
 *     { id: 2, name: 'Bob', active: false }
 *   ],
 *   count: 2
 * });
 *
 * // Deserialize back to original value
 * const data = codec.deserialize(buffer);
 * console.log(data.users[0].name); // 'Alice'
 * ```
 *
 * @example Type-safe usage
 * ```ts
 * interface User {
 *   id: number;
 *   name: string;
 *   email: string;
 * }
 *
 * const codec = new MessagePackCodec<User>();
 *
 * const user: User = { id: 1, name: 'Alice', email: 'alice@example.com' };
 * const buffer = codec.serialize(user);
 * const decoded: User = codec.deserialize(buffer);
 * // TypeScript knows decoded has id, name, email properties
 * ```
 *
 * @example With extension types for Date, Map, Set, BigInt
 * ```ts
 * import { createExtendedCodec } from '@procwire/codec-msgpack';
 *
 * const codec = createExtendedCodec<MyData>();
 *
 * const data = {
 *   createdAt: new Date(),
 *   tags: new Set(['important', 'urgent']),
 *   metadata: new Map([['key', 'value']]),
 *   bigId: BigInt('9007199254740993')
 * };
 *
 * const buffer = codec.serialize(data);
 * const decoded = codec.deserialize(buffer);
 * // decoded.createdAt instanceof Date === true
 * // decoded.tags instanceof Set === true
 * ```
 *
 * @example Binary data handling
 * ```ts
 * const codec = new MessagePackCodec();
 *
 * // TypedArrays are preserved
 * const data = {
 *   pixels: new Uint8Array([255, 128, 64, 32]),
 *   floats: new Float32Array([1.5, 2.5, 3.5])
 * };
 *
 * const buffer = codec.serialize(data);
 * const decoded = codec.deserialize(buffer);
 * // decoded.pixels instanceof Uint8Array === true
 * ```
 *
 * @example Integration with @procwire/transport
 * ```ts
 * import { MessagePackCodec } from '@procwire/codec-msgpack';
 * import { RequestChannel } from '@procwire/transport/channel';
 *
 * const channel = new RequestChannel({
 *   transport,
 *   framing,
 *   serialization: new MessagePackCodec(),
 *   protocol
 * });
 * ```
 *
 * @see {@link MessagePackCodecOptions} for configuration options
 * @see {@link createExtendedCodec} for Date/Map/Set/BigInt support
 * @see {@link createCommonExtensionCodec} for custom extension codec setup
 */
export class MessagePackCodec<T = unknown> implements SerializationCodec<T> {
  /**
   * Unique identifier for this codec.
   *
   * Used by codec registries to identify and lookup codecs by name.
   * The value `"msgpack"` identifies this as a MessagePack codec.
   *
   * @readonly
   */
  readonly name = "msgpack";

  /**
   * MIME type for MessagePack encoded data.
   *
   * Used in HTTP Content-Type headers and content negotiation.
   * The `application/x-msgpack` type is widely used for MessagePack data,
   * though `application/msgpack` is also valid.
   *
   * @readonly
   * @see {@link https://www.iana.org/assignments/media-types/application/msgpack | IANA MessagePack Media Type}
   */
  readonly contentType = "application/x-msgpack";

  private readonly options: MessagePackCodecOptions;

  /**
   * Creates a new MessagePackCodec instance.
   *
   * @param options - Optional configuration for serialization behavior.
   *                  See {@link MessagePackCodecOptions} for available options.
   *
   * @example Default configuration
   * ```ts
   * const codec = new MessagePackCodec();
   * ```
   *
   * @example With options
   * ```ts
   * const codec = new MessagePackCodec({
   *   initialBufferSize: 4096,
   *   sortKeys: true,
   * });
   * ```
   */
  constructor(options?: MessagePackCodecOptions) {
    this.options = options ?? {};
  }

  /**
   * Serializes a value to MessagePack binary format.
   *
   * Converts the input value to a compact binary representation using
   * the MessagePack specification. The output is typically 20-50% smaller
   * than equivalent JSON.
   *
   * @param value - The value to serialize. Supports objects, arrays, strings,
   *                numbers, booleans, null, undefined, Buffer, and TypedArrays.
   *                Functions and Symbols are silently ignored.
   *                For Date, Map, Set, BigInt support, use {@link createExtendedCodec}.
   * @returns Buffer containing the MessagePack-encoded binary data.
   *
   * @throws {SerializationError} When encoding fails due to unsupported types
   *         (e.g., BigInt without extension codec) or circular references.
   *
   * @example Basic serialization
   * ```ts
   * const codec = new MessagePackCodec();
   *
   * // Objects and arrays
   * const buf1 = codec.serialize({ key: 'value', nested: { a: 1 } });
   *
   * // Primitives
   * const buf2 = codec.serialize('hello');
   * const buf3 = codec.serialize(42);
   * const buf4 = codec.serialize(true);
   * const buf5 = codec.serialize(null);
   *
   * // Binary data
   * const buf6 = codec.serialize(new Uint8Array([1, 2, 3]));
   * ```
   *
   * @example Error handling
   * ```ts
   * const codec = new MessagePackCodec();
   *
   * try {
   *   // BigInt fails without extension codec
   *   codec.serialize({ id: BigInt(123) });
   * } catch (error) {
   *   if (error instanceof SerializationError) {
   *     console.error('Serialization failed:', error.message);
   *   }
   * }
   * ```
   *
   * @see {@link deserialize} for the reverse operation
   */
  serialize(value: T): Buffer {
    try {
      // Use type assertion to work around exactOptionalPropertyTypes issues with @msgpack/msgpack
      const encodeOptions = this.options as Parameters<typeof encode>[1];
      const uint8array = encode(value, encodeOptions);
      // Zero-copy: wrap underlying ArrayBuffer without copying
      // Safe because @msgpack/msgpack returns owned Uint8Array (no buffer pooling)
      return Buffer.from(uint8array.buffer, uint8array.byteOffset, uint8array.byteLength);
    } catch (error) {
      throw new SerializationError(
        `Failed to encode MessagePack: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }

  /**
   * Deserializes MessagePack binary data back to the original value.
   *
   * Parses the binary MessagePack data and reconstructs the JavaScript value.
   * TypedArrays and Buffers are preserved during deserialization.
   *
   * @param buffer - Buffer or Uint8Array containing MessagePack-encoded data.
   *                 Must be valid MessagePack binary format.
   * @returns The deserialized JavaScript value with original types preserved
   *          where possible. The return type matches the generic type parameter `T`.
   *
   * @throws {SerializationError} When input is null, undefined, or not a Buffer/Uint8Array.
   * @throws {SerializationError} When the buffer contains invalid or corrupted MessagePack data.
   *
   * @example Basic deserialization
   * ```ts
   * const codec = new MessagePackCodec();
   *
   * // Roundtrip
   * const original = { id: 1, tags: ['a', 'b'], active: true };
   * const buffer = codec.serialize(original);
   * const decoded = codec.deserialize(buffer);
   *
   * console.log(decoded.id);      // 1
   * console.log(decoded.tags[0]); // 'a'
   * console.log(decoded.active);  // true
   * ```
   *
   * @example Error handling
   * ```ts
   * const codec = new MessagePackCodec();
   *
   * try {
   *   codec.deserialize(Buffer.from('invalid data'));
   * } catch (error) {
   *   if (error instanceof SerializationError) {
   *     console.error('Deserialization failed:', error.message);
   *   }
   * }
   * ```
   *
   * @example Type-safe deserialization
   * ```ts
   * interface User { id: number; name: string; }
   * const codec = new MessagePackCodec<User>();
   *
   * const buffer = codec.serialize({ id: 1, name: 'Alice' });
   * const user = codec.deserialize(buffer);
   * // TypeScript knows user.id is number, user.name is string
   * ```
   *
   * @see {@link serialize} for the reverse operation
   */
  deserialize(buffer: Buffer): T {
    if (buffer === null || buffer === undefined) {
      throw new SerializationError(
        `Invalid input: expected Buffer or Uint8Array, got ${buffer === null ? "null" : "undefined"}`,
        new TypeError("Invalid input type"),
      );
    }

    if (typeof buffer !== "object") {
      throw new SerializationError(
        `Invalid input: expected Buffer or Uint8Array, got ${typeof buffer}`,
        new TypeError("Invalid input type"),
      );
    }

    // Type guard for Uint8Array compatibility check
    const isBufferLike = Buffer.isBuffer(buffer) || ArrayBuffer.isView(buffer);
    if (!isBufferLike) {
      throw new SerializationError(
        `Invalid input: expected Buffer or Uint8Array, got ${typeof buffer}`,
        new TypeError("Invalid input type"),
      );
    }

    try {
      // Use type assertion to work around exactOptionalPropertyTypes issues with @msgpack/msgpack
      const decodeOptions = this.options as Parameters<typeof decode>[1];
      return decode(buffer, decodeOptions) as T;
    } catch (error) {
      throw new SerializationError(
        `Failed to decode MessagePack: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }
}
