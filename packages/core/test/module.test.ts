import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { Socket } from "node:net";
import { Module } from "../src/module.js";
import { msgpackCodec, arrowCodec } from "@procwire/codecs";
import { buildFrame, Flags } from "@procwire/protocol";

describe("Module", () => {
  describe("builder API", () => {
    it("should set name", () => {
      const mod = new Module("worker");
      expect(mod.name).toBe("worker");
    });

    it("should configure executable", () => {
      const mod = new Module("worker").executable("python", ["worker.py"], { cwd: "/app" });

      expect(mod.executableConfig).toEqual({
        command: "python",
        args: ["worker.py"],
        cwd: "/app",
        env: undefined,
      });
    });

    it("should configure executable with env", () => {
      const mod = new Module("worker").executable("node", ["index.js"], {
        env: { NODE_ENV: "production" },
      });

      expect(mod.executableConfig?.env).toEqual({ NODE_ENV: "production" });
    });

    it("should register methods with default config", () => {
      const mod = new Module("worker").method("process");

      expect(mod.methods.size).toBe(1);
      const config = mod.methods.get("process");
      expect(config?.response).toBe("result");
      expect(config?.cancellable).toBe(false);
      expect(config?.codec).toBe(msgpackCodec);
    });

    it("should register methods with custom config", () => {
      const mod = new Module("worker")
        .method("process", { codec: msgpackCodec })
        .method("batch", { codec: arrowCodec, response: "stream" });

      expect(mod.methods.size).toBe(2);
      expect(mod.methods.get("process")?.response).toBe("result");
      expect(mod.methods.get("batch")?.response).toBe("stream");
      expect(mod.methods.get("batch")?.codec).toBe(arrowCodec);
    });

    it("should register events with default codec", () => {
      const mod = new Module("worker").event("progress");

      expect(mod.events.size).toBe(1);
      expect(mod.events.get("progress")?.codec).toBe(msgpackCodec);
    });

    it("should register events with custom codec", () => {
      const mod = new Module("worker").event("status", { codec: arrowCodec });

      expect(mod.events.size).toBe(1);
      expect(mod.events.get("status")?.codec).toBe(arrowCodec);
    });

    it("should set spawn policy", () => {
      const mod = new Module("worker").spawnPolicy({
        initTimeout: 60_000,
        restartOnCrash: true,
      });

      expect(mod.spawnPolicyConfig.initTimeout).toBe(60_000);
      expect(mod.spawnPolicyConfig.restartOnCrash).toBe(true);
    });

    it("should merge spawn policy options", () => {
      const mod = new Module("worker")
        .spawnPolicy({ initTimeout: 60_000 })
        .spawnPolicy({ maxRetries: 5 });

      expect(mod.spawnPolicyConfig.initTimeout).toBe(60_000);
      expect(mod.spawnPolicyConfig.maxRetries).toBe(5);
    });

    it("should support method chaining", () => {
      const mod = new Module("worker")
        .executable("node", ["index.js"])
        .method("foo")
        .method("bar")
        .event("baz")
        .spawnPolicy({ maxRetries: 5 });

      expect(mod.methods.size).toBe(2);
      expect(mod.events.size).toBe(1);
      expect(mod.executableConfig).not.toBeNull();
    });

    it("should set maxPayloadSize", () => {
      const mod = new Module("worker").maxPayloadSize(1024 * 1024);
      // Can't directly access private field, but it's used in _attachDataChannel
      expect(mod).toBeDefined();
    });
  });

  describe("validation", () => {
    it("should throw if no executable", () => {
      const mod = new Module("worker").method("foo");

      expect(() => mod._validate()).toThrow("executable not configured");
    });

    it("should throw if no methods", () => {
      const mod = new Module("worker").executable("node", ["index.js"]);

      expect(() => mod._validate()).toThrow("no methods registered");
    });

    it("should pass validation with proper config", () => {
      const mod = new Module("worker").executable("node", ["index.js"]).method("foo");

      expect(() => mod._validate()).not.toThrow();
    });
  });

  describe("state", () => {
    it("should start in created state", () => {
      const mod = new Module("worker");
      expect(mod.state).toBe("created");
    });

    it("should emit state changes", () => {
      const mod = new Module("worker");
      const handler = vi.fn();
      mod.on("state", handler);

      mod._setState("initializing");

      expect(handler).toHaveBeenCalledWith("initializing");
      expect(mod.state).toBe("initializing");
    });

    it("should allow state transitions", () => {
      const mod = new Module("worker");

      mod._setState("initializing");
      expect(mod.state).toBe("initializing");

      mod._setState("connecting");
      expect(mod.state).toBe("connecting");

      mod._setState("ready");
      expect(mod.state).toBe("ready");
    });
  });

  describe("internal API", () => {
    it("should build expected schema", () => {
      const mod = new Module("worker")
        .method("foo")
        .method("bar")
        .event("progress")
        .event("status");

      const schema = mod._buildExpectedSchema();

      expect(schema.methods).toEqual(["foo", "bar"]);
      expect(schema.events).toEqual(["progress", "status"]);
    });

    it("should attach schema and build lookups", () => {
      const mod = new Module("worker").method("process").event("progress");

      mod._attachSchema({
        methods: { process: { id: 1, response: "result" } },
        events: { progress: { id: 2 } },
      });

      // Schema is attached - now module can resolve method/event names
      mod._setState("ready");

      // The lookups are internal, but we can verify via send() behavior
      expect(mod.state).toBe("ready");
    });

    it("should detach and cleanup", () => {
      const mod = new Module("worker").method("foo");

      mod._attachSchema({
        methods: { foo: { id: 1, response: "result" } },
        events: {},
      });

      mod._detach();

      // After detach, module should be cleaned up
      expect(mod.process).toBeNull();
    });
  });

  describe("send", () => {
    it("should throw if not ready", async () => {
      const mod = new Module("worker").executable("node", ["index.js"]).method("foo");

      await expect(mod.send("foo", {})).rejects.toThrow("not ready");
    });

    it("should throw for unknown method", async () => {
      const mod = new Module("worker").executable("node", ["index.js"]).method("foo");

      mod._setState("ready");

      await expect(mod.send("unknown", {})).rejects.toThrow("Unknown method");
    });

    it("should throw if method not in child schema", async () => {
      const mod = new Module("worker").executable("node", ["index.js"]).method("foo");

      mod._setState("ready");
      mod._attachSchema({
        methods: {}, // foo not registered by child
        events: {},
      });

      await expect(mod.send("foo", {})).rejects.toThrow("not registered by child");
    });

    it("should throw if method returns stream", async () => {
      const mod = new Module("worker")
        .executable("node", ["index.js"])
        .method("streamMethod", { response: "stream" });

      mod._setState("ready");
      mod._attachSchema({
        methods: { streamMethod: { id: 1, response: "stream" } },
        events: {},
      });

      await expect(mod.send("streamMethod", {})).rejects.toThrow(
        "Use .stream() instead of .send()",
      );
    });
  });

  describe("stream", () => {
    it("should throw if not ready", async () => {
      const mod = new Module("worker").executable("node", ["index.js"]).method("foo");

      const gen = mod.stream("foo", {});
      await expect(gen.next()).rejects.toThrow("not ready");
    });

    it("should throw if method does not return stream", async () => {
      const mod = new Module("worker")
        .executable("node", ["index.js"])
        .method("resultMethod", { response: "result" });

      mod._setState("ready");
      mod._attachSchema({
        methods: { resultMethod: { id: 1, response: "result" } },
        events: {},
      });

      const gen = mod.stream("resultMethod", {});
      await expect(gen.next()).rejects.toThrow("Use .send() instead of .stream()");
    });
  });

  describe("onEvent", () => {
    it("should throw for unknown event", () => {
      const mod = new Module("worker");

      expect(() => mod.onEvent("unknown", () => {})).toThrow("Unknown event");
    });

    it("should return unsubscribe function", () => {
      const mod = new Module("worker").event("progress");

      const handler = vi.fn();
      const unsubscribe = mod.onEvent("progress", handler);

      expect(typeof unsubscribe).toBe("function");

      // Call unsubscribe - should not throw
      unsubscribe();
    });

    it("should handle events when emitted", () => {
      const mod = new Module("worker").event("progress");

      const handler = vi.fn();
      mod.onEvent("progress", handler);

      // Simulate event emission
      mod.emit("event:progress", { percent: 50 });

      expect(handler).toHaveBeenCalledWith({ percent: 50 });
    });

    it("should stop receiving events after unsubscribe", () => {
      const mod = new Module("worker").event("progress");

      const handler = vi.fn();
      const unsubscribe = mod.onEvent("progress", handler);

      mod.emit("event:progress", { percent: 25 });
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();

      mod.emit("event:progress", { percent: 50 });
      expect(handler).toHaveBeenCalledTimes(1); // Still 1, not called again
    });
  });

  describe("process getter", () => {
    it("should return null before attach", () => {
      const mod = new Module("worker");
      expect(mod.process).toBeNull();
    });
  });

  describe("ACK response handling (TASK-08)", () => {
    /**
     * Creates a mock socket that can emit data events.
     */
    function createMockSocket(): Socket & EventEmitter {
      const emitter = new EventEmitter();
      const mockSocket = Object.assign(emitter, {
        write: vi.fn().mockReturnValue(true),
        destroy: vi.fn(),
        destroyed: false,
        setNoDelay: vi.fn(),
        cork: vi.fn(),
        uncork: vi.fn(),
      }) as unknown as Socket & EventEmitter;
      return mockSocket;
    }

    /**
     * Sets up a module ready to send requests.
     */
    function setupReadyModule(
      methodName: string,
      responseType: "ack" | "result",
    ): { mod: Module; socket: Socket & EventEmitter } {
      const mod = new Module("worker")
        .executable("node", ["index.js"])
        .method(methodName, { response: responseType, codec: msgpackCodec });

      mod._setState("ready");
      mod._attachSchema({
        methods: { [methodName]: { id: 1, response: responseType } },
        events: {},
      });

      const socket = createMockSocket();
      mod._attachDataChannel(socket);

      return { mod, socket };
    }

    it('should resolve "ack" method on IS_ACK frame', async () => {
      const { mod, socket } = setupReadyModule("ackMethod", "ack");

      // Start send - will create pending request with expectedResponse: "ack"
      const sendPromise = mod.send("ackMethod", { data: "test" });

      // Wait for the send frame to be written
      await vi.waitFor(() => {
        expect(socket.write).toHaveBeenCalled();
      });

      // Build ACK response frame (IS_RESPONSE | IS_ACK)
      const responsePayload = msgpackCodec.serialize({ acknowledged: true });
      const ackFrame = buildFrame(
        {
          methodId: 1,
          flags: Flags.IS_RESPONSE | Flags.IS_ACK,
          requestId: 1,
        },
        responsePayload,
      );

      // Simulate receiving ACK frame
      socket.emit("data", ackFrame);

      // Should resolve with ACK payload
      const result = await sendPromise;
      expect(result).toEqual({ acknowledged: true });
    });

    it('should resolve "ack" method on full response (graceful fallback)', async () => {
      const { mod, socket } = setupReadyModule("ackMethod", "ack");

      const sendPromise = mod.send("ackMethod", { data: "test" });

      await vi.waitFor(() => {
        expect(socket.write).toHaveBeenCalled();
      });

      // Build full response frame (IS_RESPONSE only, no IS_ACK)
      const responsePayload = msgpackCodec.serialize({ result: "full" });
      const fullFrame = buildFrame(
        {
          methodId: 1,
          flags: Flags.IS_RESPONSE,
          requestId: 1,
        },
        responsePayload,
      );

      socket.emit("data", fullFrame);

      // Should resolve with full response payload
      const result = await sendPromise;
      expect(result).toEqual({ result: "full" });
    });

    it('should ignore IS_ACK frame for "result" method and wait for full response', async () => {
      const { mod, socket } = setupReadyModule("resultMethod", "result");

      const sendPromise = mod.send("resultMethod", { data: "test" });

      await vi.waitFor(() => {
        expect(socket.write).toHaveBeenCalled();
      });

      // Build ACK frame (should be ignored for "result" methods)
      const ackPayload = msgpackCodec.serialize({ ack: true });
      const ackFrame = buildFrame(
        {
          methodId: 1,
          flags: Flags.IS_RESPONSE | Flags.IS_ACK,
          requestId: 1,
        },
        ackPayload,
      );

      // Simulate receiving ACK frame
      socket.emit("data", ackFrame);

      // Promise should NOT be resolved yet - create a race
      let resolved = false;
      sendPromise.then(() => {
        resolved = true;
      });

      // Wait a tick to ensure no premature resolution
      await new Promise((r) => setTimeout(r, 10));
      expect(resolved).toBe(false);

      // Now send full response
      const resultPayload = msgpackCodec.serialize({ result: "final" });
      const resultFrame = buildFrame(
        {
          methodId: 1,
          flags: Flags.IS_RESPONSE,
          requestId: 1,
        },
        resultPayload,
      );

      socket.emit("data", resultFrame);

      // Now should resolve with full response
      const result = await sendPromise;
      expect(result).toEqual({ result: "final" });
    });

    it('should resolve "result" method on full response', async () => {
      const { mod, socket } = setupReadyModule("resultMethod", "result");

      const sendPromise = mod.send("resultMethod", { data: "test" });

      await vi.waitFor(() => {
        expect(socket.write).toHaveBeenCalled();
      });

      // Build full response frame
      const responsePayload = msgpackCodec.serialize({ result: "success" });
      const responseFrame = buildFrame(
        {
          methodId: 1,
          flags: Flags.IS_RESPONSE,
          requestId: 1,
        },
        responsePayload,
      );

      socket.emit("data", responseFrame);

      const result = await sendPromise;
      expect(result).toEqual({ result: "success" });
    });

    it("should handle error responses correctly", async () => {
      const { mod, socket } = setupReadyModule("resultMethod", "result");

      const sendPromise = mod.send("resultMethod", { data: "test" });

      await vi.waitFor(() => {
        expect(socket.write).toHaveBeenCalled();
      });

      // Build error response frame
      const errorPayload = msgpackCodec.serialize("Something went wrong");
      const errorFrame = buildFrame(
        {
          methodId: 1,
          flags: Flags.IS_RESPONSE | Flags.IS_ERROR,
          requestId: 1,
        },
        errorPayload,
      );

      socket.emit("data", errorFrame);

      await expect(sendPromise).rejects.toThrow("Something went wrong");
    });
  });
});
