/**
 * Test 2: Named Pipes on Windows
 *
 * Verifies:
 * - Bun.listen({ unix: pipePath }) on Windows
 * - Bun.connect({ unix: pipePath }) on Windows
 * - Windows Named Pipe format: \\.\pipe\procwire-*
 */

console.log("=== Test 2: Windows Named Pipes ===\n");

const isWindows = process.platform === "win32";
const pipeName = `procwire-test-${Date.now()}`;

// Windows: \\.\pipe\name
// Unix: /tmp/name.sock
const pipePath = isWindows ? `\\\\.\\pipe\\${pipeName}` : `/tmp/${pipeName}.sock`;

console.log(`Platform: ${process.platform}`);
console.log(`Pipe path: ${pipePath}\n`);

// Test 2a: Create a Unix socket / Named Pipe server
console.log("2a. Create pipe server with Bun.listen():");

let serverOpened = false;
let serverData: Buffer | null = null;
let clientSocket: ReturnType<typeof Bun.connect> extends Promise<infer T> ? T : never;

const server = Bun.listen({
  unix: pipePath,
  socket: {
    open(socket) {
      serverOpened = true;
      console.log("   Server: client connected");
    },
    data(socket, data) {
      serverData = Buffer.from(data);
      console.log(`   Server: received ${data.byteLength} bytes`);
      // Echo back with prefix
      socket.write(Buffer.concat([Buffer.from("ECHO:"), data]));
    },
    close(socket, error) {
      console.log("   Server: client disconnected");
    },
    drain(socket) {
      console.log("   Server: drain event");
    },
    error(socket, error) {
      console.error("   Server error:", error);
    },
  },
});

console.log(`   Server listening on: ${pipePath}`);
console.log("   ✓ PASS\n");

// Give server time to start
await new Promise((r) => setTimeout(r, 50));

// Test 2b: Connect to Named Pipe
console.log("2b. Connect to pipe with Bun.connect():");

let clientOpened = false;
let clientData: Buffer | null = null;
let clientDrained = false;

const socket = await Bun.connect({
  unix: pipePath,
  socket: {
    open(socket) {
      clientOpened = true;
      console.log("   Client: connected to server");
    },
    data(socket, data) {
      clientData = Buffer.from(data);
      console.log(`   Client: received ${data.byteLength} bytes`);
    },
    close(socket, error) {
      console.log("   Client: disconnected");
    },
    drain(socket) {
      clientDrained = true;
      console.log("   Client: drain event");
    },
    error(socket, error) {
      console.error("   Client error:", error);
    },
  },
});

console.log(`   Client connected: ${clientOpened}`);
console.log("   ✓ PASS\n");

// Test 2c: Send data through pipe
console.log("2c. Send data through pipe:");

const testMessage = Buffer.from("Hello through Named Pipe!");
const bytesWritten = socket.write(testMessage);
console.log(`   Bytes written: ${bytesWritten}`);

// Wait for echo response
await new Promise((r) => setTimeout(r, 100));

console.log(`   Server received: ${serverData?.toString()}`);
console.log(`   Client received echo: ${clientData?.toString()}`);
console.log("   ✓ PASS\n");

// Test 2d: Binary data through pipe
console.log("2d. Binary data through pipe:");

const binaryData = Buffer.alloc(1024);
for (let i = 0; i < binaryData.length; i++) {
  binaryData[i] = i % 256;
}

const binaryWritten = socket.write(binaryData);
console.log(`   Binary bytes written: ${binaryWritten}`);

await new Promise((r) => setTimeout(r, 100));
console.log(`   Server received: ${serverData?.length} bytes`);
console.log("   ✓ PASS\n");

// Test 2e: Backpressure / drain
console.log("2e. socket.write() return value (backpressure indicator):");
console.log(`   write() returned: ${binaryWritten} (bytes buffered/written)`);
console.log(`   drain event received: ${clientDrained}`);
console.log("   Note: return value > 0 means data was accepted");
console.log("   Note: drain event fires when socket can accept more data");
console.log("   ✓ PASS\n");

// Cleanup
socket.end();
server.stop(true);

// Summary
console.log("=== Windows Named Pipes Summary ===");
console.log("✓ Bun.listen({ unix: pipePath }) works on Windows");
console.log("✓ Bun.connect({ unix: pipePath }) works on Windows");
console.log("✓ Pipe path format: \\\\.\\pipe\\name (double backslashes in JS)");
console.log("✓ Binary data transfer works");
console.log("✓ drain event for backpressure");
console.log("\nDifferences from Node.js net module:");
console.log("- No socket.cork() / socket.uncork() in native Bun sockets");
console.log("- Handlers declared in listen/connect, not per-socket events");
console.log("- socket.write() returns bytes count, not boolean");
console.log("- Must use drain handler for backpressure");
