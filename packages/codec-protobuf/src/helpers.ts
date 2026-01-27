/**
 * Helper functions for creating ProtobufCodec instances.
 *
 * @remarks
 * This is an internal module. Import from `@procwire/codec-protobuf` instead.
 *
 * @internal
 */

import protobufModule from "protobufjs";
import { ProtobufCodec, type ProtobufCodecOptions } from "./codec.js";

// Handle protobufjs ESM/CJS interop - the module exports everything via default
const protobuf = (protobufModule as { default?: typeof protobufModule }).default ?? protobufModule;

/**
 * Creates a ProtobufCodec by loading a .proto file.
 *
 * This is the recommended way to create a codec for production use,
 * as it loads the schema from a standard .proto file that can be
 * shared with other languages and tools.
 *
 * @typeParam T - TypeScript interface matching the protobuf message structure.
 *
 * @param protoPath - Path to the .proto file. Can be absolute or relative
 *                    to the current working directory.
 * @param messageName - Fully qualified message name including package
 *                      (e.g., `"mypackage.MyMessage"`). For messages without
 *                      a package, use just the message name (e.g., `"User"`).
 * @param options - Optional codec configuration. See {@link ProtobufCodecOptions}.
 *
 * @returns Promise resolving to the configured codec instance.
 *
 * @throws {Error} When the .proto file cannot be found or parsed.
 * @throws {Error} When the message name doesn't exist in the schema.
 *
 * @example Basic usage
 * ```ts
 * import { createCodecFromProto } from '@procwire/codec-protobuf';
 *
 * // user.proto:
 * // syntax = "proto3";
 * // package myapp;
 * // message User {
 * //   int32 id = 1;
 * //   string name = 2;
 * //   string email = 3;
 * // }
 *
 * interface User {
 *   id: number;
 *   name: string;
 *   email: string;
 * }
 *
 * const codec = await createCodecFromProto<User>(
 *   './schemas/user.proto',
 *   'myapp.User'
 * );
 *
 * const buffer = codec.serialize({ id: 1, name: 'Alice', email: 'alice@example.com' });
 * const user = codec.deserialize(buffer);
 * ```
 *
 * @example With options
 * ```ts
 * const codec = await createCodecFromProto<Message>(
 *   './schemas/message.proto',
 *   'myapp.Message',
 *   {
 *     longs: String,    // Convert int64 to string
 *     enums: String,    // Convert enums to names
 *     defaults: true,   // Include default values
 *   }
 * );
 * ```
 *
 * @example Loading nested messages
 * ```ts
 * // schema.proto:
 * // package api;
 * // message Outer {
 * //   message Inner {
 * //     string value = 1;
 * //   }
 * // }
 *
 * const codec = await createCodecFromProto<Inner>(
 *   './schema.proto',
 *   'api.Outer.Inner' // Use dot notation for nested messages
 * );
 * ```
 *
 * @example Error handling
 * ```ts
 * try {
 *   const codec = await createCodecFromProto<User>(
 *     './missing.proto',
 *     'User'
 *   );
 * } catch (error) {
 *   console.error('Failed to load schema:', error.message);
 * }
 * ```
 *
 * @see {@link createCodecFromJSON} for inline JSON schemas
 * @see {@link ProtobufCodec} for the underlying codec class
 */
export async function createCodecFromProto<T>(
  protoPath: string,
  messageName: string,
  options?: ProtobufCodecOptions,
): Promise<ProtobufCodec<T>> {
  const root = await protobuf.load(protoPath);
  const messageType = root.lookupType(messageName);
  return new ProtobufCodec<T>(messageType, options);
}

/**
 * Creates a ProtobufCodec from an inline JSON schema definition.
 *
 * Use this function when you want to define the schema programmatically
 * without external .proto files. This is useful for:
 * - Simple schemas that don't need external files
 * - Dynamic schema generation
 * - Testing and prototyping
 *
 * @typeParam T - TypeScript interface matching the protobuf message structure.
 *
 * @param schema - Protobuf schema as JSON in the protobufjs `INamespace` format.
 *                 Use the `nested` property to define messages and their fields.
 * @param messageName - Message name to lookup in the schema. For schemas without
 *                      a package, use the direct message name.
 * @param options - Optional codec configuration. See {@link ProtobufCodecOptions}.
 *
 * @returns Configured codec instance.
 *
 * @throws {Error} When the message name doesn't exist in the schema.
 *
 * @example Basic usage
 * ```ts
 * import { createCodecFromJSON } from '@procwire/codec-protobuf';
 *
 * interface User {
 *   id: number;
 *   name: string;
 *   email: string;
 * }
 *
 * const codec = createCodecFromJSON<User>(
 *   {
 *     nested: {
 *       User: {
 *         fields: {
 *           id: { type: 'int32', id: 1 },
 *           name: { type: 'string', id: 2 },
 *           email: { type: 'string', id: 3 }
 *         }
 *       }
 *     }
 *   },
 *   'User'
 * );
 *
 * const buffer = codec.serialize({ id: 1, name: 'Alice', email: 'alice@example.com' });
 * const user = codec.deserialize(buffer);
 * ```
 *
 * @example With nested messages
 * ```ts
 * interface Order {
 *   id: number;
 *   items: OrderItem[];
 * }
 *
 * interface OrderItem {
 *   productId: number;
 *   quantity: number;
 * }
 *
 * const codec = createCodecFromJSON<Order>(
 *   {
 *     nested: {
 *       Order: {
 *         fields: {
 *           id: { type: 'int32', id: 1 },
 *           items: { rule: 'repeated', type: 'OrderItem', id: 2 }
 *         }
 *       },
 *       OrderItem: {
 *         fields: {
 *           productId: { type: 'int32', id: 1 },
 *           quantity: { type: 'int32', id: 2 }
 *         }
 *       }
 *     }
 *   },
 *   'Order'
 * );
 * ```
 *
 * @example With enums
 * ```ts
 * interface Task {
 *   id: number;
 *   status: number | string; // Depends on codec options
 * }
 *
 * const codec = createCodecFromJSON<Task>(
 *   {
 *     nested: {
 *       Status: {
 *         values: {
 *           PENDING: 0,
 *           IN_PROGRESS: 1,
 *           COMPLETED: 2
 *         }
 *       },
 *       Task: {
 *         fields: {
 *           id: { type: 'int32', id: 1 },
 *           status: { type: 'Status', id: 2 }
 *         }
 *       }
 *     }
 *   },
 *   'Task',
 *   { enums: String } // Convert enum to name string
 * );
 * ```
 *
 * @example With options
 * ```ts
 * const codec = createCodecFromJSON<Message>(
 *   schema,
 *   'Message',
 *   {
 *     longs: Number,          // Use numbers for int64 (be careful with precision)
 *     defaults: true,         // Include default values in output
 *     verifyOnSerialize: true // Validate before encoding
 *   }
 * );
 * ```
 *
 * @see {@link createCodecFromProto} for loading .proto files
 * @see {@link ProtobufCodec} for the underlying codec class
 * @see {@link https://protobufjs.github.io/protobuf.js/ | protobufjs documentation}
 */
export function createCodecFromJSON<T>(
  schema: protobuf.INamespace,
  messageName: string,
  options?: ProtobufCodecOptions,
): ProtobufCodec<T> {
  const root = protobuf.Root.fromJSON(schema);
  const messageType = root.lookupType(messageName);
  return new ProtobufCodec<T>(messageType, options);
}
