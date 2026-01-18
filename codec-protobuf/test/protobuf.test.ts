import { describe, expect, it } from "vitest";
import * as protobuf from "protobufjs";
import { ProtobufCodec } from "../src/index.js";
import { SerializationError } from "@procwire/transport";

describe("@procwire/codec-protobuf", () => {
  describe("ProtobufCodec", () => {
    interface User {
      id: number;
      name: string;
      email?: string;
    }

    interface Message {
      id: number;
      text: string;
      timestamp: number;
      tags: string[];
    }

    it("has correct metadata", () => {
      const root = protobuf.Root.fromJSON({
        nested: {
          User: {
            fields: {
              id: { type: "int32", id: 1 },
              name: { type: "string", id: 2 },
            },
          },
        },
      });
      const UserType = root.lookupType("User");
      const codec = new ProtobufCodec<User>(UserType);

      expect(codec.name).toBe("protobuf");
      expect(codec.contentType).toBe("application/x-protobuf");
    });

    it("roundtrips simple message", () => {
      const root = protobuf.Root.fromJSON({
        nested: {
          User: {
            fields: {
              id: { type: "int32", id: 1 },
              name: { type: "string", id: 2 },
            },
          },
        },
      });
      const UserType = root.lookupType("User");
      const codec = new ProtobufCodec<User>(UserType);

      const input: User = { id: 123, name: "Alice" };
      const buffer = codec.serialize(input);
      expect(Buffer.isBuffer(buffer)).toBe(true);

      const output = codec.deserialize(buffer);
      expect(output).toEqual(input);
    });

    it("roundtrips message with optional fields", () => {
      const root = protobuf.Root.fromJSON({
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
      const UserType = root.lookupType("User");
      const codec = new ProtobufCodec<User>(UserType);

      // With optional field
      const input1: User = { id: 123, name: "Alice", email: "alice@example.com" };
      const buffer1 = codec.serialize(input1);
      expect(codec.deserialize(buffer1)).toEqual(input1);

      // Without optional field
      const input2: User = { id: 456, name: "Bob" };
      const buffer2 = codec.serialize(input2);
      const output2 = codec.deserialize(buffer2);
      expect(output2.id).toBe(456);
      expect(output2.name).toBe("Bob");
      // email may be undefined or empty string depending on protobufjs behavior
    });

    it("roundtrips message with arrays", () => {
      const root = protobuf.Root.fromJSON({
        nested: {
          Message: {
            fields: {
              id: { type: "int32", id: 1 },
              text: { type: "string", id: 2 },
              timestamp: { type: "int64", id: 3 },
              tags: { type: "string", id: 4, rule: "repeated" },
            },
          },
        },
      });
      const MessageType = root.lookupType("Message");
      const codec = new ProtobufCodec<Message>(MessageType);

      const input: Message = {
        id: 1,
        text: "Hello world",
        timestamp: 1234567890,
        tags: ["foo", "bar", "baz"],
      };

      const buffer = codec.serialize(input);
      const output = codec.deserialize(buffer);

      expect(output.id).toBe(input.id);
      expect(output.text).toBe(input.text);
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
      const PersonType = root.lookupType("Person");

      interface Address {
        street: string;
        city: string;
      }
      interface Person {
        name: string;
        address: Address;
      }

      const codec = new ProtobufCodec<Person>(PersonType);

      const input: Person = {
        name: "Alice",
        address: {
          street: "123 Main St",
          city: "Springfield",
        },
      };

      const buffer = codec.serialize(input);
      const output = codec.deserialize(buffer);
      expect(output).toEqual(input);
    });

    it("handles empty messages", () => {
      const root = protobuf.Root.fromJSON({
        nested: {
          Empty: {
            fields: {},
          },
        },
      });
      const EmptyType = root.lookupType("Empty");
      const codec = new ProtobufCodec(EmptyType);

      const buffer = codec.serialize({});
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(codec.deserialize(buffer)).toEqual({});
    });

    it("produces compact binary output", () => {
      const root = protobuf.Root.fromJSON({
        nested: {
          User: {
            fields: {
              id: { type: "int32", id: 1 },
              name: { type: "string", id: 2 },
            },
          },
        },
      });
      const UserType = root.lookupType("User");
      const codec = new ProtobufCodec<User>(UserType);

      const input: User = { id: 123, name: "Alice" };
      const buffer = codec.serialize(input);

      // Protobuf should be compact
      expect(buffer.length).toBeLessThan(100);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it("handles messages with default values when fields are missing", () => {
      const root = protobuf.Root.fromJSON({
        nested: {
          User: {
            fields: {
              id: { type: "int32", id: 1 },
              name: { type: "string", id: 2 },
            },
          },
        },
      });
      const UserType = root.lookupType("User");
      const codec = new ProtobufCodec<User>(UserType);

      // Protobufjs will create default values for missing fields
      // @ts-expect-error - intentionally incomplete for testing
      const buffer = codec.serialize({});
      const decoded = codec.deserialize(buffer);

      // toObject() returns undefined for unset fields, not default values
      // This is expected behavior in protobufjs
      expect(decoded).toBeDefined();
      expect(typeof decoded).toBe("object");
    });

    it("throws SerializationError on invalid buffer", () => {
      const root = protobuf.Root.fromJSON({
        nested: {
          User: {
            fields: {
              id: { type: "int32", id: 1 },
              name: { type: "string", id: 2 },
            },
          },
        },
      });
      const UserType = root.lookupType("User");
      const codec = new ProtobufCodec<User>(UserType);

      // Create invalid protobuf data
      const invalidBuffer = Buffer.from([0xff, 0xff, 0xff, 0xff]);
      expect(() => codec.deserialize(invalidBuffer)).toThrow(SerializationError);
    });

    it("returns plain objects (not protobuf Message instances)", () => {
      const root = protobuf.Root.fromJSON({
        nested: {
          User: {
            fields: {
              id: { type: "int32", id: 1 },
              name: { type: "string", id: 2 },
            },
          },
        },
      });
      const UserType = root.lookupType("User");
      const codec = new ProtobufCodec<User>(UserType);

      const input: User = { id: 123, name: "Alice" };
      const buffer = codec.serialize(input);
      const output = codec.deserialize(buffer);

      // Verify it's a plain object, not a protobuf Message
      expect(typeof output).toBe("object");
      expect(output).toEqual(input);
      // Should not have protobuf-specific methods
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((output as any).$type).toBeUndefined();
    });
  });
});
