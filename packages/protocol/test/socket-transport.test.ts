import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { Socket } from "node:net";
import { NodeSocketTransport } from "../src/node-socket-transport.js";
import { BunSocketTransport, type BunTransportSocket } from "../src/bun-socket-transport.js";

// ═══════════════════════════════════════════════════════════════════════════
// NodeSocketTransport
// ═══════════════════════════════════════════════════════════════════════════

interface MockNodeSocket extends EventEmitter {
  write: ReturnType<typeof vi.fn>;
  cork: ReturnType<typeof vi.fn>;
  uncork: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  destroyed: boolean;
  writableNeedDrain: boolean;
}

function createNodeSocket(options: { writeReturns?: boolean } = {}): MockNodeSocket {
  const emitter = new EventEmitter() as MockNodeSocket;
  emitter.write = vi.fn().mockReturnValue(options.writeReturns ?? true);
  emitter.cork = vi.fn();
  emitter.uncork = vi.fn();
  emitter.destroy = vi.fn();
  emitter.pause = vi.fn();
  emitter.resume = vi.fn();
  emitter.destroyed = false;
  emitter.writableNeedDrain = false;
  return emitter;
}

describe("NodeSocketTransport", () => {
  it("writes header and payload as two zero-copy writes inside cork/uncork", async () => {
    const socket = createNodeSocket();
    const transport = new NodeSocketTransport(socket as unknown as Socket);

    const header = Buffer.from("HEADER");
    const payload = Buffer.from("PAYLOAD");
    await transport.writeFrame(header, payload);

    // Zero-copy contract: NO Buffer.concat - the exact buffers are written.
    expect(socket.write).toHaveBeenCalledTimes(2);
    expect(socket.write.mock.calls[0]?.[0]).toBe(header);
    expect(socket.write.mock.calls[1]?.[0]).toBe(payload);

    // cork before the writes, uncork after (atomic flush of both buffers).
    const corkOrder = socket.cork.mock.invocationCallOrder[0]!;
    const writeOrder = socket.write.mock.invocationCallOrder[0]!;
    const uncorkOrder = socket.uncork.mock.invocationCallOrder[0]!;
    expect(corkOrder).toBeLessThan(writeOrder);
    expect(writeOrder).toBeLessThan(uncorkOrder);
  });

  it("resolves immediately when the kernel buffer accepts the write", async () => {
    const socket = createNodeSocket({ writeReturns: true });
    const transport = new NodeSocketTransport(socket as unknown as Socket);

    await expect(transport.writeFrame(Buffer.from("h"), Buffer.from("p"))).resolves.toBeUndefined();
  });

  it("waits for drain when write() reports backpressure", async () => {
    const socket = createNodeSocket({ writeReturns: false });
    socket.writableNeedDrain = true;
    const transport = new NodeSocketTransport(socket as unknown as Socket);

    let settled = false;
    const pending = transport.writeFrame(Buffer.from("h"), Buffer.from("p")).then(() => {
      settled = true;
    });

    await new Promise((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);

    socket.writableNeedDrain = false;
    socket.emit("drain");
    await pending;
    expect(settled).toBe(true);
  });

  it("rejects a write suspended on backpressure when the transport closes", async () => {
    const socket = createNodeSocket({ writeReturns: false });
    socket.writableNeedDrain = true;
    const transport = new NodeSocketTransport(socket as unknown as Socket);

    const pending = transport.writeFrame(Buffer.from("h"), Buffer.from("p"));
    await new Promise((resolve) => setImmediate(resolve));

    transport.close();

    await expect(pending).rejects.toThrow("Socket closed during backpressure wait");
    expect(socket.destroy).toHaveBeenCalled();
  });

  it("delegates pause/resume to the socket", () => {
    const socket = createNodeSocket();
    const transport = new NodeSocketTransport(socket as unknown as Socket);

    transport.pause();
    transport.resume();

    expect(socket.pause).toHaveBeenCalledTimes(1);
    expect(socket.resume).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BunSocketTransport
// ═══════════════════════════════════════════════════════════════════════════

function createBunSocket(writeResults: number[] = []): BunTransportSocket & {
  writes: Buffer[];
  ended: boolean;
  paused: number;
  resumed: number;
} {
  const state = {
    writes: [] as Buffer[],
    ended: false,
    paused: 0,
    resumed: 0,
  };
  return {
    ...state,
    write(data: Buffer | Uint8Array): number {
      state.writes.push(Buffer.from(data));
      this.writes = state.writes;
      const result = writeResults.shift();
      return result ?? data.length;
    },
    end(): void {
      state.ended = true;
      this.ended = true;
    },
    pause(): void {
      state.paused++;
      this.paused = state.paused;
    },
    resume(): void {
      state.resumed++;
      this.resumed = state.resumed;
    },
  };
}

describe("BunSocketTransport", () => {
  it("hands the whole frame to the kernel in ONE write() on the fast path", async () => {
    const socket = createBunSocket();
    const transport = new BunSocketTransport(socket);

    await transport.writeFrame(Buffer.from("HEADER"), Buffer.from("PAYLOAD"));

    expect(socket.writes).toHaveLength(1);
    expect(socket.writes[0]?.toString()).toBe("HEADERPAYLOAD");
  });

  it("writes the bare header without concat when the payload is empty", async () => {
    const socket = createBunSocket();
    const transport = new BunSocketTransport(socket);

    const header = Buffer.from("HEADER");
    await transport.writeFrame(header, Buffer.alloc(0));

    expect(socket.writes).toHaveLength(1);
    expect(socket.writes[0]?.toString()).toBe("HEADER");
  });

  it("re-sends the unwritten tail after handleDrain() on a partial write", async () => {
    // 13 bytes total; only 6 accepted on the first write.
    const socket = createBunSocket([6]);
    const transport = new BunSocketTransport(socket);

    const pending = transport.writeFrame(Buffer.from("HEADER"), Buffer.from("PAYLOAD"));
    await new Promise((resolve) => setImmediate(resolve));

    transport.handleDrain();
    await pending;

    expect(socket.writes).toHaveLength(2);
    expect(socket.writes[1]?.toString()).toBe("PAYLOAD");
  });

  it("rejects a write suspended on backpressure when the transport closes", async () => {
    const socket = createBunSocket([3]);
    const transport = new BunSocketTransport(socket);

    const pending = transport.writeFrame(Buffer.from("HEADER"), Buffer.from("PAYLOAD"));
    await new Promise((resolve) => setImmediate(resolve));

    transport.close();

    await expect(pending).rejects.toThrow("Socket closed during backpressure wait");
    expect(socket.ended).toBe(true);
  });

  it("delegates pause/resume to the socket", () => {
    const socket = createBunSocket();
    const transport = new BunSocketTransport(socket);

    transport.pause();
    transport.resume();

    expect(socket.paused).toBe(1);
    expect(socket.resumed).toBe(1);
  });
});
