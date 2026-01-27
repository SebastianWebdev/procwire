#!/usr/bin/env npx tsx
/**
 * Arrow codec worker - Codec benchmark.
 *
 * Note: Arrow codec is designed for columnar data (Tables), not for JSON-RPC.
 * This worker demonstrates Arrow usage but the actual Arrow benchmark
 * should test serialization in isolation (without JSON-RPC wrapper).
 *
 * For benchmarking purposes, we use MessagePack on the data channel
 * and serialize Arrow tables within the payload.
 */

import { createWorker } from "@procwire/sdk";
import { MessagePackCodec } from "@procwire/codec-msgpack";
import { ArrowCodec } from "@procwire/codec-arrow";
import { tableFromArrays } from "apache-arrow";

// Use MessagePack for data channel (JSON-RPC transport)
// Arrow codec is used internally for table serialization
const arrowCodec = new ArrowCodec({ validateInput: false });

const worker = createWorker({
  name: "arrow-worker",
  debug: process.env.DEBUG === "true",
  dataChannel: {
    // Use MessagePack for JSON-RPC envelope
    serialization: new MessagePackCodec(),
  },
});

// Echo - returns params as-is
worker.handle("echo", (params) => {
  return params;
});

// Process tabular data - receives array of objects, returns stats
worker.handle(
  "process_table_data",
  (params: { data: Array<{ id: number; name: string; value: number; category: string }> }) => {
    // Convert to Arrow table for processing
    const table = tableFromArrays({
      id: new Int32Array(params.data.map((r) => r.id)),
      name: params.data.map((r) => r.name),
      value: new Float64Array(params.data.map((r) => r.value)),
      category: params.data.map((r) => r.category),
    });

    // Serialize/deserialize to simulate Arrow IPC
    const buffer = arrowCodec.serialize(table);
    const decoded = arrowCodec.deserialize(buffer);

    return {
      rowCount: decoded.numRows,
      colCount: decoded.numCols,
      serializedSize: buffer.length,
    };
  },
);

// Process pre-serialized Arrow buffer
worker.handle(
  "process_arrow_buffer",
  (params: { buffer: number[] /* serialized as array of bytes */ }) => {
    const buf = Buffer.from(params.buffer);
    const table = arrowCodec.deserialize(buf);

    // Compute checksum from table data
    let checksum = 0;
    const idColumn = table.getChild("id");
    if (idColumn) {
      for (let i = 0; i < table.numRows; i++) {
        checksum += idColumn.get(i) as number;
      }
    }

    return {
      rowCount: table.numRows,
      colCount: table.numCols,
      checksum: checksum % 1000000,
    };
  },
);

// Ping for health check
worker.handle("ping", () => {
  return { pong: true, timestamp: Date.now() };
});

worker.hooks({
  onReady: () => {
    if (process.env.DEBUG === "true") {
      console.error("[arrow-worker] Ready");
      console.error(`[arrow-worker] Data path: ${process.env.PROCWIRE_DATA_PATH}`);
    }
  },
});

worker.start().catch((error) => {
  console.error("[arrow-worker] Fatal error:", error);
  process.exit(1);
});
