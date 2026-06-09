/**
 * Transport-level regression tests (bun-core), run against REAL Bun sockets.
 *
 * Each `describe` targets ONE bug: written to FAIL against the buggy code and
 * PASS once the fix is applied.
 */
import { describe, it, expect } from "bun:test";
import { unlinkSync } from "node:fs";
import { FrameBuffer } from "@procwire/protocol";
import { rawCodec, msgpackCodec } from "@procwire/codecs";
import { Module } from "../src/index.js";
import { BunDrainWaiter } from "../src/drain-waiter.js";

type BunSocket = Awaited<ReturnType<typeof Bun.connect>>;

interface SendInternals {
  _socket: unknown;
  _drainWaiter: BunDrainWaiter | null;
  _pendingRequests: Map<number, unknown>;
  _pendingStreams: Map<number, unknown>;
  _sendFrame(methodId: number, requestId: number, data: unknown, codec: unknown): Promise<void>;
}

function tmpSock(): string {
  return `/tmp/procwire-test-${process.pid}-${Math.random().toString(36).slice(2, 10)}.sock`;
}

async function waitFor(cond: () => boolean, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 10));
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// Bug W1 (bun-core): Bun's socket.write() returns the NUMBER of bytes written
// (possibly partial, -1 when closed), not a boolean. _sendFrame treated the
// number as a boolean: a partial write (0 < n < length) is truthy, so the
// frame tail was silently dropped and the wire desynced; a 0 write waited for
// drain but never re-sent the frame.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug W1 (bun-core): partial socket writes must not drop frame tails", () => {
  it("delivers a complete 4MB frame through a real socket under receiver backpressure", async () => {
    const path = tmpSock();
    const received: Buffer[] = [];
    let receivedBytes = 0;
    let receiverSocket: { resume(): void } | null = null;
    // Helper: inside a function the variable keeps its declared union type,
    // avoiding TS narrowing `receiverSocket` to null in the linear flow.
    const resumeReceiver = (): void => {
      receiverSocket?.resume();
    };

    const server = Bun.listen({
      unix: path,
      socket: {
        open(socket) {
          receiverSocket = socket as unknown as { pause(): void; resume(): void };
          // Stop reading: kernel buffers fill up and the sender's write()
          // goes partial. This is the exact production backpressure case.
          (socket as unknown as { pause(): void }).pause();
        },
        data(_socket, data: Buffer) {
          received.push(Buffer.from(data));
          receivedBytes += data.length;
        },
        error() {},
        close() {},
      },
    });

    const waiter = new BunDrainWaiter();
    const sender = await Bun.connect({
      unix: path,
      socket: {
        data() {},
        error() {},
        close() {},
        drain() {
          waiter.onDrain();
        },
      },
    });

    try {
      const payload = Buffer.alloc(4 * 1024 * 1024);
      for (let i = 0; i < payload.length; i++) payload[i] = i % 251;

      const mod = new Module("worker").executable("bun", ["w.ts"]).method("foo");
      const internals = mod as unknown as SendInternals;
      internals._socket = sender as BunSocket;
      internals._drainWaiter = waiter;

      // Let the kernel buffers fill first, then release the receiver so the
      // drain path can complete the send.
      const resumeTimer = setTimeout(resumeReceiver, 200);

      await internals._sendFrame(7, 99, payload, rawCodec);

      const expectedTotal = 11 + payload.length;
      await waitFor(() => receivedBytes >= expectedTotal, 5000);
      clearTimeout(resumeTimer);
      resumeReceiver();

      expect(receivedBytes).toBe(expectedTotal);

      const frames = new FrameBuffer({ maxPayloadSize: 64 * 1024 * 1024 }).push(
        Buffer.concat(received),
      );
      expect(frames.length).toBe(1);
      expect(frames[0]!.header.methodId).toBe(7);
      expect(frames[0]!.header.requestId).toBe(99);
      expect(frames[0]!.header.payloadLength).toBe(payload.length);
      expect(frames[0]!.payload.equals(payload)).toBe(true);
    } finally {
      sender.end();
      server.stop(true);
      try {
        unlinkSync(path);
      } catch {
        /* already removed */
      }
    }
  }, 15000);
});

// ═══════════════════════════════════════════════════════════════════════════
// Bug S1 (bun-core): send()/stream() register pending state BEFORE awaiting
// _sendFrame. When the send fails (codec.serialize throws), the caller gets
// the error but the orphaned pending entry is later rejected by its timeout
// timer with no observer -> unhandled rejection -> process death.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug S1 (bun-core): failed send must not orphan pending state", () => {
  const bombCodec = {
    name: "bomb",
    serialize: (): Buffer => {
      throw new Error("serialize boom");
    },
    deserialize: (data: Buffer): unknown => data,
  };

  function setupWithBomb(): Module {
    const mod = new Module("worker")
      .executable("bun", ["w.ts"])
      .requestTimeout(50)
      .method("foo", { response: "result", codec: bombCodec })
      .method("bar", { response: "stream", codec: bombCodec, cancellable: true });

    mod._setState("ready");
    mod._attachSchema({
      methods: {
        foo: { id: 1, response: "result" },
        bar: { id: 2, response: "stream" },
      },
      events: {},
    });
    mod._attachDataChannel({ write: () => 1, end: () => {} } as never);
    return mod;
  }

  it("send(): serialize failure rejects, clears the pending entry, and leaves no unhandled rejection", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);

    try {
      const mod = setupWithBomb();
      const internals = mod as unknown as SendInternals;

      let thrown: Error | null = null;
      try {
        await mod.send("foo", { x: 1 });
      } catch (err) {
        thrown = err as Error;
      }
      expect(thrown?.message).toBe("serialize boom");

      expect(internals._pendingRequests.size).toBe(0);

      // Wait past the 50ms request timeout: a leaked timer would reject the
      // orphaned responsePromise here.
      await new Promise((r) => setTimeout(r, 150));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("stream(): serialize failure cleans the stream entry and removes the abort listener", async () => {
    const mod = setupWithBomb();
    const internals = mod as unknown as SendInternals;

    const controller = new AbortController();
    let removed = 0;
    const origRemove = controller.signal.removeEventListener.bind(controller.signal);
    controller.signal.removeEventListener = ((...args: Parameters<typeof origRemove>) => {
      removed++;
      return origRemove(...args);
    }) as typeof origRemove;

    const gen = mod.stream("bar", { x: 1 }, { signal: controller.signal });

    let thrown: Error | null = null;
    try {
      await gen.next();
    } catch (err) {
      thrown = err as Error;
    }
    expect(thrown?.message).toBe("serialize boom");

    expect(internals._pendingStreams.size).toBe(0);
    expect(removed).toBeGreaterThan(0);
  });

  it("regression guard: a successful send still resolves with the response", async () => {
    const mod = new Module("worker")
      .executable("bun", ["w.ts"])
      .requestTimeout(1000)
      .method("foo", { response: "result", codec: msgpackCodec });

    mod._setState("ready");
    mod._attachSchema({
      methods: { foo: { id: 1, response: "result" } },
      events: {},
    });

    const written: Buffer[] = [];
    mod._attachDataChannel({
      write: (data: Buffer) => {
        written.push(Buffer.from(data));
        return data.length;
      },
      end: () => {},
    } as never);

    const internals = mod as unknown as {
      _handleResponse(header: unknown, frame: unknown): void;
      _onSocketData(data: Buffer): void;
    };

    const sendPromise = mod.send("foo", { q: 1 });
    await waitFor(() => written.length > 0, 1000);

    // Simulate the child's response: IS_RESPONSE | DIRECTION_TO_PARENT
    const { buildFrame, Flags } = await import("@procwire/protocol");
    const requestId = 1;
    const response = buildFrame(
      { methodId: 1, flags: Flags.IS_RESPONSE | Flags.DIRECTION_TO_PARENT, requestId },
      msgpackCodec.serialize({ ok: true }),
    );
    internals._onSocketData(response);

    const result = (await sendPromise) as { ok: boolean };
    expect(result.ok).toBe(true);
  });
});
