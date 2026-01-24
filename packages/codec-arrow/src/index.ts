/**
 * Apache Arrow IPC codec for @procwire/transport.
 * Provides high-performance columnar data serialization using apache-arrow.
 *
 * @module @procwire/codec-arrow
 */

// Main codec class and options
export { ArrowCodec } from "./codec.js";
export type { ArrowCodecOptions, ArrowCodecMetrics, ArrowIPCFormat } from "./codec.js";

// Helper functions
export { createFastArrowCodec, createMonitoredArrowCodec, createFileArrowCodec } from "./codec.js";

// Re-export useful apache-arrow types for convenience
export type { Table, Schema, Field, RecordBatch } from "apache-arrow";
