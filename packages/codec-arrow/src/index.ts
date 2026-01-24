/**
 * Apache Arrow IPC serialization codec for @procwire/transport.
 *
 * Provides high-performance columnar data serialization using Apache Arrow,
 * optimized for analytics workloads and large datasets. This codec implements
 * the {@link SerializationCodec} interface for seamless integration with
 * @procwire/transport channels.
 *
 * ## Features
 *
 * - **Zero-copy serialization** - Minimizes memory allocations and copies
 * - **Columnar format** - Optimized for analytics and batch processing
 * - **Large dataset support** - Efficiently handles millions of rows
 * - **Cross-language compatibility** - Works with Python (PyArrow), R, Java, etc.
 * - **Built-in metrics** - Optional monitoring of throughput and errors
 * - **Configurable formats** - Stream (default) or file format
 *
 * ## When to Use Arrow
 *
 * Apache Arrow is ideal for:
 * - Data analytics and processing pipelines
 * - Transferring tabular data between processes
 * - Interoperability with data science tools (pandas, R, Spark)
 * - High-throughput, low-latency data transfer
 * - Large datasets where columnar access patterns dominate
 *
 * For small messages or non-tabular data, consider {@link @procwire/codec-msgpack}
 * or {@link @procwire/codec-protobuf} instead.
 *
 * ## Quick Start
 *
 * ```ts
 * import { tableFromArrays } from 'apache-arrow';
 * import { ArrowCodec } from '@procwire/codec-arrow';
 *
 * const codec = new ArrowCodec();
 *
 * // Create an Arrow table
 * const table = tableFromArrays({
 *   id: [1, 2, 3, 4, 5],
 *   name: ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'],
 *   score: [95.5, 87.3, 92.1, 88.7, 91.2]
 * });
 *
 * // Serialize to IPC format
 * const buffer = codec.serialize(table);
 *
 * // Deserialize back to Table
 * const decoded = codec.deserialize(buffer);
 * console.log(decoded.numRows); // 5
 * ```
 *
 * ## IPC Formats
 *
 * Arrow supports two IPC formats:
 *
 * - **Stream format** (default): Smaller size, no footer, ideal for streaming/IPC
 * - **File format**: Includes footer for random access, suitable for file storage
 *
 * ```ts
 * // Stream format (default) - for IPC
 * const streamCodec = new ArrowCodec({ format: 'stream' });
 *
 * // File format - for random access
 * const fileCodec = new ArrowCodec({ format: 'file' });
 * ```
 *
 * ## Integration with @procwire/transport
 *
 * ```ts
 * import { ArrowCodec } from '@procwire/codec-arrow';
 * import { RequestChannel } from '@procwire/transport/channel';
 *
 * const channel = new RequestChannel({
 *   transport,
 *   framing,
 *   serialization: new ArrowCodec(),
 *   protocol
 * });
 * ```
 *
 * @packageDocumentation
 * @module codec-arrow
 */

// Main codec class and options
export { ArrowCodec } from "./codec.js";
export type { ArrowCodecOptions, ArrowCodecMetrics, ArrowIPCFormat } from "./codec.js";

// Helper functions
export { createFastArrowCodec, createMonitoredArrowCodec, createFileArrowCodec } from "./codec.js";

/**
 * Re-export of Table from apache-arrow.
 *
 * The Table class is the primary data structure for Apache Arrow.
 * It represents a two-dimensional dataset with named columns,
 * similar to a DataFrame in pandas or R.
 *
 * @example Creating a Table
 * ```ts
 * import { tableFromArrays, Table } from 'apache-arrow';
 *
 * const table: Table = tableFromArrays({
 *   id: [1, 2, 3],
 *   name: ['Alice', 'Bob', 'Charlie']
 * });
 * ```
 *
 * @see {@link https://arrow.apache.org/docs/js/classes/Arrow_dom.Table.html | Apache Arrow Table documentation}
 */
export type { Table } from "apache-arrow";

/**
 * Re-export of Schema from apache-arrow.
 *
 * The Schema class describes the structure of an Arrow Table,
 * including column names, types, and metadata.
 *
 * @see {@link https://arrow.apache.org/docs/js/classes/Arrow_dom.Schema.html | Apache Arrow Schema documentation}
 */
export type { Schema } from "apache-arrow";

/**
 * Re-export of Field from apache-arrow.
 *
 * The Field class represents a single column definition in a Schema,
 * including the column name, data type, and nullability.
 *
 * @see {@link https://arrow.apache.org/docs/js/classes/Arrow_dom.Field.html | Apache Arrow Field documentation}
 */
export type { Field } from "apache-arrow";

/**
 * Re-export of RecordBatch from apache-arrow.
 *
 * A RecordBatch is a chunk of a Table, containing a fixed number of rows
 * with the same schema. Tables are composed of one or more RecordBatches.
 *
 * @see {@link https://arrow.apache.org/docs/js/classes/Arrow_dom.RecordBatch.html | Apache Arrow RecordBatch documentation}
 */
export type { RecordBatch } from "apache-arrow";
