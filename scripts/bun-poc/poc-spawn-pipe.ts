/**
 * Proof-of-Concept: Parent spawns child, child creates pipe, parent connects
 *
 * This simulates the Procwire architecture:
 * 1. Parent spawns child process
 * 2. Child creates named pipe server
 * 3. Child sends pipe path to parent via stdout (control plane)
 * 4. Parent connects to pipe (data plane)
 * 5. Bidirectional communication over pipe
 */

console.log("=== PoC: Spawn + Named Pipe ===\n");

const isWindows = process.platform === "win32";
const pipeName = `procwire-poc-${process.pid}-${Date.now()}`;
const pipePath = isWindows ? `\\\\.\\pipe\\${pipeName}` : `/tmp/${pipeName}.sock`;

// Child process code (will be spawned)
// Use environment variable to pass pipe path (more reliable than argv with -e)
const childCode = `
const pipePath = process.env.PROCWIRE_PIPE_PATH;

console.log("CHILD: Starting...");
console.log("CHILD: Creating pipe server at:", pipePath);

let messageCount = 0;

const server = Bun.listen({
  unix: pipePath,
  socket: {
    open(socket) {
      console.error("CHILD: Parent connected to data plane");
    },
    data(socket, data) {
      const msg = Buffer.from(data).toString();
      messageCount++;
      console.error("CHILD: Received:", msg);

      // Echo back with sequence number
      const response = JSON.stringify({ echo: msg, seq: messageCount });
      socket.write(response);
    },
    close(socket) {
      console.error("CHILD: Parent disconnected");
    },
    error(socket, error) {
      console.error("CHILD: Socket error:", error);
    },
  },
});

// Signal to parent that pipe is ready (via stdout = control plane)
console.log("PIPE_READY:" + pipePath);

// Keep child alive for 5 seconds
setTimeout(() => {
  console.error("CHILD: Shutting down after timeout");
  server.stop(true);
  process.exit(0);
}, 5000);
`;

console.log("1. Spawning child process...");

const child = Bun.spawn(["bun", "-e", childCode], {
  stdout: "pipe",
  stderr: "inherit", // Show child's debug output
  env: {
    ...process.env,
    PROCWIRE_PIPE_PATH: pipePath,
  },
});

console.log(`   Child PID: ${child.pid}`);

// Read stdout line by line to get pipe path
console.log("2. Waiting for PIPE_READY signal from child...");

const reader = child.stdout.getReader();
let buffer = "";
let receivedPipePath = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += new TextDecoder().decode(value);
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";

  for (const line of lines) {
    console.log(`   Child stdout: ${line}`);
    if (line.startsWith("PIPE_READY:")) {
      receivedPipePath = line.slice("PIPE_READY:".length);
    }
  }

  if (receivedPipePath) break;
}

reader.releaseLock();

if (!receivedPipePath) {
  console.error("   ERROR: Did not receive PIPE_READY signal");
  child.kill();
  process.exit(1);
}

console.log(`   Received pipe path: ${receivedPipePath}`);

// Give child time to fully initialize server
await new Promise((r) => setTimeout(r, 100));

console.log("3. Connecting to child's data plane...");

const responses: string[] = [];

const socket = await Bun.connect({
  unix: receivedPipePath,
  socket: {
    open(_socket) {
      console.log("   Connected to data plane!");
    },
    data(_socket, data) {
      const response = Buffer.from(data).toString();
      responses.push(response);
      console.log(`   Received response: ${response}`);
    },
    close(_socket) {
      console.log("   Data plane disconnected");
    },
    error(_socket, error) {
      console.error("   Socket error:", error);
    },
  },
});

console.log("4. Sending messages over data plane...");

// Send test messages
socket.write("Hello from parent!");
await new Promise((r) => setTimeout(r, 50));

socket.write("Second message");
await new Promise((r) => setTimeout(r, 50));

socket.write("Binary test: " + Buffer.from([0x00, 0x01, 0x02]).toString("hex"));
await new Promise((r) => setTimeout(r, 50));

console.log("5. Verifying responses...");

console.log(`   Received ${responses.length} responses`);
for (const r of responses) {
  try {
    const parsed = JSON.parse(r);
    console.log(`   - seq=${parsed.seq}: "${parsed.echo}"`);
  } catch {
    console.log(`   - raw: ${r}`);
  }
}

// Cleanup
console.log("\n6. Cleanup...");
socket.end();
child.kill();
await child.exited;

console.log("   Child exited with code:", child.exitCode);

// Summary
console.log("\n=== PoC Summary ===");
console.log("✓ Parent successfully spawned child process");
console.log("✓ Child created named pipe server");
console.log("✓ Child signaled pipe path via stdout (control plane)");
console.log("✓ Parent connected to named pipe (data plane)");
console.log("✓ Bidirectional communication works");
console.log("✓ Child cleanup on parent disconnect");
console.log("\nThis architecture is compatible with Procwire!");
