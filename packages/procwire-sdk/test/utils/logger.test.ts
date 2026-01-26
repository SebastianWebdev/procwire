import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger } from "../../src/utils/logger.js";

describe("Logger", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe("createLogger with enabled=false", () => {
    it("should create no-op logger", () => {
      const logger = createLogger("test", false);

      logger.debug("debug message");
      logger.info("info message");
      logger.warn("warn message");
      logger.error("error message");

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("should have all methods defined", () => {
      const logger = createLogger("test", false);

      expect(typeof logger.debug).toBe("function");
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.error).toBe("function");
    });
  });

  describe("createLogger with enabled=true", () => {
    it("should log debug messages with prefix", () => {
      const logger = createLogger("my-worker", true);

      logger.debug("test message");

      expect(consoleErrorSpy).toHaveBeenCalledWith("[my-worker]", "[DEBUG]", "test message");
    });

    it("should log info messages with prefix", () => {
      const logger = createLogger("my-worker", true);

      logger.info("info message");

      expect(consoleErrorSpy).toHaveBeenCalledWith("[my-worker]", "[INFO]", "info message");
    });

    it("should log warn messages with prefix", () => {
      const logger = createLogger("my-worker", true);

      logger.warn("warn message");

      expect(consoleErrorSpy).toHaveBeenCalledWith("[my-worker]", "[WARN]", "warn message");
    });

    it("should log error messages with prefix", () => {
      const logger = createLogger("my-worker", true);

      logger.error("error message");

      expect(consoleErrorSpy).toHaveBeenCalledWith("[my-worker]", "[ERROR]", "error message");
    });

    it("should handle multiple arguments", () => {
      const logger = createLogger("test", true);

      logger.info("message", { key: "value" }, 123);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[test]",
        "[INFO]",
        "message",
        { key: "value" },
        123,
      );
    });

    it("should handle error objects", () => {
      const logger = createLogger("test", true);
      const error = new Error("test error");

      logger.error("Something failed:", error);

      expect(consoleErrorSpy).toHaveBeenCalledWith("[test]", "[ERROR]", "Something failed:", error);
    });
  });

  describe("prefix formatting", () => {
    it("should include worker name in brackets", () => {
      const logger = createLogger("special-worker-123", true);

      logger.info("test");

      expect(consoleErrorSpy).toHaveBeenCalledWith("[special-worker-123]", "[INFO]", "test");
    });

    it("should handle empty worker name", () => {
      const logger = createLogger("", true);

      logger.info("test");

      expect(consoleErrorSpy).toHaveBeenCalledWith("[]", "[INFO]", "test");
    });
  });
});
