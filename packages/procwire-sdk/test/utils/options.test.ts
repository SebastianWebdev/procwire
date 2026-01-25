import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveWorkerOptions, DEFAULT_WORKER_OPTIONS } from "../../src/utils/options.js";

describe("Worker Options", () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    // Reset process.argv
    process.argv = ["node", "/path/to/my-script.js"];
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  describe("DEFAULT_WORKER_OPTIONS", () => {
    it("should have correct default values", () => {
      expect(DEFAULT_WORKER_OPTIONS).toEqual({
        name: "worker",
        dataChannel: undefined,
        debug: false,
        capabilities: [],
        drainTimeout: 5000,
      });
    });
  });

  describe("resolveWorkerOptions", () => {
    it("should return defaults when no options provided", () => {
      const resolved = resolveWorkerOptions();

      expect(resolved.debug).toBe(false);
      expect(resolved.capabilities).toEqual([]);
      expect(resolved.drainTimeout).toBe(5000);
      expect(resolved.dataChannel).toBeUndefined();
    });

    it("should derive name from process.argv", () => {
      process.argv = ["node", "/path/to/my-worker.js"];

      const resolved = resolveWorkerOptions();

      expect(resolved.name).toBe("my-worker");
    });

    it("should handle script name without extension", () => {
      process.argv = ["node", "/path/to/worker"];

      const resolved = resolveWorkerOptions();

      expect(resolved.name).toBe("worker");
    });

    it("should use fallback name when argv[1] is empty", () => {
      process.argv = ["node"];

      const resolved = resolveWorkerOptions();

      expect(resolved.name).toBe("worker");
    });

    it("should use provided name over argv", () => {
      process.argv = ["node", "/path/to/other-name.js"];

      const resolved = resolveWorkerOptions({ name: "custom-name" });

      expect(resolved.name).toBe("custom-name");
    });

    it("should merge user options with defaults", () => {
      const resolved = resolveWorkerOptions({
        name: "test-worker",
        debug: true,
        drainTimeout: 10000,
      });

      expect(resolved.name).toBe("test-worker");
      expect(resolved.debug).toBe(true);
      expect(resolved.drainTimeout).toBe(10000);
      expect(resolved.capabilities).toEqual([]);
    });

    it("should preserve dataChannel options", () => {
      const mockCodec = { encode: vi.fn(), decode: vi.fn() };

      const resolved = resolveWorkerOptions({
        dataChannel: { serialization: mockCodec as never },
      });

      expect(resolved.dataChannel?.serialization).toBe(mockCodec);
    });

    it("should preserve capabilities array", () => {
      const resolved = resolveWorkerOptions({
        capabilities: ["custom_capability", "another_one"],
      });

      expect(resolved.capabilities).toEqual(["custom_capability", "another_one"]);
    });

    it("should handle Windows-style paths", () => {
      process.argv = ["node", "C:\\Users\\Test\\my-app.js"];

      const resolved = resolveWorkerOptions();

      // path.basename should handle both separators
      expect(resolved.name).toBe("my-app");
    });
  });
});
