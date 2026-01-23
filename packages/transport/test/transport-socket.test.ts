import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SocketTransport } from "../src/transport/socket-transport.js";
import { SocketServer } from "../src/transport/socket-server.js";
import { PipePath } from "../src/utils/pipe-path.js";

describe("SocketTransport", () => {
  const testPath = PipePath.forModule("test-transport", `socket-${Date.now()}`);
  let server: SocketServer;

  beforeEach(async () => {
    server = new SocketServer();
    await server.listen(testPath);
  });

  afterEach(async () => {
    if (server) {
      await server.close();
    }
    await PipePath.cleanup(testPath);
  });

  it("should connect to server", async () => {
    const client = new SocketTransport({ path: testPath });

    expect(client.state).toBe("disconnected");
    await client.connect();
    expect(client.state).toBe("connected");

    await client.disconnect();
    expect(client.state).toBe("disconnected");
  });

  it("should send and receive data", async () => {
    const client = new SocketTransport({ path: testPath });

    // Setup echo handler on server
    server.onConnection((transport) => {
      transport.onData((data) => {
        transport.write(data); // Echo back
      });
    });

    await client.connect();

    // Send data and wait for echo
    const received = await new Promise<Buffer>((resolve) => {
      client.onData(resolve);
      client.write(Buffer.from("hello"));
    });

    expect(received.toString()).toBe("hello");

    await client.disconnect();
  });

  it("should emit connect event", async () => {
    const client = new SocketTransport({ path: testPath });

    const connectPromise = new Promise<void>((resolve) => {
      client.on("connect", resolve);
    });

    await client.connect();
    await connectPromise;

    await client.disconnect();
  });

  it("should emit disconnect event", async () => {
    const client = new SocketTransport({ path: testPath });

    await client.connect();

    const disconnectPromise = new Promise<void>((resolve) => {
      client.on("disconnect", resolve);
    });

    await client.disconnect();
    await disconnectPromise;
  });

  it("should handle connection timeout", async () => {
    const nonExistentPath = PipePath.forModule("test-transport", "nonexistent");
    const client = new SocketTransport({
      path: nonExistentPath,
      connectionTimeout: 100,
    });

    // On Windows, may get ENOENT instead of timeout
    await expect(client.connect()).rejects.toThrow();
  }, 10000);

  it("should throw when writing while disconnected", async () => {
    const client = new SocketTransport({ path: testPath });

    await expect(client.write(Buffer.from("test"))).rejects.toThrow(/not connected/i);
  });
});

describe("SocketServer", () => {
  const testPath = PipePath.forModule("test-server", `socket-${Date.now()}`);
  let server: SocketServer;

  afterEach(async () => {
    if (server) {
      await server.close();
    }
    await PipePath.cleanup(testPath);
  });

  it("should listen and accept connections", async () => {
    server = new SocketServer();

    expect(server.isListening).toBe(false);
    const address = await server.listen(testPath);
    expect(server.isListening).toBe(true);
    expect(address.value).toBe(testPath);
  });

  it("should emit connection event", async () => {
    server = new SocketServer();
    await server.listen(testPath);

    const connectionPromise = new Promise<void>((resolve) => {
      server.onConnection(() => resolve());
    });

    const client = new SocketTransport({ path: testPath });
    await client.connect();

    await connectionPromise;

    await client.disconnect();
  });

  it("should close server and all connections", async () => {
    server = new SocketServer();
    await server.listen(testPath);

    const client = new SocketTransport({ path: testPath });
    await client.connect();

    await server.close();

    expect(server.isListening).toBe(false);
  });
});
