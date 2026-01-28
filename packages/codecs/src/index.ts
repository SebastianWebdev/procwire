/**
 * @procwire/codecs - Serialization codecs for Procwire binary protocol.
 *
 * This package provides codec interfaces and implementations for
 * serializing/deserializing payload data in the binary protocol.
 *
 * @example
 * ```typescript
 * import { rawCodec, rawChunksCodec, codecDeserialize } from '@procwire/codecs';
 *
 * // For small/medium payloads - returns Buffer
 * const data = rawCodec.deserialize(payload);
 *
 * // For large payloads - returns Buffer[] (ZERO-COPY!)
 * const chunks = rawChunksCodec.deserializeChunks(payloadChunks);
 *
 * // Helper that auto-selects the best path
 * const result = codecDeserialize(myCodec, frame);
 * ```
 *
 * @module
 */

export type { Codec, RawCodecType, RawChunksCodecType, ObjectCodecType } from "./types.js";

export { codecDeserialize } from "./types.js";

export { RawCodec, rawCodec, RawChunksCodec, rawChunksCodec } from "./raw-codec.js";
