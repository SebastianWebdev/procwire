/**
 * Echo child process fixture for integration tests.
 *
 * This child process provides various handlers to test
 * all response types and features of the IPC bridge.
 */

import { Client } from "@procwire/client";

const client = new Client()
  // Simple echo - returns same data
  .handle("echo", async (data, ctx) => {
    await ctx.respond(data);
  })

  // Stream echo - returns each item as a chunk
  .handle(
    "echoStream",
    async (data, ctx) => {
      const items = data as unknown[];
      for (const item of items) {
        await ctx.chunk(item);
      }
      await ctx.end();
    },
    { response: "stream" },
  )

  // ACK response - acknowledges receipt
  .handle(
    "echoAck",
    async (data, ctx) => {
      await ctx.ack({ received: true, originalData: data });
    },
    { response: "ack" },
  )

  // Error response - throws intentional error
  .handle("throwError", async (data, ctx) => {
    const { message } = data as { message?: string };
    await ctx.error(new Error(message ?? "Intentional error"));
  })

  // Slow operation - for testing cancellation
  .handle("slowOperation", async (data, ctx) => {
    const { delay } = data as { delay: number };

    // Check for abort during wait
    let aborted = false;
    ctx.onAbort(() => {
      aborted = true;
    });

    await new Promise((r) => setTimeout(r, delay));

    if (aborted) {
      // Don't respond if aborted
      return;
    }

    await ctx.respond({ completed: true, delay });
  })

  // Emit event on request
  .handle("emitProgress", async (data, ctx) => {
    const { count } = data as { count: number };

    for (let i = 1; i <= count; i++) {
      await client.emitEvent("progress", { current: i, total: count });
    }

    await ctx.respond({ emitted: count });
  })

  // No response (fire-and-forget style, but handler still needs to ack)
  .handle("noResponse", async (_data, ctx) => {
    // For "none" response type, we still need to signal completion
    await ctx.ack();
  })

  // Register events
  .event("progress");

await client.start();
