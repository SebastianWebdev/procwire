import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WorkerImpl } from "../src/worker-impl.js";

// Mock the StdioWorkerTransport
vi.mock("../src/transport/stdio-worker.js", () => ({
  StdioWorkerTransport: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    write: vi.fn().mockResolvedValue(undefined),
    onData: vi.fn().mockReturnValue(() => {}),
    onError: vi.fn().mockReturnValue(() => {}),
    onClose: vi.fn().mockReturnValue(() => {}),
    state: "disconnected",
  })),
}));

// Mock SocketServer
vi.mock("../src/transport/socket-server.js", () => ({
  SocketServer: vi.fn().mockImplementation(() => ({
    listen: vi.fn().mockResolvedValue(undefined),
    waitForConnection: vi.fn().mockResolvedValue({
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      write: vi.fn().mockResolvedValue(undefined),
      onData: vi.fn().mockReturnValue(() => {}),
      onError: vi.fn().mockReturnValue(() => {}),
      onClose: vi.fn().mockReturnValue(() => {}),
      state: "connected",
    }),
    close: vi.fn().mockResolvedValue(undefined),
    isListening: false,
    path: null,
  })),
  SocketClientTransport: vi.fn(),
}));

describe("WorkerImpl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should create worker with default options", () => {
      const worker = new WorkerImpl();
      expect(worker.state).toBe("created");
    });

    it("should create worker with custom options", () => {
      const worker = new WorkerImpl({
        name: "test-worker",
        debug: true,
      });
      expect(worker.state).toBe("created");
    });
  });

  describe("handle", () => {
    it("should register handler and return this for chaining", () => {
      const worker = new WorkerImpl();
      const handler = vi.fn(() => ({ result: "test" }));

      const result = worker.handle("echo", handler);

      expect(result).toBe(worker); // Fluent API
    });

    it("should throw on reserved method", () => {
      const worker = new WorkerImpl();

      expect(() => worker.handle("__handshake__", () => ({}))).toThrow(/reserved/);
    });

    it("should allow multiple handlers for different methods", () => {
      const worker = new WorkerImpl();

      worker.handle("echo", () => ({})).handle("add", () => ({}));

      expect(worker.state).toBe("created"); // Still in created state
    });
  });

  describe("onNotification", () => {
    it("should register notification handler and return this", () => {
      const worker = new WorkerImpl();
      const handler = vi.fn();

      const result = worker.onNotification("event", handler);

      expect(result).toBe(worker);
    });

    it("should throw on reserved method", () => {
      const worker = new WorkerImpl();

      expect(() =>
        worker.onNotification("__shutdown__", () => {
          /* noop */
        }),
      ).toThrow(/reserved/);
    });
  });

  describe("hooks", () => {
    it("should register lifecycle hooks and return this", () => {
      const worker = new WorkerImpl();
      const onReady = vi.fn();
      const onShutdown = vi.fn();
      const onError = vi.fn();

      const result = worker.hooks({ onReady, onShutdown, onError });

      expect(result).toBe(worker);
    });

    it("should allow chaining with handle", () => {
      const worker = new WorkerImpl();

      const result = worker
        .hooks({ onReady: () => {} })
        .handle("echo", () => ({}))
        .onNotification("event", () => {});

      expect(result).toBe(worker);
    });
  });

  describe("state transitions", () => {
    it("should start in created state", () => {
      const worker = new WorkerImpl();
      expect(worker.state).toBe("created");
    });
  });

  describe("notify", () => {
    it("should throw if worker not started", async () => {
      const worker = new WorkerImpl();

      await expect(worker.notify("test")).rejects.toThrow("Worker not started");
    });
  });

  describe("shutdown", () => {
    it("should do nothing if already stopped", async () => {
      const worker = new WorkerImpl();
      // Access private state through casting for testing
      (worker as unknown as { _state: string })._state = "stopped";

      // Should not throw
      await worker.shutdown(0);
    });

    it("should do nothing if already draining", async () => {
      const worker = new WorkerImpl();
      (worker as unknown as { _state: string })._state = "draining";

      // Should not throw
      await worker.shutdown(0);
    });
  });
});

describe("createWorker factory", () => {
  it("should create a WorkerImpl instance", async () => {
    const { createWorker } = await import("../src/worker.js");

    const worker = createWorker({ name: "test" });

    expect(worker).toBeInstanceOf(WorkerImpl);
    expect(worker.state).toBe("created");
  });

  it("should work with default options", async () => {
    const { createWorker } = await import("../src/worker.js");

    const worker = createWorker();

    expect(worker.state).toBe("created");
  });
});
