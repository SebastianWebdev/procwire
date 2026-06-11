/**
 * Cross-runtime fixture: a NODE child (@procwire/client) spawned by a BUN
 * parent (@procwire/bun-core). Run with: node --import <tsx> node-echo-child.ts
 *
 * "Identical on the wire" is the core claim - this child must be
 * indistinguishable from a Bun child to the Bun parent.
 */

// Relative source import so the test exercises the CURRENT client sources
// (tsx compiles them on the fly in the spawned Node process).
import { Client } from "../../../client/src/index.js";

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
