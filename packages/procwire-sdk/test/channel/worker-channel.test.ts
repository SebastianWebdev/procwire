import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WorkerChannel } from "../../src/channel/worker-channel.js";
import type { WorkerTransport } from "../../src/transport/types.js";
import type { Logger } from "../../src/utils/logger.js";

/**
 * Create a mock transport for testing.
 */
function createMockTransport(): WorkerTransport & {
  simulateData: (data: Buffer) => void;
  simulateClose: () => void;
  simulateError: (error: Error) => void;
  writtenData: Buffer[];
} {
  let dataHandler: ((data: Buffer) => void) | null = null;
  let closeHandler: (() => void) | null = null;
  let errorHandler: ((error: Error) => void) | null = null;
  const writtenData: Buffer[] = [];

  return {
    state: "disconnected" as const,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    write: vi.fn().mockImplementation(async (data: Buffer) => {
      writtenData.push(data);
    }),
    onData: vi.fn().mockImplementation((handler: (data: Buffer) => void) => {
      dataHandler = handler;
      return () => {
        dataHandler = null;
      };
    }),
    onError: vi.fn().mockImplementation((handler: (error: Error) => void) => {
      errorHandler = handler;
      return () => {
        errorHandler = null;
      };
    }),
    onClose: vi.fn().mockImplementation((handler: () => void) => {
      closeHandler = handler;
      return () => {
        closeHandler = null;
      };
    }),
    simulateData: (data: Buffer) => {
      dataHandler?.(data);
    },
    simulateClose: () => {
      closeHandler?.();
    },
    simulateError: (error: Error) => {
      errorHandler?.(error);
    },
    writtenData,
  };
}

/**
 * Create a no-op logger for testing.
 */
function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe("WorkerChannel", () => {
  let transport: ReturnType<typeof createMockTransport>;
  let logger: Logger;
  let onRequest: ReturnType<typeof vi.fn>;
  let onNotification: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    transport = createMockTransport();
    logger = createMockLogger();
    onRequest = vi.fn().mockResolvedValue({ result: "ok" });
    onNotification = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("start/stop", () => {
    it("should connect transport on start", async () => {
      const channel = new WorkerChannel({
        transport,
        framing: "line-delimited",
        logger,
        onRequest,
        onNotification,
      });

      await channel.start();

      expect(transport.connect).toHaveBeenCalled();
      expect(transport.onData).toHaveBeenCalled();
      expect(transport.onError).toHaveBeenCalled();
      expect(transport.onClose).toHaveBeenCalled();
    });

    it("should disconnect transport on stop", async () => {
      const channel = new WorkerChannel({
        transport,
        framing: "line-delimited",
        logger,
        onRequest,
        onNotification,
      });

      await channel.start();
      await channel.stop();

      expect(transport.disconnect).toHaveBeenCalled();
    });

    it("should not start twice", async () => {
      const channel = new WorkerChannel({
        transport,
        framing: "line-delimited",
        logger,
        onRequest,
        onNotification,
      });

      await channel.start();
      await channel.start();

      expect(transport.connect).toHaveBeenCalledTimes(1);
    });

    it("should not stop if not running", async () => {
      const channel = new WorkerChannel({
        transport,
        framing: "line-delimited",
        logger,
        onRequest,
        onNotification,
      });

      await channel.stop();

      expect(transport.disconnect).not.toHaveBeenCalled();
    });
  });

  describe("line-delimited framing", () => {
    it("should parse complete JSON-RPC request", async () => {
      const channel = new WorkerChannel({
        transport,
        framing: "line-delimited",
        logger,
        onRequest,
        onNotification,
      });

      await channel.start();

      const request = { jsonrpc: "2.0", id: 1, method: "test", params: { foo: "bar" } };
      transport.simulateData(Buffer.from(JSON.stringify(request) + "\n"));

      // Wait for async processing
      await new Promise((r) => setTimeout(r, 10));

      expect(onRequest).toHaveBeenCalledWith("test", { foo: "bar" }, 1);
    });

    it("should parse complete JSON-RPC notification", async () => {
      const channel = new WorkerChannel({
        transport,
        framing: "line-delimited",
        logger,
        onRequest,
        onNotification,
      });

      await channel.start();

      const notification = { jsonrpc: "2.0", method: "event", params: { data: 123 } };
      transport.simulateData(Buffer.from(JSON.stringify(notification) + "\n"));

      await new Promise((r) => setTimeout(r, 10));

      expect(onNotification).toHaveBeenCalledWith("event", { data: 123 });
    });

    it("should handle multiple messages in single chunk", async () => {
      const channel = new WorkerChannel({
        transport,
        framing: "line-delimited",
        logger,
        onRequest,
        onNotification,
      });

      await channel.start();

      const msg1 = { jsonrpc: "2.0", id: 1, method: "m1" };
      const msg2 = { jsonrpc: "2.0", id: 2, method: "m2" };
      transport.simulateData(
        Buffer.from(JSON.stringify(msg1) + "\n" + JSON.stringify(msg2) + "\n"),
      );

      await new Promise((r) => setTimeout(r, 10));

      expect(onRequest).toHaveBeenCalledTimes(2);
      expect(onRequest).toHaveBeenCalledWith("m1", undefined, 1);
      expect(onRequest).toHaveBeenCalledWith("m2", undefined, 2);
    });

    it("should buffer partial messages", async () => {
      const channel = new WorkerChannel({
        transport,
        framing: "line-delimited",
        logger,
        onRequest,
        onNotification,
      });

      await channel.start();

      const request = { jsonrpc: "2.0", id: 1, method: "test" };
      const json = JSON.stringify(request);

      // Send first half
      transport.simulateData(Buffer.from(json.slice(0, 10)));
      await new Promise((r) => setTimeout(r, 10));
      expect(onRequest).not.toHaveBeenCalled();

      // Send rest with newline
      transport.simulateData(Buffer.from(json.slice(10) + "\n"));
      await new Promise((r) => setTimeout(r, 10));
      expect(onRequest).toHaveBeenCalledWith("test", undefined, 1);
    });

    it("should skip empty lines", async () => {
      const channel = new WorkerChannel({
        transport,
        framing: "line-delimited",
        logger,
        onRequest,
        onNotification,
      });

      await channel.start();

      const request = { jsonrpc: "2.0", id: 1, method: "test" };
      transport.simulateData(Buffer.from("\n\n" + JSON.stringify(request) + "\n\n"));

      await new Promise((r) => setTimeout(r, 10));

      expect(onRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe("length-prefixed framing", () => {
    it("should parse length-prefixed message", async () => {
      const channel = new WorkerChannel({
        transport,
        framing: "length-prefixed",
        logger,
        onRequest,
        onNotification,
      });

      await channel.start();

      const request = { jsonrpc: "2.0", id: 1, method: "test" };
      const payload = Buffer.from(JSON.stringify(request));
      const frame = Buffer.alloc(4 + payload.length);
      frame.writeUInt32BE(payload.length, 0);
      payload.copy(frame, 4);

      transport.simulateData(frame);

      await new Promise((r) => setTimeout(r, 10));

      expect(onRequest).toHaveBeenCalledWith("test", undefined, 1);
    });

    it("should handle multiple length-prefixed messages", async () => {
      const channel = new WorkerChannel({
        transport,
        framing: "length-prefixed",
        logger,
        onRequest,
        onNotification,
      });

      await channel.start();

      const createFrame = (obj: object): Buffer => {
        const payload = Buffer.from(JSON.stringify(obj));
        const frame = Buffer.alloc(4 + payload.length);
        frame.writeUInt32BE(payload.length, 0);
        payload.copy(frame, 4);
        return frame;
      };

      const frame1 = createFrame({ jsonrpc: "2.0", id: 1, method: "m1" });
      const frame2 = createFrame({ jsonrpc: "2.0", id: 2, method: "m2" });

      transport.simulateData(Buffer.concat([frame1, frame2]));

      await new Promise((r) => setTimeout(r, 10));

      expect(onRequest).toHaveBeenCalledTimes(2);
    });

    it("should buffer incomplete length-prefixed messages", async () => {
      const channel = new WorkerChannel({
        transport,
        framing: "length-prefixed",
        logger,
        onRequest,
        onNotification,
      });

      await channel.start();

      const request = { jsonrpc: "2.0", id: 1, method: "test" };
      const payload = Buffer.from(JSON.stringify(request));
      const frame = Buffer.alloc(4 + payload.length);
      frame.writeUInt32BE(payload.length, 0);
      payload.copy(frame, 4);

      // Send only header + partial payload
      transport.simulateData(frame.subarray(0, 10));
      await new Promise((r) => setTimeout(r, 10));
      expect(onRequest).not.toHaveBeenCalled();

      // Send rest
      transport.simulateData(frame.subarray(10));
      await new Promise((r) => setTimeout(r, 10));
      expect(onRequest).toHaveBeenCalledWith("test", undefined, 1);
    });
  });

  describe("send methods", () => {
    it("should send notification with line-delimited framing", async () => {
      const channel = new WorkerChannel({
        transport,
        framing: "line-delimited",
        logger,
        onRequest,
        onNotification,
      });

      await channel.start();
      await channel.notify("event", { data: 42 });

      expect(transport.write).toHaveBeenCalled();
      expect(transport.writtenData.length).toBeGreaterThan(0);
      const written = transport.writtenData[0]!.toString();
      expect(written).toContain('"method":"event"');
      expect(written).toContain('"params":{"data":42}');
      expect(written.endsWith("\n")).toBe(true);
    });

    it("should send notification with length-prefixed framing", async () => {
      const channel = new WorkerChannel({
        transport,
        framing: "length-prefixed",
        logger,
        onRequest,
        onNotification,
      });

      await channel.start();
      await channel.notify("event", { data: 42 });

      expect(transport.write).toHaveBeenCalled();
      expect(transport.writtenData.length).toBeGreaterThan(0);
      const frame = transport.writtenData[0]!;
      const length = frame.readUInt32BE(0);
      const payload = frame.subarray(4).toString();

      expect(length).toBe(frame.length - 4);
      expect(payload).toContain('"method":"event"');
    });

    it("should send response", async () => {
      const channel = new WorkerChannel({
        transport,
        framing: "line-delimited",
        logger,
        onRequest,
        onNotification,
      });

      await channel.start();
      await channel.respond(123, { value: "result" });

      expect(transport.writtenData.length).toBeGreaterThan(0);
      const written = transport.writtenData[0]!.toString();
      expect(written).toContain('"id":123');
      expect(written).toContain('"result":{"value":"result"}');
    });

    it("should send error response", async () => {
      const channel = new WorkerChannel({
        transport,
        framing: "line-delimited",
        logger,
        onRequest,
        onNotification,
      });

      await channel.start();
      await channel.respondError(123, -32603, "Internal error", { details: "oops" });

      expect(transport.writtenData.length).toBeGreaterThan(0);
      const written = transport.writtenData[0]!.toString();
      expect(written).toContain('"id":123');
      expect(written).toContain('"error"');
      expect(written).toContain('"code":-32603');
      expect(written).toContain('"message":"Internal error"');
    });
  });

  describe("error handling", () => {
    it("should log parse errors", async () => {
      const channel = new WorkerChannel({
        transport,
        framing: "line-delimited",
        logger,
        onRequest,
        onNotification,
      });

      await channel.start();
      transport.simulateData(Buffer.from("not valid json\n"));

      await new Promise((r) => setTimeout(r, 10));

      expect(logger.error).toHaveBeenCalled();
    });

    it("should log unknown message types", async () => {
      const channel = new WorkerChannel({
        transport,
        framing: "line-delimited",
        logger,
        onRequest,
        onNotification,
      });

      await channel.start();
      // Valid JSON but not a valid JSON-RPC message
      transport.simulateData(Buffer.from('{"foo":"bar"}\n'));

      await new Promise((r) => setTimeout(r, 10));

      expect(logger.warn).toHaveBeenCalled();
    });

    it("should send error response when handler throws", async () => {
      onRequest.mockRejectedValue(new Error("Handler failed"));

      const channel = new WorkerChannel({
        transport,
        framing: "line-delimited",
        logger,
        onRequest,
        onNotification,
      });

      await channel.start();

      const request = { jsonrpc: "2.0", id: 1, method: "test" };
      transport.simulateData(Buffer.from(JSON.stringify(request) + "\n"));

      await new Promise((r) => setTimeout(r, 10));

      // Should have written error response
      expect(transport.write).toHaveBeenCalled();
      expect(transport.writtenData.length).toBeGreaterThan(0);
      const written = transport.writtenData[0]!.toString();
      expect(written).toContain('"error"');
      expect(written).toContain("Handler failed");
    });

    it("should log notification handler errors", async () => {
      onNotification.mockRejectedValue(new Error("Notification failed"));

      const channel = new WorkerChannel({
        transport,
        framing: "line-delimited",
        logger,
        onRequest,
        onNotification,
      });

      await channel.start();

      const notification = { jsonrpc: "2.0", method: "event" };
      transport.simulateData(Buffer.from(JSON.stringify(notification) + "\n"));

      await new Promise((r) => setTimeout(r, 10));

      expect(logger.error).toHaveBeenCalled();
    });

    it("should log transport errors", async () => {
      const channel = new WorkerChannel({
        transport,
        framing: "line-delimited",
        logger,
        onRequest,
        onNotification,
      });

      await channel.start();
      transport.simulateError(new Error("Transport error"));

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("request auto-response", () => {
    it("should automatically send response after handler returns", async () => {
      onRequest.mockResolvedValue({ success: true });

      const channel = new WorkerChannel({
        transport,
        framing: "line-delimited",
        logger,
        onRequest,
        onNotification,
      });

      await channel.start();

      const request = { jsonrpc: "2.0", id: 42, method: "test" };
      transport.simulateData(Buffer.from(JSON.stringify(request) + "\n"));

      await new Promise((r) => setTimeout(r, 10));

      expect(transport.writtenData.length).toBeGreaterThan(0);
      const written = transport.writtenData[0]!.toString();
      expect(written).toContain('"id":42');
      expect(written).toContain('"result":{"success":true}');
    });
  });
});
