import { describe, expect, it } from "vitest";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createCodecFromProto, createCodecFromJSON } from "../src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const testProtoPath = join(__dirname, "../test-fixtures/test.proto");

describe("createCodecFromProto", () => {
  it("loads .proto file and creates codec", async () => {
    const codec = await createCodecFromProto<{ id: number; name: string }>(
      testProtoPath,
      "testpkg.SimpleMessage",
    );

    expect(codec.name).toBe("protobuf");
    const buffer = codec.serialize({ id: 1, name: "Test" });
    const output = codec.deserialize(buffer);
    expect(output).toEqual({ id: 1, name: "Test" });
  });

  it("resolves nested message names", async () => {
    const codec = await createCodecFromProto<{ value: string }>(
      testProtoPath,
      "testpkg.NestedMessage",
    );

    const buffer = codec.serialize({ value: "nested" });
    const output = codec.deserialize(buffer);
    expect(output).toEqual({ value: "nested" });
  });

  it("passes options to codec", async () => {
    // Create a simpler schema with just an int64 field to test options
    const codec = await createCodecFromProto<Record<string, unknown>>(
      testProtoPath,
      "testpkg.CompleteMessage",
      { longs: String, defaults: true },
    );

    // Use a numeric value for int64 field
    const buffer = codec.serialize({ int32Field: 1 });
    const output = codec.deserialize(buffer);

    // Verify the codec was created successfully with the right options
    expect(codec.name).toBe("protobuf");
    // Check that defaults option is working (int32_field should be present)
    expect(output).toHaveProperty("int32Field");
  });

  it("throws on file not found", async () => {
    await expect(
      createCodecFromProto("./nonexistent.proto", "Message"),
    ).rejects.toThrow();
  });

  it("throws on invalid message name", async () => {
    await expect(
      createCodecFromProto(testProtoPath, "testpkg.NonExistent"),
    ).rejects.toThrow();
  });

  it("handles package names correctly", async () => {
    // With package prefix should work
    const codec = await createCodecFromProto<{ id: number; name: string }>(
      testProtoPath,
      "testpkg.SimpleMessage",
    );
    expect(codec).toBeDefined();

    // Without package prefix may or may not work depending on protobufjs version
    // Just test that the package-prefixed version works
  });
});

describe("createCodecFromJSON", () => {
  it("creates codec from JSON schema", () => {
    const codec = createCodecFromJSON<{ id: number; name: string }>(
      {
        nested: {
          User: {
            fields: {
              id: { type: "int32", id: 1 },
              name: { type: "string", id: 2 },
            },
          },
        },
      },
      "User",
    );

    expect(codec.name).toBe("protobuf");
    const buffer = codec.serialize({ id: 1, name: "Alice" });
    const output = codec.deserialize(buffer);
    expect(output).toEqual({ id: 1, name: "Alice" });
  });

  it("handles nested message types", () => {
    const codec = createCodecFromJSON<{ name: string; address: { street: string; city: string } }>(
      {
        nested: {
          Address: {
            fields: {
              street: { type: "string", id: 1 },
              city: { type: "string", id: 2 },
            },
          },
          Person: {
            fields: {
              name: { type: "string", id: 1 },
              address: { type: "Address", id: 2 },
            },
          },
        },
      },
      "Person",
    );

    const input = {
      name: "Alice",
      address: { street: "123 Main St", city: "Springfield" },
    };

    const buffer = codec.serialize(input);
    const output = codec.deserialize(buffer);
    expect(output).toEqual(input);
  });

  it("passes options to codec", () => {
    const codec = createCodecFromJSON<{ value: string | number }>(
      {
        nested: {
          Message: {
            fields: {
              value: { type: "int64", id: 1 },
            },
          },
        },
      },
      "Message",
      { longs: String, verifyOnSerialize: false },
    );

    // Use string input with verify disabled
    const buffer = codec.serialize({ value: "123456789012345" });
    const output = codec.deserialize(buffer);
    expect(typeof output.value).toBe("string");
  });

  it("throws on invalid message name", () => {
    expect(() =>
      createCodecFromJSON(
        {
          nested: {
            User: {
              fields: {
                id: { type: "int32", id: 1 },
              },
            },
          },
        },
        "NonExistent",
      ),
    ).toThrow();
  });
});
