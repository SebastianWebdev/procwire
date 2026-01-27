#!/usr/bin/env npx tsx
/**
 * MessagePack over pipe worker - Codec benchmark.
 *
 * This worker uses the data channel with MessagePack serialization.
 * Best for general-purpose IPC with moderate payloads.
 */

import { createWorker } from "@procwire/sdk";
import { MessagePackCodec } from "@procwire/codec-msgpack";

const worker = createWorker({
  name: "msgpack-worker",
  debug: process.env.DEBUG === "true",
  dataChannel: {
    serialization: new MessagePackCodec(),
  },
});

// Echo - returns params as-is
worker.handle("echo", (params) => {
  return params;
});

// Process structured payload and return stats
worker.handle(
  "process_payload",
  (params: { id: number; name: string; data: string; items: number[] }) => {
    let checksum = 0;
    for (let i = 0; i < params.data.length; i++) {
      checksum += params.data.charCodeAt(i);
    }
    for (const item of params.items) {
      checksum += item;
    }
    return {
      receivedId: params.id,
      receivedName: params.name,
      dataSize: params.data.length,
      itemsCount: params.items.length,
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
      console.error("[msgpack-worker] Ready");
      console.error(`[msgpack-worker] Data path: ${process.env.PROCWIRE_DATA_PATH}`);
    }
  },
});

worker.start().catch((error) => {
  console.error("[msgpack-worker] Fatal error:", error);
  process.exit(1);
});
