import { describe, expect, it } from "vitest";
import protobuf from "protobufjs";

import { ProtobufCodec } from "../src/index.js";

describe("@procwire/codec-protobuf", () => {
  it("serializes + deserializes", () => {
    const Message = new protobuf.Type("Message").add(new protobuf.Field("a", 1, "int32"));
    const codec = new ProtobufCodec<{ a: number }>(Message);
    const buf = codec.serialize({ a: 123 });
    expect(codec.deserialize(buf)).toEqual({ a: 123 });
  });
});
