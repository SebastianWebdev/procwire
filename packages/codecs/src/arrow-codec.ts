/**
 * Arrow codec for high-performance columnar data serialization.
 *
 * Features:
 * - Zero-copy reads (very fast deserialization)
 * - Columnar format (great for analytics)
 * - Cross-language (Python pandas, Rust, etc.)
 * - Streaming IPC format
 * - Zero-copy view in serialize
 *
 * @module
 */

import {
  tableToIPC,
  tableFromIPC,
  Table,
  RecordBatch,
  Utf8,
  Float64,
  type Vector,
  vectorFromArray,
  makeVector,
} from "apache-arrow";
import type { Codec } from "./types.js";

/**
 * Types that ArrowCodec can serialize.
 */
export type ArrowSerializable = Table | RecordBatch | ArrowObjectInput;

/**
 * Simple object format for convenience.
 * Keys are column names, values are arrays.
 */
export interface ArrowObjectInput {
  [column: string]: number[] | string[] | Float32Array | Float64Array | Int32Array;
}

/**
 * ArrowCodec - High-performance columnar data serialization.
 *
 * USE CASES:
 * - Embeddings / vectors: Float32Array[]
 * - Query results: { ids: number[], scores: number[] }
 * - Batch data: { names: string[], values: number[] }
 *
 * FEATURES:
 * - Zero-copy reads (very fast deserialization)
 * - Columnar format (great for analytics)
 * - Cross-language (Python pandas, Rust, etc.)
 * - Streaming IPC format
 * - ⚡️ Zero-copy view in serialize
 *
 * NOT FOR:
 * - Simple objects with few fields (use MsgPackCodec)
 * - Raw binary data (use RawChunksCodec)
 *
 * NOTE: We don't implement deserializeChunks for Arrow.
 * Arrow's streaming format requires proper RecordBatchReader which is complex.
 * For now, we rely on FrameBuffer merging for Arrow data.
 *
 * @example
 * ```typescript
 * const codec = new ArrowCodec();
 *
 * // From simple object
 * const buffer = codec.serialize({
 *   ids: [1, 2, 3],
 *   scores: new Float32Array([0.9, 0.8, 0.7]),
 * });
 *
 * // Deserialize always returns Table
 * const table = codec.deserialize(buffer);
 * const ids = table.getChild('ids')?.toArray();
 * ```
 */
export class ArrowCodec implements Codec<ArrowSerializable, Table> {
  readonly name = "arrow";

  /**
   * Serialize Arrow Table, RecordBatch, or simple object to Arrow IPC format.
   *
   * ⚡️ OPTIMIZATION: Uses Buffer.from(view) instead of copying.
   */
  serialize(data: ArrowSerializable): Buffer {
    let table: Table;

    if (data instanceof Table) {
      table = data;
    } else if (data instanceof RecordBatch) {
      table = new Table(data);
    } else {
      table = this.objectToTable(data);
    }

    // Serialize to IPC stream format
    const ipcUint8Array = tableToIPC(table, "stream");

    // ⚡️ Zero-copy: Create Buffer view over the Uint8Array's ArrayBuffer
    return Buffer.from(ipcUint8Array.buffer, ipcUint8Array.byteOffset, ipcUint8Array.byteLength);
  }

  /**
   * Deserialize Arrow IPC format to Table.
   *
   * Arrow handles zero-copy reading from buffer automatically.
   */
  deserialize(buffer: Buffer): Table {
    return tableFromIPC(buffer);
  }

  // NOTE: We do NOT implement deserializeChunks here.
  // Although Arrow supports RecordBatchReader for streaming,
  // combining arbitrary TCP chunks correctly requires complex
  // stream parsing. For now, we rely on FrameBuffer merging.

  /**
   * Convert simple object to Arrow Table.
   */
  private objectToTable(obj: ArrowObjectInput): Table {
    const columns: Record<string, Vector> = {};

    for (const [name, values] of Object.entries(obj)) {
      columns[name] = this.arrayToVector(values);
    }

    return new Table(columns);
  }

  /**
   * Convert array to Arrow Vector with appropriate type.
   */
  private arrayToVector(
    arr: number[] | string[] | Float32Array | Float64Array | Int32Array,
  ): Vector {
    // TypedArrays use makeVector (infers type automatically)
    if (arr instanceof Float32Array || arr instanceof Float64Array || arr instanceof Int32Array) {
      return makeVector(arr);
    }
    // Regular arrays use vectorFromArray
    if (arr.length === 0) {
      // Default to float64 for empty arrays
      return vectorFromArray([], new Float64());
    }
    if (typeof arr[0] === "string") {
      return vectorFromArray(arr as string[], new Utf8());
    }
    // Default: number[] as Float64
    return vectorFromArray(arr as number[], new Float64());
  }
}

/**
 * Singleton instance of ArrowCodec.
 * Use this for convenience.
 */
export const arrowCodec = new ArrowCodec();
