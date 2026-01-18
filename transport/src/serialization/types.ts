/**
 * Serialization codec interface for converting between objects and binary data.
 * Implementations: JSON, MessagePack, Protocol Buffers, Apache Arrow.
 *
 * @template T - Type of objects being serialized/deserialized
 */
export interface SerializationCodec<T = unknown> {
  /**
   * Codec name (e.g., 'json', 'msgpack', 'protobuf').
   */
  readonly name: string;

  /**
   * Content type identifier (e.g., 'application/json', 'application/msgpack').
   */
  readonly contentType: string;

  /**
   * Serializes object to binary buffer.
   * @throws {SerializationError} if serialization fails
   */
  serialize(data: T): Buffer;

  /**
   * Deserializes binary buffer to object.
   * @throws {SerializationError} if deserialization fails
   */
  deserialize(buffer: Buffer): T;
}
