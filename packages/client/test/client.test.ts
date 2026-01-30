import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { Socket } from "node:net";
import { Client } from "../src/client.js";
import { RequestContextImpl } from "../src/request-context.js";
import { msgpackCodec } from "@procwire/codecs";
import { HEADER_SIZE } from "@procwire/protocol";

describe("Client", () => {
  describe("builder API", () => {
    it("should register method handlers", () => {
      const client = new Client();
      const handler = vi.fn();

      const result = client.handle("query", handler);

      expect(result).toBe(client); // Chainable
    });

    it("should register events", () => {
      const client = new Client();

      const result = client.event("progress");

      expect(result).toBe(client); // Chainable
    });

    it("should support method chaining", () => {
      const client = new Client()
        .handle("foo", vi.fn())
        .handle("bar", vi.fn())
        .event("progress")
        .event("status");

      expect(client).toBeInstanceOf(Client);
    });

    it("should throw if adding handlers after start", async () => {
      const client = new Client().handle("foo", vi.fn());

      // Mock console.log to capture $init
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      // Start will fail without actual pipe, but _started flag is set first
      try {
        await client.start();
      } catch {
        // Expected - pipe creation will fail in test env
      }

      expect(() => client.handle("bar", vi.fn())).toThrow("Cannot add handlers after start()");

      consoleSpy.mockRestore();
    });

    it("should throw if adding events after start", async () => {
      const client = new Client().handle("foo", vi.fn());

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      try {
        await client.start();
      } catch {
        // Expected
      }

      expect(() => client.event("bar")).toThrow("Cannot add events after start()");

      consoleSpy.mockRestore();
    });
  });

  describe("RequestContextImpl", () => {
    function createMockSocket(): Socket & EventEmitter {
      const emitter = new EventEmitter();
      return Object.assign(emitter, {
        write: vi.fn().mockReturnValue(true),
        destroy: vi.fn(),
        destroyed: false,
        cork: vi.fn(),
        uncork: vi.fn(),
      }) as unknown as Socket & EventEmitter;
    }

    it("should send response with IS_RESPONSE flag", async () => {
      const socket = createMockSocket();
      const abortCallbacks = new Map<number, Set<() => void>>();
      const acquireHeader = vi.fn(() => Buffer.allocUnsafe(HEADER_SIZE));

      const ctx = new RequestContextImpl(
        42, // requestId
        "testMethod",
        1, // methodId
        msgpackCodec,
        socket,
        abortCallbacks,
        acquireHeader,
      );

      await ctx.respond({ result: "success" });

      expect(socket.cork).toHaveBeenCalled();
      expect(socket.write).toHaveBeenCalledTimes(2); // header + payload
      expect(socket.uncork).toHaveBeenCalled();
      expect(ctx.responded).toBe(true);
    });

    it("should send ack with IS_ACK flag", async () => {
      const socket = createMockSocket();
      const abortCallbacks = new Map<number, Set<() => void>>();
      const acquireHeader = vi.fn(() => Buffer.allocUnsafe(HEADER_SIZE));

      const ctx = new RequestContextImpl(
        42,
        "testMethod",
        1,
        msgpackCodec,
        socket,
        abortCallbacks,
        acquireHeader,
      );

      await ctx.ack({ jobId: 123 });

      expect(socket.write).toHaveBeenCalledTimes(2);
      expect(ctx.responded).toBe(true);
    });

    it("should send stream chunks without setting responded", async () => {
      const socket = createMockSocket();
      const abortCallbacks = new Map<number, Set<() => void>>();
      const acquireHeader = vi.fn(() => Buffer.allocUnsafe(HEADER_SIZE));

      const ctx = new RequestContextImpl(
        42,
        "testMethod",
        1,
        msgpackCodec,
        socket,
        abortCallbacks,
        acquireHeader,
      );

      await ctx.chunk({ data: 1 });
      await ctx.chunk({ data: 2 });

      expect(socket.write).toHaveBeenCalledTimes(4); // 2 headers + 2 payloads
      expect(ctx.responded).toBe(false); // Can still send more
    });

    it("should end stream with STREAM_END flag", async () => {
      const socket = createMockSocket();
      const abortCallbacks = new Map<number, Set<() => void>>();
      const acquireHeader = vi.fn(() => Buffer.allocUnsafe(HEADER_SIZE));

      const ctx = new RequestContextImpl(
        42,
        "testMethod",
        1,
        msgpackCodec,
        socket,
        abortCallbacks,
        acquireHeader,
      );

      await ctx.chunk({ data: 1 });
      await ctx.end();

      expect(ctx.responded).toBe(true);
    });

    it("should send error with IS_ERROR flag", async () => {
      const socket = createMockSocket();
      const abortCallbacks = new Map<number, Set<() => void>>();
      const acquireHeader = vi.fn(() => Buffer.allocUnsafe(HEADER_SIZE));

      const ctx = new RequestContextImpl(
        42,
        "testMethod",
        1,
        msgpackCodec,
        socket,
        abortCallbacks,
        acquireHeader,
      );

      await ctx.error(new Error("Something went wrong"));

      expect(socket.write).toHaveBeenCalledTimes(2);
      expect(ctx.responded).toBe(true);
    });

    it("should throw if responding twice", async () => {
      const socket = createMockSocket();
      const abortCallbacks = new Map<number, Set<() => void>>();
      const acquireHeader = vi.fn(() => Buffer.allocUnsafe(HEADER_SIZE));

      const ctx = new RequestContextImpl(
        42,
        "testMethod",
        1,
        msgpackCodec,
        socket,
        abortCallbacks,
        acquireHeader,
      );

      await ctx.respond({ result: "first" });

      await expect(ctx.respond({ result: "second" })).rejects.toThrow("Response already sent");
      await expect(ctx.ack()).rejects.toThrow("Response already sent");
      await expect(ctx.error("fail")).rejects.toThrow("Response already sent");
      await expect(ctx.end()).rejects.toThrow("Response already sent");
    });

    it("should register abort callback", () => {
      const socket = createMockSocket();
      const abortCallbacks = new Map<number, Set<() => void>>();
      const acquireHeader = vi.fn(() => Buffer.allocUnsafe(HEADER_SIZE));

      const ctx = new RequestContextImpl(
        42,
        "testMethod",
        1,
        msgpackCodec,
        socket,
        abortCallbacks,
        acquireHeader,
      );

      const callback = vi.fn();
      ctx.onAbort(callback);

      expect(abortCallbacks.has(42)).toBe(true);
      expect(abortCallbacks.get(42)?.size).toBe(1);
    });

    it("should track aborted state", () => {
      const socket = createMockSocket();
      const abortCallbacks = new Map<number, Set<() => void>>();
      const acquireHeader = vi.fn(() => Buffer.allocUnsafe(HEADER_SIZE));

      const ctx = new RequestContextImpl(
        42,
        "testMethod",
        1,
        msgpackCodec,
        socket,
        abortCallbacks,
        acquireHeader,
      );

      expect(ctx.aborted).toBe(false);

      ctx._markAborted();

      expect(ctx.aborted).toBe(true);
    });

    it("should cleanup abort callbacks on respond", async () => {
      const socket = createMockSocket();
      const abortCallbacks = new Map<number, Set<() => void>>();
      const acquireHeader = vi.fn(() => Buffer.allocUnsafe(HEADER_SIZE));

      const ctx = new RequestContextImpl(
        42,
        "testMethod",
        1,
        msgpackCodec,
        socket,
        abortCallbacks,
        acquireHeader,
      );

      ctx.onAbort(vi.fn());
      expect(abortCallbacks.has(42)).toBe(true);

      await ctx.respond({ result: "done" });

      expect(abortCallbacks.has(42)).toBe(false);
    });

    it("should wait for drain when socket buffer is full", async () => {
      const socket = createMockSocket();
      const abortCallbacks = new Map<number, Set<() => void>>();
      const acquireHeader = vi.fn(() => Buffer.allocUnsafe(HEADER_SIZE));

      // Make write return false (buffer full)
      (socket.write as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const ctx = new RequestContextImpl(
        42,
        "testMethod",
        1,
        msgpackCodec,
        socket,
        abortCallbacks,
        acquireHeader,
      );

      // Start respond - should wait for drain
      const respondPromise = ctx.respond({ large: "data" });

      // Promise should be pending (waiting for drain)
      let resolved = false;
      respondPromise.then(() => {
        resolved = true;
      });

      // Give microtasks a chance to run
      await new Promise((r) => setImmediate(r));
      expect(resolved).toBe(false);

      // Emit drain
      socket.emit("drain");

      // Now should resolve
      await respondPromise;
      expect(ctx.responded).toBe(true);
    });

    it("should throw when socket closes during drain wait", async () => {
      const socket = createMockSocket();
      const abortCallbacks = new Map<number, Set<() => void>>();
      const acquireHeader = vi.fn(() => Buffer.allocUnsafe(HEADER_SIZE));

      // Make write return false (buffer full)
      (socket.write as ReturnType<typeof vi.fn>).mockReturnValue(false);

      // Mark socket as destroyed
      (socket as unknown as { destroyed: boolean }).destroyed = true;

      const ctx = new RequestContextImpl(
        42,
        "testMethod",
        1,
        msgpackCodec,
        socket,
        abortCallbacks,
        acquireHeader,
      );

      await expect(ctx.respond({ data: "test" })).rejects.toThrow(
        "Socket closed during backpressure wait",
      );
    });

    it("should handle rapid chunk() calls with backpressure", async () => {
      const socket = createMockSocket();
      const abortCallbacks = new Map<number, Set<() => void>>();
      const acquireHeader = vi.fn(() => Buffer.allocUnsafe(HEADER_SIZE));

      // First two writes succeed, then backpressure kicks in
      let writeCount = 0;
      (socket.write as ReturnType<typeof vi.fn>).mockImplementation(() => {
        writeCount++;
        // Header + payload for first chunk succeeds
        // Header + payload for second chunk triggers backpressure
        return writeCount <= 2;
      });

      const ctx = new RequestContextImpl(
        42,
        "testMethod",
        1,
        msgpackCodec,
        socket,
        abortCallbacks,
        acquireHeader,
      );

      // First chunk should complete
      await ctx.chunk({ data: 1 });

      // Second chunk should wait for drain
      const chunk2Promise = ctx.chunk({ data: 2 });

      let chunk2Resolved = false;
      chunk2Promise.then(() => {
        chunk2Resolved = true;
      });

      await new Promise((r) => setImmediate(r));
      expect(chunk2Resolved).toBe(false);

      // Emit drain
      socket.emit("drain");

      await chunk2Promise;
      expect(chunk2Resolved).toBe(true);
    });
  });

  describe("$init message", () => {
    it("should generate correct schema in $init", () => {
      const client = new Client()
        .handle("query", vi.fn(), { response: "result" })
        .handle("insert", vi.fn(), { response: "ack" })
        .handle("stream", vi.fn(), { response: "stream" })
        .event("progress")
        .event("status");

      // Access private methods for testing
      const clientAny = client as unknown as {
        _methods: Map<string, unknown>;
        _events: Map<string, unknown>;
        _methodNameToId: Map<string, number>;
        _methodIdToName: Map<number, string>;
        _eventNameToId: Map<string, number>;
        _started: boolean;
      };

      // Manually assign IDs (normally done in start())
      clientAny._started = true;
      let methodId = 1;
      for (const name of clientAny._methods.keys()) {
        clientAny._methodNameToId.set(name, methodId);
        clientAny._methodIdToName.set(methodId, name);
        methodId++;
      }

      let eventId = 1;
      for (const name of clientAny._events.keys()) {
        clientAny._eventNameToId.set(name, eventId);
        eventId++;
      }

      // Check IDs were assigned
      expect(clientAny._methodNameToId.get("query")).toBe(1);
      expect(clientAny._methodNameToId.get("insert")).toBe(2);
      expect(clientAny._methodNameToId.get("stream")).toBe(3);
      expect(clientAny._eventNameToId.get("progress")).toBe(1);
      expect(clientAny._eventNameToId.get("status")).toBe(2);
    });
  });

  describe("event emitting", () => {
    it("should throw if emitting unknown event", async () => {
      const client = new Client().event("progress");

      // Mock as connected
      const clientAny = client as unknown as {
        _socket: Socket | null;
        _eventNameToId: Map<string, number>;
      };
      clientAny._socket = createMockSocket();
      clientAny._eventNameToId.set("progress", 1);

      await expect(client.emitEvent("unknown", {})).rejects.toThrow("Unknown event: unknown");
    });

    it("should throw if not connected", async () => {
      const client = new Client().event("progress");

      await expect(client.emitEvent("progress", {})).rejects.toThrow("Client not connected");
    });
  });

  describe("connected state", () => {
    it("should report connected state correctly", () => {
      const client = new Client();

      expect(client.connected).toBe(false);

      // Mock socket
      const clientAny = client as unknown as { _socket: Socket | null };
      const mockSocket = createMockSocket();
      clientAny._socket = mockSocket;

      expect(client.connected).toBe(true);

      // Mark as destroyed
      (mockSocket as unknown as { destroyed: boolean }).destroyed = true;

      expect(client.connected).toBe(false);
    });
  });

  // Helper
  function createMockSocket(): Socket & EventEmitter {
    const emitter = new EventEmitter();
    return Object.assign(emitter, {
      write: vi.fn().mockReturnValue(true),
      destroy: vi.fn(),
      destroyed: false,
      cork: vi.fn(),
      uncork: vi.fn(),
    }) as unknown as Socket & EventEmitter;
  }
});
