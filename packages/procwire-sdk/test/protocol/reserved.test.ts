import { describe, it, expect } from "vitest";
import {
  isReservedMethod,
  validateUserMethod,
  ReservedMethods,
  RESERVED_PREFIX,
  RESERVED_SUFFIX,
  WORKER_AUTO_HANDLED_METHODS,
} from "../../src/protocol/reserved.js";

describe("reserved methods", () => {
  describe("constants", () => {
    it("should have correct prefix and suffix", () => {
      expect(RESERVED_PREFIX).toBe("__");
      expect(RESERVED_SUFFIX).toBe("__");
    });

    it("should have all required reserved methods", () => {
      expect(ReservedMethods.HANDSHAKE).toBe("__handshake__");
      expect(ReservedMethods.HEARTBEAT_PING).toBe("__heartbeat_ping__");
      expect(ReservedMethods.HEARTBEAT_PONG).toBe("__heartbeat_pong__");
      expect(ReservedMethods.DATA_CHANNEL_READY).toBe("__data_channel_ready__");
      expect(ReservedMethods.DATA_CHANNEL_ERROR).toBe("__data_channel_error__");
      expect(ReservedMethods.SHUTDOWN).toBe("__shutdown__");
      expect(ReservedMethods.SHUTDOWN_COMPLETE).toBe("__shutdown_complete__");
    });

    it("should have streaming methods for v0.5.0", () => {
      expect(ReservedMethods.STREAM_OPEN).toBe("__stream_open__");
      expect(ReservedMethods.STREAM_DATA).toBe("__stream_data__");
      expect(ReservedMethods.STREAM_END).toBe("__stream_end__");
      expect(ReservedMethods.STREAM_CLOSE).toBe("__stream_close__");
      expect(ReservedMethods.STREAM_ABORT).toBe("__stream_abort__");
    });

    it("should have flow control methods for v0.5.0", () => {
      expect(ReservedMethods.CREDIT_GRANT).toBe("__credit_grant__");
      expect(ReservedMethods.CREDIT_EXHAUSTED).toBe("__credit_exhausted__");
    });

    it("should have correct auto-handled methods", () => {
      expect(WORKER_AUTO_HANDLED_METHODS).toContain(ReservedMethods.HANDSHAKE);
      expect(WORKER_AUTO_HANDLED_METHODS).toContain(ReservedMethods.HEARTBEAT_PING);
      expect(WORKER_AUTO_HANDLED_METHODS).toContain(ReservedMethods.SHUTDOWN);
      expect(WORKER_AUTO_HANDLED_METHODS).toHaveLength(3);
    });
  });

  describe("isReservedMethod", () => {
    it("should return true for reserved methods", () => {
      expect(isReservedMethod("__handshake__")).toBe(true);
      expect(isReservedMethod("__heartbeat_ping__")).toBe(true);
      expect(isReservedMethod("__shutdown__")).toBe(true);
      expect(isReservedMethod("__custom__")).toBe(true);
      expect(isReservedMethod("__a__")).toBe(true);
    });

    it("should return false for user methods", () => {
      expect(isReservedMethod("echo")).toBe(false);
      expect(isReservedMethod("myMethod")).toBe(false);
      expect(isReservedMethod("some_method")).toBe(false);
    });

    it("should return false for partial matches", () => {
      expect(isReservedMethod("__partial")).toBe(false);
      expect(isReservedMethod("partial__")).toBe(false);
      expect(isReservedMethod("_single_")).toBe(false);
    });

    it("should return true for double underscore patterns", () => {
      // "__" starts with __ and ends with __ (they overlap)
      expect(isReservedMethod("__")).toBe(true);
      expect(isReservedMethod("____")).toBe(true);
    });
  });

  describe("validateUserMethod", () => {
    it("should pass for valid user methods", () => {
      expect(() => validateUserMethod("echo")).not.toThrow();
      expect(() => validateUserMethod("my_method")).not.toThrow();
      expect(() => validateUserMethod("myMethod")).not.toThrow();
      expect(() => validateUserMethod("a")).not.toThrow();
      expect(() => validateUserMethod("method123")).not.toThrow();
    });

    it("should pass for partial underscore methods", () => {
      expect(() => validateUserMethod("__partial")).not.toThrow();
      expect(() => validateUserMethod("partial__")).not.toThrow();
      expect(() => validateUserMethod("_single_")).not.toThrow();
    });

    it("should throw for reserved methods", () => {
      expect(() => validateUserMethod("__handshake__")).toThrow(/reserved/);
      expect(() => validateUserMethod("__heartbeat_ping__")).toThrow(/reserved/);
      expect(() => validateUserMethod("__custom__")).toThrow(/reserved/);
    });

    it("should include method name in error message", () => {
      try {
        validateUserMethod("__test__");
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as Error).message).toContain("__test__");
      }
    });
  });
});
