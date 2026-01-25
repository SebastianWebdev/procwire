import { describe, it, expect } from "vitest";
import {
  createShutdownResponse,
  createShutdownCompleteParams,
  validateShutdownParams,
} from "../../src/protocol/shutdown.js";

describe("shutdown", () => {
  describe("createShutdownResponse", () => {
    it("should create response with shutting_down status", () => {
      const response = createShutdownResponse(0);

      expect(response.status).toBe("shutting_down");
    });

    it("should include pending requests count", () => {
      const response = createShutdownResponse(5);

      expect(response.pending_requests).toBe(5);
    });

    it("should work with zero pending requests", () => {
      const response = createShutdownResponse(0);

      expect(response.pending_requests).toBe(0);
    });

    it("should work with many pending requests", () => {
      const response = createShutdownResponse(100);

      expect(response.pending_requests).toBe(100);
    });
  });

  describe("createShutdownCompleteParams", () => {
    it("should create params with exit code 0", () => {
      const params = createShutdownCompleteParams(0);

      expect(params.exit_code).toBe(0);
    });

    it("should create params with non-zero exit code", () => {
      const params = createShutdownCompleteParams(1);

      expect(params.exit_code).toBe(1);
    });

    it("should preserve negative exit codes", () => {
      const params = createShutdownCompleteParams(-1);

      expect(params.exit_code).toBe(-1);
    });
  });

  describe("validateShutdownParams", () => {
    it("should pass for valid params with user_requested reason", () => {
      const params = {
        timeout_ms: 5000,
        reason: "user_requested",
      };

      expect(() => validateShutdownParams(params)).not.toThrow();
    });

    it("should pass for valid params with manager_shutdown reason", () => {
      const params = {
        timeout_ms: 10000,
        reason: "manager_shutdown",
      };

      expect(() => validateShutdownParams(params)).not.toThrow();
    });

    it("should pass for all valid reasons", () => {
      const reasons = [
        "user_requested",
        "manager_shutdown",
        "idle_timeout",
        "error_threshold",
        "restart",
        "heartbeat_dead",
      ];

      for (const reason of reasons) {
        const params = {
          timeout_ms: 5000,
          reason,
        };
        expect(() => validateShutdownParams(params)).not.toThrow();
      }
    });

    it("should pass with zero timeout", () => {
      const params = {
        timeout_ms: 0,
        reason: "user_requested",
      };

      expect(() => validateShutdownParams(params)).not.toThrow();
    });

    it("should throw for null params", () => {
      expect(() => validateShutdownParams(null)).toThrow(/expected object/);
    });

    it("should throw for undefined params", () => {
      expect(() => validateShutdownParams(undefined)).toThrow(/expected object/);
    });

    it("should throw for missing timeout_ms", () => {
      const params = {
        reason: "user_requested",
      };

      expect(() => validateShutdownParams(params)).toThrow(/timeout_ms must be a number/);
    });

    it("should throw for non-number timeout_ms", () => {
      const params = {
        timeout_ms: "5000",
        reason: "user_requested",
      };

      expect(() => validateShutdownParams(params)).toThrow(/timeout_ms must be a number/);
    });

    it("should throw for missing reason", () => {
      const params = {
        timeout_ms: 5000,
      };

      expect(() => validateShutdownParams(params)).toThrow(/reason must be a string/);
    });

    it("should throw for non-string reason", () => {
      const params = {
        timeout_ms: 5000,
        reason: 123,
      };

      expect(() => validateShutdownParams(params)).toThrow(/reason must be a string/);
    });
  });
});
