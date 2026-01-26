import { describe, it, expect } from "vitest";
import {
  isRequest,
  isNotification,
  createResponse,
  createErrorResponse,
  createNotification,
  JsonRpcErrorCodes,
} from "../../src/channel/types.js";

describe("Channel Types", () => {
  describe("isRequest", () => {
    it("should return true for valid request", () => {
      const msg = { jsonrpc: "2.0", id: 1, method: "test" };
      expect(isRequest(msg)).toBe(true);
    });

    it("should return true for request with string id", () => {
      const msg = { jsonrpc: "2.0", id: "abc-123", method: "test" };
      expect(isRequest(msg)).toBe(true);
    });

    it("should return true for request with params", () => {
      const msg = { jsonrpc: "2.0", id: 1, method: "test", params: { foo: "bar" } };
      expect(isRequest(msg)).toBe(true);
    });

    it("should return false for notification (no id)", () => {
      const msg = { jsonrpc: "2.0", method: "test" };
      expect(isRequest(msg)).toBe(false);
    });

    it("should return false for null", () => {
      expect(isRequest(null)).toBe(false);
    });

    it("should return false for non-object", () => {
      expect(isRequest("test")).toBe(false);
      expect(isRequest(123)).toBe(false);
    });

    it("should return false for wrong jsonrpc version", () => {
      const msg = { jsonrpc: "1.0", id: 1, method: "test" };
      expect(isRequest(msg)).toBe(false);
    });

    it("should return false for missing method", () => {
      const msg = { jsonrpc: "2.0", id: 1 };
      expect(isRequest(msg)).toBe(false);
    });
  });

  describe("isNotification", () => {
    it("should return true for valid notification", () => {
      const msg = { jsonrpc: "2.0", method: "test" };
      expect(isNotification(msg)).toBe(true);
    });

    it("should return true for notification with params", () => {
      const msg = { jsonrpc: "2.0", method: "test", params: { foo: "bar" } };
      expect(isNotification(msg)).toBe(true);
    });

    it("should return false for request (has id)", () => {
      const msg = { jsonrpc: "2.0", id: 1, method: "test" };
      expect(isNotification(msg)).toBe(false);
    });

    it("should return false for null", () => {
      expect(isNotification(null)).toBe(false);
    });

    it("should return false for non-object", () => {
      expect(isNotification("test")).toBe(false);
    });

    it("should return false for wrong jsonrpc version", () => {
      const msg = { jsonrpc: "1.0", method: "test" };
      expect(isNotification(msg)).toBe(false);
    });
  });

  describe("createResponse", () => {
    it("should create success response with number id", () => {
      const response = createResponse(1, { value: "test" });

      expect(response).toEqual({
        jsonrpc: "2.0",
        id: 1,
        result: { value: "test" },
      });
    });

    it("should create success response with string id", () => {
      const response = createResponse("abc-123", { value: "test" });

      expect(response).toEqual({
        jsonrpc: "2.0",
        id: "abc-123",
        result: { value: "test" },
      });
    });

    it("should handle null result", () => {
      const response = createResponse(1, null);

      expect(response.result).toBeNull();
    });

    it("should handle undefined result", () => {
      const response = createResponse(1, undefined);

      expect(response.result).toBeUndefined();
    });
  });

  describe("createErrorResponse", () => {
    it("should create error response", () => {
      const response = createErrorResponse(1, -32600, "Invalid Request");

      expect(response).toEqual({
        jsonrpc: "2.0",
        id: 1,
        error: {
          code: -32600,
          message: "Invalid Request",
        },
      });
    });

    it("should create error response with data", () => {
      const response = createErrorResponse(1, -32603, "Internal error", {
        details: "Something went wrong",
      });

      expect(response).toEqual({
        jsonrpc: "2.0",
        id: 1,
        error: {
          code: -32603,
          message: "Internal error",
          data: { details: "Something went wrong" },
        },
      });
    });

    it("should use standard error codes", () => {
      const response = createErrorResponse(
        1,
        JsonRpcErrorCodes.METHOD_NOT_FOUND,
        "Method not found",
      );

      expect(response.error?.code).toBe(-32601);
    });
  });

  describe("createNotification", () => {
    it("should create notification without params", () => {
      const notification = createNotification("test.event");

      expect(notification).toEqual({
        jsonrpc: "2.0",
        method: "test.event",
      });
    });

    it("should create notification with params", () => {
      const notification = createNotification("test.event", { foo: "bar" });

      expect(notification).toEqual({
        jsonrpc: "2.0",
        method: "test.event",
        params: { foo: "bar" },
      });
    });

    it("should handle undefined params", () => {
      const notification = createNotification("test", undefined);

      expect(notification.params).toBeUndefined();
    });
  });

  describe("JsonRpcErrorCodes", () => {
    it("should have correct standard error codes", () => {
      expect(JsonRpcErrorCodes.PARSE_ERROR).toBe(-32700);
      expect(JsonRpcErrorCodes.INVALID_REQUEST).toBe(-32600);
      expect(JsonRpcErrorCodes.METHOD_NOT_FOUND).toBe(-32601);
      expect(JsonRpcErrorCodes.INVALID_PARAMS).toBe(-32602);
      expect(JsonRpcErrorCodes.INTERNAL_ERROR).toBe(-32603);
    });
  });
});
