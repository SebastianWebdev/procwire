import { describe, it, expect, beforeEach } from "vitest";
import { HandlerRegistry, HandlerRegistrationError } from "../../src/handlers/registry.js";

describe("HandlerRegistry", () => {
  let registry: HandlerRegistry;

  beforeEach(() => {
    registry = new HandlerRegistry();
  });

  describe("register", () => {
    it("should register a handler", () => {
      registry.register("echo", () => ({ result: "test" }));
      expect(registry.has("echo")).toBe(true);
      expect(registry.size).toBe(1);
    });

    it("should register multiple handlers", () => {
      registry.register("echo", () => ({ result: "echo" }));
      registry.register("add", () => ({ result: "add" }));
      expect(registry.size).toBe(2);
      expect(registry.methods()).toContain("echo");
      expect(registry.methods()).toContain("add");
    });

    it("should throw on reserved method", () => {
      expect(() => registry.register("__handshake__", () => ({}))).toThrow(/reserved/);
    });

    it("should throw on duplicate registration", () => {
      registry.register("echo", () => ({}));
      expect(() => registry.register("echo", () => ({}))).toThrow(HandlerRegistrationError);
    });

    it("should throw HandlerRegistrationError with descriptive message", () => {
      registry.register("echo", () => ({}));
      try {
        registry.register("echo", () => ({}));
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(HandlerRegistrationError);
        expect((error as Error).message).toContain("echo");
        expect((error as Error).message).toContain("remove()");
      }
    });
  });

  describe("registerNotification", () => {
    it("should register a notification handler", () => {
      registry.registerNotification("log", () => {
        /* noop */
      });
      expect(registry.hasNotification("log")).toBe(true);
      expect(registry.notificationSize).toBe(1);
    });

    it("should throw on reserved method", () => {
      expect(() =>
        registry.registerNotification("__shutdown__", () => {
          /* noop */
        }),
      ).toThrow(/reserved/);
    });

    it("should throw on duplicate registration", () => {
      registry.registerNotification("log", () => {
        /* noop */
      });
      expect(() =>
        registry.registerNotification("log", () => {
          /* noop */
        }),
      ).toThrow(HandlerRegistrationError);
    });
  });

  describe("get", () => {
    it("should return registered handler", () => {
      const handler = () => ({ result: "test" });
      registry.register("echo", handler);
      expect(registry.get("echo")).toBe(handler);
    });

    it("should return undefined for unknown method", () => {
      expect(registry.get("unknown")).toBeUndefined();
    });
  });

  describe("getNotification", () => {
    it("should return registered notification handler", () => {
      const handler = () => {
        /* noop */
      };
      registry.registerNotification("log", handler);
      expect(registry.getNotification("log")).toBe(handler);
    });

    it("should return undefined for unknown method", () => {
      expect(registry.getNotification("unknown")).toBeUndefined();
    });
  });

  describe("has / hasNotification", () => {
    it("should return true for registered handlers", () => {
      registry.register("echo", () => ({}));
      registry.registerNotification("log", () => {
        /* noop */
      });

      expect(registry.has("echo")).toBe(true);
      expect(registry.hasNotification("log")).toBe(true);
    });

    it("should return false for unregistered handlers", () => {
      expect(registry.has("echo")).toBe(false);
      expect(registry.hasNotification("log")).toBe(false);
    });
  });

  describe("remove", () => {
    it("should remove handler", () => {
      registry.register("echo", () => ({}));
      expect(registry.remove("echo")).toBe(true);
      expect(registry.has("echo")).toBe(false);
    });

    it("should return false for unknown method", () => {
      expect(registry.remove("unknown")).toBe(false);
    });

    it("should allow re-registration after removal", () => {
      registry.register("echo", () => ({ first: true }));
      registry.remove("echo");
      registry.register("echo", () => ({ second: true }));
      expect(registry.has("echo")).toBe(true);
    });
  });

  describe("removeNotification", () => {
    it("should remove notification handler", () => {
      registry.registerNotification("log", () => {
        /* noop */
      });
      expect(registry.removeNotification("log")).toBe(true);
      expect(registry.hasNotification("log")).toBe(false);
    });

    it("should return false for unknown method", () => {
      expect(registry.removeNotification("unknown")).toBe(false);
    });
  });

  describe("methods / notificationMethods", () => {
    it("should return all registered method names", () => {
      registry.register("a", () => ({}));
      registry.register("b", () => ({}));
      registry.registerNotification("x", () => {
        /* noop */
      });
      registry.registerNotification("y", () => {
        /* noop */
      });

      expect(registry.methods()).toEqual(["a", "b"]);
      expect(registry.notificationMethods()).toEqual(["x", "y"]);
    });

    it("should return empty arrays when no handlers registered", () => {
      expect(registry.methods()).toEqual([]);
      expect(registry.notificationMethods()).toEqual([]);
    });
  });

  describe("size / notificationSize", () => {
    it("should return correct counts", () => {
      expect(registry.size).toBe(0);
      expect(registry.notificationSize).toBe(0);

      registry.register("a", () => ({}));
      registry.register("b", () => ({}));
      registry.registerNotification("x", () => {
        /* noop */
      });

      expect(registry.size).toBe(2);
      expect(registry.notificationSize).toBe(1);
    });
  });

  describe("clear", () => {
    it("should remove all handlers", () => {
      registry.register("a", () => ({}));
      registry.register("b", () => ({}));
      registry.registerNotification("x", () => {
        /* noop */
      });
      registry.registerNotification("y", () => {
        /* noop */
      });

      registry.clear();

      expect(registry.size).toBe(0);
      expect(registry.notificationSize).toBe(0);
      expect(registry.has("a")).toBe(false);
      expect(registry.hasNotification("x")).toBe(false);
    });
  });
});
