import { describe, it, expect } from "vitest";
import type { BunWritableSocket } from "../src/bun-drain-waiter.js";
import { BunDrainWaiter } from "../src/bun-drain-waiter.js";

/**
 * Creates a mock Bun socket whose write() returns scripted byte counts.
 * Bun's socket.write() returns the NUMBER of bytes written (-1 = closed),
 * unlike Node's boolean return.
 */
function createMockSocket(writeResults: number[]): BunWritableSocket & {
  writes: Buffer[];
} {
  const writes: Buffer[] = [];
  return {
    writes,
    write(data: Buffer | Uint8Array): number {
      writes.push(Buffer.from(data));
      const result = writeResults.shift();
      return result ?? data.length;
    },
  };
}

describe("BunDrainWaiter", () => {
  describe("waitForDrain", () => {
    it("should return immediately if no drain needed", async () => {
      const waiter = new BunDrainWaiter();

      await waiter.waitForDrain();
      expect(waiter.needsDrain).toBe(false);
    });

    it("should track drain state via markNeedsDrain/onDrain", () => {
      const waiter = new BunDrainWaiter();

      waiter.markNeedsDrain();
      expect(waiter.needsDrain).toBe(true);

      waiter.onDrain();
      expect(waiter.needsDrain).toBe(false);
    });

    it("should resolve waiters on drain", async () => {
      const waiter = new BunDrainWaiter();
      waiter.markNeedsDrain();

      let resolved = false;
      const waitPromise = waiter.waitForDrain().then(() => {
        resolved = true;
      });

      waiter.onDrain();

      await waitPromise;
      expect(resolved).toBe(true);
    });

    it("should resolve multiple concurrent waiters on a single drain", async () => {
      const waiter = new BunDrainWaiter();
      waiter.markNeedsDrain();

      const results = [waiter.waitForDrain(), waiter.waitForDrain(), waiter.waitForDrain()];
      waiter.onDrain();

      await expect(Promise.all(results)).resolves.toBeDefined();
    });

    it("should throw if already closed", async () => {
      const waiter = new BunDrainWaiter();
      waiter.clear();
      waiter.markNeedsDrain();

      await expect(waiter.waitForDrain()).rejects.toThrow("Socket closed during backpressure wait");
    });
  });

  describe("clear (D7: unified REJECT semantics with Node DrainWaiter)", () => {
    it("should REJECT pending waiters so a sender cannot 'succeed' on a dead socket", async () => {
      const waiter = new BunDrainWaiter();
      waiter.markNeedsDrain();

      const pending = waiter.waitForDrain();
      waiter.clear();

      await expect(pending).rejects.toThrow("Socket closed during backpressure wait");
    });

    it("should reset needsDrain on clear()", () => {
      const waiter = new BunDrainWaiter();
      waiter.markNeedsDrain();

      waiter.clear();
      expect(waiter.needsDrain).toBe(false);
    });

    it("should reject a writeAll suspended mid-frame on backpressure", async () => {
      const waiter = new BunDrainWaiter();
      // Partial write: 4 of 8 bytes accepted, then the socket dies.
      const socket = createMockSocket([4]);

      const pending = waiter.writeAll(socket, Buffer.from("12345678"));
      // Let the serialized write task reach the drain wait.
      await new Promise((resolve) => setImmediate(resolve));

      waiter.clear();

      await expect(pending).rejects.toThrow("Socket closed during backpressure wait");
    });
  });

  describe("writeAll", () => {
    it("should complete in a single write() call on the fast path", async () => {
      const waiter = new BunDrainWaiter();
      const socket = createMockSocket([8]);

      await waiter.writeAll(socket, Buffer.from("12345678"));

      expect(socket.writes).toHaveLength(1);
    });

    it("should re-send the unwritten tail after drain on partial write", async () => {
      const waiter = new BunDrainWaiter();
      const socket = createMockSocket([3, 5]);

      const pending = waiter.writeAll(socket, Buffer.from("12345678"));
      await new Promise((resolve) => setImmediate(resolve));
      waiter.onDrain();
      await pending;

      expect(socket.writes).toHaveLength(2);
      expect(socket.writes[1]?.toString()).toBe("45678");
    });

    it("should throw when write() returns -1 (socket closed)", async () => {
      const waiter = new BunDrainWaiter();
      const socket = createMockSocket([-1]);

      await expect(waiter.writeAll(socket, Buffer.from("1234"))).rejects.toThrow(
        "Socket closed during write",
      );
    });

    it("should serialize concurrent writeAll calls in FIFO order", async () => {
      const waiter = new BunDrainWaiter();
      // Frame A: partial (2 of 4), then tail; frame B must not interleave.
      const socket = createMockSocket([2, 2, 4]);

      const a = waiter.writeAll(socket, Buffer.from("AAAA"));
      const b = waiter.writeAll(socket, Buffer.from("BBBB"));
      await new Promise((resolve) => setImmediate(resolve));
      waiter.onDrain();
      await Promise.all([a, b]);

      expect(socket.writes.map((w) => w.toString())).toEqual(["AAAA", "AA", "BBBB"]);
    });

    it("should keep the queue alive after a failed write", async () => {
      const waiter = new BunDrainWaiter();
      const socket = createMockSocket([-1, 4]);

      await expect(waiter.writeAll(socket, Buffer.from("dead"))).rejects.toThrow(
        "Socket closed during write",
      );
      await expect(waiter.writeAll(socket, Buffer.from("live"))).resolves.toBeUndefined();
    });
  });
});
