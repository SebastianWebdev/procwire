/**
 * MessagePack binary serialization codec for @procwire/transport.
 *
 * Provides efficient binary serialization using the MessagePack format,
 * which is typically 20-50% smaller and 2-5x faster than JSON. This codec
 * implements the {@link SerializationCodec} interface for seamless integration
 * with @procwire/transport channels.
 *
 * ## Features
 *
 * - **Compact binary format** - 20-50% smaller than JSON
 * - **Fast serialization** - 2-5x faster than JSON.stringify/parse
 * - **Type preservation** - Supports Buffer, TypedArray, and binary data
 * - **Extension types** - Optional support for Date, Map, Set, BigInt
 * - **Zero-copy optimization** - Minimizes memory allocations
 * - **Configurable** - Buffer size, key sorting, and custom extensions
 *
 * ## Quick Start
 *
 * ```ts
 * import { MessagePackCodec } from '@procwire/codec-msgpack';
 *
 * const codec = new MessagePackCodec();
 * const buffer = codec.serialize({ hello: 'world', count: 42 });
 * const data = codec.deserialize(buffer);
 * ```
 *
 * ## Supported Types
 *
 * Out of the box, MessagePackCodec supports:
 * - Primitives: `string`, `number`, `boolean`, `null`
 * - Containers: `object`, `array` (nested)
 * - Binary: `Buffer`, `Uint8Array`, `TypedArray`
 * - Special: `undefined` (encoded as `null`)
 *
 * ## Extended Type Support
 *
 * For `Date`, `Map`, `Set`, and `BigInt` support, use {@link createExtendedCodec}:
 *
 * ```ts
 * import { createExtendedCodec } from '@procwire/codec-msgpack';
 *
 * const codec = createExtendedCodec();
 * const data = {
 *   createdAt: new Date(),
 *   tags: new Set(['a', 'b']),
 *   metadata: new Map([['key', 'value']]),
 *   bigNumber: BigInt('9007199254740993')
 * };
 * const buffer = codec.serialize(data);
 * ```
 *
 * ## Integration with @procwire/transport
 *
 * ```ts
 * import { MessagePackCodec } from '@procwire/codec-msgpack';
 * import { RequestChannel } from '@procwire/transport/channel';
 *
 * const channel = new RequestChannel({
 *   transport,
 *   framing,
 *   serialization: new MessagePackCodec(),
 *   protocol
 * });
 * ```
 *
 * @packageDocumentation
 * @module codec-msgpack
 */

// Main codec class and options
export { MessagePackCodec } from "./codec.js";
export type { MessagePackCodecOptions } from "./codec.js";

// Extension utilities
export { createCommonExtensionCodec, createExtendedCodec } from "./extensions.js";

/**
 * Re-export of ExtensionCodec from @msgpack/msgpack.
 *
 * Use this type when creating custom extension codecs for non-standard types.
 * The ExtensionCodec allows you to define how custom types are serialized
 * and deserialized using MessagePack extension types (type IDs 0-127).
 *
 * @see {@link https://github.com/msgpack/msgpack-javascript#extension-types | @msgpack/msgpack Extension Types}
 * @see {@link createCommonExtensionCodec} for pre-built extension support
 */
export type { ExtensionCodec } from "@msgpack/msgpack";
