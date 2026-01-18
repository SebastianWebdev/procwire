import { decode, encode } from "@msgpack/msgpack";

import type { SerializationCodec } from "@aspect-ipc/transport/serialization";

export class MessagePackCodec implements SerializationCodec<unknown> {
  readonly name = "msgpack";
  readonly contentType = "application/x-msgpack";

  serialize(value: unknown): Buffer {
    return Buffer.from(encode(value));
  }

  deserialize(buffer: Buffer): unknown {
    return decode(buffer);
  }
}
