/**
 * Protocol Buffers codec for @procwire/transport.
 * Provides type-safe binary serialization using protobufjs.
 *
 * @module Codec Protobuf
 */

// Main class and options
export { ProtobufCodec } from "./codec.js";
export type { ProtobufCodecOptions } from "./codec.js";

// Helper functions
export { createCodecFromProto, createCodecFromJSON } from "./helpers.js";

// Re-export useful protobufjs types for advanced users
export type { Type, Root, Field, INamespace } from "protobufjs";
