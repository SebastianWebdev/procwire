/**
 * @procwire/codecs - Serialization codecs for Procwire binary protocol.
 *
 * This package provides codec interfaces and implementations for
 * serializing/deserializing payload data in the binary protocol.
 *
 * @example
 * ```typescript
 * import { rawCodec, rawChunksCodec, msgpackCodec } from '@procwire/codecs';
 *
 * // For small/medium payloads - returns Buffer
 * const data = rawCodec.deserialize(payload);
 *
 * // For large payloads - returns Buffer[] (ZERO-COPY!)
 * const chunks = rawChunksCodec.deserializeChunks(payloadChunks);
 *
 * // For objects with Date/Buffer support
 * const obj = msgpackCodec.deserialize(payload);
 *
 * // For columnar data (ML embeddings, query results), import the opt-in
 * // subpath (requires the `apache-arrow` peer dependency):
 * //   import { arrowCodec } from '@procwire/codecs/arrow';
 * ```
 *
 * @module @procwire/codecs
 */

export type { Codec, RawCodecType, RawChunksCodecType, ObjectCodecType } from "./types.js";

export { codecDeserialize } from "./types.js";

export { RawCodec, rawCodec, RawChunksCodec, rawChunksCodec } from "./raw-codec.js";

export { MsgPackCodec, msgpackCodec, msgpack } from "./msgpack-codec.js";

// NOTE: the Arrow codec is intentionally NOT re-exported here. It lives behind
// the opt-in `@procwire/codecs/arrow` subpath so that importing this package
// never eagerly loads `apache-arrow` (an optional peer dependency). See arrow.ts.

export type {
  InferCodecInput,
  InferCodecOutput,
  MethodDescriptor,
  EventDescriptor,
  Schema,
  EmptySchema,
  ExtractSchema,
  ParentRequestType,
  ParentResponseType,
  ChildRequestType,
  ChildResponseType,
  ParentEventType,
  ChildEventType,
} from "./schema-types.js";
