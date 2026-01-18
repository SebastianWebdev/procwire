/**
 * Basic stdio IPC example - Parent process.
 *
 * Demonstrates:
 * - Spawning a child process with stdio transport
 * - Request/response pattern
 * - Receiving notifications from child
 * - Graceful shutdown
 */

import { createStdioChannel } from "@aspect-ipc/transport";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log("Parent: Starting...");

  // Create stdio channel to worker
  // Uses: line-delimited + JSON + JSON-RPC by default
  const channel = await createStdioChannel("node", {
    args: [join(__dirname, "worker.js")],
    cwd: __dirname,
    timeout: 5000,
  });

  console.log("Parent: Channel established");

  // Listen for notifications from worker
  channel.onNotification((notification: any) => {
    if (notification.method === "log") {
      console.log(`Parent: [Worker Log] ${notification.params.message}`);
    }
  });

  // Send requests to worker
  try {
    console.log("Parent: Sending add(2, 3)...");
    const sum = await channel.request("add", { a: 2, b: 3 });
    console.log(`Parent: Result: ${sum}`);

    console.log("Parent: Sending multiply(4, 5)...");
    const product = await channel.request("multiply", { a: 4, b: 5 });
    console.log(`Parent: Result: ${product}`);

    console.log("Parent: Sending greeting...");
    const greeting = await channel.request("greet", { name: "Alice" });
    console.log(`Parent: Result: ${greeting}`);

    // Send notification to worker (no response expected)
    console.log("Parent: Sending shutdown notification...");
    channel.notify("shutdown", {});

    // Wait a bit for worker to process
    await new Promise((resolve) => setTimeout(resolve, 500));
  } catch (error) {
    console.error("Parent: Error:", error);
  } finally {
    console.log("Parent: Closing channel...");
    await channel.close();
    console.log("Parent: Done");
  }
}

main().catch((error) => {
  console.error("Parent: Fatal error:", error);
  process.exit(1);
});
