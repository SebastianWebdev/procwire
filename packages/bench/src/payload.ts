/**
 * Payload generators for different sizes and codecs.
 */

import type { PayloadSize, CodecType } from "./types.js";
import { PAYLOAD_SIZES } from "./types.js";

/**
 * Generates a payload of the specified size for the given codec type.
 */
export function generatePayload(size: PayloadSize, codec: CodecType): unknown {
  const bytes = PAYLOAD_SIZES[size];

  switch (codec) {
    case "raw":
      // Raw binary buffer filled with 0x42 ('B')
      return Buffer.alloc(bytes, 0x42);

    case "msgpack":
      // Object with a data buffer - msgpack will serialize it
      return { data: Buffer.alloc(bytes, 0x42) };

    case "arrow": {
      // Columnar data - array of numbers to create Arrow table
      // Arrow has overhead, so we use fewer elements but each is a number (8 bytes)
      const elementCount = Math.floor(bytes / 8);
      const values = new Float64Array(elementCount);
      for (let i = 0; i < elementCount; i++) {
        values[i] = i * 1.5;
      }
      return { values: Array.from(values) };
    }

    default:
      throw new Error(`Unknown codec: ${codec}`);
  }
}

/**
 * Generates stream chunks for streaming benchmarks.
 */
export function generateStreamChunks(
  size: PayloadSize,
  codec: CodecType,
  chunkCount: number,
): unknown[] {
  const totalBytes = PAYLOAD_SIZES[size];
  const chunkSize = Math.floor(totalBytes / chunkCount);

  const chunks: unknown[] = [];
  for (let i = 0; i < chunkCount; i++) {
    const isLast = i === chunkCount - 1;
    const thisChunkSize = isLast ? totalBytes - chunkSize * i : chunkSize;

    switch (codec) {
      case "raw":
        chunks.push(Buffer.alloc(thisChunkSize, 0x42));
        break;
      case "msgpack":
        chunks.push({ chunkIndex: i, data: Buffer.alloc(thisChunkSize, 0x42) });
        break;
      case "arrow": {
        const elementCount = Math.floor(thisChunkSize / 8);
        const values = new Float64Array(elementCount);
        for (let j = 0; j < elementCount; j++) {
          values[j] = i * 1000 + j;
        }
        chunks.push({ values: Array.from(values) });
        break;
      }
    }
  }

  return chunks;
}

/**
 * Gets the byte size of a payload (for throughput calculation).
 */
export function getPayloadByteSize(size: PayloadSize): number {
  return PAYLOAD_SIZES[size];
}
