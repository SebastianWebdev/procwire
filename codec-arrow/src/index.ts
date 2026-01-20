/**
 * Apache Arrow codec for @procwire/transport.
 * Provides columnar data serialization using apache-arrow.
 *
 * @module Codec Arrow
 */

import type { Table } from "apache-arrow";
import { tableFromIPC, tableToIPC } from "apache-arrow";
import type { SerializationCodec } from "@procwire/transport/serialization";
import { SerializationError } from "@procwire/transport";

/**
 * Apache Arrow serialization codec.
 * Implements efficient columnar data serialization ideal for analytical workloads.
 *
 * @example
 * ```ts
 * import { tableFromArrays } from 'apache-arrow';
 * import { ArrowCodec } from '@procwire/codec-arrow';
 * import { ChannelBuilder } from '@procwire/transport';
 *
 * const codec = new ArrowCodec();
 *
 * // Create a table
 * const table = tableFromArrays({
 *   id: [1, 2, 3],
 *   name: ['Alice', 'Bob', 'Charlie']
 * });
 *
 * // Use with channel
 * const channel = new ChannelBuilder()
 *   .withSerialization(codec)
 *   // ... other configuration
 *   .build();
 *
 * // Send table over channel
 * await channel.request('process', table);
 * ```
 */
export class ArrowCodec implements SerializationCodec<Table> {
  readonly name = "arrow";
  readonly contentType = "application/vnd.apache.arrow.stream";

  /**
   * Serializes an Apache Arrow Table to IPC stream format.
   *
   * @param value - Arrow Table to serialize
   * @returns Buffer containing Arrow IPC stream data
   * @throws {SerializationError} if encoding fails
   */
  serialize(value: Table): Buffer {
    try {
      const uint8array = tableToIPC(value);
      return Buffer.from(uint8array);
    } catch (error) {
      throw new SerializationError(
        `Failed to encode Arrow table: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }

  /**
   * Deserializes Arrow IPC stream data to an Apache Arrow Table.
   *
   * @param buffer - Buffer containing Arrow IPC stream data
   * @returns Deserialized Arrow Table
   * @throws {SerializationError} if decoding fails
   */
  deserialize(buffer: Buffer): Table {
    try {
      return tableFromIPC(buffer);
    } catch (error) {
      throw new SerializationError(
        `Failed to decode Arrow table: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }
}
