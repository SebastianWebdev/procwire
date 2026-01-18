import type { Type } from "protobufjs";

import type { SerializationCodec } from "@aspect-ipc/transport/serialization";

export class ProtobufCodec<T> implements SerializationCodec<T> {
  readonly name = "protobuf";
  readonly contentType = "application/x-protobuf";

  constructor(private readonly messageType: Type) {}

  serialize(value: T): Buffer {
    const message = this.messageType.create(value as Record<string, unknown>);
    const bytes = this.messageType.encode(message).finish();
    return Buffer.from(bytes);
  }

  deserialize(buffer: Buffer): T {
    const decoded = this.messageType.decode(buffer);
    return this.messageType.toObject(decoded) as T;
  }
}
