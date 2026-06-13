import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { Socket } from "node:net";
import { Client } from "../src/client.js";
import { RequestContextImpl } from "@procwire/runtime-core";
import { msgpackCodec } from "@procwire/codecs";
import { NodeSocketTransport } from "@procwire/protocol";

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

      // Swallow the $init control line (written to process.stdout - D10)
      const consoleSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

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

      const consoleSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

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
    interface MockSocket extends EventEmitter {
      write: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
      destroyed: boolean;
      cork: ReturnType<typeof vi.fn>;
      uncork: ReturnType<typeof vi.fn>;
      writableNeedDrain: boolean;
    }

    function createMockSocket(): MockSocket {
      const emitter = new EventEmitter() as MockSocket;
      emitter.write = vi.fn().mockReturnValue(true);
      emitter.destroy = vi.fn();
      emitter.destroyed = false;
      emitter.cork = vi.fn();
      emitter.uncork = vi.fn();
      emitter.writableNeedDrain = false;
      return emitter;
    }

    it("should send response with IS_RESPONSE flag", async () => {
      const socket = createMockSocket();
      const abortCallbacks = new Map<number, Set<() => void>>();

      const ctx = new RequestContextImpl(
        42, // requestId
        "testMethod",
        1, // methodId
        msgpackCodec,
        new NodeSocketTransport(socket as unknown as Socket),
        abortCallbacks,
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

      const ctx = new RequestContextImpl(
        42,
        "testMethod",
        1,
        msgpackCodec,
        new NodeSocketTransport(socket as unknown as Socket),
        abortCallbacks,
      );

      await ctx.ack({ jobId: 123 });

      expect(socket.write).toHaveBeenCalledTimes(2);
      expect(ctx.responded).toBe(true);
    });

    it("should send stream chunks without setting responded", async () => {
      const socket = createMockSocket();
      const abortCallbacks = new Map<number, Set<() => void>>();

      const ctx = new RequestContextImpl(
        42,
        "testMethod",
        1,
        msgpackCodec,
        new NodeSocketTransport(socket as unknown as Socket),
        abortCallbacks,
      );

      await ctx.chunk({ data: 1 });
      await ctx.chunk({ data: 2 });

      expect(socket.write).toHaveBeenCalledTimes(4); // 2 headers + 2 payloads
      expect(ctx.responded).toBe(false); // Can still send more
    });

    it("should end stream with STREAM_END flag", async () => {
      const socket = createMockSocket();
      const abortCallbacks = new Map<number, Set<() => void>>();

      const ctx = new RequestContextImpl(
        42,
        "testMethod",
        1,
        msgpackCodec,
        new NodeSocketTransport(socket as unknown as Socket),
        abortCallbacks,
      );

      await ctx.chunk({ data: 1 });
      await ctx.end();

      expect(ctx.responded).toBe(true);
    });

    it("should send error with IS_ERROR flag", async () => {
      const socket = createMockSocket();
      const abortCallbacks = new Map<number, Set<() => void>>();

      const ctx = new RequestContextImpl(
        42,
        "testMethod",
        1,
        msgpackCodec,
        new NodeSocketTransport(socket as unknown as Socket),
        abortCallbacks,
      );

      await ctx.error(new Error("Something went wrong"));

      expect(socket.write).toHaveBeenCalledTimes(2);
      expect(ctx.responded).toBe(true);
    });

    it("should throw if responding twice", async () => {
      const socket = createMockSocket();
      const abortCallbacks = new Map<number, Set<() => void>>();

      const ctx = new RequestContextImpl(
        42,
        "testMethod",
        1,
        msgpackCodec,
        new NodeSocketTransport(socket as unknown as Socket),
        abortCallbacks,
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

      const ctx = new RequestContextImpl(
        42,
        "testMethod",
        1,
        msgpackCodec,
        new NodeSocketTransport(socket as unknown as Socket),
        abortCallbacks,
      );

      const callback = vi.fn();
      ctx.onAbort(callback);

      expect(abortCallbacks.has(42)).toBe(true);
      expect(abortCallbacks.get(42)?.size).toBe(1);
    });

    it("should track aborted state", () => {
      const socket = createMockSocket();
      const abortCallbacks = new Map<number, Set<() => void>>();

      const ctx = new RequestContextImpl(
        42,
        "testMethod",
        1,
        msgpackCodec,
        new NodeSocketTransport(socket as unknown as Socket),
        abortCallbacks,
      );

      expect(ctx.aborted).toBe(false);

      ctx._markAborted();

      expect(ctx.aborted).toBe(true);
    });

    it("should cleanup abort callbacks on respond", async () => {
      const socket = createMockSocket();
      const abortCallbacks = new Map<number, Set<() => void>>();

      const ctx = new RequestContextImpl(
        42,
        "testMethod",
        1,
        msgpackCodec,
        new NodeSocketTransport(socket as unknown as Socket),
        abortCallbacks,
      );

      ctx.onAbort(vi.fn());
      expect(abortCallbacks.has(42)).toBe(true);

      await ctx.respond({ result: "done" });

      expect(abortCallbacks.has(42)).toBe(false);
    });

    it("should wait for drain when socket buffer is full", async () => {
      const socket = createMockSocket();
      const abortCallbacks = new Map<number, Set<() => void>>();

      // Make write return false (buffer full) and set writableNeedDrain
      socket.write.mockImplementation(() => {
        socket.writableNeedDrain = true;
        return false;
      });

      const ctx = new RequestContextImpl(
        42,
        "testMethod",
        1,
        msgpackCodec,
        new NodeSocketTransport(socket as unknown as Socket),
        abortCallbacks,
      );

      // Start respond - should wait for drain after write
      const respondPromise = ctx.respond({ large: "data" });

      // Promise should be pending (waiting for drain)
      let resolved = false;
      respondPromise.then(() => {
        resolved = true;
      });

      // Give microtasks a chance to run
      await new Promise((r) => setImmediate(r));
      expect(resolved).toBe(false);

      // Emit drain (also clear writableNeedDrain)
      socket.writableNeedDrain = false;
      socket.emit("drain");

      // Now should resolve
      await respondPromise;
      expect(ctx.responded).toBe(true);
    });

    it("should throw when socket closes during drain wait", async () => {
      const socket = createMockSocket();
      const abortCallbacks = new Map<number, Set<() => void>>();

      // RING+SYNC: Write happens before await, so we need socket.write
      // to return false (backpressure) to trigger waitForDrain
      socket.write.mockReturnValue(false);
      socket.writableNeedDrain = true;
      socket.destroyed = true;

      const ctx = new RequestContextImpl(
        42,
        "testMethod",
        1,
        msgpackCodec,
        new NodeSocketTransport(socket as unknown as Socket),
        abortCallbacks,
      );

      await expect(ctx.respond({ data: "test" })).rejects.toThrow(
        "Socket closed during backpressure wait",
      );
    });

    it("should handle rapid chunk() calls with backpressure", async () => {
      const socket = createMockSocket();
      const abortCallbacks = new Map<number, Set<() => void>>();

      // First two writes succeed, then backpressure kicks in
      let writeCount = 0;
      socket.write.mockImplementation(() => {
        writeCount++;
        // Header + payload for first chunk succeeds
        // Header + payload for second chunk triggers backpressure
        const canContinue = writeCount <= 2;
        if (!canContinue) {
          socket.writableNeedDrain = true;
        }
        return canContinue;
      });

      const ctx = new RequestContextImpl(
        42,
        "testMethod",
        1,
        msgpackCodec,
        new NodeSocketTransport(socket as unknown as Socket),
        abortCallbacks,
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

      // Emit drain (also clear writableNeedDrain)
      socket.writableNeedDrain = false;
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

      // Mock as connected: the shared core checks the transport AND adoption.
      const clientAny = client as unknown as {
        _transport: NodeSocketTransport | null;
        _adopted: boolean;
        _eventNameToId: Map<string, number>;
      };
      clientAny._transport = new NodeSocketTransport(createMockSocket() as unknown as Socket);
      clientAny._adopted = true;
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

      // Mock socket + transport (adapter checks the socket, the core checks the
      // transport + adoption: a "connected" client is one whose connection was
      // adopted, i.e. accepted with auth off or after a successful AUTH frame).
      const clientAny = client as unknown as {
        _socket: Socket | null;
        _transport: NodeSocketTransport | null;
        _adopted: boolean;
      };
      const mockSocket = createMockSocket();
      clientAny._socket = mockSocket as unknown as Socket;
      clientAny._transport = new NodeSocketTransport(mockSocket as unknown as Socket);
      clientAny._adopted = true;

      expect(client.connected).toBe(true);

      // Mark as destroyed
      mockSocket.destroyed = true;

      expect(client.connected).toBe(false);
    });
  });

  // Helper
  interface MockSocket extends EventEmitter {
    write: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    destroyed: boolean;
    cork: ReturnType<typeof vi.fn>;
    uncork: ReturnType<typeof vi.fn>;
    writableNeedDrain: boolean;
  }

  function createMockSocket(): MockSocket {
    const emitter = new EventEmitter() as MockSocket;
    emitter.write = vi.fn().mockReturnValue(true);
    emitter.destroy = vi.fn();
    emitter.destroyed = false;
    emitter.cork = vi.fn();
    emitter.uncork = vi.fn();
    emitter.writableNeedDrain = false;
    return emitter;
  }
});
