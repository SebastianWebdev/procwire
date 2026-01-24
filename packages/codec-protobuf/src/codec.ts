/**
 * Protocol Buffers codec implementation for @procwire/transport.
 *
 * @remarks
 * This is an internal module. Import from `@procwire/codec-protobuf` instead.
 *
 * @internal
 */

import type { Type, IConversionOptions } from "protobufjs";
import type { SerializationCodec } from "@procwire/transport/serialization";
import { SerializationError } from "@procwire/transport";

/**
 * Configuration options for {@link ProtobufCodec}.
 *
 * These options control how protobuf messages are converted to/from JavaScript objects.
 * All options are optional and have sensible defaults.
 *
 * @example Default configuration
 * ```ts
 * const codec = new ProtobufCodec<User>(userType);
 * ```
 *
 * @example Custom configuration
 * ```ts
 * const codec = new ProtobufCodec<Message>(messageType, {
 *   longs: String,           // Convert int64 to string
 *   enums: String,           // Convert enums to names
 *   bytes: Array,            // Convert bytes to number arrays
 *   defaults: true,          // Include default values
 *   verifyOnSerialize: true, // Validate before encoding
 * });
 * ```
 *
 * @see {@link ProtobufCodec} for the main codec class
 */
export interface ProtobufCodecOptions {
  /**
   * Controls how 64-bit integer values (int64, uint64, etc.) are converted.
   *
   * - `String` (default): Convert to string representation. Safe for large integers,
   *   preserves precision beyond `Number.MAX_SAFE_INTEGER` (2^53 - 1).
   * - `Number`: Convert to JavaScript number. May lose precision for values > 2^53.
   *
   * @default String
   *
   * @example
   * ```ts
   * // String mode (recommended for large integers)
   * const codec = new ProtobufCodec<Msg>(type, { longs: String });
   * const result = codec.deserialize(buffer);
   * console.log(result.bigId); // "9007199254740993" (string)
   *
   * // Number mode (convenient for small integers)
   * const codec = new ProtobufCodec<Msg>(type, { longs: Number });
   * const result = codec.deserialize(buffer);
   * console.log(result.smallId); // 12345 (number)
   * ```
   */
  longs?: typeof String | typeof Number;

  /**
   * Controls how enum values are converted.
   *
   * - `String`: Convert to enum name string (e.g., `"STATUS_ACTIVE"`).
   * - `undefined` (default): Keep as numeric value (e.g., `1`).
   *
   * @default undefined
   *
   * @example
   * ```ts
   * // String mode - human-readable
   * const codec = new ProtobufCodec<Msg>(type, { enums: String });
   * const result = codec.deserialize(buffer);
   * console.log(result.status); // "STATUS_ACTIVE"
   *
   * // Number mode (default) - compact
   * const codec = new ProtobufCodec<Msg>(type);
   * const result = codec.deserialize(buffer);
   * console.log(result.status); // 1
   * ```
   */
  enums?: typeof String;

  /**
   * Controls how bytes fields are converted.
   *
   * - `String`: Base64 encoded string.
   * - `Array`: Array of numbers (0-255).
   * - `undefined` (default): Keep as `Uint8Array`.
   *
   * @default undefined
   *
   * @example
   * ```ts
   * // Base64 string - easy to serialize in JSON
   * const codec = new ProtobufCodec<Msg>(type, { bytes: String });
   * const result = codec.deserialize(buffer);
   * console.log(result.data); // "SGVsbG8gV29ybGQ="
   *
   * // Array - easy to manipulate
   * const codec = new ProtobufCodec<Msg>(type, { bytes: Array });
   * const result = codec.deserialize(buffer);
   * console.log(result.data); // [72, 101, 108, 108, 111]
   *
   * // Uint8Array (default) - efficient
   * const codec = new ProtobufCodec<Msg>(type);
   * const result = codec.deserialize(buffer);
   * console.log(result.data); // Uint8Array [72, 101, 108, 108, 111]
   * ```
   */
  bytes?: typeof String | typeof Array;

  /**
   * Whether to include fields with default/zero values in the output.
   *
   * - `false` (default): Omit fields with default values to reduce output size.
   * - `true`: Include all fields, even those with default values.
   *
   * @default false
   *
   * @example
   * ```ts
   * // Without defaults
   * const codec = new ProtobufCodec<User>(type, { defaults: false });
   * const result = codec.deserialize(buffer);
   * // { name: "Alice" } - 'age' omitted because it's 0
   *
   * // With defaults
   * const codec = new ProtobufCodec<User>(type, { defaults: true });
   * const result = codec.deserialize(buffer);
   * // { name: "Alice", age: 0, active: false, ... }
   * ```
   */
  defaults?: boolean;

  /**
   * Whether to include virtual `oneof` properties in output.
   *
   * When `true`, adds a property indicating which field of a `oneof` is set.
   *
   * @default false
   *
   * @example
   * ```ts
   * // Given a message with: oneof payload { string text = 1; int32 number = 2; }
   * const codec = new ProtobufCodec<Msg>(type, { oneofs: true });
   * const result = codec.deserialize(buffer);
   * // { text: "hello", payload: "text" } - indicates 'text' field is set
   * ```
   */
  oneofs?: boolean;

  /**
   * Whether to verify the message against the schema before encoding.
   *
   * - `true` (default): Validate message structure, providing clearer error messages
   *   for invalid data (e.g., missing required fields, wrong types).
   * - `false`: Skip validation for maximum performance. Only use in trusted
   *   environments where input is guaranteed to be valid.
   *
   * @default true
   *
   * @example
   * ```ts
   * // With verification (recommended)
   * const codec = new ProtobufCodec<User>(type, { verifyOnSerialize: true });
   *
   * try {
   *   codec.serialize({ name: 123 }); // Wrong type
   * } catch (error) {
   *   // Clear error: "name: string expected"
   * }
   *
   * // Without verification (maximum performance)
   * const codec = new ProtobufCodec<User>(type, { verifyOnSerialize: false });
   * ```
   */
  verifyOnSerialize?: boolean;
}

/**
 * Protocol Buffers serialization codec.
 *
 * Implements the {@link SerializationCodec} interface for use with @procwire/transport
 * channels. Provides schema-validated binary serialization using Protocol Buffers,
 * which is typically 3-10x smaller than JSON and offers cross-language compatibility.
 *
 * @typeParam T - TypeScript interface matching the protobuf message structure.
 *               Must align with the protobuf schema for type-safe operations.
 *
 * @remarks
 * This codec uses zero-copy optimization where possible, wrapping the underlying
 * ArrayBuffer instead of copying data. Message verification is enabled by default
 * for safety but can be disabled for performance in trusted environments.
 *
 * @example Basic usage with inline schema
 * ```ts
 * import * as protobuf from 'protobufjs';
 * import { ProtobufCodec } from '@procwire/codec-protobuf';
 *
 * // Define schema inline
 * const root = protobuf.Root.fromJSON({
 *   nested: {
 *     User: {
 *       fields: {
 *         id: { type: 'int32', id: 1 },
 *         name: { type: 'string', id: 2 },
 *         email: { type: 'string', id: 3 },
 *         active: { type: 'bool', id: 4 }
 *       }
 *     }
 *   }
 * });
 *
 * interface User {
 *   id: number;
 *   name: string;
 *   email: string;
 *   active: boolean;
 * }
 *
 * const codec = new ProtobufCodec<User>(root.lookupType('User'));
 *
 * const user: User = { id: 1, name: 'Alice', email: 'alice@example.com', active: true };
 * const buffer = codec.serialize(user);
 * const decoded = codec.deserialize(buffer);
 * ```
 *
 * @example Loading from .proto file
 * ```ts
 * import { createCodecFromProto } from '@procwire/codec-protobuf';
 *
 * // user.proto:
 * // syntax = "proto3";
 * // package myapp;
 * // message User {
 * //   int32 id = 1;
 * //   string name = 2;
 * // }
 *
 * const codec = await createCodecFromProto<User>(
 *   './schemas/user.proto',
 *   'myapp.User'
 * );
 * ```
 *
 * @example With configuration options
 * ```ts
 * const codec = new ProtobufCodec<Message>(messageType, {
 *   longs: String,            // Convert int64 to string (preserves precision)
 *   enums: String,            // Convert enums to readable names
 *   defaults: true,           // Include all fields in output
 *   verifyOnSerialize: false, // Skip validation for performance
 * });
 * ```
 *
 * @example Handling 64-bit integers
 * ```ts
 * // Protobuf int64/uint64 exceeds JavaScript's safe integer range.
 * // Use string conversion to preserve precision.
 *
 * interface Transaction {
 *   id: string;        // int64 as string
 *   amount: string;    // uint64 as string
 *   timestamp: string; // int64 as string
 * }
 *
 * const codec = new ProtobufCodec<Transaction>(transactionType, {
 *   longs: String,
 * });
 *
 * const tx = codec.deserialize(buffer);
 * console.log(tx.id); // "9007199254740993" (safe as string)
 * ```
 *
 * @example Integration with @procwire/transport
 * ```ts
 * import { ProtobufCodec } from '@procwire/codec-protobuf';
 * import { RequestChannel } from '@procwire/transport/channel';
 *
 * const codec = new ProtobufCodec<Request>(requestType);
 *
 * const channel = new RequestChannel({
 *   transport,
 *   framing,
 *   serialization: codec,
 *   protocol
 * });
 * ```
 *
 * @see {@link ProtobufCodecOptions} for configuration options
 * @see {@link createCodecFromProto} for loading .proto files
 * @see {@link createCodecFromJSON} for inline JSON schemas
 */
export class ProtobufCodec<T> implements SerializationCodec<T> {
  /**
   * Unique identifier for this codec.
   *
   * Used by codec registries to identify and lookup codecs by name.
   * The value `"protobuf"` identifies this as a Protocol Buffers codec.
   *
   * @readonly
   */
  readonly name = "protobuf";

  /**
   * MIME type for Protocol Buffers encoded data.
   *
   * Used in HTTP Content-Type headers and content negotiation.
   * The `application/x-protobuf` type is the widely-used convention
   * for protobuf binary data.
   *
   * @readonly
   * @see {@link https://developers.google.com/protocol-buffers | Protocol Buffers documentation}
   */
  readonly contentType = "application/x-protobuf";

  private readonly conversionOptions: IConversionOptions;
  private readonly verifyOnSerialize: boolean;

  /**
   * Creates a new ProtobufCodec instance.
   *
   * @param messageType - The protobufjs Type instance defining the message schema.
   *                      Obtain this via `root.lookupType('MessageName')` or use
   *                      the helper functions {@link createCodecFromProto} or
   *                      {@link createCodecFromJSON}.
   * @param options - Optional configuration for serialization behavior.
   *                  See {@link ProtobufCodecOptions} for available options.
   *
   * @example With inline schema
   * ```ts
   * import * as protobuf from 'protobufjs';
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
   * const codec = new ProtobufCodec<User>(root.lookupType('User'));
   * ```
   *
   * @example With options
   * ```ts
   * const codec = new ProtobufCodec<Message>(messageType, {
   *   longs: String,
   *   defaults: true,
   * });
   * ```
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
   *
   * Provides access to the underlying message type for advanced operations
   * like schema reflection, field inspection, or creating nested codecs.
   *
   * @returns The protobufjs Type instance.
   *
   * @example Schema reflection
   * ```ts
   * const codec = new ProtobufCodec<User>(userType);
   *
   * // Inspect fields
   * for (const field of codec.type.fieldsArray) {
   *   console.log(`${field.name}: ${field.type}`);
   * }
   *
   * // Check if field exists
   * const hasEmail = codec.type.fields['email'] !== undefined;
   * ```
   */
  get type(): Type {
    return this.messageType;
  }

  /**
   * Serializes a value to Protocol Buffers binary format.
   *
   * Converts the input value to a compact binary representation using
   * the protobuf schema. If `verifyOnSerialize` is enabled (default),
   * the message is validated against the schema before encoding.
   *
   * @param value - The value to serialize. Must conform to the protobuf message
   *                schema. All required fields must be present and all values
   *                must match their declared types.
   * @returns Buffer containing the protobuf-encoded binary data.
   *
   * @throws {SerializationError} When message verification fails (if enabled).
   *         The error message includes details about which field failed validation.
   * @throws {SerializationError} When encoding fails due to invalid data or
   *         internal protobufjs errors.
   *
   * @example Basic serialization
   * ```ts
   * const codec = new ProtobufCodec<User>(userType);
   *
   * const user = { id: 1, name: 'Alice', email: 'alice@example.com' };
   * const buffer = codec.serialize(user);
   * console.log(buffer.length); // Compact binary size
   * ```
   *
   * @example Error handling
   * ```ts
   * const codec = new ProtobufCodec<User>(userType);
   *
   * try {
   *   // Missing required field or wrong type
   *   codec.serialize({ id: 'not-a-number' });
   * } catch (error) {
   *   if (error instanceof SerializationError) {
   *     console.error('Validation failed:', error.message);
   *     // "Message verification failed: id: integer expected"
   *   }
   * }
   * ```
   *
   * @see {@link deserialize} for the reverse operation
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
   * Parses the binary protobuf data and converts it to a plain JavaScript object
   * according to the conversion options (longs, enums, bytes, defaults, oneofs).
   *
   * @param buffer - Buffer or Uint8Array containing protobuf-encoded data.
   *                 Must be valid protobuf binary format matching the schema.
   * @returns The deserialized plain JavaScript object. The return type matches
   *          the generic type parameter `T`.
   *
   * @throws {SerializationError} When input is null, undefined, or not a Buffer/Uint8Array.
   * @throws {SerializationError} When the buffer contains invalid or corrupted protobuf data.
   * @throws {SerializationError} When the data doesn't match the expected schema.
   *
   * @example Basic deserialization
   * ```ts
   * const codec = new ProtobufCodec<User>(userType);
   *
   * // Roundtrip
   * const original = { id: 1, name: 'Alice', email: 'alice@example.com' };
   * const buffer = codec.serialize(original);
   * const decoded = codec.deserialize(buffer);
   *
   * console.log(decoded.id);    // 1
   * console.log(decoded.name);  // 'Alice'
   * console.log(decoded.email); // 'alice@example.com'
   * ```
   *
   * @example Error handling
   * ```ts
   * const codec = new ProtobufCodec<User>(userType);
   *
   * try {
   *   codec.deserialize(Buffer.from('invalid data'));
   * } catch (error) {
   *   if (error instanceof SerializationError) {
   *     console.error('Decode failed:', error.message);
   *   }
   * }
   * ```
   *
   * @example With conversion options
   * ```ts
   * const codec = new ProtobufCodec<Message>(messageType, {
   *   longs: String,    // int64 → string
   *   enums: String,    // enums → names
   *   defaults: true,   // include all fields
   * });
   *
   * const msg = codec.deserialize(buffer);
   * console.log(typeof msg.timestamp); // 'string' (from int64)
   * console.log(msg.status);           // 'STATUS_ACTIVE' (enum name)
   * ```
   *
   * @see {@link serialize} for the reverse operation
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
