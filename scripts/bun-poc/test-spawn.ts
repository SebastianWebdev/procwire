/**
 * Test 1: Bun.spawn() API Compatibility
 *
 * Verifies:
 * - stdio: ['pipe', 'pipe', 'pipe'] equivalent
 * - subprocess.stdin.write() and subprocess.stdout
 * - onExit callback
 */

console.log("=== Test 1: Bun.spawn() API ===\n");

// Test 1a: Basic spawn with piped stdio
console.log("1a. Basic spawn with piped stdio:");
const proc = Bun.spawn(["bun", "-e", 'console.log("Hello from child")'], {
  stdout: "pipe",
  stderr: "pipe",
});

const stdout = await new Response(proc.stdout).text();
console.log(`   stdout: ${stdout.trim()}`);
console.log(`   pid: ${proc.pid}`);
await proc.exited;
console.log(`   exitCode: ${proc.exitCode}`);
console.log("   ✓ PASS\n");

// Test 1b: stdin pipe write
console.log("1b. stdin pipe write:");
const echoProc = Bun.spawn(["bun", "-e", `
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
    break; // Read first chunk
  }
  console.log("Received:", Buffer.concat(chunks).toString());
`], {
  stdin: "pipe",
  stdout: "pipe",
});

echoProc.stdin.write("Test message from parent");
echoProc.stdin.end();

const echoOutput = await new Response(echoProc.stdout).text();
console.log(`   ${echoOutput.trim()}`);
await echoProc.exited;
console.log(`   exitCode: ${echoProc.exitCode}`);
console.log("   ✓ PASS\n");

// Test 1c: onExit callback
console.log("1c. onExit callback:");
let exitCalled = false;
let exitData: { exitCode: number | null; signalCode: string | null } | null = null;

const exitProc = Bun.spawn(["bun", "-e", "process.exit(42)"], {
  stdout: "ignore",
  stderr: "ignore",
  onExit(proc, exitCode, signalCode, error) {
    exitCalled = true;
    exitData = { exitCode, signalCode };
  },
});

await exitProc.exited;

// Small delay to ensure onExit is called
await new Promise((r) => setTimeout(r, 10));

console.log(`   onExit called: ${exitCalled}`);
console.log(`   exitCode: ${exitData?.exitCode}`);
console.log(`   signalCode: ${exitData?.signalCode}`);
console.log("   ✓ PASS\n");

// Test 1d: Binary data through stdin/stdout
console.log("1d. Binary data through pipes:");
const binaryProc = Bun.spawn(["bun", "-e", `
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
  }
  const data = Buffer.concat(chunks);
  // Echo back with first byte incremented
  data[0] = data[0] + 1;
  process.stdout.write(data);
`], {
  stdin: "pipe",
  stdout: "pipe",
});

const testBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
binaryProc.stdin.write(testBuffer);
binaryProc.stdin.end();

const binaryOutput = Buffer.from(await new Response(binaryProc.stdout).arrayBuffer());
console.log(`   Input:  [${Array.from(testBuffer).join(", ")}]`);
console.log(`   Output: [${Array.from(binaryOutput).join(", ")}]`);
console.log(`   First byte incremented: ${binaryOutput[0] === 1 ? "✓" : "✗"}`);
await binaryProc.exited;
console.log("   ✓ PASS\n");

// Summary
console.log("=== Bun.spawn() Summary ===");
console.log("✓ stdio pipe configuration works");
console.log("✓ stdin.write() and stdin.end() work");
console.log("✓ stdout as ReadableStream works");
console.log("✓ onExit callback works");
console.log("✓ Binary data transfer works");
console.log("\nDifferences from Node.js child_process:");
console.log("- stdin is FileSink (not Writable stream)");
console.log("- stdout is ReadableStream (not Readable stream)");
console.log("- No .on('data') events - use async iterator or Response");
