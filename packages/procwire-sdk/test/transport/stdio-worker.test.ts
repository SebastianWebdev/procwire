import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Readable, Writable } from "node:stream";
import { StdioWorkerTransport } from "../../src/transport/stdio-worker.js";

describe("StdioWorkerTransport", () => {
  let mockStdin: Readable;
  let mockStdout: Writable;
  let stdoutChunks: Buffer[];

  beforeEach(() => {
    stdoutChunks = [];

    mockStdin = new Readable({
      read() {},
    });

    mockStdout = new Writable({
      write(chunk, _encoding, callback) {
        stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        callback();
      },
    });
  });

  afterEach(() => {
    mockStdin.destroy();
    mockStdout.destroy();
  });

  describe("connect", () => {
    it("should transition to connected state", async () => {
      const transport = new StdioWorkerTransport({
        stdin: mockStdin,
        stdout: mockStdout,
      });

      expect(transport.state).toBe("disconnected");
      await transport.connect();
      expect(transport.state).toBe("connected");
    });

    it("should be idempotent", async () => {
      const transport = new StdioWorkerTransport({
        stdin: mockStdin,
        stdout: mockStdout,
      });

      await transport.connect();
      await transport.connect(); // Should not throw
      expect(transport.state).toBe("connected");
    });
  });

  describe("disconnect", () => {
    it("should transition to disconnected state", async () => {
      const transport = new StdioWorkerTransport({
        stdin: mockStdin,
        stdout: mockStdout,
      });

      await transport.connect();
      await transport.disconnect();
      expect(transport.state).toBe("disconnected");
    });

    it("should be idempotent", async () => {
      const transport = new StdioWorkerTransport({
        stdin: mockStdin,
        stdout: mockStdout,
      });

      await transport.disconnect(); // Should not throw when not connected
      expect(transport.state).toBe("disconnected");
    });
  });

  describe("write", () => {
    it("should write data to stdout", async () => {
      const transport = new StdioWorkerTransport({
        stdin: mockStdin,
        stdout: mockStdout,
      });

      await transport.connect();
      await transport.write(Buffer.from("hello"));

      expect(stdoutChunks.length).toBe(1);
      expect(stdoutChunks[0]!.toString()).toBe("hello");
    });

    it("should throw when not connected", async () => {
      const transport = new StdioWorkerTransport({
        stdin: mockStdin,
        stdout: mockStdout,
      });

      await expect(transport.write(Buffer.from("hello"))).rejects.toThrow(
        "Transport not connected",
      );
    });
  });

  describe("onData", () => {
    it("should receive data from stdin", async () => {
      const transport = new StdioWorkerTransport({
        stdin: mockStdin,
        stdout: mockStdout,
      });

      const receivedData: Buffer[] = [];
      transport.onData((data) => {
        receivedData.push(data);
      });

      await transport.connect();

      // Push data to mock stdin
      mockStdin.push(Buffer.from("test data"));

      // Allow event loop to process
      await new Promise((resolve) => setImmediate(resolve));

      expect(receivedData.length).toBe(1);
      expect(receivedData[0]!.toString()).toBe("test data");
    });

    it("should handle string data converted to Buffer", async () => {
      const transport = new StdioWorkerTransport({
        stdin: mockStdin,
        stdout: mockStdout,
      });

      const receivedData: Buffer[] = [];
      transport.onData((data) => {
        receivedData.push(data);
      });

      await transport.connect();
      mockStdin.push("string data");

      await new Promise((resolve) => setImmediate(resolve));

      expect(receivedData.length).toBe(1);
      expect(Buffer.isBuffer(receivedData[0]!)).toBe(true);
      expect(receivedData[0]!.toString()).toBe("string data");
    });

    it("should return unsubscribe function", async () => {
      const transport = new StdioWorkerTransport({
        stdin: mockStdin,
        stdout: mockStdout,
      });

      const receivedData: Buffer[] = [];
      const unsubscribe = transport.onData((data) => {
        receivedData.push(data);
      });

      await transport.connect();

      mockStdin.push(Buffer.from("first"));
      await new Promise((resolve) => setImmediate(resolve));

      unsubscribe();

      mockStdin.push(Buffer.from("second"));
      await new Promise((resolve) => setImmediate(resolve));

      expect(receivedData.length).toBe(1);
      expect(receivedData[0]!.toString()).toBe("first");
    });
  });

  describe("onClose", () => {
    it("should be called when stdin ends", async () => {
      const transport = new StdioWorkerTransport({
        stdin: mockStdin,
        stdout: mockStdout,
      });

      const closeHandler = vi.fn();
      transport.onClose(closeHandler);

      await transport.connect();

      mockStdin.push(null); // Signal end

      await new Promise((resolve) => setImmediate(resolve));

      expect(closeHandler).toHaveBeenCalled();
      expect(transport.state).toBe("disconnected");
    });
  });

  describe("onError", () => {
    it("should be called on stdin error", async () => {
      const transport = new StdioWorkerTransport({
        stdin: mockStdin,
        stdout: mockStdout,
      });

      const errorHandler = vi.fn();
      transport.onError(errorHandler);

      await transport.connect();

      const error = new Error("Test error");
      mockStdin.emit("error", error);

      expect(errorHandler).toHaveBeenCalledWith(error);
    });
  });
});
