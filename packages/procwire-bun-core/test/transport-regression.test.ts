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
import { BunDrainWaiter } from "@procwire/protocol";

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
    const socket = {
      write: (data: Buffer) => {
        written.push(Buffer.from(data));
        return data.length;
      },
      end: () => {},
    };
    mod._attachDataChannel(socket as never);

    const internals = mod as unknown as {
      _handleResponse(header: unknown, frame: unknown): void;
      _onSocketData(socket: unknown, data: Buffer): void;
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
    internals._onSocketData(socket, response);

    const result = (await sendPromise) as { ok: boolean };
    expect(result.ok).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bug W2 (bun-core): writeAll must serialize concurrent senders.
//
// A partial write suspends at waitForDrain() mid-frame. Without a write
// queue, a concurrently submitted frame slips between the written prefix
// and the pending tail: prefix(A) + frame(B) + tail(A) -> corrupted framing.
// (Found by Codex review on PR #49.)
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug W2 (bun-core): concurrent writeAll calls must not interleave frames", () => {
  it("keeps frames contiguous when a second send is submitted mid-partial-write", async () => {
    const { buildFrame } = await import("@procwire/protocol");

    const wire: Buffer[] = [];
    // First write: accept only half (forces the sender to suspend on drain).
    // Every later write: accept fully (simulates capacity freed by the
    // receiver between the partial write and the drain event).
    let firstWrite = true;
    const socket = {
      write(d: Buffer): number {
        if (firstWrite) {
          firstWrite = false;
          const n = Math.floor(d.length / 2);
          wire.push(Buffer.from(d.subarray(0, n)));
          return n;
        }
        wire.push(Buffer.from(d));
        return d.length;
      },
    };

    const waiter = new BunDrainWaiter();
    const frameA = buildFrame({ methodId: 1, flags: 0, requestId: 1 }, Buffer.alloc(100, 0xaa));
    const frameB = buildFrame({ methodId: 2, flags: 0, requestId: 2 }, Buffer.alloc(20, 0xbb));

    const pA = waiter.writeAll(socket, frameA);
    const pB = waiter.writeAll(socket, frameB); // submitted while A is mid-frame

    // Let both calls reach their suspension/queue points, then release drain.
    await new Promise((r) => setTimeout(r, 10));
    waiter.onDrain();
    await Promise.all([pA, pB]);

    const frames = new FrameBuffer().push(Buffer.concat(wire));
    expect(frames.length).toBe(2);
    expect(frames[0]!.header.methodId).toBe(1);
    expect(frames[0]!.payload.equals(Buffer.alloc(100, 0xaa))).toBe(true);
    expect(frames[1]!.header.methodId).toBe(2);
    expect(frames[1]!.payload.equals(Buffer.alloc(20, 0xbb))).toBe(true);
  });

  it("keeps frames intact when two real concurrent sends hit backpressure", async () => {
    const path = tmpSock();
    const received: Buffer[] = [];
    let receivedBytes = 0;
    let receiverSocket: { resume(): void } | null = null;
    const resumeReceiver = (): void => {
      receiverSocket?.resume();
    };

    const server = Bun.listen({
      unix: path,
      socket: {
        open(socket) {
          receiverSocket = socket as unknown as { pause(): void; resume(): void };
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
      const payloadA = Buffer.alloc(2 * 1024 * 1024, 0xa1);
      const payloadB = Buffer.alloc(2 * 1024 * 1024, 0xb2);

      const mod = new Module("worker").executable("bun", ["w.ts"]).method("foo");
      const internals = mod as unknown as SendInternals;
      internals._socket = sender as BunSocket;
      internals._drainWaiter = waiter;

      const resumeTimer = setTimeout(resumeReceiver, 200);

      // Two sends racing on the same socket under backpressure.
      await Promise.all([
        internals._sendFrame(7, 1, payloadA, rawCodec),
        internals._sendFrame(8, 2, payloadB, rawCodec),
      ]);

      const expectedTotal = 2 * (11 + payloadA.length);
      await waitFor(() => receivedBytes >= expectedTotal, 8000);
      clearTimeout(resumeTimer);
      resumeReceiver();

      expect(receivedBytes).toBe(expectedTotal);

      // Both frames must parse cleanly (any order) - interleaving would
      // desync the FrameBuffer and fail these assertions.
      const frames = new FrameBuffer({ maxPayloadSize: 64 * 1024 * 1024 }).push(
        Buffer.concat(received),
      );
      expect(frames.length).toBe(2);
      const byMethod = new Map(frames.map((f) => [f.header.methodId, f]));
      expect(byMethod.get(7)!.payload.equals(payloadA)).toBe(true);
      expect(byMethod.get(8)!.payload.equals(payloadB)).toBe(true);
    } finally {
      sender.end();
      server.stop(true);
      try {
        unlinkSync(path);
      } catch {
        /* already removed */
      }
    }
  }, 20000);
});

// ═══════════════════════════════════════════════════════════════════════════
// Bug W5 (bun-core): Bun.connect() was called without await/catch and without
// a connectError handler. Per Bun's docs, a failed connect then lands in the
// unhandled promise rejection queue - which terminates the process by
// default - instead of rejecting connectDataChannel cleanly.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug W5 (bun-core): failed data-channel connect must reject cleanly", () => {
  it("rejects with dataChannelFailed and leaves no unhandled rejection", async () => {
    const { ModuleManager } = await import("../src/index.js");

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);

    try {
      const manager = new ModuleManager();
      const fakeModule = {
        _onSocketData() {},
        _onSocketError() {},
        _onSocketClose() {},
        _onSocketDrain() {},
      };
      const api = manager as unknown as {
        connectDataChannel(m: unknown, p: string, t?: number): Promise<unknown>;
      };

      let thrown: Error | null = null;
      try {
        await api.connectDataChannel(fakeModule, tmpSock(), 1000);
      } catch (err) {
        thrown = err as Error;
      }
      expect(thrown).not.toBeNull();

      // Give a queued unhandled rejection time to surface.
      await new Promise((r) => setTimeout(r, 100));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bug W8 (bun-core): the socket handlers installed by connectDataChannel
// delegate to Module shims with NO socket identity. After a crash + restart,
// a late close/data/drain from the OLD socket hits the NEW connection's
// state: _onSocketClose flips a freshly-ready module to "disconnected", and
// _onSocketData feeds stale bytes into the new FrameBuffer. (Node fixed this
// as Bug C8; the port was missing.)
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug W8 (bun-core): late events from a previous socket must be ignored", () => {
  function readySocketModule(): { mod: Module; active: { write(d: Buffer): number } } {
    const mod = new Module("worker").executable("bun", ["w.ts"]).method("foo");
    mod._setState("ready");
    mod._attachSchema({ methods: { foo: { id: 1, response: "result" } }, events: {} });
    const active = { write: (d: Buffer): number => d.length, end: (): void => {} };
    mod._attachDataChannel(active as never);
    return { mod, active };
  }

  it("a stale socket's close does not flip a freshly attached session to disconnected", () => {
    const { mod } = readySocketModule();
    const internals = mod as unknown as { _onSocketClose(socket: unknown): void };

    const staleSocket = { write: (d: Buffer): number => d.length, end: (): void => {} };
    internals._onSocketClose(staleSocket);

    expect(mod.state).toBe("ready");
  });

  it("a stale socket's data is not fed into the active FrameBuffer", () => {
    const { mod } = readySocketModule();
    const internals = mod as unknown as {
      _onSocketData(socket: unknown, data: Buffer): void;
      _frameBuffer: { bufferedBytes: number } | null;
    };

    const staleSocket = { write: (d: Buffer): number => d.length, end: (): void => {} };
    expect(() => internals._onSocketData(staleSocket, Buffer.alloc(5, 0x99))).not.toThrow();
    expect(internals._frameBuffer!.bufferedBytes).toBe(0);
  });

  it("the active socket's close still disconnects", () => {
    const { mod, active } = readySocketModule();
    const internals = mod as unknown as { _onSocketClose(socket: unknown): void };

    internals._onSocketClose(active);
    expect(mod.state).toBe("disconnected");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bug W1b (bun-core): the parent's receive path had no try/catch (port of the
// core W1 fix). An oversized/corrupt frame from the child threw out of the
// socket data handler and killed the parent supervisor.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug W1b (bun-core): malformed child frames must not crash the parent", () => {
  it("drops the connection instead of throwing on an oversized frame", async () => {
    const { encodeHeader } = await import("@procwire/protocol");

    const mod = new Module("worker").executable("bun", ["w.ts"]).method("foo");
    mod._setState("ready");
    mod._attachSchema({ methods: { foo: { id: 1, response: "result" } }, events: {} });

    let ended = 0;
    const active = {
      write: (d: Buffer): number => d.length,
      end: (): void => {
        ended++;
      },
    };
    mod._attachDataChannel(active as never);

    const internals = mod as unknown as { _onSocketData(socket: unknown, data: Buffer): void };
    const oversized = encodeHeader({
      methodId: 1,
      flags: 0,
      requestId: 1,
      payloadLength: 2 * 1024 * 1024 * 1024 - 1, // > default 1GB limit
    });

    expect(() => internals._onSocketData(active, oversized)).not.toThrow();
    expect(ended).toBe(1);
  });

  it("rejects the pending request instead of crashing on a corrupt response payload", async () => {
    const { buildFrame, Flags } = await import("@procwire/protocol");

    const mod = new Module("worker")
      .executable("bun", ["w.ts"])
      .requestTimeout(1000)
      .method("foo", { response: "result", codec: msgpackCodec });
    mod._setState("ready");
    mod._attachSchema({ methods: { foo: { id: 1, response: "result" } }, events: {} });
    const active = { write: (d: Buffer): number => d.length, end: (): void => {} };
    mod._attachDataChannel(active as never);

    const internals = mod as unknown as { _onSocketData(socket: unknown, data: Buffer): void };

    const sendPromise = mod.send("foo", { q: 1 });
    await new Promise((r) => setTimeout(r, 5));

    const corrupt = buildFrame(
      { methodId: 1, flags: Flags.IS_RESPONSE | Flags.DIRECTION_TO_PARENT, requestId: 1 },
      Buffer.from([0xc1]), // reserved msgpack byte -> decode throws
    );
    expect(() => internals._onSocketData(active, corrupt)).not.toThrow();

    let thrown: Error | null = null;
    try {
      await sendPromise;
    } catch (err) {
      thrown = err as Error;
    }
    expect(thrown).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Canary W6 (bun-core): static analysis suggested that after the $init
// handshake releases the stdout reader, an un-drained 64KB pipe would
// deadlock any child doing synchronous stdout writes (fs.writeSync here;
// print()/println!() in Python/Rust children). Empirically this does NOT
// reproduce on Bun >= 1.3: the runtime keeps pumping the pipe into the
// ReadableStream's internal queue even while no reader is attached. This
// end-to-end test (real ModuleManager spawn of a real bun-client child)
// pins that behavior down - if a future Bun changes the pumping semantics,
// this turns red and stdout draining must be added to the manager.
// ═══════════════════════════════════════════════════════════════════════════
describe("Canary W6 (bun-core): heavy sync stdout logging must not deadlock the child", () => {
  it("a child that logs heavily can still respond (no pipe deadlock)", async () => {
    const { ModuleManager } = await import("../src/index.js");

    const fixture = new URL("./fixtures/flood-child.ts", import.meta.url).pathname;
    const mod = new Module("flooder")
      .executable("bun", [fixture])
      .method("flood")
      .requestTimeout(8000);

    const manager = new ModuleManager();
    manager.register(mod);

    try {
      await manager.spawn("flooder");

      const result = (await mod.send("flood", {})) as { wrote: number };
      expect(result.wrote).toBe(300);
    } finally {
      await manager.shutdown();
    }
  }, 30000);
});
