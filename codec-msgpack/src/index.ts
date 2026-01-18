/**
 * MessagePack codec for @aspect-ipc/transport.
 * Provides efficient binary serialization using @msgpack/msgpack.
 *
 * @module
 */

import { decode, encode } from "@msgpack/msgpack";
import type { SerializationCodec } from "@aspect-ipc/transport/serialization";
import { SerializationError } from "@aspect-ipc/transport";

/**
 * MessagePack serialization codec.
 * Implements efficient binary serialization with support for various JavaScript types.
 *
 * @example
 * ```ts
 * import { MessagePackCodec } from '@aspect-ipc/codec-msgpack';
 * import { ChannelBuilder } from '@aspect-ipc/transport';
 *
 * const channel = new ChannelBuilder()
 *   .withSerialization(new MessagePackCodec())
 *   // ... other configuration
 *   .build();
 * ```
 */
export class MessagePackCodec implements SerializationCodec<unknown> {
  readonly name = "msgpack";
  readonly contentType = "application/x-msgpack";

  /**
   * Serializes a value to MessagePack binary format.
   *
   * @param value - Value to serialize
   * @returns Buffer containing MessagePack-encoded data
   * @throws {SerializationError} if encoding fails
   */
  serialize(value: unknown): Buffer {
    try {
      const uint8array = encode(value);
      // Optimize: avoid copying by wrapping the underlying ArrayBuffer
      return Buffer.from(
        uint8array.buffer,
        uint8array.byteOffset,
        uint8array.byteLength,
      );
    } catch (error) {
      throw new SerializationError(
        `Failed to encode MessagePack: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }

  /**
   * Deserializes MessagePack binary data to a JavaScript value.
   *
   * @param buffer - Buffer containing MessagePack-encoded data
   * @returns Deserialized value
   * @throws {SerializationError} if decoding fails
   */
  deserialize(buffer: Buffer): unknown {
    try {
      return decode(buffer);
    } catch (error) {
      throw new SerializationError(
        `Failed to decode MessagePack: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }
}
