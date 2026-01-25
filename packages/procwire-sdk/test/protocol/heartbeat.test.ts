import { describe, it, expect } from "vitest";
import {
  createHeartbeatPong,
  collectLoadMetrics,
  validateHeartbeatPingParams,
  type HeartbeatPingParams,
} from "../../src/protocol/heartbeat.js";

describe("heartbeat", () => {
  describe("collectLoadMetrics", () => {
    it("should collect memory usage", () => {
      const metrics = collectLoadMetrics(0);

      expect(metrics.memory_mb).toBeTypeOf("number");
      expect(metrics.memory_mb).toBeGreaterThanOrEqual(0);
    });

    it("should include pending requests count", () => {
      const metrics = collectLoadMetrics(5);

      expect(metrics.pending_requests).toBe(5);
    });

    it("should return memory in whole megabytes", () => {
      const metrics = collectLoadMetrics(0);

      // Memory should be rounded to whole MB
      expect(Number.isInteger(metrics.memory_mb)).toBe(true);
    });
  });

  describe("createHeartbeatPong", () => {
    it("should echo timestamp and seq from ping", () => {
      const ping: HeartbeatPingParams = {
        timestamp: 1234567890,
        seq: 42,
      };

      const pong = createHeartbeatPong(ping, 0);

      expect(pong.timestamp).toBe(1234567890);
      expect(pong.seq).toBe(42);
    });

    it("should include load metrics", () => {
      const ping: HeartbeatPingParams = {
        timestamp: Date.now(),
        seq: 1,
      };

      const pong = createHeartbeatPong(ping, 3);

      expect(pong.load).toBeDefined();
      expect(pong.load?.pending_requests).toBe(3);
      expect(pong.load?.memory_mb).toBeTypeOf("number");
    });

    it("should work with zero pending requests", () => {
      const ping: HeartbeatPingParams = {
        timestamp: Date.now(),
        seq: 100,
      };

      const pong = createHeartbeatPong(ping, 0);

      expect(pong.load?.pending_requests).toBe(0);
    });
  });

  describe("validateHeartbeatPingParams", () => {
    it("should pass for valid params", () => {
      const params = {
        timestamp: Date.now(),
        seq: 1,
      };

      expect(() => validateHeartbeatPingParams(params)).not.toThrow();
    });

    it("should pass for zero values", () => {
      const params = {
        timestamp: 0,
        seq: 0,
      };

      expect(() => validateHeartbeatPingParams(params)).not.toThrow();
    });

    it("should throw for null params", () => {
      expect(() => validateHeartbeatPingParams(null)).toThrow(/expected object/);
    });

    it("should throw for undefined params", () => {
      expect(() => validateHeartbeatPingParams(undefined)).toThrow(/expected object/);
    });

    it("should throw for missing timestamp", () => {
      const params = {
        seq: 1,
      };

      expect(() => validateHeartbeatPingParams(params)).toThrow(
        /timestamp and seq must be numbers/,
      );
    });

    it("should throw for missing seq", () => {
      const params = {
        timestamp: Date.now(),
      };

      expect(() => validateHeartbeatPingParams(params)).toThrow(
        /timestamp and seq must be numbers/,
      );
    });

    it("should throw for non-number timestamp", () => {
      const params = {
        timestamp: "1234567890",
        seq: 1,
      };

      expect(() => validateHeartbeatPingParams(params)).toThrow(
        /timestamp and seq must be numbers/,
      );
    });

    it("should throw for non-number seq", () => {
      const params = {
        timestamp: Date.now(),
        seq: "1",
      };

      expect(() => validateHeartbeatPingParams(params)).toThrow(
        /timestamp and seq must be numbers/,
      );
    });
  });
});
