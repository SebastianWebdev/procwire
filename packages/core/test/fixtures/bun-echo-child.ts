/**
 * Cross-runtime fixture: a BUN child (@procwire/bun-client) spawned by a
 * NODE parent (@procwire/core). Run with: bun bun-echo-child.ts
 *
 * "Identical on the wire" is the core claim - this child must be
 * indistinguishable from a Node child to the Node parent.
 *
 * Imported by relative source path so the test exercises the CURRENT
 * bun-client sources (Bun executes TypeScript natively).
 */

import { Client } from "../../../procwire-bun-client/src/index.js";

const client = new Client()
  .handle("echo", async (data, ctx) => {
    await ctx.respond(data);
  })
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
  .handle("emitProgress", async (data, ctx) => {
    const { count } = data as { count: number };
    for (let i = 1; i <= count; i++) {
      await client.emitEvent("progress", { current: i, total: count });
    }
    await ctx.respond({ emitted: count });
  })
  .event("progress");

await client.start();
