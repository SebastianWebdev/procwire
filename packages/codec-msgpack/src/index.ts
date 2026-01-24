/**
 * MessagePack codec for @procwire/transport.
 * Provides efficient binary serialization using @msgpack/msgpack.
 *
 * @module @procwire/codec-msgpack
 */

// Main codec class and options
export { MessagePackCodec } from "./codec.js";
export type { MessagePackCodecOptions } from "./codec.js";

// Extension utilities
export { createCommonExtensionCodec, createExtendedCodec } from "./extensions.js";

// Re-export ExtensionCodec type for advanced users
export type { ExtensionCodec } from "@msgpack/msgpack";
