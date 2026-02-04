/**
 * @procwire/codecs - Serialization codecs for Procwire binary protocol.
 *
 * This package provides codec interfaces and implementations for
 * serializing/deserializing payload data in the binary protocol.
 *
 * @example
 * ```typescript
 * import { rawCodec, rawChunksCodec, msgpackCodec, arrowCodec } from '@procwire/codecs';
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
 * // For columnar data (ML embeddings, query results)
 * const table = arrowCodec.deserialize(payload);
 * ```
 *
 * @module
 */

export type { Codec, RawCodecType, RawChunksCodecType, ObjectCodecType } from "./types.js";

export { codecDeserialize } from "./types.js";

export { RawCodec, rawCodec, RawChunksCodec, rawChunksCodec } from "./raw-codec.js";

export { MsgPackCodec, msgpackCodec } from "./msgpack-codec.js";

export {
  ArrowCodec,
  arrowCodec,
  type ArrowSerializable,
  type ArrowObjectInput,
} from "./arrow-codec.js";
