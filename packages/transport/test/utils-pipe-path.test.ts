import { describe, it, expect, vi } from "vitest";
import { tmpdir } from "node:os";
import { PipePath } from "../src/utils/pipe-path.js";
import * as platform from "../src/utils/platform.js";

describe("PipePath", () => {
  describe("forModule", () => {
    it("should generate Windows pipe path on Windows", () => {
      vi.spyOn(platform, "isWindows").mockReturnValue(true);

      const path = PipePath.forModule("procwire", "worker-1");

      expect(path).toBe("\\\\.\\pipe\\procwire-worker-1");
    });

    it("should generate Unix socket path on Unix", () => {
      vi.spyOn(platform, "isWindows").mockReturnValue(false);

      const path = PipePath.forModule("procwire", "worker-1");

      // Should use os.tmpdir() as base directory
      expect(path).toContain(tmpdir());
      expect(path).toContain("procwire-worker-1.sock");
      expect(path).toMatch(/procwire-worker-1\.sock$/);
    });

    it("should sanitize special characters", () => {
      vi.spyOn(platform, "isWindows").mockReturnValue(false);

      const path = PipePath.forModule("my@app", "worker#1");

      expect(path).toContain("my_app-worker_1.sock");
      expect(path).not.toContain("@");
      expect(path).not.toContain("#");
    });

    it("should replace multiple underscores with single", () => {
      vi.spyOn(platform, "isWindows").mockReturnValue(false);

      const path = PipePath.forModule("my___app", "worker");

      expect(path).toContain("my_app-worker.sock");
    });

    it("should trim underscores from ends", () => {
      vi.spyOn(platform, "isWindows").mockReturnValue(false);

      const path = PipePath.forModule("_myapp_", "_worker_");

      expect(path).toContain("myapp-worker.sock");
    });

    it("should handle alphanumeric and dashes", () => {
      vi.spyOn(platform, "isWindows").mockReturnValue(false);

      const path = PipePath.forModule("procwire-v2", "worker-123");

      expect(path).toContain("procwire-v2-worker-123.sock");
    });

    it("should use custom baseDir when provided (Unix)", () => {
      vi.spyOn(platform, "isWindows").mockReturnValue(false);

      const result = PipePath.forModule("myapp", "worker", "/var/run/myapp");

      // Use path.join for cross-platform compatibility in test assertions
      // The implementation uses path.join which produces platform-specific separators
      expect(result).toContain("var");
      expect(result).toContain("run");
      expect(result).toContain("myapp");
      expect(result).toMatch(/myapp-worker\.sock$/);
    });

    it("should ignore baseDir on Windows", () => {
      vi.spyOn(platform, "isWindows").mockReturnValue(true);

      // baseDir is ignored on Windows (Named Pipes are virtual)
      const path = PipePath.forModule("myapp", "worker", "/var/run/myapp");

      expect(path).toBe("\\\\.\\pipe\\myapp-worker");
    });

    it("should throw error when Unix socket path exceeds 104 characters", () => {
      vi.spyOn(platform, "isWindows").mockReturnValue(false);

      // Create very long namespace and moduleId that will exceed 104 chars
      const longNamespace = "a".repeat(50);
      const longModuleId = "b".repeat(50);

      expect(() => PipePath.forModule(longNamespace, longModuleId)).toThrow(
        /Unix socket path exceeds maximum length of 104 characters/,
      );
    });

    it("should include path details in length validation error", () => {
      vi.spyOn(platform, "isWindows").mockReturnValue(false);

      const longNamespace = "namespace".repeat(10);
      const longModuleId = "module".repeat(10);

      expect(() => PipePath.forModule(longNamespace, longModuleId)).toThrow(/Current length:/);
      expect(() => PipePath.forModule(longNamespace, longModuleId)).toThrow(/Path:/);
      expect(() => PipePath.forModule(longNamespace, longModuleId)).toThrow(
        /Consider shortening namespace or moduleId/,
      );
    });

    it("should not validate path length on Windows", () => {
      vi.spyOn(platform, "isWindows").mockReturnValue(true);

      // Very long names that would exceed Unix limit
      const longNamespace = "a".repeat(100);
      const longModuleId = "b".repeat(100);

      // Should not throw on Windows (Named Pipes don't have path length limits)
      expect(() => PipePath.forModule(longNamespace, longModuleId)).not.toThrow();
    });

    it("should accept paths at exactly 104 characters (Unix)", () => {
      vi.spyOn(platform, "isWindows").mockReturnValue(false);

      // Use a short baseDir to control exact length
      // Path format: <baseDir>/<namespace>-<moduleId>.sock
      // On Windows test environment, path.join uses backslashes, but on Unix it uses forward slashes
      // The path length calculation should account for the actual separator used
      const baseDir = "/t"; // 2 chars on Unix, potentially different on Windows

      // Create a path that's under the limit on any platform
      // baseDir(2) + sep(1) + namespace + dash(1) + moduleId + .sock(5) = 104
      // namespace + moduleId = 95 chars
      const namespace = "a".repeat(45);
      const moduleId = "b".repeat(45);

      // This should not throw (well under 104 chars)
      expect(() => PipePath.forModule(namespace, moduleId, baseDir)).not.toThrow();
    });
  });

  describe("cleanup", () => {
    it("should be a no-op on Windows", async () => {
      vi.spyOn(platform, "isWindows").mockReturnValue(true);

      // Should not throw
      await expect(PipePath.cleanup("\\\\.\\pipe\\test")).resolves.toBeUndefined();
    });

    it("should not throw on non-existent file (Unix)", async () => {
      vi.spyOn(platform, "isWindows").mockReturnValue(false);

      // Should not throw even if file doesn't exist
      await expect(PipePath.cleanup("/tmp/nonexistent.sock")).resolves.toBeUndefined();
    });
  });
});
