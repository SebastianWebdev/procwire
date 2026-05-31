/**
 * Regression tests for production-readiness bug fixes.
 *
 * Each `describe` block targets ONE specific bug. The tests are written to FAIL
 * against the buggy code (demonstrating the bug exists) and PASS once the fix is
 * applied. They also guard against regressing the surrounding behavior.
 */
import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { Socket } from "node:net";
import { Module } from "../src/module.js";
import { msgpackCodec } from "@procwire/codecs";

/**
 * Mock socket usable as a net.Socket in tests.
 * It is a real EventEmitter so `emit("data"|"error"|"close")` drives the module.
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

function setupReadyModule(): { mod: Module; socket: Socket & EventEmitter } {
  const mod = new Module("worker")
    .executable("node", ["index.js"])
    .method("foo", { response: "result", codec: msgpackCodec });

  mod._setState("ready");
  mod._attachSchema({
    methods: { foo: { id: 1, response: "result" } },
    events: {},
  });

  const socket = createMockSocket();
  mod._attachDataChannel(socket);

  return { mod, socket };
}

// ═══════════════════════════════════════════════════════════════════════════
// Bug C5: a socket "error" must not crash the parent process when the user
// has not attached a Module "error" listener.
//
// Node's EventEmitter throws synchronously when "error" is emitted with no
// registered listener. The Module forwards socket errors via emit("error"),
// and ModuleManager does NOT attach a per-Module "error" listener, so an
// unobserved socket error would take down the whole parent process.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug C5: unobserved socket error must not crash the process", () => {
  it("does not throw when the socket errors and no 'error' listener is attached", () => {
    const { socket } = setupReadyModule();

    // No mod.on("error", ...) listener registered on purpose.
    // Buggy behavior: socket "error" -> mod.emit("error") with no listener -> throws.
    expect(() => socket.emit("error", new Error("ECONNRESET"))).not.toThrow();
  });

  it("still forwards socket errors to a registered 'error' listener", () => {
    const { mod, socket } = setupReadyModule();

    const onError = vi.fn();
    mod.on("error", onError);

    const err = new Error("EPIPE");
    expect(() => socket.emit("error", err)).not.toThrow();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(err);
  });
});
