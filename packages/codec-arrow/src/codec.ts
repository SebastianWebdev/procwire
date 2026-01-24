/**
 * Apache Arrow IPC codec implementation for @procwire/transport.
 *
 * @remarks
 * This is an internal module. Import from `@procwire/codec-arrow` instead.
 *
 * @internal
 */

import type { Table } from "apache-arrow";
import { tableFromIPC, tableToIPC } from "apache-arrow";
import type { SerializationCodec } from "@procwire/transport/serialization";
import { SerializationError } from "@procwire/transport";

/**
 * IPC format type for Arrow serialization.
 *
 * Apache Arrow supports two IPC formats with different characteristics:
 *
 * - `'stream'` - Streaming format optimized for sequential access.
 *   Smaller size, no footer, ideal for IPC and streaming scenarios.
 * - `'file'` - File format with footer for random access.
 *   Larger size, includes schema and metadata footer, suitable for files.
 *
 * @example
 * ```ts
 * import { ArrowIPCFormat } from '@procwire/codec-arrow';
 *
 * const format: ArrowIPCFormat = 'stream';
 * const codec = new ArrowCodec({ format });
 * ```
 */
export type ArrowIPCFormat = "stream" | "file";

/**
 * Configuration options for {@link ArrowCodec}.
 *
 * All options are optional and have sensible defaults optimized for
 * typical IPC scenarios.
 *
 * @example Default configuration
 * ```ts
 * const codec = new ArrowCodec();
 * // Equivalent to: { format: 'stream', validateInput: true, collectMetrics: false }
 * ```
 *
 * @example Performance configuration
 * ```ts
 * const codec = new ArrowCodec({
 *   format: 'stream',
 *   validateInput: false, // Skip validation in trusted environments
 *   collectMetrics: true, // Monitor throughput
 * });
 * ```
 *
 * @see {@link ArrowCodec} for the main codec class
 */
export interface ArrowCodecOptions {
  /**
   * IPC format to use for serialization.
   *
   * - `'stream'` (default): Optimized for streaming and IPC. Smaller size,
   *   no footer, data can be read sequentially as it arrives.
   * - `'file'`: With footer for random access. Larger size, includes
   *   schema and record batch offsets at the end for seekable reads.
   *
   * Use `'stream'` for inter-process communication and `'file'` when
   * writing to disk or when random access is needed.
   *
   * @default 'stream'
   *
   * @example
   * ```ts
   * // Stream format for IPC (default)
   * const ipcCodec = new ArrowCodec({ format: 'stream' });
   *
   * // File format for disk storage
   * const fileCodec = new ArrowCodec({ format: 'file' });
   * ```
   */
  format?: ArrowIPCFormat;

  /**
   * Whether to validate input types before serialization/deserialization.
   *
   * - `true` (default): Validate that inputs are valid Arrow Tables or
   *   non-empty Buffers. Provides clear error messages for invalid data.
   * - `false`: Skip validation for maximum performance. Only use in
   *   trusted environments where input is guaranteed to be valid.
   *
   * @default true
   *
   * @example
   * ```ts
   * // With validation (recommended for external data)
   * const safeCodec = new ArrowCodec({ validateInput: true });
   *
   * // Without validation (for trusted internal IPC)
   * const fastCodec = new ArrowCodec({ validateInput: false });
   * ```
   */
  validateInput?: boolean;

  /**
   * Whether to collect basic metrics for monitoring.
   *
   * When enabled, the codec tracks:
   * - Serialize/deserialize counts
   * - Bytes processed
   * - Rows processed
   * - Error counts
   *
   * Metrics have minimal overhead and are useful for monitoring
   * throughput and debugging issues.
   *
   * @default false
   *
   * @example
   * ```ts
   * const codec = new ArrowCodec({ collectMetrics: true });
   *
   * // Process data...
   * for (const batch of batches) {
   *   codec.serialize(batch);
   * }
   *
   * // Check metrics
   * console.log(codec.metrics);
   * // { serializeCount: 100, bytesSerialised: 10485760, rowsSerialized: 1000000, ... }
   * ```
   *
   * @see {@link ArrowCodecMetrics} for the metrics structure
   * @see {@link ArrowCodec.metrics} for accessing metrics
   * @see {@link ArrowCodec.resetMetrics} for resetting metrics
   */
  collectMetrics?: boolean;
}

/**
 * Metrics collected by ArrowCodec when `collectMetrics` is enabled.
 *
 * These metrics provide visibility into codec performance and can be
 * used for monitoring, debugging, and capacity planning.
 *
 * @example
 * ```ts
 * const codec = new ArrowCodec({ collectMetrics: true });
 *
 * // Process data...
 * codec.serialize(table);
 *
 * const metrics = codec.metrics;
 * if (metrics) {
 *   console.log(`Serialized ${metrics.rowsSerialized} rows`);
 *   console.log(`Total bytes: ${metrics.bytesSerialised}`);
 *   console.log(`Errors: ${metrics.serializeErrors}`);
 * }
 * ```
 *
 * @see {@link ArrowCodecOptions.collectMetrics} to enable metrics
 * @see {@link ArrowCodec.metrics} for accessing metrics
 */
export interface ArrowCodecMetrics {
  /**
   * Number of successful `serialize()` calls.
   */
  serializeCount: number;

  /**
   * Number of successful `deserialize()` calls.
   */
  deserializeCount: number;

  /**
   * Total bytes produced by serialization.
   */
  bytesSerialised: number;

  /**
   * Total bytes consumed by deserialization.
   */
  bytesDeserialized: number;

  /**
   * Total number of rows serialized across all tables.
   */
  rowsSerialized: number;

  /**
   * Total number of rows deserialized across all tables.
   */
  rowsDeserialized: number;

  /**
   * Number of serialization errors encountered.
   */
  serializeErrors: number;

  /**
   * Number of deserialization errors encountered.
   */
  deserializeErrors: number;
}

/**
 * High-performance Apache Arrow IPC serialization codec.
 *
 * Implements the {@link SerializationCodec} interface for use with
 * @procwire/transport channels. Optimized for columnar data transfer,
 * analytics workloads, and interoperability with data science tools.
 *
 * @remarks
 * This codec uses zero-copy optimization where possible, wrapping the
 * underlying ArrayBuffer instead of copying data. For maximum performance
 * in trusted environments, disable input validation with `validateInput: false`.
 *
 * @example Basic usage
 * ```ts
 * import { tableFromArrays } from 'apache-arrow';
 * import { ArrowCodec } from '@procwire/codec-arrow';
 *
 * const codec = new ArrowCodec();
 *
 * // Create a table with typed columns
 * const table = tableFromArrays({
 *   id: Int32Array.from([1, 2, 3, 4, 5]),
 *   name: ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'],
 *   score: Float64Array.from([95.5, 87.3, 92.1, 88.7, 91.2]),
 *   active: [true, false, true, true, false]
 * });
 *
 * // Serialize to Arrow IPC format
 * const buffer = codec.serialize(table);
 * console.log(`Serialized ${table.numRows} rows to ${buffer.length} bytes`);
 *
 * // Deserialize back to Table
 * const decoded = codec.deserialize(buffer);
 * console.log(decoded.numRows);    // 5
 * console.log(decoded.numCols);    // 4
 * console.log(decoded.schema.fields.map(f => f.name)); // ['id', 'name', 'score', 'active']
 * ```
 *
 * @example With configuration options
 * ```ts
 * const codec = new ArrowCodec({
 *   format: 'stream',       // Streaming format for IPC
 *   validateInput: false,   // Skip validation for performance
 *   collectMetrics: true,   // Track throughput
 * });
 *
 * // Process batches
 * for (const batch of batches) {
 *   channel.send(codec.serialize(batch));
 * }
 *
 * // Check metrics
 * console.log(`Processed ${codec.metrics?.rowsSerialized} rows`);
 * ```
 *
 * @example File format for random access
 * ```ts
 * import { writeFileSync, readFileSync } from 'fs';
 *
 * const codec = new ArrowCodec({ format: 'file' });
 *
 * // Write to file
 * const buffer = codec.serialize(table);
 * writeFileSync('data.arrow', buffer);
 *
 * // Read from file (supports random access)
 * const fileBuffer = readFileSync('data.arrow');
 * const loadedTable = codec.deserialize(fileBuffer);
 * ```
 *
 * @example Cross-language interoperability
 * ```ts
 * // Node.js side
 * const codec = new ArrowCodec();
 * const buffer = codec.serialize(table);
 * socket.write(buffer);
 *
 * // Python side (PyArrow)
 * // import pyarrow as pa
 * // reader = pa.ipc.open_stream(buffer)
 * // table = reader.read_all()
 * ```
 *
 * @example Integration with @procwire/transport
 * ```ts
 * import { ArrowCodec } from '@procwire/codec-arrow';
 * import { StreamChannel } from '@procwire/transport/channel';
 *
 * const codec = new ArrowCodec({ collectMetrics: true });
 *
 * const channel = new StreamChannel({
 *   transport,
 *   framing,
 *   serialization: codec,
 *   protocol
 * });
 *
 * // Send Arrow tables through the channel
 * channel.send(table);
 * ```
 *
 * @see {@link ArrowCodecOptions} for configuration options
 * @see {@link ArrowCodecMetrics} for metrics structure
 * @see {@link createFastArrowCodec} for maximum performance
 * @see {@link createMonitoredArrowCodec} for monitoring
 * @see {@link createFileArrowCodec} for file format
 */
export class ArrowCodec implements SerializationCodec<Table> {
  /**
   * Unique identifier for this codec.
   *
   * Used by codec registries to identify and lookup codecs by name.
   * The value `"arrow"` identifies this as an Apache Arrow codec.
   *
   * @readonly
   */
  readonly name = "arrow";

  /**
   * MIME type for Arrow IPC encoded data.
   *
   * The content type varies based on the format:
   * - Stream format: `application/vnd.apache.arrow.stream`
   * - File format: `application/vnd.apache.arrow.file`
   *
   * Used in HTTP Content-Type headers and content negotiation.
   *
   * @readonly
   * @see {@link https://arrow.apache.org/docs/format/IPC.html | Apache Arrow IPC specification}
   */
  readonly contentType: string;

  private readonly format: ArrowIPCFormat;
  private readonly validateInput: boolean;
  private readonly collectMetrics: boolean;
  private _metrics: ArrowCodecMetrics | null = null;

  /**
   * Creates a new ArrowCodec instance.
   *
   * @param options - Optional configuration for serialization behavior.
   *                  See {@link ArrowCodecOptions} for available options.
   *
   * @example Default configuration
   * ```ts
   * const codec = new ArrowCodec();
   * ```
   *
   * @example With options
   * ```ts
   * const codec = new ArrowCodec({
   *   format: 'file',
   *   validateInput: true,
   *   collectMetrics: true,
   * });
   * ```
   */
  constructor(options?: ArrowCodecOptions) {
    this.format = options?.format ?? "stream";
    this.validateInput = options?.validateInput ?? true;
    this.collectMetrics = options?.collectMetrics ?? false;

    // Set content type based on format
    this.contentType =
      this.format === "file"
        ? "application/vnd.apache.arrow.file"
        : "application/vnd.apache.arrow.stream";

    if (this.collectMetrics) {
      this._metrics = {
        serializeCount: 0,
        deserializeCount: 0,
        bytesSerialised: 0,
        bytesDeserialized: 0,
        rowsSerialized: 0,
        rowsDeserialized: 0,
        serializeErrors: 0,
        deserializeErrors: 0,
      };
    }
  }

  /**
   * Returns current metrics if `collectMetrics` is enabled.
   *
   * Returns a copy of the metrics object to prevent external modification.
   * Returns `null` if metrics collection is disabled.
   *
   * @returns A readonly copy of metrics, or `null` if metrics are disabled.
   *
   * @example
   * ```ts
   * const codec = new ArrowCodec({ collectMetrics: true });
   *
   * // Process some data
   * codec.serialize(table1);
   * codec.serialize(table2);
   *
   * const metrics = codec.metrics;
   * if (metrics) {
   *   console.log(`Serialized ${metrics.serializeCount} tables`);
   *   console.log(`Total rows: ${metrics.rowsSerialized}`);
   *   console.log(`Total bytes: ${metrics.bytesSerialised}`);
   * }
   * ```
   *
   * @see {@link ArrowCodecMetrics} for the metrics structure
   * @see {@link resetMetrics} to reset all metrics to zero
   */
  get metrics(): Readonly<ArrowCodecMetrics> | null {
    return this._metrics ? { ...this._metrics } : null;
  }

  /**
   * Resets all metrics to zero.
   *
   * Use this method to start fresh measurement periods, for example
   * at the beginning of a new batch processing run or time window.
   * Has no effect if metrics collection is disabled.
   *
   * @example
   * ```ts
   * const codec = new ArrowCodec({ collectMetrics: true });
   *
   * // Process batch 1
   * for (const table of batch1) {
   *   codec.serialize(table);
   * }
   * console.log('Batch 1:', codec.metrics);
   *
   * // Reset for batch 2
   * codec.resetMetrics();
   *
   * // Process batch 2
   * for (const table of batch2) {
   *   codec.serialize(table);
   * }
   * console.log('Batch 2:', codec.metrics);
   * ```
   */
  resetMetrics(): void {
    if (this._metrics) {
      this._metrics.serializeCount = 0;
      this._metrics.deserializeCount = 0;
      this._metrics.bytesSerialised = 0;
      this._metrics.bytesDeserialized = 0;
      this._metrics.rowsSerialized = 0;
      this._metrics.rowsDeserialized = 0;
      this._metrics.serializeErrors = 0;
      this._metrics.deserializeErrors = 0;
    }
  }

  /**
   * Serializes an Apache Arrow Table to IPC format.
   *
   * Converts the input Table to Arrow IPC binary format using the configured
   * format (stream or file). Uses zero-copy optimization to avoid unnecessary
   * memory allocations.
   *
   * @param value - Apache Arrow Table to serialize. Must be a valid Table
   *                instance with at least one column.
   * @returns Buffer containing the Arrow IPC encoded data.
   *
   * @throws {SerializationError} When input is not a valid Arrow Table
   *         (if validation is enabled).
   * @throws {SerializationError} When encoding fails due to internal
   *         Arrow library errors.
   *
   * @example Basic serialization
   * ```ts
   * import { tableFromArrays } from 'apache-arrow';
   *
   * const codec = new ArrowCodec();
   * const table = tableFromArrays({
   *   id: [1, 2, 3],
   *   name: ['Alice', 'Bob', 'Charlie']
   * });
   *
   * const buffer = codec.serialize(table);
   * console.log(`Serialized to ${buffer.length} bytes`);
   * ```
   *
   * @example Error handling
   * ```ts
   * const codec = new ArrowCodec();
   *
   * try {
   *   codec.serialize({ notATable: true } as any);
   * } catch (error) {
   *   if (error instanceof SerializationError) {
   *     console.error('Invalid input:', error.message);
   *   }
   * }
   * ```
   *
   * @see {@link deserialize} for the reverse operation
   */
  serialize(value: Table): Buffer {
    // Input validation (can be disabled for performance)
    if (this.validateInput) {
      if (!this.isTable(value)) {
        if (this._metrics) this._metrics.serializeErrors++;
        throw new SerializationError(
          "Invalid input: expected Apache Arrow Table",
          new TypeError("Input is not an Arrow Table")
        );
      }
    }

    try {
      // Serialize to IPC format
      const uint8array = tableToIPC(value, this.format);

      // ZERO-COPY: Wrap underlying ArrayBuffer without copying
      const buffer = Buffer.from(uint8array.buffer, uint8array.byteOffset, uint8array.byteLength);

      // Update metrics
      if (this._metrics) {
        this._metrics.serializeCount++;
        this._metrics.bytesSerialised += buffer.length;
        this._metrics.rowsSerialized += value.numRows;
      }

      return buffer;
    } catch (error) {
      if (this._metrics) this._metrics.serializeErrors++;
      throw new SerializationError(
        `Failed to encode Arrow table: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Deserializes Arrow IPC data back to an Apache Arrow Table.
   *
   * Parses the binary Arrow IPC data and reconstructs the Table with
   * its full schema and column data.
   *
   * @param buffer - Buffer or Uint8Array containing Arrow IPC encoded data.
   *                 Must be valid Arrow IPC format (stream or file).
   * @returns The deserialized Apache Arrow Table.
   *
   * @throws {SerializationError} When input is null, undefined, empty,
   *         or not a Buffer/Uint8Array (if validation is enabled).
   * @throws {SerializationError} When the buffer contains invalid or
   *         corrupted Arrow IPC data.
   *
   * @example Basic deserialization
   * ```ts
   * const codec = new ArrowCodec();
   *
   * // Roundtrip
   * const original = tableFromArrays({ id: [1, 2, 3], name: ['A', 'B', 'C'] });
   * const buffer = codec.serialize(original);
   * const decoded = codec.deserialize(buffer);
   *
   * console.log(decoded.numRows);    // 3
   * console.log(decoded.numCols);    // 2
   * console.log(decoded.getChild('id')?.toArray()); // Int32Array [1, 2, 3]
   * ```
   *
   * @example Accessing column data
   * ```ts
   * const table = codec.deserialize(buffer);
   *
   * // Get column by name
   * const idColumn = table.getChild('id');
   * const ids = idColumn?.toArray();
   *
   * // Iterate rows
   * for (const row of table) {
   *   console.log(row.id, row.name);
   * }
   *
   * // Access schema
   * for (const field of table.schema.fields) {
   *   console.log(`${field.name}: ${field.type}`);
   * }
   * ```
   *
   * @example Error handling
   * ```ts
   * const codec = new ArrowCodec();
   *
   * try {
   *   codec.deserialize(Buffer.from('invalid data'));
   * } catch (error) {
   *   if (error instanceof SerializationError) {
   *     console.error('Decode failed:', error.message);
   *   }
   * }
   * ```
   *
   * @see {@link serialize} for the reverse operation
   */
  deserialize(buffer: Buffer): Table {
    // Input validation (can be disabled for performance)
    if (this.validateInput) {
      // Use unknown to allow runtime type checking
      const input = buffer as unknown;

      if (input === null || input === undefined) {
        if (this._metrics) this._metrics.deserializeErrors++;
        throw new SerializationError(
          `Invalid input: expected Buffer or Uint8Array, got ${input === null ? "null" : "undefined"}`,
          new TypeError("Invalid input type")
        );
      }

      if (!Buffer.isBuffer(input) && !(input instanceof Uint8Array)) {
        if (this._metrics) this._metrics.deserializeErrors++;
        throw new SerializationError(
          `Invalid input: expected Buffer or Uint8Array, got ${typeof input}`,
          new TypeError("Invalid input type")
        );
      }

      if (buffer.length === 0) {
        if (this._metrics) this._metrics.deserializeErrors++;
        throw new SerializationError("Invalid input: buffer is empty", new Error("Empty buffer"));
      }
    }

    try {
      const table = tableFromIPC(buffer);

      // Update metrics
      if (this._metrics) {
        this._metrics.deserializeCount++;
        this._metrics.bytesDeserialized += buffer.length;
        this._metrics.rowsDeserialized += table.numRows;
      }

      return table;
    } catch (error) {
      if (this._metrics) this._metrics.deserializeErrors++;
      throw new SerializationError(
        `Failed to decode Arrow table: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Checks if value is an Apache Arrow Table.
   *
   * Uses duck-typing for performance, avoiding instanceof checks that
   * can fail across module boundaries or different package versions.
   *
   * @param value - Value to check.
   * @returns `true` if value appears to be an Arrow Table.
   *
   * @internal
   */
  private isTable(value: unknown): value is Table {
    if (!value || typeof value !== "object") return false;
    const table = value as Table;
    return (
      typeof table.numRows === "number" &&
      typeof table.numCols === "number" &&
      typeof table.schema === "object" &&
      table.schema !== null &&
      typeof table.getChild === "function"
    );
  }
}

/**
 * Creates an ArrowCodec optimized for maximum throughput.
 *
 * Returns a codec with input validation disabled for use in trusted
 * environments where input is guaranteed to be valid. This provides
 * the best possible performance but will produce unclear errors or
 * undefined behavior if given invalid input.
 *
 * @param format - IPC format to use. Defaults to `'stream'`.
 *
 * @returns A configured ArrowCodec with validation disabled.
 *
 * @example
 * ```ts
 * // For trusted internal IPC between your own processes
 * const codec = createFastArrowCodec('stream');
 *
 * // Maximum performance - no validation overhead
 * const buffer = codec.serialize(table);
 * ```
 *
 * @remarks
 * Only use this in trusted environments where:
 * - Input always comes from your own code
 * - Tables are guaranteed to be valid Arrow Tables
 * - Buffers are guaranteed to be valid Arrow IPC data
 *
 * @see {@link ArrowCodec} for the full codec with validation
 * @see {@link createMonitoredArrowCodec} for monitoring support
 */
export function createFastArrowCodec(format: ArrowIPCFormat = "stream"): ArrowCodec {
  return new ArrowCodec({
    format,
    validateInput: false,
    collectMetrics: false,
  });
}

/**
 * Creates an ArrowCodec with metrics collection enabled.
 *
 * Returns a codec that tracks serialize/deserialize counts, bytes processed,
 * rows processed, and error counts. Useful for monitoring throughput,
 * debugging issues, and capacity planning.
 *
 * @param options - Additional codec options. The `collectMetrics` option
 *                  will always be set to `true`.
 *
 * @returns A configured ArrowCodec with metrics collection enabled.
 *
 * @example Basic monitoring
 * ```ts
 * const codec = createMonitoredArrowCodec();
 *
 * // Process data
 * for (const table of tables) {
 *   codec.serialize(table);
 * }
 *
 * // Check throughput
 * const metrics = codec.metrics!;
 * console.log(`Tables: ${metrics.serializeCount}`);
 * console.log(`Rows: ${metrics.rowsSerialized}`);
 * console.log(`Bytes: ${metrics.bytesSerialised}`);
 * console.log(`Errors: ${metrics.serializeErrors}`);
 * ```
 *
 * @example With additional options
 * ```ts
 * const codec = createMonitoredArrowCodec({
 *   format: 'file',
 *   validateInput: false, // Trust input for performance
 * });
 * ```
 *
 * @example Periodic reporting
 * ```ts
 * const codec = createMonitoredArrowCodec();
 *
 * setInterval(() => {
 *   const m = codec.metrics;
 *   if (m) {
 *     console.log(`Throughput: ${m.rowsSerialized} rows, ${m.bytesSerialised} bytes`);
 *     codec.resetMetrics(); // Reset for next interval
 *   }
 * }, 60000); // Report every minute
 * ```
 *
 * @see {@link ArrowCodecMetrics} for the metrics structure
 * @see {@link ArrowCodec.metrics} for accessing metrics
 * @see {@link ArrowCodec.resetMetrics} for resetting metrics
 */
export function createMonitoredArrowCodec(
  options?: Omit<ArrowCodecOptions, "collectMetrics">
): ArrowCodec {
  return new ArrowCodec({
    ...options,
    collectMetrics: true,
  });
}

/**
 * Creates an ArrowCodec configured for file format.
 *
 * Returns a codec using the Arrow file format, which includes a footer
 * with schema and record batch offsets for random access. Use this when
 * you need to write Arrow data to disk or when random access to record
 * batches is required.
 *
 * @param options - Additional codec options. The `format` option
 *                  will always be set to `'file'`.
 *
 * @returns A configured ArrowCodec for file format.
 *
 * @example Writing to disk
 * ```ts
 * import { writeFileSync, readFileSync } from 'fs';
 *
 * const codec = createFileArrowCodec();
 *
 * // Serialize with file format (includes footer)
 * const buffer = codec.serialize(table);
 * writeFileSync('data.arrow', buffer);
 *
 * // Read back
 * const loaded = codec.deserialize(readFileSync('data.arrow'));
 * ```
 *
 * @example With additional options
 * ```ts
 * const codec = createFileArrowCodec({
 *   validateInput: true,
 *   collectMetrics: true,
 * });
 * ```
 *
 * @remarks
 * The file format is larger than stream format due to the footer,
 * but enables random access to record batches without reading the
 * entire file. For IPC where you read data sequentially, prefer
 * the default stream format.
 *
 * @see {@link ArrowCodec} for stream format (default)
 * @see {@link ArrowIPCFormat} for format differences
 */
export function createFileArrowCodec(options?: Omit<ArrowCodecOptions, "format">): ArrowCodec {
  return new ArrowCodec({
    ...options,
    format: "file",
  });
}
