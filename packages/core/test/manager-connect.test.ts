/**
 * Regression test for Bug C9: connectDataChannel had no timeout. A child that
 * advertises a data-plane pipe it never accepts connections on would make the
 * connect Promise hang forever, hanging the spawn and leaking the child. The
 * connect must be bounded by a timeout that rejects and destroys the socket.
 *
 * node:net is mocked here so createConnection returns a socket that never emits
 * "connect" or "error", isolating the timeout behavior.
 */
import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";

interface FakeSocket extends EventEmitter {
  setNoDelay: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

const createdSockets: FakeSocket[] = [];

vi.mock("node:net", () => ({
  createConnection: vi.fn((): FakeSocket => {
    const socket = Object.assign(new EventEmitter(), {
      setNoDelay: vi.fn(),
      destroy: vi.fn(),
    }) as FakeSocket;
    createdSockets.push(socket);
    return socket;
  }),
}));

const { ModuleManager } = await import("../src/manager.js");

type ConnectFn = (pipePath: string, bufSize?: number, timeoutMs?: number) => Promise<unknown>;

describe("Bug C9: connectDataChannel must time out instead of hanging", () => {
  it("rejects and destroys the socket when the connection never completes", async () => {
    vi.useFakeTimers();
    try {
      createdSockets.length = 0;
      const manager = new ModuleManager();
      const connect = (
        manager as unknown as { connectDataChannel: ConnectFn }
      ).connectDataChannel.bind(manager);

      let outcome: unknown = "pending";
      // The fake socket never emits "connect" or "error".
      connect("/tmp/procwire-never", undefined, 1000).then(
        (v) => (outcome = v),
        (e) => (outcome = e),
      );

      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();

      // Fixed: the timeout fired -> rejected + socket destroyed.
      // Buggy: no timer -> still "pending", destroy never called.
      expect(outcome).toBeInstanceOf(Error);
      expect((outcome as Error).message).toMatch(/timed out/i);
      expect(createdSockets[0]!.destroy).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
