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
 * Memory leak tests for transport layer.
 *
 * These tests verify that repeated operations don't cause unbounded memory growth.
 * For best results, run with: node --expose-gc node_modules/.bin/vitest run memory
 *
 * Note: Memory measurements are approximate and may vary between runs.
 * The key is to verify no significant/unbounded growth pattern.
 */
describe("Memory Tests", () => {
  let server: SocketServer | undefined;
  let serverChannel: Channel | undefined;
  let clientChannel: Channel | undefined;
  let socketPath: string;

  beforeEach(() => {
    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    socketPath = PipePath.forModule("memory-test", uniqueId);
  });

  afterEach(async () => {
    if (clientChannel) {
      await clientChannel.close().catch(() => {});
      clientChannel = undefined;
    }
    if (serverChannel) {
      await serverChannel.close().catch(() => {});
      serverChannel = undefined;
    }
    if (server) {
      await server.close().catch(() => {});
      server = undefined;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  /**
   * Forces garbage collection if available.
   */
  function forceGC(): void {
    if (typeof global.gc === "function") {
      global.gc();
    }
  }

  /**
   * Measures current heap usage in MB.
   */
  function getHeapMB(): number {
    return process.memoryUsage().heapUsed / 1024 / 1024;
  }

  async function setupChannels(): Promise<void> {
    server = new SocketServer();
    await server.listen(socketPath);

    const serverConnectionPromise = new Promise<Channel>((resolve) => {
      server!.onConnection((transport) => {
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
          return { ok: true };
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

  describe("Request/Response Memory", () => {
    it("should not leak memory on repeated requests", async () => {
      await setupChannels();

      // Warm up
      for (let i = 0; i < 100; i++) {
        await clientChannel!.request("echo", { data: "warmup" });
      }

      forceGC();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const heapBefore = getHeapMB();

      // Run many requests
      const requestCount = 5000;
      for (let i = 0; i < requestCount; i++) {
        await clientChannel!.request("echo", { data: "x".repeat(100), index: i });
      }

      forceGC();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const heapAfter = getHeapMB();

      const growth = heapAfter - heapBefore;

      console.log(`Memory test - repeated requests:`);
      console.log(`  Requests: ${requestCount}`);
      console.log(`  Heap before: ${heapBefore.toFixed(2)} MB`);
      console.log(`  Heap after: ${heapAfter.toFixed(2)} MB`);
      console.log(`  Growth: ${growth.toFixed(2)} MB`);

      // Allow up to 5MB growth (reasonable for test overhead)
      // Main concern is unbounded growth patterns
      expect(growth).toBeLessThan(5);
    });

    it("should not leak memory with concurrent requests", async () => {
      await setupChannels();

      // Warm up
      await Promise.all(Array.from({ length: 100 }, () => clientChannel!.request("echo", {})));

      forceGC();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const heapBefore = getHeapMB();

      // Run batches of concurrent requests
      const batchCount = 50;
      const batchSize = 100;

      for (let batch = 0; batch < batchCount; batch++) {
        const promises = Array.from({ length: batchSize }, (_, i) =>
          clientChannel!.request("echo", { data: "concurrent", batch, index: i }),
        );
        await Promise.all(promises);
      }

      forceGC();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const heapAfter = getHeapMB();

      const growth = heapAfter - heapBefore;

      console.log(`Memory test - concurrent requests:`);
      console.log(`  Batches: ${batchCount}, Size: ${batchSize}`);
      console.log(`  Total requests: ${batchCount * batchSize}`);
      console.log(`  Heap before: ${heapBefore.toFixed(2)} MB`);
      console.log(`  Heap after: ${heapAfter.toFixed(2)} MB`);
      console.log(`  Growth: ${growth.toFixed(2)} MB`);

      expect(growth).toBeLessThan(10);
    });
  });

  describe("Connect/Disconnect Memory", () => {
    it("should not leak memory on repeated connect/disconnect", async () => {
      server = new SocketServer();
      await server.listen(socketPath);

      // Handle connections
      server.onConnection((transport) => {
        const channel: any = new ChannelBuilder()
          .withTransport(transport)
          .withFraming(new LengthPrefixedFraming())
          .withSerialization(new JsonCodec())
          .withProtocol(new JsonRpcProtocol())
          .build();

        channel.onRequest(() => ({ ok: true }));
        channel.start();
      });

      // Warm up
      for (let i = 0; i < 5; i++) {
        const transport = new SocketTransport({ path: socketPath });
        const channel = new ChannelBuilder()
          .withTransport(transport)
          .withFraming(new LengthPrefixedFraming())
          .withSerialization(new JsonCodec())
          .withProtocol(new JsonRpcProtocol())
          .build();
        await channel.start();
        await channel.close();
      }

      forceGC();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const heapBefore = getHeapMB();

      // Repeated connect/disconnect cycles
      const cycles = 50;
      for (let i = 0; i < cycles; i++) {
        const transport = new SocketTransport({ path: socketPath });
        const channel = new ChannelBuilder()
          .withTransport(transport)
          .withFraming(new LengthPrefixedFraming())
          .withSerialization(new JsonCodec())
          .withProtocol(new JsonRpcProtocol())
          .build();

        await channel.start();
        await channel.request("ping");
        await channel.close();
      }

      forceGC();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const heapAfter = getHeapMB();

      const growth = heapAfter - heapBefore;

      console.log(`Memory test - connect/disconnect cycles:`);
      console.log(`  Cycles: ${cycles}`);
      console.log(`  Heap before: ${heapBefore.toFixed(2)} MB`);
      console.log(`  Heap after: ${heapAfter.toFixed(2)} MB`);
      console.log(`  Growth: ${growth.toFixed(2)} MB`);

      expect(growth).toBeLessThan(5);
    });
  });

  describe("Large Payload Memory", () => {
    it("should properly release memory after large payloads", async () => {
      await setupChannels();

      forceGC();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const heapBefore = getHeapMB();

      // Send large payloads
      const payloadSize = 100 * 1024; // 100KB
      const iterations = 50;

      for (let i = 0; i < iterations; i++) {
        const largePayload = { data: "x".repeat(payloadSize) };
        await clientChannel!.request("echo", largePayload);
      }

      forceGC();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const heapAfter = getHeapMB();

      const growth = heapAfter - heapBefore;

      console.log(`Memory test - large payloads:`);
      console.log(`  Payload size: ${(payloadSize / 1024).toFixed(0)} KB`);
      console.log(`  Iterations: ${iterations}`);
      console.log(`  Total transferred: ${((payloadSize * iterations * 2) / 1024 / 1024).toFixed(1)} MB`);
      console.log(`  Heap before: ${heapBefore.toFixed(2)} MB`);
      console.log(`  Heap after: ${heapAfter.toFixed(2)} MB`);
      console.log(`  Growth: ${growth.toFixed(2)} MB`);

      // After GC, memory should be mostly reclaimed
      // Allow some growth for internal buffers
      expect(growth).toBeLessThan(10);
    });
  });
});
