/**
 * Benchmark: Transport Layer Breakdown
 *
 * Measures time spent in each layer:
 * 1. Raw pipe/socket write (no framing, no serialization)
 * 2. Framing overhead (length-prefixed vs line-delimited)
 * 3. Full stack (transport + framing + serialization + protocol)
 *
 * Run with: pnpm benchmark:transport
 */

import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function _formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 * 1024 * 1024)
    return `${(bytesPerSec / 1024 / 1024 / 1024).toFixed(2)} GB/s`;
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / 1024 / 1024).toFixed(2)} MB/s`;
  if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(2)} KB/s`;
  return `${bytesPerSec.toFixed(2)} B/s`;
}

function getPipePath(name: string): string {
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\benchmark-${name}-${process.pid}`;
  }
  return path.join(os.tmpdir(), `benchmark-${name}-${process.pid}.sock`);
}

function generateBinaryPayload(sizeBytes: number): Buffer {
  return Buffer.alloc(sizeBytes, 0x78); // Fill with 'x'
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw Pipe Benchmark (no framing, no serialization)
// ─────────────────────────────────────────────────────────────────────────────

async function benchmarkRawPipe(
  sizeBytes: number,
  iterations: number,
): Promise<{
  avgMs: number;
  throughputMBps: number;
}> {
  const pipePath = getPipePath("raw");
  const payload = generateBinaryPayload(sizeBytes);

  // Cleanup any existing socket
  if (process.platform !== "win32") {
    try {
      fs.unlinkSync(pipePath);
    } catch {
      // Ignore errors when cleaning up Unix socket
    }
  }

  return new Promise((resolve, reject) => {
    let received = 0;
    const expectedTotal = sizeBytes * iterations;
    let startTime: number;
    let clientSocket: net.Socket;

    const server = net.createServer((socket) => {
      socket.on("data", (data) => {
        received += data.length;
        if (received >= expectedTotal) {
          const elapsed = performance.now() - startTime;
          clientSocket.end();
          socket.end();
          server.close(() => {
            if (process.platform !== "win32") {
              try {
                fs.unlinkSync(pipePath);
              } catch {
                // Ignore cleanup errors
              }
            }
            const totalMB = (sizeBytes * iterations) / (1024 * 1024);
            resolve({
              avgMs: elapsed / iterations,
              throughputMBps: totalMB / (elapsed / 1000),
            });
          });
        }
      });
    });

    server.listen(pipePath, () => {
      clientSocket = net.connect(pipePath, () => {
        startTime = performance.now();

        // Write all payloads
        let written = 0;
        const writeNext = () => {
          while (written < iterations) {
            const canContinue = clientSocket.write(payload);
            written++;
            if (!canContinue) {
              clientSocket.once("drain", writeNext);
              return;
            }
          }
        };
        writeNext();
      });

      clientSocket.on("error", reject);
    });

    server.on("error", reject);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipe with Length-Prefixed Framing
// ─────────────────────────────────────────────────────────────────────────────

async function benchmarkLengthPrefixedPipe(
  sizeBytes: number,
  iterations: number,
): Promise<{
  avgMs: number;
  throughputMBps: number;
}> {
  const pipePath = getPipePath("lp");
  const payload = generateBinaryPayload(sizeBytes);

  // Cleanup any existing socket
  if (process.platform !== "win32") {
    try {
      fs.unlinkSync(pipePath);
    } catch {
      // Ignore cleanup errors
    }
  }

  return new Promise((resolve, reject) => {
    let messagesReceived = 0;
    // Use buffer list to avoid Buffer.concat overhead
    const buffers: Buffer[] = [];
    let totalLength = 0;
    let expectedLength: number | null = null;
    let startTime: number;
    let clientSocket: net.Socket;

    // Helper to peek bytes from buffer list
    const peekUInt32BE = (): number | null => {
      if (totalLength < 4) return null;
      const first = buffers[0]!;
      if (first.length >= 4) {
        return first.readUInt32BE(0);
      }
      // Rare case: header split across buffers
      const header = Buffer.allocUnsafe(4);
      let offset = 0;
      for (const buf of buffers) {
        const toCopy = Math.min(buf.length, 4 - offset);
        buf.copy(header, offset, 0, toCopy);
        offset += toCopy;
        if (offset >= 4) break;
      }
      return header.readUInt32BE(0);
    };

    // Helper to consume bytes from buffer list
    const consumeBytes = (length: number): void => {
      let remaining = length;
      while (remaining > 0 && buffers.length > 0) {
        const buf = buffers[0]!;
        if (remaining >= buf.length) {
          buffers.shift();
          remaining -= buf.length;
        } else {
          buffers[0] = buf.subarray(remaining);
          remaining = 0;
        }
      }
      totalLength -= length;
    };

    const server = net.createServer((socket) => {
      socket.on("data", (data) => {
        buffers.push(data);
        totalLength += data.length;

        // Parse length-prefixed messages
        while (true) {
          if (expectedLength === null) {
            const len = peekUInt32BE();
            if (len === null) break;
            expectedLength = len;
            consumeBytes(4);
          }

          if (totalLength < expectedLength) break;

          // Got a complete message - skip the payload (just consume bytes)
          consumeBytes(expectedLength);
          expectedLength = null;
          messagesReceived++;

          if (messagesReceived >= iterations) {
            const elapsed = performance.now() - startTime;
            clientSocket.end();
            socket.end();
            server.close(() => {
              if (process.platform !== "win32") {
                try {
                  fs.unlinkSync(pipePath);
                } catch {
                  // Ignore cleanup errors
                }
              }
              const totalMB = (sizeBytes * iterations) / (1024 * 1024);
              resolve({
                avgMs: elapsed / iterations,
                throughputMBps: totalMB / (elapsed / 1000),
              });
            });
            return;
          }
        }
      });
    });

    server.listen(pipePath, () => {
      clientSocket = net.connect(pipePath, () => {
        startTime = performance.now();

        // Write all payloads with length prefix
        let written = 0;
        const writeNext = () => {
          while (written < iterations) {
            // Create length-prefixed frame
            const frame = Buffer.alloc(4 + payload.length);
            frame.writeUInt32BE(payload.length, 0);
            payload.copy(frame, 4);

            const canContinue = clientSocket.write(frame);
            written++;
            if (!canContinue) {
              clientSocket.once("drain", writeNext);
              return;
            }
          }
        };
        writeNext();
      });

      clientSocket.on("error", reject);
    });

    server.on("error", reject);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stdio Benchmark (for comparison)
// ─────────────────────────────────────────────────────────────────────────────

async function benchmarkRawStdio(
  sizeBytes: number,
  iterations: number,
): Promise<{
  avgMs: number;
  throughputMBps: number;
}> {
  const { spawn } = await import("node:child_process");
  const payload = generateBinaryPayload(sizeBytes);

  return new Promise((resolve, reject) => {
    // Spawn a simple echo process
    const child = spawn(
      "node",
      [
        "-e",
        `
      let received = 0;
      const expected = ${sizeBytes * iterations};
      process.stdin.on("data", (data) => {
        received += data.length;
        if (received >= expected) {
          process.exit(0);
        }
      });
    `,
      ],
      {
        stdio: ["pipe", "pipe", "inherit"],
      },
    );

    let startTime = 0;

    child.on("error", reject);
    child.on("exit", () => {
      const elapsed = performance.now() - startTime;
      const totalMB = (sizeBytes * iterations) / (1024 * 1024);
      resolve({
        avgMs: elapsed / iterations,
        throughputMBps: totalMB / (elapsed / 1000),
      });
    });

    // Start writing
    startTime = performance.now();
    let written = 0;

    const writeNext = () => {
      while (written < iterations) {
        const canContinue = child.stdin!.write(payload);
        written++;
        if (!canContinue) {
          child.stdin!.once("drain", writeNext);
          return;
        }
      }
      child.stdin!.end();
    };
    writeNext();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Request/Response Round-trip (simulates actual usage)
// ─────────────────────────────────────────────────────────────────────────────

async function benchmarkRoundTrip(
  sizeBytes: number,
  iterations: number,
): Promise<{
  avgMs: number;
  throughputMBps: number;
}> {
  const pipePath = getPipePath("rt");
  const payload = generateBinaryPayload(sizeBytes);

  // Cleanup any existing socket
  if (process.platform !== "win32") {
    try {
      fs.unlinkSync(pipePath);
    } catch {
      // Ignore cleanup errors
    }
  }

  // Helper class for efficient buffer management (avoids Buffer.concat)
  class BufferList {
    private buffers: Buffer[] = [];
    private totalLength = 0;
    private expectedLength: number | null = null;

    push(data: Buffer): void {
      this.buffers.push(data);
      this.totalLength += data.length;
    }

    peekUInt32BE(): number | null {
      if (this.totalLength < 4) return null;
      const first = this.buffers[0]!;
      if (first.length >= 4) {
        return first.readUInt32BE(0);
      }
      const header = Buffer.allocUnsafe(4);
      let offset = 0;
      for (const buf of this.buffers) {
        const toCopy = Math.min(buf.length, 4 - offset);
        buf.copy(header, offset, 0, toCopy);
        offset += toCopy;
        if (offset >= 4) break;
      }
      return header.readUInt32BE(0);
    }

    takeFrame(): Buffer | null {
      if (this.expectedLength === null) {
        const len = this.peekUInt32BE();
        if (len === null) return null;
        this.expectedLength = len;
        this.consumeBytes(4);
      }

      if (this.totalLength < this.expectedLength) return null;

      // Extract frame data
      const length = this.expectedLength;
      const result = Buffer.allocUnsafe(4 + length);
      result.writeUInt32BE(length, 0);

      let offset = 4;
      let remaining = length;
      while (remaining > 0 && this.buffers.length > 0) {
        const buf = this.buffers[0]!;
        if (remaining >= buf.length) {
          buf.copy(result, offset);
          offset += buf.length;
          remaining -= buf.length;
          this.buffers.shift();
        } else {
          buf.copy(result, offset, 0, remaining);
          this.buffers[0] = buf.subarray(remaining);
          remaining = 0;
        }
      }
      this.totalLength -= length;
      this.expectedLength = null;
      return result;
    }

    skipFrame(): boolean {
      if (this.expectedLength === null) {
        const len = this.peekUInt32BE();
        if (len === null) return false;
        this.expectedLength = len;
        this.consumeBytes(4);
      }

      if (this.totalLength < this.expectedLength) return false;

      this.consumeBytes(this.expectedLength);
      this.expectedLength = null;
      return true;
    }

    private consumeBytes(length: number): void {
      let remaining = length;
      while (remaining > 0 && this.buffers.length > 0) {
        const buf = this.buffers[0]!;
        if (remaining >= buf.length) {
          this.buffers.shift();
          remaining -= buf.length;
        } else {
          this.buffers[0] = buf.subarray(remaining);
          remaining = 0;
        }
      }
      this.totalLength -= length;
    }
  }

  return new Promise((resolve, reject) => {
    let roundTripsCompleted = 0;
    const clientBufferList = new BufferList();
    const serverBufferList = new BufferList();
    let startTime: number;
    let clientSocket: net.Socket;
    const times: number[] = [];
    let requestStart: number;

    const server = net.createServer((socket) => {
      socket.on("data", (data) => {
        serverBufferList.push(data);

        // Parse and echo back
        let frame: Buffer | null;
        while ((frame = serverBufferList.takeFrame()) !== null) {
          // Echo back immediately
          socket.write(frame);
        }
      });
    });

    server.listen(pipePath, () => {
      clientSocket = net.connect(pipePath, () => {
        startTime = performance.now();

        // Handle responses
        clientSocket.on("data", (data) => {
          clientBufferList.push(data);

          while (clientBufferList.skipFrame()) {
            times.push(performance.now() - requestStart);
            roundTripsCompleted++;

            if (roundTripsCompleted >= iterations) {
              const elapsed = performance.now() - startTime;
              clientSocket.end();
              server.close(() => {
                if (process.platform !== "win32") {
                  try {
                    fs.unlinkSync(pipePath);
                  } catch {
                    // Ignore cleanup errors
                  }
                }
                const totalMB = (sizeBytes * iterations * 2) / (1024 * 1024); // *2 for round-trip
                resolve({
                  avgMs: times.reduce((a, b) => a + b, 0) / times.length,
                  throughputMBps: totalMB / (elapsed / 1000),
                });
              });
              return;
            }

            // Send next request
            sendRequest();
          }
        });

        // Send requests one at a time (simulating request/response pattern)
        const sendRequest = () => {
          const frame = Buffer.allocUnsafe(4 + payload.length);
          frame.writeUInt32BE(payload.length, 0);
          payload.copy(frame, 4);
          requestStart = performance.now();
          clientSocket.write(frame);
        };

        sendRequest();
      });

      clientSocket.on("error", reject);
    });

    server.on("error", reject);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Transport Layer Breakdown Analysis");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");

  const testCases = [
    { sizeKB: 100, iterations: 100 },
    { sizeKB: 1024, iterations: 50 }, // 1 MB
    { sizeKB: 10 * 1024, iterations: 20 }, // 10 MB
    { sizeKB: 100 * 1024, iterations: 5 }, // 100 MB
  ];

  for (const { sizeKB, iterations } of testCases) {
    const sizeBytes = sizeKB * 1024;
    const label = sizeKB >= 1024 ? `${sizeKB / 1024} MB` : `${sizeKB} KB`;

    console.log(`\n─── ${label} payload (${iterations} iterations) ───\n`);

    // Raw pipe (one-way streaming)
    console.log("  Raw Named Pipe (one-way, no framing):");
    try {
      const rawPipe = await benchmarkRawPipe(sizeBytes, iterations);
      console.log(`    Throughput: ${formatSpeed(rawPipe.throughputMBps * 1024 * 1024)}`);
      console.log(`    Avg time per payload: ${rawPipe.avgMs.toFixed(2)}ms`);
    } catch (e) {
      console.log(`    Error: ${e}`);
    }

    // Length-prefixed pipe (one-way streaming)
    console.log("\n  Length-Prefixed Pipe (one-way, with framing):");
    try {
      const lpPipe = await benchmarkLengthPrefixedPipe(sizeBytes, iterations);
      console.log(`    Throughput: ${formatSpeed(lpPipe.throughputMBps * 1024 * 1024)}`);
      console.log(`    Avg time per payload: ${lpPipe.avgMs.toFixed(2)}ms`);
    } catch (e) {
      console.log(`    Error: ${e}`);
    }

    // Raw stdio (one-way streaming)
    console.log("\n  Raw Stdio (one-way, no framing):");
    try {
      const rawStdio = await benchmarkRawStdio(sizeBytes, iterations);
      console.log(`    Throughput: ${formatSpeed(rawStdio.throughputMBps * 1024 * 1024)}`);
      console.log(`    Avg time per payload: ${rawStdio.avgMs.toFixed(2)}ms`);
    } catch (e) {
      console.log(`    Error: ${e}`);
    }

    // Round-trip (request/response pattern)
    console.log("\n  Round-Trip (request/response, length-prefixed):");
    try {
      const roundTrip = await benchmarkRoundTrip(sizeBytes, iterations);
      console.log(`    Throughput: ${formatSpeed(roundTrip.throughputMBps * 1024 * 1024)}`);
      console.log(`    Avg round-trip time: ${roundTrip.avgMs.toFixed(2)}ms`);
    } catch (e) {
      console.log(`    Error: ${e}`);
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  Analysis Complete!");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("\nInterpretation:");
  console.log("  - Raw pipe shows maximum achievable throughput");
  console.log("  - Length-prefixed adds framing overhead");
  console.log("  - Stdio for comparison (may have different characteristics)");
  console.log("  - Round-trip shows actual request/response performance");
  console.log("  - Difference between one-way and round-trip shows latency impact");
}

main().catch(console.error);
