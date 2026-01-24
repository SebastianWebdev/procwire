/**
 * Protocol Buffers codec implementation for @procwire/transport.
 * Provides type-safe binary serialization with configurable options.
 *
 * @module Codec
 */

import type { Type, IConversionOptions } from "protobufjs";
import type { SerializationCodec } from "@procwire/transport/serialization";
import { SerializationError } from "@procwire/transport";

/**
 * Options for ProtobufCodec configuration.
 */
export interface ProtobufCodecOptions {
  /**
   * How to convert Long (int64/uint64) values in toObject().
   * - String: Safe representation for large integers (default)
   * - Number: Native number (may lose precision > MAX_SAFE_INTEGER)
   * @default String
   */
  longs?: typeof String | typeof Number;

  /**
   * How to convert enum values in toObject().
   * - String: Enum name as string
   * - undefined: Numeric value (default)
   * @default undefined
   */
  enums?: typeof String;

  /**
   * How to convert bytes fields in toObject().
   * - String: Base64 encoded
   * - Array: Number array
   * - undefined: Uint8Array (default)
   * @default undefined
   */
  bytes?: typeof String | typeof Array;

  /**
   * Include fields with default/zero values in output.
   * @default false
   */
  defaults?: boolean;

  /**
   * Include virtual oneof properties in output.
   * @default false
   */
  oneofs?: boolean;

  /**
   * Verify message before encoding for clearer error messages.
   * Disable for maximum performance in trusted environments.
   * @default true
   */
  verifyOnSerialize?: boolean;
}

/**
 * Protocol Buffers serialization codec with configurable options.
 *
 * Features:
 * - Type-safe serialization with generic type parameter
 * - Schema validation via protobufjs
 * - Configurable Long/enum/bytes conversion
 * - Optional message verification before encoding
 * - Zero-copy buffer optimization
 *
 * @template T - TypeScript type corresponding to the protobuf message
 *
 * @example Basic usage
 * ```ts
 * import * as protobuf from 'protobufjs';
 * import { ProtobufCodec } from '@procwire/codec-protobuf';
 *
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
 *
 * interface User { id: number; name: string; }
 * const codec = new ProtobufCodec<User>(root.lookupType('User'));
 * ```
 *
 * @example With options
 * ```ts
 * const codec = new ProtobufCodec<Message>(MessageType, {
 *   longs: String,      // Convert int64 to string
 *   enums: String,      // Convert enums to names
 *   defaults: true,     // Include default values
 *   verifyOnSerialize: false  // Skip verification for performance
 * });
 * ```
 */
export class ProtobufCodec<T> implements SerializationCodec<T> {
  readonly name = "protobuf";
  readonly contentType = "application/x-protobuf";

  private readonly conversionOptions: IConversionOptions;
  private readonly verifyOnSerialize: boolean;

  /**
   * Creates a new ProtobufCodec instance.
   *
   * @param messageType - The protobufjs Type instance defining the message schema
   * @param options - Optional configuration for serialization behavior
   */
  constructor(
    private readonly messageType: Type,
    options?: ProtobufCodecOptions,
  ) {
    this.verifyOnSerialize = options?.verifyOnSerialize ?? true;

    // Build conversion options for toObject()
    // Only include properties that are defined to satisfy exactOptionalPropertyTypes
    const conversionOptions: IConversionOptions = {
      longs: options?.longs ?? String,
      defaults: options?.defaults ?? false,
      oneofs: options?.oneofs ?? false,
    };

    if (options?.enums !== undefined) {
      conversionOptions.enums = options.enums;
    }
    if (options?.bytes !== undefined) {
      conversionOptions.bytes = options.bytes;
    }

    this.conversionOptions = conversionOptions;
  }

  /**
   * Returns the protobufjs Type used by this codec.
   * Useful for advanced operations like reflection.
   */
  get type(): Type {
    return this.messageType;
  }

  /**
   * Serializes a value to Protocol Buffers binary format.
   *
   * @param value - Value to serialize (must conform to message schema)
   * @returns Buffer containing protobuf-encoded data
   * @throws {SerializationError} if verification fails or encoding errors occur
   */
  serialize(value: T): Buffer {
    try {
      // Optional verification for clearer error messages
      if (this.verifyOnSerialize) {
        const verifyError = this.messageType.verify(value as Record<string, unknown>);
        if (verifyError) {
          throw new Error(`Message verification failed: ${verifyError}`);
        }
      }

      const message = this.messageType.create(value as Record<string, unknown>);
      const bytes = this.messageType.encode(message).finish();

      // Zero-copy: wrap underlying ArrayBuffer without copying
      return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    } catch (error) {
      if (error instanceof SerializationError) {
        throw error;
      }
      throw new SerializationError(
        `Failed to encode protobuf message: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }

  /**
   * Deserializes Protocol Buffers binary data to a typed JavaScript object.
   *
   * @param buffer - Buffer or Uint8Array containing protobuf-encoded data
   * @returns Deserialized plain JavaScript object
   * @throws {SerializationError} if input is invalid or decoding fails
   */
  deserialize(buffer: Buffer): T {
    // Validate input type - cast to unknown first for runtime type check
    const input = buffer as unknown;
    if (
      !Buffer.isBuffer(input) &&
      !(input instanceof Uint8Array)
    ) {
      throw new SerializationError(
        `Invalid input: expected Buffer or Uint8Array, got ${typeof input}`,
        new TypeError("Invalid input type"),
      );
    }

    try {
      const decoded = this.messageType.decode(buffer);
      return this.messageType.toObject(decoded, this.conversionOptions) as T;
    } catch (error) {
      if (error instanceof SerializationError) {
        throw error;
      }
      throw new SerializationError(
        `Failed to decode protobuf message: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }
}
