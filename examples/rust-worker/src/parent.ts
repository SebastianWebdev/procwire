/**
 * Rust worker IPC example - Node.js parent process.
 *
 * Demonstrates:
 * - Cross-language IPC (Node.js ↔ Rust)
 * - Stdio with line-delimited JSON-RPC
 * - Language-agnostic protocol
 * - Performance comparison
 */

import { createStdioChannel } from "@aspect-ipc/transport";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { platform } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Finds the Rust worker executable path.
 */
function getWorkerPath(): string {
  const rustDir = join(__dirname, "..", "rust");
  const executable = platform() === "win32" ? "rust-worker.exe" : "rust-worker";

  // Try release build first, then debug
  const releasePath = join(rustDir, "target", "release", executable);
  const debugPath = join(rustDir, "target", "debug", executable);

  // For this example, we'll use the release path
  // In production, you'd check if file exists
  return releasePath;
}

async function main() {
  console.log("Parent: Starting Rust worker example...");

  const workerPath = getWorkerPath();
  console.log(`Parent: Worker path: ${workerPath}`);
  console.log('Parent: Make sure to run "cargo build --release" in the rust/ directory first!\n');

  try {
    // Create channel to Rust worker
    const channel = await createStdioChannel(workerPath, {
      timeout: 10000,
    });

    console.log("Parent: Channel established\n");

    // Listen for notifications from Rust worker
    channel.onNotification((notification: any) => {
      if (notification.method === "log") {
        console.log(`Parent: [Rust Log] ${notification.params.message}`);
      }
    });

    // Basic arithmetic
    console.log("=== Basic Operations ===");
    const sum = await channel.request("add", { a: 42, b: 58 });
    console.log(`Parent: add(42, 58) = ${sum}`);

    const product = await channel.request("multiply", { a: 12, b: 34 });
    console.log(`Parent: multiply(12, 34) = ${product}`);

    // Fibonacci (compute-intensive)
    console.log("\n=== Fibonacci (Rust performance) ===");
    const fib30 = await channel.request("fibonacci", { n: 30 });
    console.log(`Parent: fibonacci(30) = ${fib30}`);

    const fib40 = await channel.request("fibonacci", { n: 40 });
    console.log(`Parent: fibonacci(40) = ${fib40}`);

    // Prime check
    console.log("\n=== Prime Number Check ===");
    const prime1 = await channel.request("is_prime", { n: 17 });
    console.log(`Parent: is_prime(17) = ${prime1}`);

    const prime2 = await channel.request("is_prime", { n: 1000000007 });
    console.log(`Parent: is_prime(1000000007) = ${prime2}`);

    // Array sum (data processing)
    console.log("\n=== Array Processing ===");
    const numbers = Array.from({ length: 1000 }, (_, i) => i + 1);
    const arraySum = await channel.request("sum_array", { numbers });
    console.log(`Parent: sum_array([1..1000]) = ${arraySum}`);

    // Echo test
    console.log("\n=== Echo Test ===");
    const echo = await channel.request("echo", { message: "Hello from Node.js!" });
    console.log(`Parent: echo = "${echo}"`);

    // Graceful shutdown
    console.log("\n=== Shutdown ===");
    await channel.notify("shutdown", {});
    await new Promise((resolve) => setTimeout(resolve, 500));

    await channel.close();
    console.log("Parent: Done");
  } catch (error) {
    if ((error as Error).message?.includes("ENOENT")) {
      console.error("\n❌ Error: Rust worker binary not found!");
      console.error("Please build the Rust worker first:");
      console.error("  cd rust");
      console.error("  cargo build --release");
      console.error("");
    } else {
      console.error("Parent: Error:", error);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Parent: Fatal error:", error);
  process.exit(1);
});
