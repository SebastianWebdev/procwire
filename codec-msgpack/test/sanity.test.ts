import { describe, expect, it } from "vitest";

import { MessagePackCodec } from "../src/index.js";

describe("@procwire/codec-msgpack", () => {
  it("serializes + deserializes", () => {
    const codec = new MessagePackCodec();
    const buf = codec.serialize({ a: 1 });
    expect(codec.deserialize(buf)).toEqual({ a: 1 });
  });
});
