import { describe, it, expect } from "vitest";
import {
  ReservedMethods,
  RESERVED_PREFIX,
  RESERVED_SUFFIX,
  isReservedMethod,
  validateUserMethod,
} from "../src/protocol/reserved-methods.js";

describe("ReservedMethods", () => {
  describe("constants", () => {
    it("should have correct prefix and suffix", () => {
      expect(RESERVED_PREFIX).toBe("__");
      expect(RESERVED_SUFFIX).toBe("__");
    });

    it("should have all reserved method names following the pattern", () => {
      const methodNames = Object.values(ReservedMethods);

      for (const method of methodNames) {
        expect(method).toMatch(/^__.*__$/);
        expect(method.startsWith(RESERVED_PREFIX)).toBe(true);
        expect(method.endsWith(RESERVED_SUFFIX)).toBe(true);
      }
    });

    it("should have expected reserved methods", () => {
      expect(ReservedMethods.HANDSHAKE).toBe("__handshake__");
      expect(ReservedMethods.HEARTBEAT_PING).toBe("__heartbeat_ping__");
      expect(ReservedMethods.HEARTBEAT_PONG).toBe("__heartbeat_pong__");
      expect(ReservedMethods.DATA_CHANNEL_READY).toBe("__data_channel_ready__");
      expect(ReservedMethods.DATA_CHANNEL_ERROR).toBe("__data_channel_error__");
      expect(ReservedMethods.SHUTDOWN).toBe("__shutdown__");
      expect(ReservedMethods.SHUTDOWN_COMPLETE).toBe("__shutdown_complete__");
      expect(ReservedMethods.STREAM_OPEN).toBe("__stream_open__");
      expect(ReservedMethods.STREAM_DATA).toBe("__stream_data__");
      expect(ReservedMethods.STREAM_END).toBe("__stream_end__");
      expect(ReservedMethods.STREAM_CLOSE).toBe("__stream_close__");
      expect(ReservedMethods.STREAM_ABORT).toBe("__stream_abort__");
      expect(ReservedMethods.CREDIT_GRANT).toBe("__credit_grant__");
      expect(ReservedMethods.CREDIT_EXHAUSTED).toBe("__credit_exhausted__");
    });
  });

  describe("isReservedMethod", () => {
    it("should return true for reserved methods", () => {
      expect(isReservedMethod("__handshake__")).toBe(true);
      expect(isReservedMethod("__heartbeat_ping__")).toBe(true);
      expect(isReservedMethod("__heartbeat_pong__")).toBe(true);
      expect(isReservedMethod("__shutdown__")).toBe(true);
      expect(isReservedMethod("__custom_reserved__")).toBe(true);
    });

    it("should return false for user methods", () => {
      expect(isReservedMethod("myMethod")).toBe(false);
      expect(isReservedMethod("similarity_search")).toBe(false);
      expect(isReservedMethod("process_image")).toBe(false);
      expect(isReservedMethod("doWork")).toBe(false);
    });

    it("should return false for partial reserved patterns", () => {
      // Only prefix
      expect(isReservedMethod("__partial")).toBe(false);
      expect(isReservedMethod("__handshake")).toBe(false);

      // Only suffix
      expect(isReservedMethod("partial__")).toBe(false);
      expect(isReservedMethod("handshake__")).toBe(false);

      // Double underscore but not at both ends
      expect(isReservedMethod("my__method")).toBe(false);
      expect(isReservedMethod("_single_underscore_")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isReservedMethod("")).toBe(false);
    });

    it("should handle edge cases", () => {
      // Just the prefix and suffix (empty method name)
      expect(isReservedMethod("____")).toBe(true);

      // Single character method name
      expect(isReservedMethod("__x__")).toBe(true);

      // Method with underscores inside
      expect(isReservedMethod("__my_long_method__")).toBe(true);
    });
  });

  describe("validateUserMethod", () => {
    it("should not throw for valid user methods", () => {
      expect(() => validateUserMethod("myMethod")).not.toThrow();
      expect(() => validateUserMethod("similarity_search")).not.toThrow();
      expect(() => validateUserMethod("process_image")).not.toThrow();
      expect(() => validateUserMethod("doWork")).not.toThrow();
    });

    it("should throw for reserved methods", () => {
      expect(() => validateUserMethod("__handshake__")).toThrow(
        "Method '__handshake__' is reserved for protocol use",
      );
      expect(() => validateUserMethod("__heartbeat_ping__")).toThrow(
        "Method '__heartbeat_ping__' is reserved for protocol use",
      );
      expect(() => validateUserMethod("__custom_reserved__")).toThrow(
        "Method '__custom_reserved__' is reserved for protocol use",
      );
    });

    it("should include helpful error message", () => {
      expect(() => validateUserMethod("__test__")).toThrow(
        "User methods cannot start and end with '__'",
      );
    });

    it("should not throw for partial reserved patterns", () => {
      expect(() => validateUserMethod("__partial")).not.toThrow();
      expect(() => validateUserMethod("partial__")).not.toThrow();
      expect(() => validateUserMethod("my__method")).not.toThrow();
    });

    it("should validate all ReservedMethods entries throw", () => {
      for (const method of Object.values(ReservedMethods)) {
        expect(() => validateUserMethod(method)).toThrow();
      }
    });
  });
});
