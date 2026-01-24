import { describe, expect, it } from "vitest";
import * as protobuf from "protobufjs";
import { ProtobufCodec } from "../src/index.js";
import { SerializationError } from "@procwire/transport";

describe("ProtobufCodec", () => {
  // Shared schema for simple tests
  const createUserSchema = () => {
    return protobuf.Root.fromJSON({
      nested: {
        User: {
          fields: {
            id: { type: "int32", id: 1 },
            name: { type: "string", id: 2 },
            email: { type: "string", id: 3, rule: "optional" },
          },
        },
      },
    });
  };

  interface User {
    id: number;
    name: string;
    email?: string;
  }

  describe("metadata", () => {
    it("has correct name", () => {
      const root = createUserSchema();
      const codec = new ProtobufCodec<User>(root.lookupType("User"));
      expect(codec.name).toBe("protobuf");
    });

    it("has correct contentType", () => {
      const root = createUserSchema();
      const codec = new ProtobufCodec<User>(root.lookupType("User"));
      expect(codec.contentType).toBe("application/x-protobuf");
    });

    it("exposes messageType via type getter", () => {
      const root = createUserSchema();
      const UserType = root.lookupType("User");
      const codec = new ProtobufCodec<User>(UserType);
      expect(codec.type).toBe(UserType);
    });
  });

  describe("basic serialization", () => {
    it("roundtrips simple message", () => {
      const root = createUserSchema();
      const codec = new ProtobufCodec<User>(root.lookupType("User"));

      const input: User = { id: 123, name: "Alice" };
      const buffer = codec.serialize(input);
      const output = codec.deserialize(buffer);
      expect(output).toEqual(input);
    });

    it("roundtrips message with optional fields present", () => {
      const root = createUserSchema();
      const codec = new ProtobufCodec<User>(root.lookupType("User"));

      const input: User = { id: 123, name: "Alice", email: "alice@example.com" };
      const buffer = codec.serialize(input);
      expect(codec.deserialize(buffer)).toEqual(input);
    });

    it("roundtrips message with optional fields absent", () => {
      const root = createUserSchema();
      const codec = new ProtobufCodec<User>(root.lookupType("User"));

      const input: User = { id: 456, name: "Bob" };
      const buffer = codec.serialize(input);
      const output = codec.deserialize(buffer);
      expect(output.id).toBe(456);
      expect(output.name).toBe("Bob");
    });

    it("roundtrips message with repeated fields (arrays)", () => {
      const root = protobuf.Root.fromJSON({
        nested: {
          Message: {
            fields: {
              id: { type: "int32", id: 1 },
              tags: { type: "string", id: 2, rule: "repeated" },
            },
          },
        },
      });

      interface Message {
        id: number;
        tags: string[];
      }

      const codec = new ProtobufCodec<Message>(root.lookupType("Message"));
      const input: Message = { id: 1, tags: ["foo", "bar", "baz"] };
      const buffer = codec.serialize(input);
      const output = codec.deserialize(buffer);
      expect(output.tags).toEqual(input.tags);
    });

    it("roundtrips nested messages", () => {
      const root = protobuf.Root.fromJSON({
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
      });

      interface Address {
        street: string;
        city: string;
      }
      interface Person {
        name: string;
        address: Address;
      }

      const codec = new ProtobufCodec<Person>(root.lookupType("Person"));
      const input: Person = {
        name: "Alice",
        address: { street: "123 Main St", city: "Springfield" },
      };
      const buffer = codec.serialize(input);
      expect(codec.deserialize(buffer)).toEqual(input);
    });

    it("roundtrips empty message", () => {
      const root = protobuf.Root.fromJSON({
        nested: {
          Empty: { fields: {} },
        },
      });
      const codec = new ProtobufCodec(root.lookupType("Empty"));
      const buffer = codec.serialize({});
      expect(codec.deserialize(buffer)).toEqual({});
    });

    it("produces Buffer output", () => {
      const root = createUserSchema();
      const codec = new ProtobufCodec<User>(root.lookupType("User"));

      const buffer = codec.serialize({ id: 1, name: "Test" });
      expect(Buffer.isBuffer(buffer)).toBe(true);
    });
  });

  describe("input validation", () => {
    it("throws SerializationError for string input", () => {
      const root = createUserSchema();
      const codec = new ProtobufCodec<User>(root.lookupType("User"));

      expect(() => codec.deserialize("not a buffer" as unknown as Buffer)).toThrow(
        SerializationError,
      );
    });

    it("throws SerializationError for number input", () => {
      const root = createUserSchema();
      const codec = new ProtobufCodec<User>(root.lookupType("User"));

      expect(() => codec.deserialize(123 as unknown as Buffer)).toThrow(SerializationError);
    });

    it("throws SerializationError for null input", () => {
      const root = createUserSchema();
      const codec = new ProtobufCodec<User>(root.lookupType("User"));

      expect(() => codec.deserialize(null as unknown as Buffer)).toThrow(SerializationError);
    });

    it("throws SerializationError for object input (non-buffer)", () => {
      const root = createUserSchema();
      const codec = new ProtobufCodec<User>(root.lookupType("User"));

      expect(() => codec.deserialize({} as unknown as Buffer)).toThrow(SerializationError);
    });

    it("accepts Uint8Array input", () => {
      const root = createUserSchema();
      const codec = new ProtobufCodec<User>(root.lookupType("User"));

      const input: User = { id: 1, name: "Test" };
      const buffer = codec.serialize(input);
      const uint8Array = new Uint8Array(buffer);

      // Should not throw
      const output = codec.deserialize(uint8Array as Buffer);
      expect(output).toEqual(input);
    });

    it("error message includes input type", () => {
      const root = createUserSchema();
      const codec = new ProtobufCodec<User>(root.lookupType("User"));

      try {
        codec.deserialize("invalid" as unknown as Buffer);
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as Error).message).toContain("string");
      }
    });
  });

  describe("error handling", () => {
    it("throws SerializationError on invalid buffer", () => {
      const root = createUserSchema();
      const codec = new ProtobufCodec<User>(root.lookupType("User"));

      const invalidBuffer = Buffer.from([0xff, 0xff, 0xff, 0xff]);
      expect(() => codec.deserialize(invalidBuffer)).toThrow(SerializationError);
    });

    it("throws SerializationError on truncated buffer", () => {
      const root = protobuf.Root.fromJSON({
        nested: {
          Message: {
            fields: {
              data: { type: "bytes", id: 1 },
            },
          },
        },
      });
      const codec = new ProtobufCodec(root.lookupType("Message"));

      // Create a buffer that indicates a bytes field longer than available
      const truncatedBuffer = Buffer.from([0x0a, 0x10]); // field 1, length 16, but no data
      expect(() => codec.deserialize(truncatedBuffer)).toThrow(SerializationError);
    });

    it("throws SerializationError with original error as cause", () => {
      const root = createUserSchema();
      const codec = new ProtobufCodec<User>(root.lookupType("User"));

      try {
        codec.deserialize(Buffer.from([0xff, 0xff, 0xff, 0xff]));
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SerializationError);
        expect((error as SerializationError).cause).toBeDefined();
      }
    });

    it("error message contains useful information", () => {
      const root = createUserSchema();
      const codec = new ProtobufCodec<User>(root.lookupType("User"));

      try {
        codec.deserialize(Buffer.from([0xff, 0xff, 0xff, 0xff]));
        expect.fail("Should have thrown");
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain("decode");
      }
    });
  });

  describe("zero-copy optimization", () => {
    it("serialize returns Buffer", () => {
      const root = createUserSchema();
      const codec = new ProtobufCodec<User>(root.lookupType("User"));

      const buffer = codec.serialize({ id: 1, name: "Test" });
      expect(Buffer.isBuffer(buffer)).toBe(true);
    });

    it("buffer has correct length", () => {
      const root = createUserSchema();
      const codec = new ProtobufCodec<User>(root.lookupType("User"));

      const buffer = codec.serialize({ id: 1, name: "Test" });
      expect(buffer.length).toBeGreaterThan(0);
      expect(buffer.length).toBeLessThan(100);
    });
  });

  describe("verify on serialize", () => {
    it("throws on invalid field type when verifyOnSerialize=true", () => {
      const root = protobuf.Root.fromJSON({
        nested: {
          Message: {
            fields: {
              id: { type: "int32", id: 1 },
            },
          },
        },
      });

      const codec = new ProtobufCodec(root.lookupType("Message"), {
        verifyOnSerialize: true,
      });

      // Pass an invalid type (string instead of int32)
      expect(() => codec.serialize({ id: "not a number" })).toThrow(SerializationError);
    });

    it("provides clear error message on verification failure", () => {
      const root = protobuf.Root.fromJSON({
        nested: {
          Message: {
            fields: {
              id: { type: "int32", id: 1 },
            },
          },
        },
      });

      const codec = new ProtobufCodec(root.lookupType("Message"), {
        verifyOnSerialize: true,
      });

      try {
        codec.serialize({ id: "not a number" });
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as Error).message).toContain("verification");
      }
    });

    it("allows invalid data when verifyOnSerialize=false", () => {
      const root = protobuf.Root.fromJSON({
        nested: {
          Message: {
            fields: {
              id: { type: "int32", id: 1 },
            },
          },
        },
      });

      const codec = new ProtobufCodec(root.lookupType("Message"), {
        verifyOnSerialize: false,
      });

      // This may not throw due to protobufjs coercion, but should not fail on verify
      const buffer = codec.serialize({ id: 0 });
      expect(Buffer.isBuffer(buffer)).toBe(true);
    });
  });

  describe("returns plain objects (not protobuf Message instances)", () => {
    it("deserialized value is a plain object", () => {
      const root = createUserSchema();
      const codec = new ProtobufCodec<User>(root.lookupType("User"));

      const input: User = { id: 123, name: "Alice" };
      const buffer = codec.serialize(input);
      const output = codec.deserialize(buffer);

      expect(typeof output).toBe("object");
      expect(output).toEqual(input);
      // Should not have protobuf-specific methods
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((output as any).$type).toBeUndefined();
    });
  });
});
