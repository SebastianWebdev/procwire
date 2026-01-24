import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ShutdownManager, DEFAULT_SHUTDOWN_OPTIONS } from "../src/shutdown/index.js";
import { ReservedMethods } from "../src/protocol/reserved-methods.js";
import type { Shutdownable } from "../src/shutdown/types.js";
import type { ShutdownResult, ShutdownCompleteParams } from "../src/protocol/reserved-types.js";

/**
 * Creates a mock shutdownable target for testing.
 */
function createMockTarget(options: {
  id?: string;
  pid?: number | null;
  requestBehavior?: "success" | "timeout" | "error";
  sendCompleteAfterMs?: number;
  pendingRequests?: number;
  exitCode?: number;
} = {}): Shutdownable & {
  requestCalls: Array<{ method: string; params: unknown; timeout?: number }>;
  killCalls: string[];
  notificationHandlers: Map<string, Set<(params: unknown) => void>>;
  triggerNotification: (method: string, params: unknown) => void;
} {
  const notificationHandlers = new Map<string, Set<(params: unknown) => void>>();

  const mock = {
    id: options.id ?? "test-process",
    pid: options.pid ?? 12345,
    requestCalls: [] as Array<{ method: string; params: unknown; timeout?: number }>,
    killCalls: [] as string[],
    notificationHandlers,

    request: vi.fn().mockImplementation(async (method: string, params: unknown, timeout?: number) => {
      mock.requestCalls.push({ method, params, ...(timeout !== undefined && { timeout }) });

      if (options.requestBehavior === "timeout") {
        await new Promise((_, reject) => {
          setTimeout(() => reject(new Error("Request timeout")), 50);
        });
      }

      if (options.requestBehavior === "error") {
        throw new Error("Request failed");
      }

      // Default: success response
      const response: ShutdownResult = {
        status: "shutting_down",
        pending_requests: options.pendingRequests ?? 0,
      };

      // Schedule __shutdown_complete__ notification if configured
      if (options.sendCompleteAfterMs !== undefined) {
        setTimeout(() => {
          const completeParams: ShutdownCompleteParams = {
            exit_code: options.exitCode ?? 0,
          };
          mock.triggerNotification(ReservedMethods.SHUTDOWN_COMPLETE, completeParams);
        }, options.sendCompleteAfterMs);
      }

      return response;
    }),

    kill: vi.fn().mockImplementation((signal?: string) => {
      mock.killCalls.push(signal ?? "SIGTERM");
    }),

    onNotification: vi.fn().mockImplementation((method: string, handler: (params: unknown) => void) => {
      if (!notificationHandlers.has(method)) {
        notificationHandlers.set(method, new Set());
      }
      notificationHandlers.get(method)!.add(handler);

      return () => {
        notificationHandlers.get(method)?.delete(handler);
      };
    }),

    triggerNotification: (method: string, params: unknown) => {
      const handlers = notificationHandlers.get(method);
      if (handlers) {
        for (const handler of handlers) {
          handler(params);
        }
      }
    },
  };

  return mock;
}

describe("ShutdownManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("should use default options when none provided", () => {
      const shutdown = new ShutdownManager();
      expect(shutdown.getOptions()).toEqual(DEFAULT_SHUTDOWN_OPTIONS);
    });

    it("should merge provided options with defaults", () => {
      const shutdown = new ShutdownManager({
        gracefulTimeoutMs: 10000,
      });

      const options = shutdown.getOptions();
      expect(options.gracefulTimeoutMs).toBe(10000);
      expect(options.enabled).toBe(DEFAULT_SHUTDOWN_OPTIONS.enabled);
      expect(options.exitWaitMs).toBe(DEFAULT_SHUTDOWN_OPTIONS.exitWaitMs);
    });
  });

  describe("graceful shutdown sequence", () => {
    it("should send __shutdown__ request with correct parameters", async () => {
      const target = createMockTarget({ sendCompleteAfterMs: 10 });
      const shutdown = new ShutdownManager({ gracefulTimeoutMs: 1000 });

      const promise = shutdown.initiateShutdown(target, "user_requested");

      // Advance timers to allow shutdown complete to fire
      await vi.advanceTimersByTimeAsync(100);
      // Advance through exit wait
      await vi.advanceTimersByTimeAsync(1000);

      await promise;

      expect(target.requestCalls).toHaveLength(1);
      expect(target.requestCalls[0]).toEqual({
        method: ReservedMethods.SHUTDOWN,
        params: {
          timeout_ms: 1000,
          reason: "user_requested",
        },
        timeout: 1000,
      });
    });

    it("should emit shutdown:start event", async () => {
      const target = createMockTarget({ sendCompleteAfterMs: 10 });
      const shutdown = new ShutdownManager();

      const startHandler = vi.fn();
      shutdown.on("shutdown:start", startHandler);

      const promise = shutdown.initiateShutdown(target, "manager_shutdown");

      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(1000);
      await promise;

      expect(startHandler).toHaveBeenCalledWith({
        processId: "test-process",
        reason: "manager_shutdown",
      });
    });

    it("should emit shutdown:ack event on successful response", async () => {
      const target = createMockTarget({
        sendCompleteAfterMs: 10,
        pendingRequests: 5,
      });
      const shutdown = new ShutdownManager();

      const ackHandler = vi.fn();
      shutdown.on("shutdown:ack", ackHandler);

      const promise = shutdown.initiateShutdown(target, "user_requested");

      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(1000);
      await promise;

      expect(ackHandler).toHaveBeenCalledWith({
        processId: "test-process",
        pendingRequests: 5,
      });
    });

    it("should emit shutdown:complete on receiving __shutdown_complete__", async () => {
      const target = createMockTarget({
        sendCompleteAfterMs: 50,
        exitCode: 0,
      });
      const shutdown = new ShutdownManager();

      const completeHandler = vi.fn();
      shutdown.on("shutdown:complete", completeHandler);

      const promise = shutdown.initiateShutdown(target, "user_requested");

      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(1000);
      await promise;

      expect(completeHandler).toHaveBeenCalledWith({
        processId: "test-process",
        exitCode: 0,
      });
    });

    it("should emit shutdown:done with graceful=true on successful shutdown", async () => {
      const target = createMockTarget({ sendCompleteAfterMs: 10 });
      const shutdown = new ShutdownManager();

      const doneHandler = vi.fn();
      shutdown.on("shutdown:done", doneHandler);

      const promise = shutdown.initiateShutdown(target, "user_requested");

      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(1000);
      await promise;

      expect(doneHandler).toHaveBeenCalledWith({
        processId: "test-process",
        graceful: true,
        durationMs: expect.any(Number),
      });
    });

    it("should not call kill on graceful shutdown", async () => {
      const target = createMockTarget({ sendCompleteAfterMs: 10 });
      const shutdown = new ShutdownManager();

      const promise = shutdown.initiateShutdown(target, "user_requested");

      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(1000);
      await promise;

      expect(target.killCalls).toHaveLength(0);
    });
  });

  describe("force kill on timeout", () => {
    it("should force kill if __shutdown_complete__ not received", async () => {
      // Target responds to shutdown but never sends complete
      const target = createMockTarget();
      const shutdown = new ShutdownManager({
        gracefulTimeoutMs: 100,
      });

      const forceHandler = vi.fn();
      shutdown.on("shutdown:force", forceHandler);

      const promise = shutdown.initiateShutdown(target, "user_requested");

      // Advance past graceful timeout
      await vi.advanceTimersByTimeAsync(200);
      await promise;

      expect(forceHandler).toHaveBeenCalledWith({
        processId: "test-process",
        reason: "timeout",
      });
      expect(target.killCalls).toContain("SIGKILL");
    });

    it("should emit shutdown:done with graceful=false on force kill", async () => {
      const target = createMockTarget();
      const shutdown = new ShutdownManager({
        gracefulTimeoutMs: 100,
      });

      const doneHandler = vi.fn();
      shutdown.on("shutdown:done", doneHandler);

      const promise = shutdown.initiateShutdown(target, "user_requested");

      await vi.advanceTimersByTimeAsync(200);
      await promise;

      expect(doneHandler).toHaveBeenCalledWith({
        processId: "test-process",
        graceful: false,
        durationMs: expect.any(Number),
      });
    });
  });

  describe("force kill on no response", () => {
    it("should force kill if __shutdown__ request times out", async () => {
      const target = createMockTarget({ requestBehavior: "timeout" });
      const shutdown = new ShutdownManager();

      const forceHandler = vi.fn();
      shutdown.on("shutdown:force", forceHandler);

      const promise = shutdown.initiateShutdown(target, "user_requested");

      await vi.advanceTimersByTimeAsync(100);
      await promise;

      expect(forceHandler).toHaveBeenCalledWith({
        processId: "test-process",
        reason: "no_response",
      });
      expect(target.killCalls).toContain("SIGKILL");
    });

    it("should force kill if __shutdown__ request errors", async () => {
      const target = createMockTarget({ requestBehavior: "error" });
      const shutdown = new ShutdownManager();

      const errorHandler = vi.fn();
      const forceHandler = vi.fn();
      shutdown.on("shutdown:error", errorHandler);
      shutdown.on("shutdown:force", forceHandler);

      const promise = shutdown.initiateShutdown(target, "user_requested");

      await vi.advanceTimersByTimeAsync(100);
      await promise;

      expect(errorHandler).toHaveBeenCalledWith({
        processId: "test-process",
        error: expect.any(Error),
      });
      expect(forceHandler).toHaveBeenCalled();
    });
  });

  describe("disabled graceful shutdown", () => {
    it("should immediately kill when graceful shutdown is disabled", async () => {
      const target = createMockTarget();
      const shutdown = new ShutdownManager({ enabled: false });

      const forceHandler = vi.fn();
      shutdown.on("shutdown:force", forceHandler);

      await shutdown.initiateShutdown(target, "user_requested");

      expect(target.requestCalls).toHaveLength(0);
      expect(target.killCalls).toContain("SIGKILL");
      expect(forceHandler).toHaveBeenCalled();
    });
  });

  describe("state management", () => {
    it("should track shutdown state during operation", async () => {
      const target = createMockTarget({ sendCompleteAfterMs: 50 });
      const shutdown = new ShutdownManager();

      const promise = shutdown.initiateShutdown(target, "user_requested");

      // Check state during shutdown
      expect(shutdown.isShuttingDown("test-process")).toBe(true);
      const state = shutdown.getState("test-process");
      expect(state).not.toBeNull();
      expect(state?.processId).toBe("test-process");

      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(1000);
      await promise;

      // State should be cleared after completion
      expect(shutdown.isShuttingDown("test-process")).toBe(false);
      expect(shutdown.getState("test-process")).toBeNull();
    });

    it("should throw if process is already being shut down", async () => {
      const target = createMockTarget({ sendCompleteAfterMs: 100 });
      const shutdown = new ShutdownManager();

      // Start first shutdown
      const promise1 = shutdown.initiateShutdown(target, "user_requested");

      // Try to start second shutdown
      await expect(shutdown.initiateShutdown(target, "manager_shutdown")).rejects.toThrow(
        /already being shut down/,
      );

      await vi.advanceTimersByTimeAsync(200);
      await vi.advanceTimersByTimeAsync(1000);
      await promise1;
    });
  });

  describe("shutdown reasons", () => {
    it("should support all shutdown reasons", async () => {
      const reasons = [
        "user_requested",
        "manager_shutdown",
        "idle_timeout",
        "error_threshold",
        "restart",
        "heartbeat_dead",
      ] as const;

      for (const reason of reasons) {
        const target = createMockTarget({ sendCompleteAfterMs: 10 });
        const shutdown = new ShutdownManager();

        const promise = shutdown.initiateShutdown(target, reason);

        await vi.advanceTimersByTimeAsync(100);
        await vi.advanceTimersByTimeAsync(1000);
        await promise;

        expect(target.requestCalls[0]?.params).toEqual(
          expect.objectContaining({ reason }),
        );
      }
    });
  });

  describe("exit codes", () => {
    it("should report exit code from __shutdown_complete__", async () => {
      const target = createMockTarget({
        sendCompleteAfterMs: 10,
        exitCode: 42,
      });
      const shutdown = new ShutdownManager();

      const completeHandler = vi.fn();
      shutdown.on("shutdown:complete", completeHandler);

      const promise = shutdown.initiateShutdown(target, "user_requested");

      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(1000);
      await promise;

      expect(completeHandler).toHaveBeenCalledWith({
        processId: "test-process",
        exitCode: 42,
      });
    });
  });
});
