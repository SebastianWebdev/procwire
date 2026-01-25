import { describe, it, expect } from "vitest";
import {
  createHandshakeResponse,
  validateHandshakeParams,
  type HandshakeParams,
} from "../../src/protocol/handshake.js";
import type { ResolvedWorkerOptions } from "../../src/types.js";

describe("handshake", () => {
  const defaultOptions: ResolvedWorkerOptions = {
    name: "test-worker",
    dataChannel: undefined,
    debug: false,
    capabilities: [],
    drainTimeout: 5000,
  };

  describe("createHandshakeResponse", () => {
    it("should create basic response with heartbeat capability", () => {
      const params: HandshakeParams = {
        version: "1.0",
        capabilities: ["heartbeat"],
      };

      const result = createHandshakeResponse(params, defaultOptions);

      expect(result.version).toBe("1.0");
      expect(result.capabilities).toContain("heartbeat");
      expect(result.worker_info.name).toBe("test-worker");
      expect(result.worker_info.language).toBe("nodejs");
      expect(typeof result.worker_info.pid).toBe("number");
    });

    it("should echo the version from params", () => {
      const params: HandshakeParams = {
        version: "2.0-beta",
        capabilities: [],
      };

      const result = createHandshakeResponse(params, defaultOptions);

      expect(result.version).toBe("2.0-beta");
    });

    it("should include custom capabilities from options", () => {
      const options: ResolvedWorkerOptions = {
        ...defaultOptions,
        capabilities: ["custom1", "custom2"],
      };
      const params: HandshakeParams = {
        version: "1.0",
        capabilities: [],
      };

      const result = createHandshakeResponse(params, options);

      expect(result.capabilities).toContain("heartbeat");
      expect(result.capabilities).toContain("custom1");
      expect(result.capabilities).toContain("custom2");
    });

    it("should add data_channel capability when dataChannel is configured", () => {
      const options: ResolvedWorkerOptions = {
        ...defaultOptions,
        dataChannel: {},
      };
      const params: HandshakeParams = {
        version: "1.0",
        capabilities: [],
      };

      const result = createHandshakeResponse(params, options);

      expect(result.capabilities).toContain("data_channel");
    });

    it("should not duplicate heartbeat capability", () => {
      const options: ResolvedWorkerOptions = {
        ...defaultOptions,
        capabilities: ["heartbeat"],
      };
      const params: HandshakeParams = {
        version: "1.0",
        capabilities: [],
      };

      const result = createHandshakeResponse(params, options);

      const heartbeatCount = result.capabilities.filter((c) => c === "heartbeat").length;
      expect(heartbeatCount).toBe(1);
    });

    it("should use correct worker info from options", () => {
      const options: ResolvedWorkerOptions = {
        ...defaultOptions,
        name: "my-custom-worker",
      };
      const params: HandshakeParams = {
        version: "1.0",
        capabilities: [],
      };

      const result = createHandshakeResponse(params, options);

      expect(result.worker_info.name).toBe("my-custom-worker");
      expect(result.worker_info.pid).toBe(process.pid);
    });
  });

  describe("validateHandshakeParams", () => {
    it("should pass for valid params", () => {
      const params = {
        version: "1.0",
        capabilities: ["heartbeat"],
      };

      expect(() => validateHandshakeParams(params)).not.toThrow();
    });

    it("should pass with data_channel", () => {
      const params = {
        version: "1.0",
        capabilities: ["heartbeat", "data_channel"],
        data_channel: {
          path: "/tmp/socket",
          serialization: "json",
        },
      };

      expect(() => validateHandshakeParams(params)).not.toThrow();
    });

    it("should throw for null params", () => {
      expect(() => validateHandshakeParams(null)).toThrow(/expected object/);
    });

    it("should throw for undefined params", () => {
      expect(() => validateHandshakeParams(undefined)).toThrow(/expected object/);
    });

    it("should throw for missing version", () => {
      const params = {
        capabilities: [],
      };

      expect(() => validateHandshakeParams(params)).toThrow(/version must be a string/);
    });

    it("should throw for non-string version", () => {
      const params = {
        version: 123,
        capabilities: [],
      };

      expect(() => validateHandshakeParams(params)).toThrow(/version must be a string/);
    });

    it("should throw for missing capabilities", () => {
      const params = {
        version: "1.0",
      };

      expect(() => validateHandshakeParams(params)).toThrow(/capabilities must be an array/);
    });

    it("should throw for non-array capabilities", () => {
      const params = {
        version: "1.0",
        capabilities: "heartbeat",
      };

      expect(() => validateHandshakeParams(params)).toThrow(/capabilities must be an array/);
    });
  });
});
