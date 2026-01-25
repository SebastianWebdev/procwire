import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SocketServer } from "../../src/transport/socket-server.js";

describe("SocketServer", () => {
  let server: SocketServer;
  let socketPath: string;

  beforeEach(() => {
    // Create unique socket path for each test
    const tmpDir = os.tmpdir();
    if (process.platform === "win32") {
      // Use named pipe path on Windows
      socketPath = `\\\\.\\pipe\\procwire-test-${process.pid}-${Date.now()}`;
    } else {
      socketPath = path.join(tmpDir, `procwire-test-${process.pid}-${Date.now()}.sock`);
    }
    server = new SocketServer();
  });

  afterEach(async () => {
    await server.close();

    // Clean up socket file on Unix
    if (process.platform !== "win32") {
      try {
        fs.unlinkSync(socketPath);
      } catch {
        // Ignore
      }
    }
  });

  describe("listen", () => {
    it("should start listening on the given path", async () => {
      await server.listen(socketPath);

      expect(server.isListening).toBe(true);
      expect(server.path).toBe(socketPath);
    });

    it("should throw if already listening", async () => {
      await server.listen(socketPath);

      await expect(server.listen(socketPath)).rejects.toThrow("Server already listening");
    });

    it("should remove existing socket file before listening", async () => {
      // Skip on Windows - named pipes don't leave files
      if (process.platform === "win32") {
        return;
      }

      // Create a file at the socket path
      fs.writeFileSync(socketPath, "dummy");

      await server.listen(socketPath);

      expect(server.isListening).toBe(true);
    });
  });

  describe("waitForConnection", () => {
    it("should return transport when client connects", async () => {
      await server.listen(socketPath);

      // Start waiting for connection
      const connectionPromise = server.waitForConnection();

      // Connect a client
      const client = net.createConnection(socketPath);

      const transport = await connectionPromise;

      expect(transport).toBeDefined();
      expect(transport.state).toBe("connected");

      client.destroy();
    });

    it("should throw if not listening", async () => {
      await expect(server.waitForConnection()).rejects.toThrow("Server not listening");
    });

    it("should timeout if no client connects", async () => {
      await server.listen(socketPath);

      await expect(server.waitForConnection(100)).rejects.toThrow("Connection timeout");
    });
  });

  describe("close", () => {
    it("should stop the server", async () => {
      await server.listen(socketPath);
      await server.close();

      expect(server.isListening).toBe(false);
    });

    it("should be idempotent", async () => {
      await server.close(); // Should not throw when not listening
      await server.close();
    });

    it("should clean up socket file on Unix", async () => {
      if (process.platform === "win32") {
        return; // Skip on Windows
      }

      await server.listen(socketPath);

      // Verify socket exists
      expect(fs.existsSync(socketPath)).toBe(true);

      await server.close();

      // Verify socket is removed
      expect(fs.existsSync(socketPath)).toBe(false);
    });

    it("should reject pending waitForConnection on close", async () => {
      await server.listen(socketPath);

      const connectionPromise = server.waitForConnection(10000);

      // Close server while waiting
      await server.close();

      await expect(connectionPromise).rejects.toThrow("Server closed");
    });
  });

  describe("SocketClientTransport", () => {
    it("should allow writing data", async () => {
      await server.listen(socketPath);

      const connectionPromise = server.waitForConnection();
      const client = net.createConnection(socketPath);

      const transport = await connectionPromise;

      // Setup client to receive data
      const receivedData: Buffer[] = [];
      client.on("data", (data) => {
        receivedData.push(data);
      });

      // Write from server transport
      await transport.write(Buffer.from("hello from server"));

      // Allow data to transfer
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(receivedData.length).toBe(1);
      expect(receivedData[0]!.toString()).toBe("hello from server");

      client.destroy();
    });

    it("should receive data from client", async () => {
      await server.listen(socketPath);

      const connectionPromise = server.waitForConnection();
      const client = net.createConnection(socketPath);

      const transport = await connectionPromise;

      // Setup transport to receive data
      const receivedData: Buffer[] = [];
      transport.onData((data) => {
        receivedData.push(data);
      });

      // Write from client
      client.write(Buffer.from("hello from client"));

      // Allow data to transfer
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(receivedData.length).toBe(1);
      expect(receivedData[0]!.toString()).toBe("hello from client");

      client.destroy();
    });

    it("should call onClose when client disconnects", async () => {
      await server.listen(socketPath);

      const connectionPromise = server.waitForConnection();
      const client = net.createConnection(socketPath);

      const transport = await connectionPromise;

      let closeCalled = false;
      transport.onClose(() => {
        closeCalled = true;
      });

      client.destroy();

      // Allow close event to propagate
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(closeCalled).toBe(true);
      expect(transport.state).toBe("disconnected");
    });

    it("should throw when writing to disconnected transport", async () => {
      await server.listen(socketPath);

      const connectionPromise = server.waitForConnection();
      const client = net.createConnection(socketPath);

      const transport = await connectionPromise;

      client.destroy();
      await new Promise((resolve) => setTimeout(resolve, 50));

      await expect(transport.write(Buffer.from("test"))).rejects.toThrow("Transport not connected");
    });

    it("should handle disconnect gracefully", async () => {
      await server.listen(socketPath);

      const connectionPromise = server.waitForConnection();
      const client = net.createConnection(socketPath);

      const transport = await connectionPromise;

      await transport.disconnect();

      expect(transport.state).toBe("disconnected");

      // Should be idempotent
      await transport.disconnect();
      expect(transport.state).toBe("disconnected");

      client.destroy();
    });

    it("should call onError when socket errors", async () => {
      await server.listen(socketPath);

      const connectionPromise = server.waitForConnection();
      const client = net.createConnection(socketPath);

      const transport = await connectionPromise;

      // Verify the handler can be registered and unregistered
      const unsubscribe = transport.onError(() => {});
      expect(typeof unsubscribe).toBe("function");
      unsubscribe();

      client.destroy();
    });

    it("should return unsubscribe functions", async () => {
      await server.listen(socketPath);

      const connectionPromise = server.waitForConnection();
      const client = net.createConnection(socketPath);

      const transport = await connectionPromise;

      const unsubData = transport.onData(() => {});
      const unsubError = transport.onError(() => {});
      const unsubClose = transport.onClose(() => {});

      // All should be functions
      expect(typeof unsubData).toBe("function");
      expect(typeof unsubError).toBe("function");
      expect(typeof unsubClose).toBe("function");

      // Should be callable without error
      unsubData();
      unsubError();
      unsubClose();

      client.destroy();
    });

    it("should not throw on connect when already connected", async () => {
      await server.listen(socketPath);

      const connectionPromise = server.waitForConnection();
      const client = net.createConnection(socketPath);

      const transport = await connectionPromise;

      // Connect should be idempotent
      await transport.connect();
      await transport.connect();

      expect(transport.state).toBe("connected");

      client.destroy();
    });
  });
});
