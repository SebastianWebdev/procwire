/**
 * MessagePack codec implementation for @procwire/transport.
 * Provides efficient binary serialization with extension type support.
 *
 * @module codec
 */

import type { ExtensionCodec } from "@msgpack/msgpack";
import { encode, decode } from "@msgpack/msgpack";
import type { SerializationCodec } from "@procwire/transport/serialization";
import { SerializationError } from "@procwire/transport";

/**
 * Options for MessagePackCodec configuration.
 */
export interface MessagePackCodecOptions {
  /**
   * Custom extension codec for handling non-standard types.
   * Use `createExtendedCodec()` for common types (Date, Map, Set, BigInt).
   * @see https://github.com/msgpack/msgpack-javascript#extension-types
   */
  extensionCodec?: ExtensionCodec;

  /**
   * Initial buffer size for encoding.
   * Larger values reduce reallocations for big payloads.
   * @default 2048
   */
  initialBufferSize?: number;

  /**
   * Sort object keys alphabetically during encoding.
   * Useful for deterministic/reproducible output.
   * @default false
   */
  sortKeys?: boolean;

  /**
   * Force float numbers that are integers to be encoded as integers.
   * E.g., 1.0 becomes integer 1 instead of float.
   * @default false
   */
  forceIntegerToFloat?: boolean;

  /**
   * Custom context passed to extension codec encode/decode functions.
   */
  context?: unknown;
}

/**
 * MessagePack serialization codec with extension type support.
 *
 * @template T - Type of data being serialized/deserialized
 *
 * @example Basic usage
 * ```ts
 * const codec = new MessagePackCodec();
 * const buffer = codec.serialize({ hello: "world" });
 * const data = codec.deserialize(buffer);
 * ```
 *
 * @example Type-safe usage
 * ```ts
 * interface User { id: number; name: string; }
 * const codec = new MessagePackCodec<User>();
 * const user: User = codec.deserialize(buffer);
 * ```
 *
 * @example With extension types
 * ```ts
 * import { createExtendedCodec } from '@procwire/codec-msgpack';
 * const codec = createExtendedCodec<MyData>();
 * // Now supports Date, Map, Set, BigInt
 * ```
 */
export class MessagePackCodec<T = unknown> implements SerializationCodec<T> {
  readonly name = "msgpack";
  readonly contentType = "application/x-msgpack";

  private readonly options: MessagePackCodecOptions;

  constructor(options?: MessagePackCodecOptions) {
    this.options = options ?? {};
  }

  /**
   * Serializes a value to MessagePack binary format.
   *
   * @param value - Value to serialize
   * @returns Buffer containing MessagePack-encoded data
   * @throws {SerializationError} if encoding fails (e.g., BigInt without extension)
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
        error
      );
    }
  }

  /**
   * Deserializes MessagePack binary data to a value.
   *
   * @param buffer - Buffer or Uint8Array containing MessagePack-encoded data
   * @returns Deserialized value
   * @throws {SerializationError} if input is invalid or decoding fails
   */
  deserialize(buffer: Buffer): T {
    if (buffer === null || buffer === undefined) {
      throw new SerializationError(
        `Invalid input: expected Buffer or Uint8Array, got ${buffer === null ? "null" : "undefined"}`,
        new TypeError("Invalid input type")
      );
    }

    if (typeof buffer !== "object") {
      throw new SerializationError(
        `Invalid input: expected Buffer or Uint8Array, got ${typeof buffer}`,
        new TypeError("Invalid input type")
      );
    }

    // Type guard for Uint8Array compatibility check
    const isBufferLike = Buffer.isBuffer(buffer) || ArrayBuffer.isView(buffer);
    if (!isBufferLike) {
      throw new SerializationError(
        `Invalid input: expected Buffer or Uint8Array, got ${typeof buffer}`,
        new TypeError("Invalid input type")
      );
    }

    try {
      // Use type assertion to work around exactOptionalPropertyTypes issues with @msgpack/msgpack
      const decodeOptions = this.options as Parameters<typeof decode>[1];
      return decode(buffer, decodeOptions) as T;
    } catch (error) {
      throw new SerializationError(
        `Failed to decode MessagePack: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }
}
