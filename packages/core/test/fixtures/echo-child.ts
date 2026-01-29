/**
 * Echo child process fixture for integration tests.
 *
 * This child process provides various handlers to test
 * all response types and features of the IPC bridge.
 */

import { Client } from "@procwire/client";

const client = new Client()
  // Simple echo - returns same data
  .handle("echo", (data, ctx) => {
    ctx.respond(data);
  })

  // Stream echo - returns each item as a chunk
  .handle(
    "echoStream",
    (data, ctx) => {
      const items = data as unknown[];
      for (const item of items) {
        ctx.chunk(item);
      }
      ctx.end();
    },
    { response: "stream" },
  )

  // ACK response - acknowledges receipt
  .handle(
    "echoAck",
    (data, ctx) => {
      ctx.ack({ received: true, originalData: data });
    },
    { response: "ack" },
  )

  // Error response - throws intentional error
  .handle("throwError", (data, ctx) => {
    const { message } = data as { message?: string };
    ctx.error(new Error(message ?? "Intentional error"));
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

    ctx.respond({ completed: true, delay });
  })

  // Emit event on request
  .handle("emitProgress", (data, ctx) => {
    const { count } = data as { count: number };

    for (let i = 1; i <= count; i++) {
      client.emitEvent("progress", { current: i, total: count });
    }

    ctx.respond({ emitted: count });
  })

  // No response (fire-and-forget style, but handler still needs to ack)
  .handle("noResponse", (_data, ctx) => {
    // For "none" response type, we still need to signal completion
    ctx.ack();
  })

  // Register events
  .event("progress");

await client.start();
