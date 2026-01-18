import { describe, expect, it } from "vitest";
import { tableFromArrays } from "apache-arrow";

import { ArrowCodec } from "../src/index.js";

describe("@aspect-ipc/codec-arrow", () => {
  it("serializes + deserializes", () => {
    const codec = new ArrowCodec();
    const table = tableFromArrays({ a: [1, 2, 3] });
    const buf = codec.serialize(table);
    const decoded = codec.deserialize(buf);
    expect(decoded.numRows).toBe(3);
  });
});
