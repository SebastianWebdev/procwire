import { describe, it, expect, vi } from "vitest";
import { PipePath } from "../src/utils/pipe-path.js";
import * as platform from "../src/utils/platform.js";

describe("PipePath", () => {
  describe("forModule", () => {
    it("should generate Windows pipe path on Windows", () => {
      vi.spyOn(platform, "isWindows").mockReturnValue(true);

      const path = PipePath.forModule("aspect-ipc", "worker-1");

      expect(path).toBe("\\\\.\\pipe\\aspect-ipc-worker-1");
    });

    it("should generate Unix socket path on Unix", () => {
      vi.spyOn(platform, "isWindows").mockReturnValue(false);

      const path = PipePath.forModule("aspect-ipc", "worker-1");

      expect(path).toContain("tmp");
      expect(path).toContain("aspect-ipc-worker-1.sock");
      expect(path).toMatch(/tmp.*aspect-ipc-worker-1\.sock$/);
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

      const path = PipePath.forModule("aspect-ipc-v2", "worker-123");

      expect(path).toContain("aspect-ipc-v2-worker-123.sock");
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
