import { describe, it, expect, beforeEach } from "vitest";
import {
  SimpleProtocol,
  type SimpleRequest,
  type SimpleResponse,
  type SimpleErrorResponse,
  type SimpleNotification,
} from "../src/protocol/simple.js";
import { ProtocolError } from "../src/utils/errors.js";

describe("SimpleProtocol", () => {
  let protocol: SimpleProtocol;

  beforeEach(() => {
    protocol = new SimpleProtocol();
  });

  describe("metadata", () => {
    it("should have correct name and version", () => {
      expect(protocol.name).toBe("simple");
      expect(protocol.version).toBe("1.0");
    });
  });

  describe("createRequest", () => {
    it("should create a valid request with auto-generated id", () => {
      const req = protocol.createRequest("getUser", { id: 42 });

      expect(req).toMatchObject({
        type: "request",
        method: "getUser",
        params: { id: 42 },
      });
      expect(req.id).toBeDefined();
      expect(typeof req.id === "number" || typeof req.id === "string").toBe(true);
    });

    it("should create a request with custom id", () => {
      const req = protocol.createRequest("getUser", { id: 42 }, "custom-123");

      expect(req).toEqual({
        type: "request",
        id: "custom-123",
        method: "getUser",
        params: { id: 42 },
      });
    });

    it("should create a request without params", () => {
      const req = protocol.createRequest("ping");

      expect(req).toMatchObject({
        type: "request",
        method: "ping",
      });
      expect(req).not.toHaveProperty("params");
    });

    it("should generate unique sequential ids", () => {
      const req1 = protocol.createRequest("method1");
      const req2 = protocol.createRequest("method2");
      const req3 = protocol.createRequest("method3");

      expect(req1.id).not.toEqual(req2.id);
      expect(req2.id).not.toEqual(req3.id);
      expect(req1.id).not.toEqual(req3.id);
    });

    it("should throw ProtocolError for empty method", () => {
      expect(() => protocol.createRequest("")).toThrow(ProtocolError);
      expect(() => protocol.createRequest("")).toThrow(/non-empty string/);
    });

    it("should throw ProtocolError for non-string method", () => {
      expect(() => protocol.createRequest(123 as unknown as string)).toThrow(ProtocolError);
    });
  });

  describe("createResponse", () => {
    it("should create a valid success response", () => {
      const res = protocol.createResponse(1, { name: "Alice" });

      expect(res).toEqual({
        type: "response",
        id: 1,
        result: { name: "Alice" },
      });
    });

    it("should create a response with null result", () => {
      const res = protocol.createResponse("req-1", null);

      expect(res).toEqual({
        type: "response",
        id: "req-1",
        result: null,
      });
    });

    it("should create a response with undefined result", () => {
      const res = protocol.createResponse(42, undefined);

      expect(res).toEqual({
        type: "response",
        id: 42,
        result: undefined,
      });
    });
  });

  describe("createErrorResponse", () => {
    it("should create a valid error response", () => {
      const error = {
        code: -1,
        message: "Method not found",
      };
      const res = protocol.createErrorResponse(1, error);

      expect(res).toEqual({
        type: "response",
        id: 1,
        error,
      });
    });

    it("should create an error response with data field", () => {
      const error = {
        code: -2,
        message: "Invalid parameters",
        data: { expected: "number", got: "string" },
      };
      const res = protocol.createErrorResponse("req-1", error);

      expect(res).toEqual({
        type: "response",
        id: "req-1",
        error,
      });
    });
  });

  describe("createNotification", () => {
    it("should create a valid notification", () => {
      const notif = protocol.createNotification("userLoggedIn", { userId: 123 });

      expect(notif).toEqual({
        type: "notification",
        method: "userLoggedIn",
        params: { userId: 123 },
      });
      expect(notif).not.toHaveProperty("id");
    });

    it("should create a notification without params", () => {
      const notif = protocol.createNotification("ping");

      expect(notif).toEqual({
        type: "notification",
        method: "ping",
      });
      expect(notif).not.toHaveProperty("params");
    });

    it("should throw ProtocolError for empty method", () => {
      expect(() => protocol.createNotification("")).toThrow(ProtocolError);
      expect(() => protocol.createNotification("")).toThrow(/non-empty string/);
    });
  });

  describe("parseMessage - requests", () => {
    it("should parse a valid request", () => {
      const data: SimpleRequest = {
        type: "request",
        id: 1,
        method: "getUser",
        params: { id: 42 },
      };

      const parsed = protocol.parseMessage(data);

      expect(parsed.kind).toBe("request");
      if (parsed.kind === "request") {
        expect(parsed.message).toEqual(data);
      }
    });

    it("should parse a request without params", () => {
      const data: SimpleRequest = {
        type: "request",
        id: "req-1",
        method: "ping",
      };

      const parsed = protocol.parseMessage(data);

      expect(parsed.kind).toBe("request");
      if (parsed.kind === "request") {
        expect(parsed.message).toEqual(data);
      }
    });

    it("should reject request without id", () => {
      const data = {
        type: "request",
        method: "getUser",
      };

      const parsed = protocol.parseMessage(data);

      expect(parsed.kind).toBe("invalid");
      if (parsed.kind === "invalid") {
        expect(parsed.error.message).toContain("id");
      }
    });

    it("should reject request with invalid id type", () => {
      const data = {
        type: "request",
        id: { nested: "object" },
        method: "getUser",
      };

      const parsed = protocol.parseMessage(data);

      expect(parsed.kind).toBe("invalid");
      if (parsed.kind === "invalid") {
        expect(parsed.error.message).toContain("id");
      }
    });

    it("should reject request without method", () => {
      const data = {
        type: "request",
        id: 1,
      };

      const parsed = protocol.parseMessage(data);

      expect(parsed.kind).toBe("invalid");
      if (parsed.kind === "invalid") {
        expect(parsed.error.message).toContain("method");
      }
    });

    it("should reject request with empty method", () => {
      const data = {
        type: "request",
        id: 1,
        method: "",
      };

      const parsed = protocol.parseMessage(data);

      expect(parsed.kind).toBe("invalid");
      if (parsed.kind === "invalid") {
        expect(parsed.error.message).toContain("method");
      }
    });

    it("should reject request with non-string method", () => {
      const data = {
        type: "request",
        id: 1,
        method: 123,
      };

      const parsed = protocol.parseMessage(data);

      expect(parsed.kind).toBe("invalid");
      if (parsed.kind === "invalid") {
        expect(parsed.error.message).toContain("method");
      }
    });
  });

  describe("parseMessage - responses", () => {
    it("should parse a valid success response", () => {
      const data: SimpleResponse = {
        type: "response",
        id: 1,
        result: { name: "Alice" },
      };

      const parsed = protocol.parseMessage(data);

      expect(parsed.kind).toBe("response");
      if (parsed.kind === "response") {
        expect(parsed.message).toEqual(data);
      }
    });

    it("should parse a valid error response", () => {
      const data: SimpleErrorResponse = {
        type: "response",
        id: 1,
        error: {
          code: -1,
          message: "Method not found",
        },
      };

      const parsed = protocol.parseMessage(data);

      expect(parsed.kind).toBe("response");
      if (parsed.kind === "response") {
        expect(parsed.message).toEqual(data);
      }
    });

    it("should parse response with both result and error (simple protocol allows this)", () => {
      const data = {
        type: "response",
        id: 1,
        result: "success",
        error: { code: -1, message: "also error" },
      };

      const parsed = protocol.parseMessage(data);

      // Simple protocol is more lenient - allows both
      expect(parsed.kind).toBe("response");
    });

    it("should reject response without id", () => {
      const data = {
        type: "response",
        result: "success",
      };

      const parsed = protocol.parseMessage(data);

      expect(parsed.kind).toBe("invalid");
      if (parsed.kind === "invalid") {
        expect(parsed.error.message).toContain("id");
      }
    });

    it("should reject response without result or error", () => {
      const data = {
        type: "response",
        id: 1,
      };

      const parsed = protocol.parseMessage(data);

      expect(parsed.kind).toBe("invalid");
      if (parsed.kind === "invalid") {
        expect(parsed.error.message).toContain("result or error");
      }
    });

    it("should reject response with invalid id type", () => {
      const data = {
        type: "response",
        id: [],
        result: "success",
      };

      const parsed = protocol.parseMessage(data);

      expect(parsed.kind).toBe("invalid");
      if (parsed.kind === "invalid") {
        expect(parsed.error.message).toContain("id");
      }
    });
  });

  describe("parseMessage - notifications", () => {
    it("should parse a valid notification", () => {
      const data: SimpleNotification = {
        type: "notification",
        method: "userLoggedIn",
        params: { userId: 123 },
      };

      const parsed = protocol.parseMessage(data);

      expect(parsed.kind).toBe("notification");
      if (parsed.kind === "notification") {
        expect(parsed.message).toEqual(data);
      }
    });

    it("should parse a notification without params", () => {
      const data: SimpleNotification = {
        type: "notification",
        method: "ping",
      };

      const parsed = protocol.parseMessage(data);

      expect(parsed.kind).toBe("notification");
      if (parsed.kind === "notification") {
        expect(parsed.message).toEqual(data);
      }
    });

    it("should reject notification with id", () => {
      const data = {
        type: "notification",
        id: 1,
        method: "event",
      };

      const parsed = protocol.parseMessage(data);

      expect(parsed.kind).toBe("invalid");
      if (parsed.kind === "invalid") {
        expect(parsed.error.message).toContain("must not have id");
      }
    });

    it("should reject notification without method", () => {
      const data = {
        type: "notification",
      };

      const parsed = protocol.parseMessage(data);

      expect(parsed.kind).toBe("invalid");
      if (parsed.kind === "invalid") {
        expect(parsed.error.message).toContain("method");
      }
    });
  });

  describe("parseMessage - invalid cases", () => {
    it("should reject non-object data", () => {
      const parsed1 = protocol.parseMessage(null);
      const parsed2 = protocol.parseMessage("string");
      const parsed3 = protocol.parseMessage(123);
      const parsed4 = protocol.parseMessage(true);
      const parsed5 = protocol.parseMessage([]);

      expect(parsed1.kind).toBe("invalid");
      expect(parsed2.kind).toBe("invalid");
      expect(parsed3.kind).toBe("invalid");
      expect(parsed4.kind).toBe("invalid");
      expect(parsed5.kind).toBe("invalid");
    });

    it("should reject message without type field", () => {
      const data = { id: 1, method: "test" };

      const parsed = protocol.parseMessage(data);

      expect(parsed.kind).toBe("invalid");
      if (parsed.kind === "invalid") {
        expect(parsed.error.message).toContain("type");
      }
    });

    it("should reject message with unknown type", () => {
      const data = { type: "unknown", id: 1 };

      const parsed = protocol.parseMessage(data);

      expect(parsed.kind).toBe("invalid");
      if (parsed.kind === "invalid") {
        expect(parsed.error.message).toContain("Unknown message type");
      }
    });

    it("should reject message with non-string type", () => {
      const data = { type: 123, id: 1 };

      const parsed = protocol.parseMessage(data);

      expect(parsed.kind).toBe("invalid");
      if (parsed.kind === "invalid") {
        expect(parsed.error.message).toContain("type");
      }
    });

    it("should include raw data in invalid message", () => {
      const data = { invalid: "data" };

      const parsed = protocol.parseMessage(data);

      expect(parsed.kind).toBe("invalid");
      if (parsed.kind === "invalid") {
        expect(parsed.raw).toEqual(data);
      }
    });
  });

  describe("type guards", () => {
    it("isRequest should identify request messages", () => {
      const req = protocol.parseMessage({
        type: "request",
        id: 1,
        method: "test",
      });

      expect(protocol.isRequest(req)).toBe(true);
      expect(protocol.isResponse(req)).toBe(false);
      expect(protocol.isNotification(req)).toBe(false);
    });

    it("isResponse should identify response messages", () => {
      const res = protocol.parseMessage({
        type: "response",
        id: 1,
        result: "success",
      });

      expect(protocol.isRequest(res)).toBe(false);
      expect(protocol.isResponse(res)).toBe(true);
      expect(protocol.isNotification(res)).toBe(false);
    });

    it("isNotification should identify notification messages", () => {
      const notif = protocol.parseMessage({
        type: "notification",
        method: "event",
      });

      expect(protocol.isRequest(notif)).toBe(false);
      expect(protocol.isResponse(notif)).toBe(false);
      expect(protocol.isNotification(notif)).toBe(true);
    });

    it("should handle invalid messages", () => {
      const invalid = protocol.parseMessage({ invalid: "data" });

      expect(protocol.isRequest(invalid)).toBe(false);
      expect(protocol.isResponse(invalid)).toBe(false);
      expect(protocol.isNotification(invalid)).toBe(false);
    });
  });

  describe("roundtrip", () => {
    it("should create and parse request", () => {
      const created = protocol.createRequest("getUser", { id: 42 });
      const parsed = protocol.parseMessage(created);

      expect(parsed.kind).toBe("request");
      if (parsed.kind === "request") {
        expect(parsed.message).toEqual(created);
      }
    });

    it("should create and parse response", () => {
      const created = protocol.createResponse(1, { name: "Alice" });
      const parsed = protocol.parseMessage(created);

      expect(parsed.kind).toBe("response");
      if (parsed.kind === "response") {
        expect(parsed.message).toEqual(created);
      }
    });

    it("should create and parse error response", () => {
      const created = protocol.createErrorResponse(1, {
        code: -1,
        message: "Error",
      });
      const parsed = protocol.parseMessage(created);

      expect(parsed.kind).toBe("response");
      if (parsed.kind === "response") {
        expect(parsed.message).toEqual(created);
      }
    });

    it("should create and parse notification", () => {
      const created = protocol.createNotification("event", { data: "test" });
      const parsed = protocol.parseMessage(created);

      expect(parsed.kind).toBe("notification");
      if (parsed.kind === "notification") {
        expect(parsed.message).toEqual(created);
      }
    });
  });

  describe("comparison with JSON-RPC", () => {
    it("should have simpler message structure than JSON-RPC", () => {
      const req = protocol.createRequest("test");

      expect(req).toHaveProperty("type");
      expect(req).not.toHaveProperty("jsonrpc");
      expect(req.type).toBe("request");
    });

    it("should use type field instead of jsonrpc field", () => {
      const notif = protocol.createNotification("event");

      expect(notif).toHaveProperty("type");
      expect(notif.type).toBe("notification");
    });
  });
});
