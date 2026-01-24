/**
 * Helper functions for creating ProtobufCodec instances.
 *
 * @module Helpers
 */

import * as protobuf from "protobufjs";
import { ProtobufCodec, type ProtobufCodecOptions } from "./codec.js";

/**
 * Creates a ProtobufCodec by loading a .proto file.
 *
 * @param protoPath - Path to the .proto file
 * @param messageName - Fully qualified message name (e.g., "mypackage.MyMessage")
 * @param options - Optional codec configuration
 * @returns Promise resolving to the configured codec
 *
 * @example
 * ```ts
 * const codec = await createCodecFromProto<User>(
 *   './schemas/user.proto',
 *   'myapp.User',
 *   { longs: String }
 * );
 * ```
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
 * @param schema - Protobuf schema as JSON (INamespace format)
 * @param messageName - Message name to lookup in the schema
 * @param options - Optional codec configuration
 * @returns Configured codec instance
 *
 * @example
 * ```ts
 * const codec = createCodecFromJSON<User>(
 *   {
 *     nested: {
 *       User: {
 *         fields: {
 *           id: { type: 'int32', id: 1 },
 *           name: { type: 'string', id: 2 }
 *         }
 *       }
 *     }
 *   },
 *   'User'
 * );
 * ```
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
