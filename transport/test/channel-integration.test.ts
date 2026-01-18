/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SocketServer } from "../src/transport/socket-server.js";
import { SocketTransport } from "../src/transport/socket-transport.js";
import { LengthPrefixedFraming } from "../src/framing/length-prefixed.js";
import { JsonCodec } from "../src/serialization/json.js";
import { JsonRpcProtocol } from "../src/protocol/jsonrpc.js";
import { SimpleProtocol } from "../src/protocol/simple.js";
import { ChannelBuilder } from "../src/channel/builder.js";
import { TimeoutError, ProtocolError } from "../src/utils/errors.js";
import type { Channel } from "../src/channel/types.js";
import { PipePath } from "../src/utils/pipe-path.js";
import type { JsonRpcRequest, JsonRpcNotification } from "../src/protocol/jsonrpc.js";

describe("Channel Integration Tests", () => {
  let server: SocketServer;
  let serverChannel: Channel;
  let clientChannel: Channel;
  let socketPath: string;

  beforeEach(() => {
    // Use a unique path for each test
    const baseName = `test-channel-${Date.now()}`;
    socketPath = PipePath.forModule("test", baseName);
  });

  afterEach(async () => {
    // Clean up channels and server
    if (clientChannel) {
      await clientChannel.close().catch(() => {});
    }
    if (serverChannel) {
      await serverChannel.close().catch(() => {});
    }
    if (server) {
      await server.close().catch(() => {});
    }
  });

  describe("Request/Response with JSON-RPC", () => {
    it("should handle basic request/response", async () => {
      // Setup server
      server = new SocketServer();
      await server.listen(socketPath);

      // Wait for client connection
      const serverConnectionPromise = new Promise<Channel>((resolve) => {
        server.onConnection((transport) => {
          const channel: any = new ChannelBuilder()
            .withTransport(transport)
            .withFraming(new LengthPrefixedFraming())
            .withSerialization(new JsonCodec())
            .withProtocol(new JsonRpcProtocol())
            .build();

          // Register request handler
          channel.onRequest((request: any) => {
            const req = request as JsonRpcRequest;
            if (req.method === "add") {
              const { a, b } = req.params as { a: number; b: number };
              return { sum: a + b };
            }
            throw new Error("Unknown method");
          });

          channel.start().then(() => resolve(channel));
        });
      });

      // Setup client
      const clientTransport = new SocketTransport({ path: socketPath });
      clientChannel = (new ChannelBuilder()
        .withTransport(clientTransport)
        .withFraming(new LengthPrefixedFraming())
        .withSerialization(new JsonCodec())
        .withProtocol(new JsonRpcProtocol())
        .build()) as any;

      await clientChannel.start();
      serverChannel = await serverConnectionPromise;

      // Send request
      const result = await clientChannel.request("add", { a: 2, b: 3 });

      expect(result).toEqual({ sum: 5 });
    });

    it("should handle multiple concurrent requests", async () => {
      // Setup server
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

          channel.onRequest(async (request: any) => {
            if (request.method === "delay") {
              const { ms, value } = request.params as { ms: number; value: unknown };
              await new Promise((resolve) => setTimeout(resolve, ms));
              return value;
            }
            throw new Error("Unknown method");
          });

          channel.start().then(() => resolve(channel));
        });
      });

      // Setup client
      const clientTransport = new SocketTransport({ path: socketPath });
      clientChannel = (new ChannelBuilder()
        .withTransport(clientTransport)
        .withFraming(new LengthPrefixedFraming())
        .withSerialization(new JsonCodec())
        .withProtocol(new JsonRpcProtocol())
        .build()) as any;

      await clientChannel.start();
      serverChannel = await serverConnectionPromise;

      // Send multiple requests concurrently
      const results = await Promise.all([
        clientChannel.request("delay", { ms: 50, value: "first" }),
        clientChannel.request("delay", { ms: 30, value: "second" }),
        clientChannel.request("delay", { ms: 10, value: "third" }),
      ]);

      expect(results).toEqual(["first", "second", "third"]);
    });

    it("should handle error responses", async () => {
      // Setup server
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
            if (request.method === "divide") {
              const { a, b } = request.params as { a: number; b: number };
              if (b === 0) {
                throw new Error("Division by zero");
              }
              return { result: a / b };
            }
            throw new Error("Unknown method");
          });

          channel.start().then(() => resolve(channel));
        });
      });

      // Setup client
      const clientTransport = new SocketTransport({ path: socketPath });
      clientChannel = (new ChannelBuilder()
        .withTransport(clientTransport)
        .withFraming(new LengthPrefixedFraming())
        .withSerialization(new JsonCodec())
        .withProtocol(new JsonRpcProtocol())
        .build()) as any;

      await clientChannel.start();
      serverChannel = await serverConnectionPromise;

      // Send request that will fail
      await expect(clientChannel.request("divide", { a: 10, b: 0 })).rejects.toThrow(
        ProtocolError,
      );
    });
  });

  describe("Notifications", () => {
    it("should handle notifications", async () => {
      // Setup server
      server = new SocketServer();
      await server.listen(socketPath);

      const notifications: JsonRpcNotification[] = [];

      const serverConnectionPromise = new Promise<Channel>((resolve) => {
        server.onConnection((transport) => {
          const channel: any = new ChannelBuilder()
            .withTransport(transport)
            .withFraming(new LengthPrefixedFraming())
            .withSerialization(new JsonCodec())
            .withProtocol(new JsonRpcProtocol())
            .build();

          channel.onNotification((notification: any) => {
            notifications.push(notification);
          });

          channel.start().then(() => resolve(channel));
        });
      });

      // Setup client
      const clientTransport = new SocketTransport({ path: socketPath });
      clientChannel = (new ChannelBuilder()
        .withTransport(clientTransport)
        .withFraming(new LengthPrefixedFraming())
        .withSerialization(new JsonCodec())
        .withProtocol(new JsonRpcProtocol())
        .build()) as any;

      await clientChannel.start();
      serverChannel = await serverConnectionPromise;

      // Send notifications
      await clientChannel.notify("log", { level: "info", message: "test1" });
      await clientChannel.notify("log", { level: "warn", message: "test2" });

      // Wait a bit for notifications to be processed
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(notifications).toHaveLength(2);
      expect(notifications[0]).toMatchObject({
        method: "log",
        params: { level: "info", message: "test1" },
      });
      expect(notifications[1]).toMatchObject({
        method: "log",
        params: { level: "warn", message: "test2" },
      });
    });

    it("should handle bidirectional notifications", async () => {
      // Setup server
      server = new SocketServer();
      await server.listen(socketPath);

      const serverNotifications: JsonRpcNotification[] = [];
      const clientNotifications: JsonRpcNotification[] = [];

      const serverConnectionPromise = new Promise<Channel>((resolve) => {
        server.onConnection((transport) => {
          const channel: any = new ChannelBuilder()
            .withTransport(transport)
            .withFraming(new LengthPrefixedFraming())
            .withSerialization(new JsonCodec())
            .withProtocol(new JsonRpcProtocol())
            .build();

          channel.onNotification((notification: any) => {
            serverNotifications.push(notification);
          });

          channel.start().then(() => resolve(channel));
        });
      });

      // Setup client
      const clientTransport = new SocketTransport({ path: socketPath });
      clientChannel = (new ChannelBuilder()
        .withTransport(clientTransport)
        .withFraming(new LengthPrefixedFraming())
        .withSerialization(new JsonCodec())
        .withProtocol(new JsonRpcProtocol())
        .build()) as any;

      clientChannel.onNotification((notification: any) => {
        clientNotifications.push(notification);
      });

      await clientChannel.start();
      serverChannel = await serverConnectionPromise;

      // Client sends notification to server
      await clientChannel.notify("clientEvent", { data: "from-client" });

      // Server sends notification to client
      await serverChannel.notify("serverEvent", { data: "from-server" });

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(serverNotifications).toHaveLength(1);
      expect(serverNotifications[0]).toMatchObject({
        method: "clientEvent",
        params: { data: "from-client" },
      });

      expect(clientNotifications).toHaveLength(1);
      expect(clientNotifications[0]).toMatchObject({
        method: "serverEvent",
        params: { data: "from-server" },
      });
    });
  });

  describe("Timeout Handling", () => {
    it("should timeout on slow responses", async () => {
      // Setup server
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

          channel.onRequest(async (request: any) => {
            if (request.method === "slow") {
              // Delay longer than timeout
              await new Promise((resolve) => setTimeout(resolve, 2000));
              return { done: true };
            }
            throw new Error("Unknown method");
          });

          channel.start().then(() => resolve(channel));
        });
      });

      // Setup client with short timeout
      const clientTransport = new SocketTransport({ path: socketPath });
      clientChannel = (new ChannelBuilder()
        .withTransport(clientTransport)
        .withFraming(new LengthPrefixedFraming())
        .withSerialization(new JsonCodec())
        .withProtocol(new JsonRpcProtocol())
        .withTimeout(100)
        .build()) as any;

      await clientChannel.start();
      serverChannel = await serverConnectionPromise;

      // Request should timeout
      await expect(clientChannel.request("slow")).rejects.toThrow(TimeoutError);
    });

    it("should allow per-request timeout override", async () => {
      // Setup server
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

          channel.onRequest(async (request: any) => {
            if (request.method === "delay") {
              const { ms } = request.params as { ms: number };
              await new Promise((resolve) => setTimeout(resolve, ms));
              return { done: true };
            }
            throw new Error("Unknown method");
          });

          channel.start().then(() => resolve(channel));
        });
      });

      // Setup client with default short timeout
      const clientTransport = new SocketTransport({ path: socketPath });
      clientChannel = (new ChannelBuilder()
        .withTransport(clientTransport)
        .withFraming(new LengthPrefixedFraming())
        .withSerialization(new JsonCodec())
        .withProtocol(new JsonRpcProtocol())
        .withTimeout(100)
        .build()) as any;

      await clientChannel.start();
      serverChannel = await serverConnectionPromise;

      // This should succeed with override
      const result = await clientChannel.request("delay", { ms: 150 }, 500);
      expect(result).toEqual({ done: true });
    });
  });

  describe("Simple Protocol", () => {
    it("should work with SimpleProtocol", async () => {
      // Setup server
      server = new SocketServer();
      await server.listen(socketPath);

      const serverConnectionPromise = new Promise<Channel>((resolve) => {
        server.onConnection((transport) => {
          const channel: any = new ChannelBuilder()
            .withTransport(transport)
            .withFraming(new LengthPrefixedFraming())
            .withSerialization(new JsonCodec())
            .withProtocol(new SimpleProtocol())
            .build();

          channel.onRequest((request: any) => {
            if (request.method === "echo") {
              return request.params;
            }
            throw new Error("Unknown method");
          });

          channel.start().then(() => resolve(channel));
        });
      });

      // Setup client
      const clientTransport = new SocketTransport({ path: socketPath });
      clientChannel = (new ChannelBuilder()
        .withTransport(clientTransport)
        .withFraming(new LengthPrefixedFraming())
        .withSerialization(new JsonCodec())
        .withProtocol(new SimpleProtocol())
        .build()) as any;

      await clientChannel.start();
      serverChannel = await serverConnectionPromise;

      // Send request
      const result = await clientChannel.request("echo", { message: "hello" });

      expect(result).toEqual({ message: "hello" });
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid messages gracefully", async () => {
      // Setup server
      server = new SocketServer();
      await server.listen(socketPath);

      const errors: Error[] = [];

      const serverConnectionPromise = new Promise<Channel>((resolve) => {
        server.onConnection((transport) => {
          const channel: any = new ChannelBuilder()
            .withTransport(transport)
            .withFraming(new LengthPrefixedFraming())
            .withSerialization(new JsonCodec())
            .withProtocol(new JsonRpcProtocol())
            .build();

          channel.on("error", (error: any) => {
            errors.push(error);
          });

          channel.onRequest((request: any) => {
            if (request.method === "test") {
              return { ok: true };
            }
            throw new Error("Unknown method");
          });

          channel.start().then(() => resolve(channel));
        });
      });

      // Setup client
      const clientTransport = new SocketTransport({ path: socketPath });
      clientChannel = (new ChannelBuilder()
        .withTransport(clientTransport)
        .withFraming(new LengthPrefixedFraming())
        .withSerialization(new JsonCodec())
        .withProtocol(new JsonRpcProtocol())
        .build()) as any;

      await clientChannel.start();
      serverChannel = await serverConnectionPromise;

      // Send a valid request first
      const result1 = await clientChannel.request("test");
      expect(result1).toEqual({ ok: true });

      // Inject invalid message by writing raw data
      const invalidMessage = { not: "a valid jsonrpc message" };
      const serialized = new JsonCodec().serialize(invalidMessage);
      const framed = new LengthPrefixedFraming().encode(serialized);
      await clientTransport.write(framed);

      // Wait for error processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Server should have received error
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toBeInstanceOf(ProtocolError);

      // Channel should still work after invalid message
      const result2 = await clientChannel.request("test");
      expect(result2).toEqual({ ok: true });
    });
  });
});
