/**
 * Benchmark worker - handles all benchmark methods.
 *
 * This worker provides methods for all codec/response-mode combinations
 * used in the benchmark suite.
 */

import { Client } from "@procwire/client";
import { rawCodec, msgpackCodec } from "@procwire/codecs";
import { arrowCodec } from "@procwire/codecs/arrow";

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
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // BACKPRESSURE FLOOD (D2 receive-side test)
  // ═══════════════════════════════════════════════════════════════════════════
  // Emits a large number of chunks as fast as send-side backpressure allows.
  // A slow consumer on the parent lets the receive queue grow; with D2 the
  // socket is paused past the high-water mark, bounding parent memory.
  .handle(
    "stream_flood",
    async (_data, ctx) => {
      const chunkSize = Number(process.env.FLOOD_CHUNK_SIZE ?? 32 * 1024);
      const chunks = Number(process.env.FLOOD_CHUNKS ?? 3000);
      // FLOOD_NOWAIT: a misbehaving producer that ignores send-side backpressure
      // (does not await drain). This is the case D2's receive-side flow control
      // protects against - without it the consumer's queue grows unbounded.
      const noWait = process.env.FLOOD_NOWAIT === "1";
      const buf = Buffer.allocUnsafe(chunkSize);
      for (let i = 0; i < chunks; i++) {
        if (noWait) {
          void ctx.chunk(buf);
        } else {
          await ctx.chunk(buf);
        }
      }
      await ctx.end();
    },
    { response: "stream", codec: rawCodec },
  );

await client.start();
