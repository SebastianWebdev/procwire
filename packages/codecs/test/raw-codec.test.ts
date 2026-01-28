import { describe, it, expect } from "vitest";
import {
  RawCodec,
  RawChunksCodec,
  rawCodec,
  rawChunksCodec,
  codecDeserialize,
} from "../src/index.js";
import type { Codec } from "../src/index.js";

describe("RawCodec", () => {
  describe("serialize", () => {
    it("should return the same buffer", () => {
      const codec = new RawCodec();
      const input = Buffer.from("hello");

      const result = codec.serialize(input);

      expect(result).toBe(input); // Same reference
    });

    it("should throw on non-Buffer input", () => {
      const codec = new RawCodec();

      expect(() => codec.serialize("string" as unknown as Buffer)).toThrow(TypeError);
      expect(() => codec.serialize({ data: "obj" } as unknown as Buffer)).toThrow(TypeError);
    });
  });

  describe("deserialize", () => {
    it("should return the same buffer", () => {
      const codec = new RawCodec();
      const input = Buffer.from("world");

      const result = codec.deserialize(input);

      expect(result).toBe(input); // Same reference
    });
  });

  describe("deserializeChunks", () => {
    it("should return single chunk without copy", () => {
      const codec = new RawCodec();
      const chunk = Buffer.from("single");

      const result = codec.deserializeChunks([chunk]);

      expect(result).toBe(chunk); // Same reference - no copy!
    });

    it("should return empty buffer for empty chunks", () => {
      const codec = new RawCodec();

      const result = codec.deserializeChunks([]);

      expect(result.length).toBe(0);
    });

    it("should merge multiple chunks (allocation)", () => {
      const codec = new RawCodec();
      const chunks = [Buffer.from("A"), Buffer.from("B"), Buffer.from("C")];

      const result = codec.deserializeChunks(chunks);

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.toString()).toBe("ABC");
      expect(result).not.toBe(chunks[0]); // NEW buffer
    });
  });

  describe("name property", () => {
    it("should have correct name", () => {
      expect(new RawCodec().name).toBe("raw");
      expect(rawCodec.name).toBe("raw");
    });
  });
});

describe("RawChunksCodec", () => {
  describe("serialize", () => {
    it("should return single chunk directly", () => {
      const codec = new RawChunksCodec();
      const chunk = Buffer.from("single");

      const result = codec.serialize([chunk]);

      expect(result).toBe(chunk); // Same reference
    });

    it("should return empty buffer for empty array", () => {
      const codec = new RawChunksCodec();

      const result = codec.serialize([]);

      expect(result.length).toBe(0);
    });

    it("should concatenate multiple chunks", () => {
      const codec = new RawChunksCodec();
      const chunks = [Buffer.from("A"), Buffer.from("B")];

      const result = codec.serialize(chunks);

      expect(result.toString()).toBe("AB");
    });

    it("should throw on non-array input", () => {
      const codec = new RawChunksCodec();

      expect(() => codec.serialize(Buffer.from("bad") as unknown as Buffer[])).toThrow(TypeError);
    });
  });

  describe("deserialize", () => {
    it("should wrap buffer in array", () => {
      const codec = new RawChunksCodec();
      const buffer = Buffer.from("data");

      const result = codec.deserialize(buffer);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0]).toBe(buffer); // Same reference
    });
  });

  describe("deserializeChunks - ZERO COPY", () => {
    it("should preserve chunks structure without copying data", () => {
      const codec = new RawChunksCodec();
      const chunks = [Buffer.from("A"), Buffer.from("B")];

      const result = codec.deserializeChunks(chunks);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);

      // CRITICAL: Verify referential equality (zero-copy!)
      expect(result[0]).toBe(chunks[0]);
      expect(result[1]).toBe(chunks[1]);
    });

    it("should handle single chunk", () => {
      const codec = new RawChunksCodec();
      const chunk = Buffer.from("single");
      const chunks = [chunk];

      const result = codec.deserializeChunks(chunks);

      expect(result[0]).toBe(chunk);
    });

    it("should handle empty chunks", () => {
      const codec = new RawChunksCodec();

      const result = codec.deserializeChunks([]);

      expect(result.length).toBe(0);
    });

    it("should return new array (not same reference)", () => {
      const codec = new RawChunksCodec();
      const chunks = [Buffer.from("test")];

      const result = codec.deserializeChunks(chunks);

      // Array itself is new (shallow copy)
      expect(result).not.toBe(chunks);
      // But buffer references are preserved (zero-copy!)
      expect(result[0]).toBe(chunks[0]);
    });
  });

  describe("name property", () => {
    it("should have correct name", () => {
      expect(new RawChunksCodec().name).toBe("raw-chunks");
      expect(rawChunksCodec.name).toBe("raw-chunks");
    });
  });
});

describe("codecDeserialize helper", () => {
  it("should use deserializeChunks when available", () => {
    const codec = new RawChunksCodec();
    const chunks = [Buffer.from("A"), Buffer.from("B")];
    const frame = {
      payload: Buffer.concat(chunks),
      payloadChunks: chunks,
    };

    const result = codecDeserialize(codec, frame);

    // Used chunks, not payload - verify by reference
    expect(result[0]).toBe(chunks[0]);
    expect(result[1]).toBe(chunks[1]);
  });

  it("should fall back to deserialize when deserializeChunks not available", () => {
    // Create codec without deserializeChunks
    const codec: Codec<Buffer, Buffer> = {
      name: "test-no-chunks",
      serialize: (data) => data,
      deserialize: (buffer) => buffer,
      // No deserializeChunks!
    };

    const payload = Buffer.from("test data");
    const frame = {
      payload,
      payloadChunks: [Buffer.from("test "), Buffer.from("data")],
    };

    const result = codecDeserialize(codec, frame);

    // Should use payload, not chunks
    expect(result).toBe(payload);
  });

  it("should work with RawCodec", () => {
    const chunks = [Buffer.from("hello"), Buffer.from(" world")];
    const frame = {
      payload: Buffer.concat(chunks),
      payloadChunks: chunks,
    };

    const result = codecDeserialize(rawCodec, frame);

    // RawCodec.deserializeChunks merges chunks
    expect(result.toString()).toBe("hello world");
  });
});

describe("Singleton instances", () => {
  it("rawCodec should be a RawCodec instance", () => {
    expect(rawCodec).toBeInstanceOf(RawCodec);
  });

  it("rawChunksCodec should be a RawChunksCodec instance", () => {
    expect(rawChunksCodec).toBeInstanceOf(RawChunksCodec);
  });
});

describe("Codec interface compliance", () => {
  it("RawCodec should implement Codec<Buffer, Buffer>", () => {
    const codec: Codec<Buffer, Buffer> = new RawCodec();

    expect(codec.name).toBeDefined();
    expect(typeof codec.serialize).toBe("function");
    expect(typeof codec.deserialize).toBe("function");
    expect(typeof codec.deserializeChunks).toBe("function");
  });

  it("RawChunksCodec should implement Codec<Buffer[], Buffer[]>", () => {
    const codec: Codec<Buffer[], Buffer[]> = new RawChunksCodec();

    expect(codec.name).toBeDefined();
    expect(typeof codec.serialize).toBe("function");
    expect(typeof codec.deserialize).toBe("function");
    expect(typeof codec.deserializeChunks).toBe("function");
  });
});
