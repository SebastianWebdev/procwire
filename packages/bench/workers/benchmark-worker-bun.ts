/**
 * Benchmark worker for Bun runtime - handles all benchmark methods.
 *
 * This worker provides methods for all codec/response-mode combinations
 * used in the benchmark suite, using @procwire/bun-client for Bun.js.
 */

import { Client } from "@procwire/bun-client";
import { rawCodec, msgpackCodec, arrowCodec } from "@procwire/codecs";

const STREAM_CHUNK_COUNT = 10;

const client = new Client()
  // ═══════════════════════════════════════════════════════════════════════════
  // RAW CODEC METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  // Raw echo - returns exact same buffer
  .handle(
    "raw_result",
    async (data, ctx) => {
      await ctx.respond(data);
    },
    { response: "result", codec: rawCodec },
  )

  // Raw stream - splits buffer into chunks
  .handle(
    "raw_stream",
    async (data, ctx) => {
      const buffer = data as Buffer;
      const chunkSize = Math.ceil(buffer.length / STREAM_CHUNK_COUNT);

      for (let i = 0; i < STREAM_CHUNK_COUNT; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, buffer.length);
        if (start < buffer.length) {
          await ctx.chunk(buffer.subarray(start, end));
        }
      }
      await ctx.end();
    },
    { response: "stream", codec: rawCodec },
  )

  // Raw ack - just acknowledge receipt
  .handle(
    "raw_ack",
    async (_data, ctx) => {
      await ctx.ack();
    },
    { response: "ack", codec: rawCodec },
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // MSGPACK CODEC METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  // Msgpack echo - returns same object
  .handle(
    "msgpack_result",
    async (data, ctx) => {
      await ctx.respond(data);
    },
    { response: "result", codec: msgpackCodec },
  )

  // Msgpack stream - returns object in chunks
  .handle(
    "msgpack_stream",
    async (data, ctx) => {
      const obj = data as { data: Buffer };
      const buffer = obj.data;
      const chunkSize = Math.ceil(buffer.length / STREAM_CHUNK_COUNT);

      for (let i = 0; i < STREAM_CHUNK_COUNT; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, buffer.length);
        if (start < buffer.length) {
          await ctx.chunk({ chunkIndex: i, data: buffer.subarray(start, end) });
        }
      }
      await ctx.end();
    },
    { response: "stream", codec: msgpackCodec },
  )

  // Msgpack ack - acknowledge with metadata
  .handle(
    "msgpack_ack",
    async (_data, ctx) => {
      await ctx.ack({ received: true });
    },
    { response: "ack", codec: msgpackCodec },
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // ARROW CODEC METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  // Arrow echo - returns same columnar data
  .handle(
    "arrow_result",
    async (data, ctx) => {
      await ctx.respond(data);
    },
    { response: "result", codec: arrowCodec },
  )

  // Arrow stream - returns data in batches
  .handle(
    "arrow_stream",
    async (data, ctx) => {
      // Arrow data comes as Table, convert to batches
      // For simplicity, we'll just echo back as single response chunks
      const table = data as { values?: number[] };
      const values = table.values ?? [];
      const batchSize = Math.ceil(values.length / STREAM_CHUNK_COUNT);

      for (let i = 0; i < STREAM_CHUNK_COUNT; i++) {
        const start = i * batchSize;
        const end = Math.min(start + batchSize, values.length);
        if (start < values.length) {
          await ctx.chunk({ values: values.slice(start, end) });
        }
      }
      await ctx.end();
    },
    { response: "stream", codec: arrowCodec },
  )

  // Arrow ack - acknowledge receipt of columnar data
  // Note: Arrow codec only supports columnar data, so we use empty ack (no metadata)
  .handle(
    "arrow_ack",
    async (_data, ctx) => {
      await ctx.ack();
    },
    { response: "ack", codec: arrowCodec },
  );

await client.start();
