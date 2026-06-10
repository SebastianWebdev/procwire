/**
 * E2E fixture: a bun-client child whose handler floods stdout with
 * SYNCHRONOUS writes before responding. Reproduces Bug W6: if the parent
 * stops draining stdout after $init, a synchronous stdout writer (anything
 * from fs.writeSync here to print()/println!() in Python/Rust children)
 * blocks forever on the full 64KB pipe and the response never arrives.
 */
import { writeSync } from "node:fs";
import { Client } from "../../../procwire-bun-client/src/index.js";

const client = new Client().handle("flood", async (_data, ctx) => {
  const line = `${"x".repeat(1024)}\n`;
  for (let i = 0; i < 300; i++) {
    writeSync(1, line); // ~300KB >> 64KB pipe buffer, blocks when full
  }
  await ctx.respond({ wrote: 300 });
});

await client.start();
