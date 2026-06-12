/**
 * E2E fixture: a bun-client child whose console.log is patched away BEFORE
 * the client starts (user code does this routinely: loggers, silencers).
 * Pins D10: the JSON-RPC control plane ($init, $pong) must not depend on
 * console.log - with the old console-based writes this child never
 * handshakes and the spawn times out.
 */
import { Client } from "../../../procwire-bun-client/src/index.js";

console.log = () => {
  // Swallow everything, like a misbehaving user logger.
};

const client = new Client().handle("echo", async (data, ctx) => {
  console.log("this must not corrupt the control plane");
  await ctx.respond(data);
});

await client.start();
