/**
 * Protocol Buffers codec for @procwire/transport.
 * Provides type-safe binary serialization using protobufjs.
 *
 * @module Codec Protobuf
 */

import type { Type } from "protobufjs";
import type { SerializationCodec } from "@procwire/transport/serialization";
import { SerializationError } from "@procwire/transport";

/**
 * Protocol Buffers serialization codec.
 * Implements type-safe binary serialization with schema validation.
 *
 * @typeParam T - The TypeScript type corresponding to the protobuf message
 *
 * @example
 * ```ts
 * import * as protobuf from 'protobufjs';
 * import { ProtobufCodec } from '@procwire/codec-protobuf';
 * import { ChannelBuilder } from '@procwire/transport';
 *
 * // Define schema
 * const root = protobuf.Root.fromJSON({
 *   nested: {
 *     User: {
 *       fields: {
 *         id: { type: 'int32', id: 1 },
 *         name: { type: 'string', id: 2 }
 *       }
 *     }
 *   }
 * });
 * const UserType = root.lookupType('User');
 *
 * // Create codec
 * const codec = new ProtobufCodec<User>(UserType);
 *
 * // Use with channel
 * const channel = new ChannelBuilder()
 *   .withSerialization(codec)
 *   // ... other configuration
 *   .build();
 * ```
 */
export class ProtobufCodec<T> implements SerializationCodec<T> {
  readonly name = "protobuf";
  readonly contentType = "application/x-protobuf";

  /**
   * Creates a new ProtobufCodec instance.
   *
   * @param messageType - The protobufjs Type instance defining the message schema
   */
  constructor(private readonly messageType: Type) {}

  /**
   * Serializes a value to Protocol Buffers binary format.
   *
   * @param value - Value to serialize (must match the message schema)
   * @returns Buffer containing protobuf-encoded data
   * @throws {SerializationError} if encoding fails or value doesn't match schema
   */
  serialize(value: T): Buffer {
    try {
      const message = this.messageType.create(value as Record<string, unknown>);
      const bytes = this.messageType.encode(message).finish();
      return Buffer.from(bytes);
    } catch (error) {
      throw new SerializationError(
        `Failed to encode protobuf message: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }

  /**
   * Deserializes Protocol Buffers binary data to a typed JavaScript object.
   *
   * @param buffer - Buffer containing protobuf-encoded data
   * @returns Deserialized plain JavaScript object
   * @throws {SerializationError} if decoding fails or data doesn't match schema
   */
  deserialize(buffer: Buffer): T {
    try {
      const decoded = this.messageType.decode(buffer);
      return this.messageType.toObject(decoded) as T;
    } catch (error) {
      throw new SerializationError(
        `Failed to decode protobuf message: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }
}
