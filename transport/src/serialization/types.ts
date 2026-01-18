export interface SerializationCodec<T = unknown> {
  readonly name: string;
  readonly contentType: string;

  serialize(value: T): Buffer;
  deserialize(buffer: Buffer): T;
}
