/**
 * Dual-channel IPC example - Parent process.
 */

import { ProcessManager } from "@aspect-ipc/transport";
import { MessagePackCodec } from "@aspect-ipc/codec-msgpack";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log("Parent: Starting ProcessManager...");

  const manager = new ProcessManager({
    defaultTimeout: 10000,
    namespace: "dual-channel-example",
    restartPolicy: {
      enabled: true,
      maxRestarts: 3,
      backoffMs: 1000,
      maxBackoffMs: 10000,
    },
  });

  // Listen for manager events
  manager.on("spawn", ({ id }) => console.log(`Parent: Process spawned: ${id}`));
  manager.on("ready", ({ id }) => console.log(`Parent: Process ready: ${id}`));
  manager.on("exit", ({ id, code }) => console.log(`Parent: Process exited: ${id} (code: ${code})`));
  manager.on("restart", ({ id, attempt }) =>
    console.log(`Parent: Restarting process: ${id} (attempt ${attempt})`),
  );

  try {
    console.log("Parent: Spawning worker with dual channels...");

    const handle = await manager.spawn("worker-1", {
      executablePath: "node",
      args: [join(__dirname, "worker.js")],
      cwd: __dirname,
      controlChannel: {},
      dataChannel: {
        enabled: true,
        channel: {
          framing: "length-prefixed",
          serialization: new MessagePackCodec(),
          protocol: "jsonrpc",
        },
      },
      restartPolicy: {
        enabled: false,
        maxRestarts: 0,
        backoffMs: 0,
      },
    });

    console.log("Parent: Both channels established");

    // Control channel
    console.log("\n=== Control Channel (stdio) ===");
    const status = await handle.request("getStatus");
    console.log(`Parent: Status:`, status);

    const config = await handle.request("getConfig");
    console.log(`Parent: Config:`, config);

    // Data channel
    console.log("\n=== Data Channel (pipe + MessagePack) ===");

    const largeDataset = {
      items: Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        value: Math.random() * 100,
        timestamp: Date.now() + i,
      })),
      metadata: {
        generated: new Date().toISOString(),
        count: 1000,
      },
    };

    console.log(`Parent: Sending ${largeDataset.items.length} items via data channel...`);
    const result = await handle.requestViaData("processItems", largeDataset);
    console.log(`Parent: Data channel result:`, result);

    const matrixData = {
      matrix: Array.from({ length: 100 }, () => Array.from({ length: 100 }, () => Math.random())),
    };

    console.log(`Parent: Sending 100x100 matrix via data channel...`);
    const matrixResult = await handle.requestViaData("processMatrix", matrixData);
    console.log(`Parent: Matrix result:`, matrixResult);

    // Graceful shutdown
    console.log("\n=== Shutdown ===");
    console.log("Parent: Sending shutdown command...");
    await handle.request("shutdown");

    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error) {
    console.error("Parent: Error:", error);
  } finally {
    console.log("Parent: Terminating all processes...");
    await manager.terminateAll();
    console.log("Parent: Done");
  }
}

main().catch((error) => {
  console.error("Parent: Fatal error:", error);
  process.exit(1);
});
