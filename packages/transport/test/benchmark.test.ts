/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SocketServer } from "../src/transport/socket-server.js";
import { SocketTransport } from "../src/transport/socket-transport.js";
import { LengthPrefixedFraming } from "../src/framing/length-prefixed.js";
import { JsonCodec } from "../src/serialization/json.js";
import { JsonRpcProtocol } from "../src/protocol/jsonrpc.js";
import { ChannelBuilder } from "../src/channel/builder.js";
import type { Channel } from "../src/channel/types.js";
import { PipePath } from "../src/utils/pipe-path.js";
import type { JsonRpcRequest } from "../src/protocol/jsonrpc.js";

/**
 * Performance benchmarks for transport layer.
 *
 * These tests measure throughput and latency characteristics.
 * Run with: pnpm --filter @procwire/transport test benchmark
 */
describe("Performance Benchmarks", () => {
  let server: SocketServer;
  let serverChannel: Channel;
  let clientChannel: Channel;
  let socketPath: string;

  beforeEach(() => {
    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    socketPath = PipePath.forModule("benchmark", uniqueId);
  });

  afterEach(async () => {
    if (clientChannel) {
      await clientChannel.close().catch(() => {});
    }
    if (serverChannel) {
      await serverChannel.close().catch(() => {});
    }
    if (server) {
      await server.close().catch(() => {});
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  async function setupChannels(): Promise<void> {
    server = new SocketServer();
    await server.listen(socketPath);

    const serverConnectionPromise = new Promise<Channel>((resolve) => {
      server.onConnection((transport) => {
        const channel: any = new ChannelBuilder()
          .withTransport(transport)
          .withFraming(new LengthPrefixedFraming())
          .withSerialization(new JsonCodec())
          .withProtocol(new JsonRpcProtocol())
          .build();

        channel.onRequest((request: any) => {
          const req = request as JsonRpcRequest;
          if (req.method === "echo") {
            return req.params;
          }
          if (req.method === "ping") {
            return { pong: true };
          }
          throw new Error("Unknown method");
        });

        channel.start().then(() => resolve(channel));
      });
    });

    const clientTransport = new SocketTransport({ path: socketPath });
    clientChannel = new ChannelBuilder()
      .withTransport(clientTransport)
      .withFraming(new LengthPrefixedFraming())
      .withSerialization(new JsonCodec())
      .withProtocol(new JsonRpcProtocol())
      .withTimeout(30000)
      .build();

    await clientChannel.start();
    serverChannel = await serverConnectionPromise;
  }

  describe("Throughput", () => {
    it("should handle high request throughput", async () => {
      await setupChannels();

      const requestCount = 1000;
      const start = performance.now();

      const promises = Array.from({ length: requestCount }, (_, i) =>
        clientChannel.request("echo", { id: i }),
      );

      await Promise.all(promises);

      const elapsed = performance.now() - start;
      const throughput = requestCount / (elapsed / 1000);

      console.log(`Throughput benchmark:`);
      console.log(`  Requests: ${requestCount}`);
      console.log(`  Elapsed: ${elapsed.toFixed(2)}ms`);
      console.log(`  Throughput: ${throughput.toFixed(0)} req/s`);

      // Minimum acceptable throughput: 500 req/s (conservative for CI)
      expect(throughput).toBeGreaterThan(500);
    });

    it("should handle sequential requests efficiently", async () => {
      await setupChannels();

      const requestCount = 100;
      const start = performance.now();

      for (let i = 0; i < requestCount; i++) {
        await clientChannel.request("ping");
      }

      const elapsed = performance.now() - start;
      const avgLatency = elapsed / requestCount;

      console.log(`Sequential request benchmark:`);
      console.log(`  Requests: ${requestCount}`);
      console.log(`  Elapsed: ${elapsed.toFixed(2)}ms`);
      console.log(`  Avg latency: ${avgLatency.toFixed(2)}ms`);

      // Each sequential request should average under 10ms
      expect(avgLatency).toBeLessThan(10);
    });
  });

  describe("Latency", () => {
    it("should have low p99 latency", async () => {
      await setupChannels();

      const latencies: number[] = [];
      const sampleCount = 500;

      for (let i = 0; i < sampleCount; i++) {
        const start = performance.now();
        await clientChannel.request("ping");
        latencies.push(performance.now() - start);
      }

      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(latencies.length * 0.5)]!;
      const p95 = latencies[Math.floor(latencies.length * 0.95)]!;
      const p99 = latencies[Math.floor(latencies.length * 0.99)]!;
      const min = latencies[0]!;
      const max = latencies[latencies.length - 1]!;
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

      console.log(`Latency benchmark (${sampleCount} samples):`);
      console.log(`  Min: ${min.toFixed(2)}ms`);
      console.log(`  Avg: ${avg.toFixed(2)}ms`);
      console.log(`  p50: ${p50.toFixed(2)}ms`);
      console.log(`  p95: ${p95.toFixed(2)}ms`);
      console.log(`  p99: ${p99.toFixed(2)}ms`);
      console.log(`  Max: ${max.toFixed(2)}ms`);

      // p99 should be under 20ms (conservative for CI environments)
      expect(p99).toBeLessThan(20);
    });
  });

  describe("Payload Size", () => {
    it("should handle various payload sizes efficiently", async () => {
      await setupChannels();

      const sizes = [100, 1000, 10000, 100000]; // 100B, 1KB, 10KB, 100KB
      const results: { size: number; latency: number; throughputMBps: number }[] = [];

      for (const size of sizes) {
        const payload = { data: "x".repeat(size) };
        const iterations = 50;
        const start = performance.now();

        for (let i = 0; i < iterations; i++) {
          await clientChannel.request("echo", payload);
        }

        const elapsed = performance.now() - start;
        const totalBytes = size * iterations * 2; // Request + response
        const throughputMBps = totalBytes / 1024 / 1024 / (elapsed / 1000);

        results.push({
          size,
          latency: elapsed / iterations,
          throughputMBps,
        });
      }

      console.log(`Payload size benchmark:`);
      for (const r of results) {
        console.log(
          `  ${(r.size / 1024).toFixed(1)}KB: ${r.latency.toFixed(2)}ms/req, ${r.throughputMBps.toFixed(2)} MB/s`,
        );
      }

      // Should handle 100KB payloads without timeout
      const largePayloadResult = results.find((r) => r.size === 100000);
      expect(largePayloadResult).toBeDefined();
      expect(largePayloadResult!.latency).toBeLessThan(100);
    });
  });
});
