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
    // Use high-resolution unique identifier to prevent conflicts in fast CI environments
    // Date.now() alone has millisecond precision which can generate duplicates on fast hardware
    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const baseName = `test-channel-${uniqueId}`;
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

    // Small delay to allow Windows kernel to release pipe resources
    // This prevents EADDRINUSE errors in fast CI environments where tests
    // run back-to-back faster than the OS can release named pipe handles
    await new Promise((resolve) => setTimeout(resolve, 50));
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
      clientChannel = new ChannelBuilder()
        .withTransport(clientTransport)
        .withFraming(new LengthPrefixedFraming())
        .withSerialization(new JsonCodec())
        .withProtocol(new JsonRpcProtocol())
        .build() as any;

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
      clientChannel = new ChannelBuilder()
        .withTransport(clientTransport)
        .withFraming(new LengthPrefixedFraming())
        .withSerialization(new JsonCodec())
        .withProtocol(new JsonRpcProtocol())
        .build() as any;

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
      clientChannel = new ChannelBuilder()
        .withTransport(clientTransport)
        .withFraming(new LengthPrefixedFraming())
        .withSerialization(new JsonCodec())
        .withProtocol(new JsonRpcProtocol())
        .build() as any;

      await clientChannel.start();
      serverChannel = await serverConnectionPromise;

      // Send request that will fail
      await expect(clientChannel.request("divide", { a: 10, b: 0 })).rejects.toThrow(ProtocolError);
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
      clientChannel = new ChannelBuilder()
        .withTransport(clientTransport)
        .withFraming(new LengthPrefixedFraming())
        .withSerialization(new JsonCodec())
        .withProtocol(new JsonRpcProtocol())
        .build() as any;

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
      clientChannel = new ChannelBuilder()
        .withTransport(clientTransport)
        .withFraming(new LengthPrefixedFraming())
        .withSerialization(new JsonCodec())
        .withProtocol(new JsonRpcProtocol())
        .build() as any;

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
      clientChannel = new ChannelBuilder()
        .withTransport(clientTransport)
        .withFraming(new LengthPrefixedFraming())
        .withSerialization(new JsonCodec())
        .withProtocol(new JsonRpcProtocol())
        .withTimeout(100)
        .build() as any;

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
      clientChannel = new ChannelBuilder()
        .withTransport(clientTransport)
        .withFraming(new LengthPrefixedFraming())
        .withSerialization(new JsonCodec())
        .withProtocol(new JsonRpcProtocol())
        .withTimeout(100)
        .build() as any;

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
      clientChannel = new ChannelBuilder()
        .withTransport(clientTransport)
        .withFraming(new LengthPrefixedFraming())
        .withSerialization(new JsonCodec())
        .withProtocol(new SimpleProtocol())
        .build() as any;

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
      clientChannel = new ChannelBuilder()
        .withTransport(clientTransport)
        .withFraming(new LengthPrefixedFraming())
        .withSerialization(new JsonCodec())
        .withProtocol(new JsonRpcProtocol())
        .build() as any;

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

  describe("Connection Error Cleanup (C1)", () => {
    it("should cleanup subscriptions when transport.connect() fails", async () => {
      // Create a mock transport that fails on connect
      const mockTransport = {
        state: "disconnected" as const,
        connectCalled: false,
        onDataCalled: false,
        onCalled: false,
        dataUnsubscribeCalled: false,
        errorUnsubscribeCalled: false,

        connect: async () => {
          mockTransport.connectCalled = true;
          throw new Error("Connection failed");
        },

        disconnect: async () => {},

        write: async () => {},

        onData: (handler: (data: Buffer) => void) => {
          mockTransport.onDataCalled = true;
          // Keep reference to verify handler isn't called
          void handler;
          return () => {
            mockTransport.dataUnsubscribeCalled = true;
          };
        },

        on: (event: string, handler: (data: unknown) => void) => {
          if (event === "error") {
            mockTransport.onCalled = true;
          }
          void handler;
          return () => {
            if (event === "error") {
              mockTransport.errorUnsubscribeCalled = true;
            }
          };
        },
      };

      const channel = new ChannelBuilder()
        .withTransport(mockTransport as any)
        .withFraming(new LengthPrefixedFraming())
        .withSerialization(new JsonCodec())
        .withProtocol(new JsonRpcProtocol())
        .build();

      // Attempt to start - should fail
      await expect(channel.start()).rejects.toThrow("Connection failed");

      // Verify subscriptions were made before connect
      expect(mockTransport.onDataCalled).toBe(true);
      expect(mockTransport.onCalled).toBe(true);

      // Verify subscriptions were cleaned up after connect failure
      expect(mockTransport.dataUnsubscribeCalled).toBe(true);
      expect(mockTransport.errorUnsubscribeCalled).toBe(true);
    });

    it("should allow retry after failed connection", async () => {
      let connectAttempts = 0;

      const mockTransport = {
        state: "disconnected" as const,
        subscriptionCount: 0,

        connect: async () => {
          connectAttempts++;
          if (connectAttempts === 1) {
            throw new Error("First attempt failed");
          }
          // Second attempt succeeds
          (mockTransport as any).state = "connected";
        },

        disconnect: async () => {
          (mockTransport as any).state = "disconnected";
        },

        write: async () => {},

        onData: () => {
          mockTransport.subscriptionCount++;
          return () => {
            mockTransport.subscriptionCount--;
          };
        },

        on: () => {
          mockTransport.subscriptionCount++;
          return () => {
            mockTransport.subscriptionCount--;
          };
        },
      };

      const channel = new ChannelBuilder()
        .withTransport(mockTransport as any)
        .withFraming(new LengthPrefixedFraming())
        .withSerialization(new JsonCodec())
        .withProtocol(new JsonRpcProtocol())
        .build();

      // First attempt fails
      await expect(channel.start()).rejects.toThrow("First attempt failed");

      // Subscriptions should be cleaned up
      expect(mockTransport.subscriptionCount).toBe(0);

      // Second attempt succeeds
      await channel.start();

      // Should have active subscriptions now
      expect(mockTransport.subscriptionCount).toBe(2); // onData + on("error")
      expect(channel.isConnected).toBe(true);

      // Cleanup
      await channel.close();
    });
  });

  describe("Max Inbound Frames Limit (C2)", () => {
    it("should close channel when maxInboundFrames limit is exceeded", async () => {
      // Setup server
      server = new SocketServer();
      await server.listen(socketPath);

      const serverErrors: Error[] = [];
      let serverClosed = false;

      const serverConnectionPromise = new Promise<Channel>((resolve) => {
        server.onConnection((transport) => {
          const channel: any = new ChannelBuilder()
            .withTransport(transport)
            .withFraming(new LengthPrefixedFraming())
            .withSerialization(new JsonCodec())
            .withProtocol(new JsonRpcProtocol())
            .withMaxInboundFrames(5) // Low limit for testing
            .build();

          channel.on("error", (err: Error) => {
            serverErrors.push(err);
          });

          channel.on("close", () => {
            serverClosed = true;
          });

          channel.start().then(() => resolve(channel));
        });
      });

      // Setup client
      const clientTransport = new SocketTransport({ path: socketPath });
      clientChannel = new ChannelBuilder()
        .withTransport(clientTransport)
        .withFraming(new LengthPrefixedFraming())
        .withSerialization(new JsonCodec())
        .withProtocol(new JsonRpcProtocol())
        .build() as any;

      await clientChannel.start();
      serverChannel = await serverConnectionPromise;

      // Send 10 notifications (more than the limit of 5)
      for (let i = 0; i < 10; i++) {
        await clientChannel.notify("test", { index: i }).catch(() => {});
      }

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Server channel should have closed
      expect(serverClosed).toBe(true);

      // Should have emitted an error about exceeding limit
      expect(serverErrors.length).toBeGreaterThan(0);
      expect(serverErrors.some((e) => e.message.includes("max inbound frames"))).toBe(true);
    });

    it("should not limit frames when maxInboundFrames is undefined", async () => {
      // Setup server without limit
      server = new SocketServer();
      await server.listen(socketPath);

      const receivedNotifications: any[] = [];

      const serverConnectionPromise = new Promise<Channel>((resolve) => {
        server.onConnection((transport) => {
          const channel: any = new ChannelBuilder()
            .withTransport(transport)
            .withFraming(new LengthPrefixedFraming())
            .withSerialization(new JsonCodec())
            .withProtocol(new JsonRpcProtocol())
            // No maxInboundFrames set - unlimited
            .build();

          channel.onNotification((notif: any) => {
            receivedNotifications.push(notif);
          });

          channel.start().then(() => resolve(channel));
        });
      });

      // Setup client
      const clientTransport = new SocketTransport({ path: socketPath });
      clientChannel = new ChannelBuilder()
        .withTransport(clientTransport)
        .withFraming(new LengthPrefixedFraming())
        .withSerialization(new JsonCodec())
        .withProtocol(new JsonRpcProtocol())
        .build() as any;

      await clientChannel.start();
      serverChannel = await serverConnectionPromise;

      // Send many notifications
      for (let i = 0; i < 20; i++) {
        await clientChannel.notify("test", { index: i });
      }

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // All notifications should have been received
      expect(receivedNotifications).toHaveLength(20);
      expect(serverChannel.isConnected).toBe(true);
    });

    it("should reset inboundFrameCount on channel restart", async () => {
      // Setup server
      server = new SocketServer();
      await server.listen(socketPath);

      const channels: Channel[] = [];

      server.onConnection((transport) => {
        const channel: any = new ChannelBuilder()
          .withTransport(transport)
          .withFraming(new LengthPrefixedFraming())
          .withSerialization(new JsonCodec())
          .withProtocol(new JsonRpcProtocol())
          .withMaxInboundFrames(3)
          .build();

        channels.push(channel);
        channel.start();
      });

      // First connection
      const clientTransport1 = new SocketTransport({ path: socketPath });
      const client1 = new ChannelBuilder()
        .withTransport(clientTransport1)
        .withFraming(new LengthPrefixedFraming())
        .withSerialization(new JsonCodec())
        .withProtocol(new JsonRpcProtocol())
        .build() as any;

      await client1.start();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Send 2 notifications (under limit)
      await client1.notify("test", { n: 1 });
      await client1.notify("test", { n: 2 });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // First channel should still be connected
      expect(channels[0]?.isConnected).toBe(true);

      // Close first client
      await client1.close();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Second connection
      const clientTransport2 = new SocketTransport({ path: socketPath });
      const client2 = new ChannelBuilder()
        .withTransport(clientTransport2)
        .withFraming(new LengthPrefixedFraming())
        .withSerialization(new JsonCodec())
        .withProtocol(new JsonRpcProtocol())
        .build() as any;

      await client2.start();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Send 3 notifications (at limit, but should work because counter was reset for new channel)
      await client2.notify("test", { n: 1 });
      await client2.notify("test", { n: 2 });
      await client2.notify("test", { n: 3 });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Second channel should still be connected (its own counter started fresh)
      expect(channels[1]?.isConnected).toBe(true);

      // Cleanup
      await client2.close();
      for (const ch of channels) {
        await ch.close().catch(() => {});
      }
    });
  });
});
