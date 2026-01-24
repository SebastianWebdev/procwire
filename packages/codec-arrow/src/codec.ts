/**
 * High-performance Apache Arrow IPC serialization codec for @procwire/transport.
 *
 * @module codec
 */

import type { Table } from "apache-arrow";
import { tableFromIPC, tableToIPC } from "apache-arrow";
import type { SerializationCodec } from "@procwire/transport/serialization";
import { SerializationError } from "@procwire/transport";

/**
 * IPC format type for Arrow serialization.
 * - 'stream': Smaller, no footer, ideal for streaming/IPC (default)
 * - 'file': Larger, with footer, supports random access
 */
export type ArrowIPCFormat = "stream" | "file";

/**
 * Options for ArrowCodec configuration.
 */
export interface ArrowCodecOptions {
  /**
   * IPC format to use for serialization.
   * - 'stream': Optimized for streaming, smaller size (default)
   * - 'file': With footer for random access, larger size
   * @default 'stream'
   */
  format?: ArrowIPCFormat;

  /**
   * Whether to validate input types before serialization/deserialization.
   * Disable for maximum performance in trusted environments.
   * @default true
   */
  validateInput?: boolean;

  /**
   * Whether to collect basic metrics (serialize/deserialize counts, bytes processed).
   * Useful for monitoring but has minimal overhead.
   * @default false
   */
  collectMetrics?: boolean;
}

/**
 * Metrics collected by ArrowCodec when collectMetrics is enabled.
 */
export interface ArrowCodecMetrics {
  /** Number of successful serialize() calls */
  serializeCount: number;
  /** Number of successful deserialize() calls */
  deserializeCount: number;
  /** Total bytes serialized */
  bytesSerialised: number;
  /** Total bytes deserialized */
  bytesDeserialized: number;
  /** Total rows serialized */
  rowsSerialized: number;
  /** Total rows deserialized */
  rowsDeserialized: number;
  /** Number of serialization errors */
  serializeErrors: number;
  /** Number of deserialization errors */
  deserializeErrors: number;
}

/**
 * High-performance Apache Arrow IPC serialization codec.
 *
 * Optimized for:
 * - Zero-copy serialization (no unnecessary buffer copies)
 * - Columnar data for analytics workloads
 * - Large datasets (millions of rows)
 * - Cross-language interoperability
 *
 * @example Basic usage
 * ```ts
 * import { tableFromArrays } from 'apache-arrow';
 * import { ArrowCodec } from '@procwire/codec-arrow';
 *
 * const codec = new ArrowCodec();
 * const table = tableFromArrays({ id: [1, 2, 3], name: ['A', 'B', 'C'] });
 *
 * const buffer = codec.serialize(table);
 * const decoded = codec.deserialize(buffer);
 * ```
 *
 * @example With options for maximum performance
 * ```ts
 * const codec = new ArrowCodec({
 *   format: 'stream',      // Smaller, optimized for IPC
 *   validateInput: false,  // Skip validation in trusted environments
 *   collectMetrics: true   // Monitor throughput
 * });
 * ```
 *
 * @example File format for random access
 * ```ts
 * const codec = new ArrowCodec({ format: 'file' });
 * const buffer = codec.serialize(table);
 * // Buffer can be written to disk and read with random access
 * ```
 */
export class ArrowCodec implements SerializationCodec<Table> {
  readonly name = "arrow";
  readonly contentType: string;

  private readonly format: ArrowIPCFormat;
  private readonly validateInput: boolean;
  private readonly collectMetrics: boolean;
  private _metrics: ArrowCodecMetrics | null = null;

  /**
   * Creates a new ArrowCodec instance.
   *
   * @param options - Configuration options
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
   * Returns current metrics if collectMetrics is enabled.
   * @returns Metrics object or null if metrics collection is disabled
   */
  get metrics(): Readonly<ArrowCodecMetrics> | null {
    return this._metrics ? { ...this._metrics } : null;
  }

  /**
   * Resets all metrics to zero.
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
   * Uses zero-copy optimization to avoid unnecessary memory allocation.
   *
   * @param value - Arrow Table to serialize
   * @returns Buffer containing Arrow IPC data
   * @throws {SerializationError} if value is not a valid Table or encoding fails
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
   * Deserializes Arrow IPC data to an Apache Arrow Table.
   *
   * @param buffer - Buffer or Uint8Array containing Arrow IPC data
   * @returns Deserialized Arrow Table
   * @throws {SerializationError} if buffer is invalid or decoding fails
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
   * Uses duck-typing for performance (avoids instanceof checks across module boundaries).
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
 * Disables input validation for use in trusted environments.
 *
 * ⚠️ WARNING: Only use in trusted environments where input is guaranteed valid.
 *
 * @param format - IPC format to use
 * @returns Configured ArrowCodec
 *
 * @example
 * ```ts
 * // For internal IPC between trusted processes
 * const codec = createFastArrowCodec('stream');
 * ```
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
 * Useful for monitoring and debugging.
 *
 * @param options - Additional options
 * @returns Configured ArrowCodec with metrics
 *
 * @example
 * ```ts
 * const codec = createMonitoredArrowCodec();
 *
 * // After processing...
 * console.log(codec.metrics);
 * // { serializeCount: 100, bytesSerialised: 1048576, ... }
 * ```
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
 * Use when you need random access to record batches or will write to disk.
 *
 * @param options - Additional options
 * @returns Configured ArrowCodec for file format
 */
export function createFileArrowCodec(options?: Omit<ArrowCodecOptions, "format">): ArrowCodec {
  return new ArrowCodec({
    ...options,
    format: "file",
  });
}
