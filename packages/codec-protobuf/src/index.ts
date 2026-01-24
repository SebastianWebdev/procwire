/**
 * Protocol Buffers serialization codec for @procwire/transport.
 *
 * Provides type-safe, schema-validated binary serialization using Protocol Buffers (protobuf).
 * This codec uses the `protobufjs` library and implements the {@link SerializationCodec}
 * interface for seamless integration with @procwire/transport channels.
 *
 * ## Features
 *
 * - **Type-safe serialization** - Generic type parameter ensures compile-time safety
 * - **Schema validation** - Messages are validated against protobuf schema
 * - **Compact binary format** - Typically 3-10x smaller than JSON
 * - **Cross-language support** - Compatible with protobuf in any language
 * - **Configurable options** - Control Long/enum/bytes conversion
 * - **Zero-copy optimization** - Minimizes memory allocations
 *
 * ## Quick Start
 *
 * ```ts
 * import * as protobuf from 'protobufjs';
 * import { ProtobufCodec } from '@procwire/codec-protobuf';
 *
 * // Define schema inline
 * const root = protobuf.Root.fromJSON({
 *   nested: {
 *     User: {
 *       fields: {
 *         id: { type: 'int32', id: 1 },
 *         name: { type: 'string', id: 2 },
 *         email: { type: 'string', id: 3 }
 *       }
 *     }
 *   }
 * });
 *
 * interface User {
 *   id: number;
 *   name: string;
 *   email: string;
 * }
 *
 * const codec = new ProtobufCodec<User>(root.lookupType('User'));
 * const buffer = codec.serialize({ id: 1, name: 'Alice', email: 'alice@example.com' });
 * const user = codec.deserialize(buffer);
 * ```
 *
 * ## Loading .proto Files
 *
 * For production use, load schemas from .proto files:
 *
 * ```ts
 * import { createCodecFromProto } from '@procwire/codec-protobuf';
 *
 * const codec = await createCodecFromProto<User>(
 *   './schemas/user.proto',
 *   'mypackage.User'
 * );
 * ```
 *
 * ## Integration with @procwire/transport
 *
 * ```ts
 * import { ProtobufCodec } from '@procwire/codec-protobuf';
 * import { RequestChannel } from '@procwire/transport/channel';
 *
 * const channel = new RequestChannel({
 *   transport,
 *   framing,
 *   serialization: new ProtobufCodec<MyMessage>(messageType),
 *   protocol
 * });
 * ```
 *
 * @packageDocumentation
 * @module @procwire/codec-protobuf
 */

// Main class and options
export { ProtobufCodec } from "./codec.js";
export type { ProtobufCodecOptions } from "./codec.js";

// Helper functions
export { createCodecFromProto, createCodecFromJSON } from "./helpers.js";

/**
 * Re-export of Type from protobufjs.
 *
 * The Type class represents a protobuf message type. Use it to define
 * the schema for {@link ProtobufCodec}. You can obtain a Type instance
 * by calling `root.lookupType('MessageName')` on a protobufjs Root.
 *
 * @see {@link https://protobufjs.github.io/protobuf.js/Type.html | protobufjs Type documentation}
 */
export type { Type } from "protobufjs";

/**
 * Re-export of Root from protobufjs.
 *
 * The Root class is the root of a protobuf namespace hierarchy.
 * Use `Root.fromJSON()` for inline schemas or `protobuf.load()` for .proto files.
 *
 * @see {@link https://protobufjs.github.io/protobuf.js/Root.html | protobufjs Root documentation}
 */
export type { Root } from "protobufjs";

/**
 * Re-export of Field from protobufjs.
 *
 * The Field class represents a single field in a protobuf message.
 * Useful for advanced reflection and schema inspection.
 *
 * @see {@link https://protobufjs.github.io/protobuf.js/Field.html | protobufjs Field documentation}
 */
export type { Field } from "protobufjs";

/**
 * Re-export of INamespace from protobufjs.
 *
 * The INamespace interface represents a protobuf namespace definition
 * in JSON format. Use with `Root.fromJSON()` to create inline schemas.
 *
 * @example
 * ```ts
 * const schema: INamespace = {
 *   nested: {
 *     User: {
 *       fields: {
 *         id: { type: 'int32', id: 1 },
 *         name: { type: 'string', id: 2 }
 *       }
 *     }
 *   }
 * };
 * ```
 *
 * @see {@link createCodecFromJSON} for creating codecs from JSON schemas
 */
export type { INamespace } from "protobufjs";
