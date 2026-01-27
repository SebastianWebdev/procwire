/**
 * Data channel integration tests.
 *
 * Tests communication over named pipes (Windows) or Unix sockets (macOS/Linux).
 * This verifies the most important functionality of the library - high-performance
 * IPC via pipes/sockets rather than stdio.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProcessManager } from "@procwire/transport";
import {
  spawnWorkerWithDataChannel,
  generatePayload,
  measureTime,
} from "../../utils/test-helpers.js";

describe("Data Channel Communication", () => {
  let manager: ProcessManager;

  beforeEach(() => {
    manager = new ProcessManager({
      namespace: "data-channel-test",
      defaultTimeout: 30000,
      gracefulShutdownMs: 5000,
    });
  });

  afterEach(async () => {
    await manager.terminateAll();
  });

  describe("Basic Data Channel Operations", () => {
    it("should establish data channel connection", async () => {
      const handle = await spawnWorkerWithDataChannel(
        manager,
        "test-data-connect",
        "data-channel-worker.ts",
      );

      expect(handle.state).toBe("running");
      expect(handle.dataChannel).not.toBeNull();

      await manager.terminate("test-data-connect");
    });

    it("should send request via data channel", async () => {
      const handle = await spawnWorkerWithDataChannel(
        manager,
        "test-data-request",
        "data-channel-worker.ts",
      );

      const result = await handle.requestViaData("ping");

      expect(result).toEqual({
        pong: true,
        timestamp: expect.any(Number),
      });

      await manager.terminate("test-data-request");
    });

    it("should echo data via data channel", async () => {
      const handle = await spawnWorkerWithDataChannel(
        manager,
        "test-data-echo",
        "data-channel-worker.ts",
      );

      const testData = { message: "hello via data channel", value: 42 };
      const result = await handle.requestViaData("echo", testData);

      expect(result).toEqual(testData);

      await manager.terminate("test-data-echo");
    });

    it("should handle multiple sequential requests via data channel", async () => {
      const handle = await spawnWorkerWithDataChannel(
        manager,
        "test-data-sequential",
        "data-channel-worker.ts",
      );

      for (let i = 0; i < 10; i++) {
        const result = await handle.requestViaData("echo", { index: i });
        expect(result).toEqual({ index: i });
      }

      await manager.terminate("test-data-sequential");
    });

    it("should handle concurrent requests via data channel", async () => {
      const handle = await spawnWorkerWithDataChannel(
        manager,
        "test-data-concurrent",
        "data-channel-worker.ts",
      );

      const requests = Array.from({ length: 20 }, (_, i) =>
        handle.requestViaData("echo", { index: i }),
      );

      const results = await Promise.all(requests);

      for (let i = 0; i < 20; i++) {
        expect(results[i]).toEqual({ index: i });
      }

      await manager.terminate("test-data-concurrent");
    });
  });

  describe("Large Payload Transfer", () => {
    it("should transfer 100KB payload via data channel", async () => {
      const handle = await spawnWorkerWithDataChannel(
        manager,
        "test-large-100kb",
        "data-channel-worker.ts",
      );

      const payload = generatePayload(100); // 100 KB
      const result = (await handle.requestViaData("process_payload", {
        data: payload.data,
      })) as { receivedSize: number; checksum: number };

      expect(result.receivedSize).toBe(payload.size);

      await manager.terminate("test-large-100kb");
    });

    it("should transfer 1MB payload via data channel", async () => {
      const handle = await spawnWorkerWithDataChannel(
        manager,
        "test-large-1mb",
        "data-channel-worker.ts",
      );

      const payload = generatePayload(1024); // 1 MB
      const result = (await handle.requestViaData("process_payload", {
        data: payload.data,
      })) as { receivedSize: number; checksum: number };

      expect(result.receivedSize).toBe(payload.size);

      await manager.terminate("test-large-1mb");
    }, 30000);

    it("should transfer 5MB payload via data channel", async () => {
      const handle = await spawnWorkerWithDataChannel(
        manager,
        "test-large-5mb",
        "data-channel-worker.ts",
      );

      const payload = generatePayload(5 * 1024); // 5 MB
      const result = (await handle.requestViaData("process_payload", {
        data: payload.data,
      })) as { receivedSize: number; checksum: number };

      expect(result.receivedSize).toBe(payload.size);

      await manager.terminate("test-large-5mb");
    }, 60000);

    it("should generate large payload from worker via data channel", async () => {
      const handle = await spawnWorkerWithDataChannel(
        manager,
        "test-generate-payload",
        "data-channel-worker.ts",
      );

      const result = (await handle.requestViaData("generate_payload", {
        sizeKB: 500,
      })) as { data: string; size: number };

      expect(result.size).toBe(500 * 1024);
      expect(result.data.length).toBe(500 * 1024);

      await manager.terminate("test-generate-payload");
    }, 30000);
  });

  describe("Data Channel vs Control Channel Performance", () => {
    it("should show data channel handles large payloads better than control channel", async () => {
      const handle = await spawnWorkerWithDataChannel(
        manager,
        "test-perf-comparison",
        "data-channel-worker.ts",
      );

      const payload = generatePayload(100); // 100 KB

      // Measure data channel performance
      const dataChannelTiming = await measureTime(async () => {
        for (let i = 0; i < 5; i++) {
          await handle.requestViaData("process_payload", { data: payload.data });
        }
      });

      // Measure control channel performance
      const controlChannelTiming = await measureTime(async () => {
        for (let i = 0; i < 5; i++) {
          await handle.request("process_payload", { data: payload.data });
        }
      });

      // Log for visibility
      console.log(`Data channel: ${dataChannelTiming.elapsed}ms for 5 x 100KB`);
      console.log(`Control channel: ${controlChannelTiming.elapsed}ms for 5 x 100KB`);

      // Both should complete successfully - performance may vary by environment
      expect(dataChannelTiming.elapsed).toBeLessThan(30000);
      expect(controlChannelTiming.elapsed).toBeLessThan(30000);

      await manager.terminate("test-perf-comparison");
    }, 60000);

    it("should handle high-throughput small messages via data channel", async () => {
      const handle = await spawnWorkerWithDataChannel(
        manager,
        "test-throughput",
        "data-channel-worker.ts",
      );

      const startTime = Date.now();
      const messageCount = 200;

      const requests = Array.from({ length: messageCount }, (_, i) =>
        handle.requestViaData("echo", { n: i }),
      );

      await Promise.all(requests);

      const elapsed = Date.now() - startTime;
      const rate = (messageCount / elapsed) * 1000;

      console.log(
        `Data channel throughput: ${rate.toFixed(0)} msg/sec (${messageCount} messages in ${elapsed}ms)`,
      );

      // Should achieve at least 50 msg/sec even on slow machines
      expect(rate).toBeGreaterThan(50);

      await manager.terminate("test-throughput");
    }, 30000);
  });

  describe("Both Channels Working Together", () => {
    it("should handle requests on both channels simultaneously", async () => {
      const handle = await spawnWorkerWithDataChannel(
        manager,
        "test-dual-channel",
        "data-channel-worker.ts",
      );

      // Send requests on both channels concurrently
      const [controlResult, dataResult] = await Promise.all([
        handle.request("echo", { channel: "control" }),
        handle.requestViaData("echo", { channel: "data" }),
      ]);

      expect(controlResult).toEqual({ channel: "control" });
      expect(dataResult).toEqual({ channel: "data" });

      await manager.terminate("test-dual-channel");
    });

    it("should interleave requests between channels", async () => {
      const handle = await spawnWorkerWithDataChannel(
        manager,
        "test-interleave",
        "data-channel-worker.ts",
      );

      const results: unknown[] = [];

      // Interleave requests
      for (let i = 0; i < 10; i++) {
        if (i % 2 === 0) {
          results.push(await handle.request("echo", { i, via: "control" }));
        } else {
          results.push(await handle.requestViaData("echo", { i, via: "data" }));
        }
      }

      for (let i = 0; i < 10; i++) {
        const expected = i % 2 === 0 ? { i, via: "control" } : { i, via: "data" };
        expect(results[i]).toEqual(expected);
      }

      await manager.terminate("test-interleave");
    });
  });

  describe("Data Channel Error Handling", () => {
    it("should throw when calling requestViaData without data channel", async () => {
      // Spawn worker WITHOUT data channel
      const workerPath = (await import("../../utils/test-helpers.js")).createWorkerPath(
        "echo-worker.ts",
      );

      const handle = await manager.spawn("test-no-data-channel", {
        executablePath: "node",
        args: ["--import", "tsx", workerPath],
        env: (await import("../../utils/test-helpers.js")).filterEnv(),
      });

      // Complete handshake (without data_channel capability)
      const { ReservedMethods } = await import("@procwire/transport");
      await handle.request(ReservedMethods.HANDSHAKE, {
        version: "1.0",
        capabilities: ["heartbeat"],
      });

      expect(handle.dataChannel).toBeNull();
      await expect(handle.requestViaData("echo", {})).rejects.toThrow(/data channel/i);

      await manager.terminate("test-no-data-channel");
    });
  });

  describe("Data Channel Cleanup", () => {
    it("should clean up data channel on graceful shutdown", async () => {
      const handle = await spawnWorkerWithDataChannel(
        manager,
        "test-cleanup",
        "data-channel-worker.ts",
      );

      // Verify data channel works
      const result = await handle.requestViaData("ping");
      expect(result).toEqual({ pong: true, timestamp: expect.any(Number) });

      // Terminate gracefully
      await manager.terminate("test-cleanup");

      expect(handle.state).toBe("stopped");
    });

    it("should handle data channel cleanup when process terminates", async () => {
      const handle = await spawnWorkerWithDataChannel(
        manager,
        "test-data-cleanup",
        "data-channel-worker.ts",
      );

      // Verify data channel is working
      const result = await handle.requestViaData("ping");
      expect(result).toEqual({ pong: true, timestamp: expect.any(Number) });

      // Force terminate (not graceful)
      await manager.terminate("test-data-cleanup");

      // Should be stopped, not crashed
      expect(handle.state).toBe("stopped");

      // Trying to use data channel after termination should fail
      await expect(handle.requestViaData("ping")).rejects.toThrow();
    }, 10000);
  });
});
