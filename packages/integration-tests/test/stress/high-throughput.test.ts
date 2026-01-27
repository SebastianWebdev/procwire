/**
 * Stress tests: High Throughput
 *
 * Tests sustained high message throughput between manager and worker.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProcessManager } from "@procwire/transport";
import { spawnWorker, measureTime } from "../../utils/test-helpers.js";
import { measureThroughput, measureBurst } from "../../utils/metrics.js";

describe("Stress - High Throughput", { timeout: 60000 }, () => {
  let manager: ProcessManager;

  beforeEach(() => {
    manager = new ProcessManager({
      defaultTimeout: 60000,
      restartPolicy: { enabled: false, maxRestarts: 0, backoffMs: 100 },
      gracefulShutdownMs: 10000,
    });
  });

  afterEach(async () => {
    await manager.terminateAll();
  });

  describe("burst throughput", () => {
    it("should handle 1000 requests burst", async () => {
      const handle = await spawnWorker(manager, "burst-1k", "echo-worker.ts");

      const result = await measureBurst({
        handle,
        method: "echo",
        count: 1000,
        payload: { test: true },
      });

      console.log(
        `Burst 1000: ${result.totalMessages} messages in ${result.durationMs}ms ` +
          `(${result.messagesPerSecond.toFixed(0)} msg/s)`,
      );

      expect(result.totalMessages).toBe(1000);
      expect(result.errors).toBe(0);
    });

    it("should handle 5000 requests burst", async () => {
      const handle = await spawnWorker(manager, "burst-5k", "echo-worker.ts");

      const result = await measureBurst({
        handle,
        method: "echo",
        count: 5000,
        payload: { seq: 0 },
      });

      console.log(
        `Burst 5000: ${result.totalMessages} messages in ${result.durationMs}ms ` +
          `(${result.messagesPerSecond.toFixed(0)} msg/s)`,
      );

      expect(result.totalMessages).toBe(5000);
      expect(result.errors).toBe(0);
    });

    it("should maintain correlation under burst load", async () => {
      const handle = await spawnWorker(manager, "burst-correlation", "echo-worker.ts");

      const count = 1000;
      const requests = Array.from({ length: count }, (_, i) => handle.request("echo", { seq: i }));

      const results = (await Promise.all(requests)) as Array<{ seq: number }>;

      // Verify all responses have correct correlation
      results.forEach((result, i) => {
        expect(result.seq).toBe(i);
      });
    });
  });

  describe("sustained throughput", () => {
    // CI environments have slower I/O, so use lower thresholds
    const isCI = process.env.CI === "true";

    it("should sustain 100 req/s for 5 seconds", async () => {
      const handle = await spawnWorker(manager, "sustained-100", "echo-worker.ts");

      const result = await measureThroughput({
        handle,
        method: "echo",
        durationMs: 5000,
        targetRps: 100,
        payload: { sustained: true },
      });

      console.log(
        `Sustained 100 req/s: ${result.messagesPerSecond.toFixed(0)} msg/s, ` +
          `p50=${result.p50LatencyMs}ms, p95=${result.p95LatencyMs}ms, p99=${result.p99LatencyMs}ms`,
      );

      // Throughput varies significantly based on hardware and system load
      // CI has lower throughput due to shared resources and slower I/O
      const minRate = isCI ? 40 : 50;
      expect(result.messagesPerSecond).toBeGreaterThan(minRate);
      expect(result.errors).toBe(0);
    });

    it("should sustain 500 req/s for 3 seconds", async () => {
      const handle = await spawnWorker(manager, "sustained-500", "echo-worker.ts");

      const result = await measureThroughput({
        handle,
        method: "echo",
        durationMs: 3000,
        targetRps: 500,
        payload: { high: true },
      });

      console.log(
        `Sustained 500 req/s: ${result.messagesPerSecond.toFixed(0)} msg/s, ` +
          `p50=${result.p50LatencyMs}ms, p95=${result.p95LatencyMs}ms`,
      );

      // Throughput varies significantly based on hardware and system load
      // CI has lower throughput due to shared resources and slower I/O
      const minRate = isCI ? 150 : 250;
      expect(result.messagesPerSecond).toBeGreaterThan(minRate);
      expect(result.errors).toBe(0);
    });
  });

  describe("throughput with computation", () => {
    // CI environments have slower I/O, so use lower thresholds
    const isCI = process.env.CI === "true";

    it("should handle sustained requests with light computation", async () => {
      const handle = await spawnWorker(manager, "compute-light", "compute-worker.ts");

      const result = await measureThroughput({
        handle,
        method: "add",
        durationMs: 3000,
        targetRps: 200,
        payload: { a: 10, b: 20 },
      });

      console.log(`Compute (add) 200 req/s: ${result.messagesPerSecond.toFixed(0)} msg/s`);

      // Throughput varies significantly based on hardware and system load
      // CI has lower throughput due to shared resources and slower I/O
      const minRate = isCI ? 50 : 100;
      expect(result.messagesPerSecond).toBeGreaterThan(minRate);
      expect(result.errors).toBe(0);
    });

    it("should handle burst with fibonacci computation", async () => {
      const handle = await spawnWorker(manager, "compute-fib", "compute-worker.ts");

      const result = await measureBurst({
        handle,
        method: "fibonacci",
        count: 100,
        payload: { n: 15 }, // Moderate fibonacci
      });

      console.log(
        `Fibonacci burst: ${result.totalMessages} in ${result.durationMs}ms ` +
          `(${result.messagesPerSecond.toFixed(0)} msg/s)`,
      );

      expect(result.totalMessages).toBe(100);
      expect(result.errors).toBe(0);
    });
  });

  describe("latency under load", () => {
    it("should maintain reasonable latency under moderate load", async () => {
      const handle = await spawnWorker(manager, "latency-moderate", "echo-worker.ts");

      const result = await measureThroughput({
        handle,
        method: "echo",
        durationMs: 3000,
        targetRps: 100,
        payload: { latency: "test" },
      });

      console.log(
        `Latency under load: p50=${result.p50LatencyMs}ms, ` +
          `p95=${result.p95LatencyMs}ms, p99=${result.p99LatencyMs}ms`,
      );

      // P50 latency should be reasonable (< 50ms)
      expect(result.p50LatencyMs).toBeLessThan(50);
      // P99 latency should be acceptable (< 200ms)
      expect(result.p99LatencyMs).toBeLessThan(200);
    });
  });

  describe("recovery after burst", () => {
    it("should remain responsive after burst", async () => {
      const handle = await spawnWorker(manager, "post-burst", "echo-worker.ts");

      // Send burst
      await measureBurst({
        handle,
        method: "echo",
        count: 2000,
        payload: { burst: true },
      });

      // Verify still responsive
      const { elapsed } = await measureTime(() => handle.request("ping"));

      expect(elapsed).toBeLessThan(100);
    });

    it("should handle multiple burst cycles", async () => {
      const handle = await spawnWorker(manager, "multi-burst", "echo-worker.ts");

      for (let cycle = 0; cycle < 3; cycle++) {
        const result = await measureBurst({
          handle,
          method: "echo",
          count: 500,
          payload: { cycle },
        });

        expect(result.totalMessages).toBe(500);
        expect(result.errors).toBe(0);

        // Small pause between cycles
        await new Promise((r) => setTimeout(r, 100));
      }

      // Final responsiveness check
      const { elapsed } = await measureTime(() => handle.request("ping"));
      expect(elapsed).toBeLessThan(100);
    });
  });
});
