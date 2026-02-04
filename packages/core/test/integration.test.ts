/**
 * End-to-End Integration Tests
 *
 * These tests spawn real child processes and test full communication
 * between ModuleManager (parent) and Client (child).
 *
 * @module
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { ModuleManager } from "../src/manager.js";
import { Module } from "../src/module.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, "fixtures", "echo-child.ts");

// Find tsx loader path in node_modules - use file:// URL for --import
const ROOT_DIR = join(__dirname, "..", "..", "..");
const TSX_LOADER = pathToFileURL(
  join(ROOT_DIR, "node_modules", "tsx", "dist", "esm", "index.mjs"),
).href;

// Use node with tsx loader
const NODE_BIN = process.execPath; // Current Node.js binary

describe("End-to-End Integration", () => {
  let manager: ModuleManager;

  beforeEach(() => {
    manager = new ModuleManager();
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  describe("Handshake", () => {
    it("should complete handshake and reach ready state", async () => {
      const module = new Module("echo")
        .executable(NODE_BIN, ["--import", TSX_LOADER, FIXTURE_PATH])
        .method("echo", { response: "result" });

      manager.register(module);

      const readyPromise = new Promise<string>((resolve) => {
        manager.on("module:ready", resolve);
      });

      await manager.spawn("echo");

      const readyName = await readyPromise;
      expect(readyName).toBe("echo");
      expect(module.state).toBe("ready");
    });

    it("should fail if child does not register expected method", async () => {
      const module = new Module("echo")
        .executable(NODE_BIN, ["--import", TSX_LOADER, FIXTURE_PATH])
        .method("nonExistentMethod", { response: "result" });

      manager.register(module);

      await expect(manager.spawn("echo")).rejects.toThrow(
        /child did not register expected method "nonExistentMethod"/,
      );
    });
  });

  describe("Result Response", () => {
    it("should send request and receive response", async () => {
      const module = new Module("echo")
        .executable(NODE_BIN, ["--import", TSX_LOADER, FIXTURE_PATH])
        .method("echo", { response: "result" });

      manager.register(module);
      await manager.spawn("echo");

      const result = await module.send("echo", { hello: "world" });

      expect(result).toEqual({ hello: "world" });
    });

    it("should handle multiple sequential requests", async () => {
      const module = new Module("echo")
        .executable(NODE_BIN, ["--import", TSX_LOADER, FIXTURE_PATH])
        .method("echo", { response: "result" });

      manager.register(module);
      await manager.spawn("echo");

      const result1 = await module.send("echo", { n: 1 });
      const result2 = await module.send("echo", { n: 2 });
      const result3 = await module.send("echo", { n: 3 });

      expect(result1).toEqual({ n: 1 });
      expect(result2).toEqual({ n: 2 });
      expect(result3).toEqual({ n: 3 });
    });

    it("should handle parallel requests", async () => {
      const module = new Module("echo")
        .executable(NODE_BIN, ["--import", TSX_LOADER, FIXTURE_PATH])
        .method("echo", { response: "result" });

      manager.register(module);
      await manager.spawn("echo");

      const results = await Promise.all([
        module.send("echo", { n: 1 }),
        module.send("echo", { n: 2 }),
        module.send("echo", { n: 3 }),
      ]);

      expect(results).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
    });
  });

  describe("ACK Response", () => {
    it("should send request and receive ACK", async () => {
      const module = new Module("echo")
        .executable(NODE_BIN, ["--import", TSX_LOADER, FIXTURE_PATH])
        .method("echoAck", { response: "ack" });

      manager.register(module);
      await manager.spawn("echo");

      const result = await module.send("echoAck", { data: "test" });

      expect(result).toEqual({ received: true, originalData: { data: "test" } });
    });
  });

  describe("Stream Response", () => {
    it("should stream chunks from child", async () => {
      const module = new Module("echo")
        .executable(NODE_BIN, ["--import", TSX_LOADER, FIXTURE_PATH])
        .method("echoStream", { response: "stream" });

      manager.register(module);
      await manager.spawn("echo");

      const chunks: unknown[] = [];
      for await (const chunk of module.stream("echoStream", [1, 2, 3])) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([1, 2, 3]);
    });

    it("should handle empty stream", async () => {
      const module = new Module("echo")
        .executable(NODE_BIN, ["--import", TSX_LOADER, FIXTURE_PATH])
        .method("echoStream", { response: "stream" });

      manager.register(module);
      await manager.spawn("echo");

      const chunks: unknown[] = [];
      for await (const chunk of module.stream("echoStream", [])) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([]);
    });

    it("should handle large stream", async () => {
      const module = new Module("echo")
        .executable(NODE_BIN, ["--import", TSX_LOADER, FIXTURE_PATH])
        .method("echoStream", { response: "stream" });

      manager.register(module);
      await manager.spawn("echo");

      const input = Array.from({ length: 100 }, (_, i) => ({ index: i }));
      const chunks: unknown[] = [];

      for await (const chunk of module.stream("echoStream", input)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(100);
      expect(chunks[0]).toEqual({ index: 0 });
      expect(chunks[99]).toEqual({ index: 99 });
    });
  });

  describe("Error Response", () => {
    it("should handle error from child", async () => {
      const module = new Module("echo")
        .executable(NODE_BIN, ["--import", TSX_LOADER, FIXTURE_PATH])
        .method("throwError", { response: "result" });

      manager.register(module);
      await manager.spawn("echo");

      await expect(module.send("throwError", { message: "Custom error" })).rejects.toThrow(
        "Custom error",
      );
    });

    it("should handle default error message", async () => {
      const module = new Module("echo")
        .executable(NODE_BIN, ["--import", TSX_LOADER, FIXTURE_PATH])
        .method("throwError", { response: "result" });

      manager.register(module);
      await manager.spawn("echo");

      await expect(module.send("throwError", {})).rejects.toThrow("Intentional error");
    });
  });

  describe("Cancellation", () => {
    it("should cancel slow operation with AbortController", async () => {
      const module = new Module("echo")
        .executable(NODE_BIN, ["--import", TSX_LOADER, FIXTURE_PATH])
        .method("slowOperation", { response: "result", cancellable: true });

      manager.register(module);
      await manager.spawn("echo");

      const controller = new AbortController();

      const promise = module.send("slowOperation", { delay: 10000 }, { signal: controller.signal });

      // Abort after a short delay
      setTimeout(() => controller.abort(), 100);

      await expect(promise).rejects.toThrow("Aborted");
    });

    it("should complete if not cancelled", async () => {
      const module = new Module("echo")
        .executable(NODE_BIN, ["--import", TSX_LOADER, FIXTURE_PATH])
        .method("slowOperation", { response: "result", cancellable: true });

      manager.register(module);
      await manager.spawn("echo");

      const result = await module.send("slowOperation", { delay: 50 });

      expect(result).toEqual({ completed: true, delay: 50 });
    });
  });

  describe("Events", () => {
    it("should receive events from child", async () => {
      const module = new Module("echo")
        .executable(NODE_BIN, ["--import", TSX_LOADER, FIXTURE_PATH])
        .method("emitProgress", { response: "result" })
        .event("progress");

      manager.register(module);
      await manager.spawn("echo");

      const events: unknown[] = [];
      module.onEvent("progress", (data) => {
        events.push(data);
      });

      const result = await module.send("emitProgress", { count: 3 });

      expect(result).toEqual({ emitted: 3 });

      // Give time for events to arrive
      await new Promise((r) => setTimeout(r, 100));

      expect(events).toHaveLength(3);
      expect(events).toEqual([
        { current: 1, total: 3 },
        { current: 2, total: 3 },
        { current: 3, total: 3 },
      ]);
    });
  });

  describe("Shutdown", () => {
    it("should shutdown gracefully", async () => {
      const module = new Module("echo")
        .executable(NODE_BIN, ["--import", TSX_LOADER, FIXTURE_PATH])
        .method("echo", { response: "result" });

      manager.register(module);
      await manager.spawn("echo");

      expect(module.state).toBe("ready");

      await manager.shutdown("echo");

      expect(module.state).toBe("closed");
    });

    it("should reject pending requests on shutdown", async () => {
      const module = new Module("echo")
        .executable(NODE_BIN, ["--import", TSX_LOADER, FIXTURE_PATH])
        .method("slowOperation", { response: "result" });

      manager.register(module);
      await manager.spawn("echo");

      const promise = module.send("slowOperation", { delay: 10000 });

      // Shutdown while request is pending
      setTimeout(() => manager.shutdown("echo"), 100);

      await expect(promise).rejects.toThrow("Module disconnected");
    });
  });

  describe("Large Payloads (Backpressure)", () => {
    it("should handle 50KB payload without deadlock", async () => {
      const module = new Module("echo")
        .executable(NODE_BIN, ["--import", TSX_LOADER, FIXTURE_PATH])
        .method("echo", { response: "result" });

      manager.register(module);
      await manager.spawn("echo");

      // Create 50KB payload (well above the 20KB threshold that caused deadlock)
      const largeData = { buffer: "x".repeat(50 * 1024) };
      const result = await module.send("echo", largeData);

      expect(result).toEqual(largeData);
    }, 10000);

    it("should handle 100KB payload without deadlock", async () => {
      const module = new Module("echo")
        .executable(NODE_BIN, ["--import", TSX_LOADER, FIXTURE_PATH])
        .method("echo", { response: "result" });

      manager.register(module);
      await manager.spawn("echo");

      const largeData = { buffer: "x".repeat(100 * 1024) };
      const result = await module.send("echo", largeData);

      expect(result).toEqual(largeData);
    }, 15000);

    it("should handle 500KB payload without deadlock", async () => {
      const module = new Module("echo")
        .executable(NODE_BIN, ["--import", TSX_LOADER, FIXTURE_PATH])
        .method("echo", { response: "result" });

      manager.register(module);
      await manager.spawn("echo");

      const largeData = { buffer: "x".repeat(500 * 1024) };
      const result = await module.send("echo", largeData);

      expect(result).toEqual(largeData);
    }, 30000);

    it("should handle 1MB payload without deadlock", async () => {
      const module = new Module("echo")
        .executable(NODE_BIN, ["--import", TSX_LOADER, FIXTURE_PATH])
        .method("echo", { response: "result" });

      manager.register(module);
      await manager.spawn("echo");

      const largeData = { buffer: "x".repeat(1024 * 1024) };
      const result = await module.send("echo", largeData);

      expect(result).toEqual(largeData);
    }, 60000);

    it("should handle rapid streaming with large chunks", async () => {
      const module = new Module("echo")
        .executable(NODE_BIN, ["--import", TSX_LOADER, FIXTURE_PATH])
        .method("echoStream", { response: "stream" });

      manager.register(module);
      await manager.spawn("echo");

      // Create 50 chunks of 10KB each (500KB total)
      const input = Array.from({ length: 50 }, (_, i) => ({
        index: i,
        data: "x".repeat(10 * 1024),
      }));

      const chunks: unknown[] = [];
      for await (const chunk of module.stream("echoStream", input)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(50);
      expect((chunks[0] as { index: number }).index).toBe(0);
      expect((chunks[49] as { index: number }).index).toBe(49);
    }, 60000);

    it("should handle multiple sequential large payloads", async () => {
      const module = new Module("echo")
        .executable(NODE_BIN, ["--import", TSX_LOADER, FIXTURE_PATH])
        .method("echo", { response: "result" });

      manager.register(module);
      await manager.spawn("echo");

      // 10 sequential requests with 30KB payloads
      // Each request should complete quickly after spawn
      for (let i = 0; i < 10; i++) {
        const payload = { iteration: i, data: "x".repeat(30 * 1024) };
        const result = await module.send("echo", payload);
        expect((result as { iteration: number }).iteration).toBe(i);
      }
    }, 60000);

    it("should handle parallel large payload requests", async () => {
      const module = new Module("echo")
        .executable(NODE_BIN, ["--import", TSX_LOADER, FIXTURE_PATH])
        .method("echo", { response: "result" });

      manager.register(module);
      await manager.spawn("echo");

      const promises = Array.from({ length: 5 }, (_, i) =>
        module.send("echo", { index: i, data: "x".repeat(30 * 1024) }),
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      for (let i = 0; i < 5; i++) {
        expect((results[i] as { index: number }).index).toBe(i);
      }
    }, 30000);
  });
});
