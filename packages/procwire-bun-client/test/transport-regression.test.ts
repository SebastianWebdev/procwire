/**
 * Transport-level regression tests (bun-client), run against REAL Bun sockets.
 *
 * Each `describe` targets ONE bug: written to FAIL against the buggy code and
 * PASS once the fix is applied.
 */
import { describe, it, expect } from "bun:test";
import { unlinkSync } from "node:fs";
import { FrameBuffer, buildFrame, Flags, hasFlag } from "@procwire/protocol";
import type { Frame } from "@procwire/protocol";
import { rawCodec, msgpackCodec } from "@procwire/codecs";
import { Client } from "../src/index.js";
import { RequestContextImpl } from "../src/request-context.js";
import { BunDrainWaiter } from "../src/drain-waiter.js";

type BunSocket = Awaited<ReturnType<typeof Bun.connect>>;

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
// Bug W1 (bun-client): every response path (respond/ack/chunk/end/error and
// event emission) treated Bun's numeric socket.write() return as a boolean.
// A partial write dropped the frame tail and desynced the parent's framing.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug W1 (bun-client): partial socket writes must not drop response tails", () => {
  it("delivers a complete 4MB response through a real socket under receiver backpressure", async () => {
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
      for (let i = 0; i < payload.length; i++) payload[i] = (i * 7) % 251;

      const ctx = new RequestContextImpl(
        42,
        "bigResponse",
        7,
        rawCodec,
        sender as BunSocket,
        new Map(),
        () => Buffer.allocUnsafe(11),
        waiter,
      );

      const resumeTimer = setTimeout(resumeReceiver, 200);

      await ctx.respond(payload);

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
      expect(frames[0]!.header.requestId).toBe(42);
      expect(hasFlag(frames[0]!.header.flags, Flags.IS_RESPONSE)).toBe(true);
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
// Bug X1 (bun-client): Bun.listen uses ONE shared handler object for every
// connection, and the close/data/error handlers ignored WHICH socket fired.
// The client rejects a second (stray) connection with socket.end() - but the
// stray socket's close event then ran _onConnectionClose() against the ACTIVE
// session: _socket nulled, all in-flight contexts aborted, "disconnected"
// emitted. Any stray connect+close on the unix socket killed the live parent
// session.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug X1 (bun-client): a stray connection must not tear down the active session", () => {
  it("keeps the active parent session working after a stray connect/close", async () => {
    const path = tmpSock();

    const client = new Client().handle("echo", async (data, ctx) => {
      await ctx.respond(data);
    });

    const internals = client as unknown as {
      _methodNameToId: Map<string, number>;
      _methodIdToName: Map<number, string>;
      _createPipeServer(pipePath: string): Promise<void>;
      _socket: unknown;
      _server: { stop(force?: boolean): void } | null;
    };

    // Minimal start(): assign method ids and open the real pipe server,
    // without the stdin control reader.
    internals._methodNameToId.set("echo", 1);
    internals._methodIdToName.set(1, "echo");
    await internals._createPipeServer(path);

    let disconnectedCount = 0;
    client.on("disconnected", () => {
      disconnectedCount++;
    });

    const responses: Frame[] = [];
    const parentBuffer = new FrameBuffer();
    let strayClosed = false;

    const parent = await Bun.connect({
      unix: path,
      socket: {
        data(_socket, data: Buffer) {
          responses.push(...parentBuffer.push(Buffer.from(data)));
        },
        error() {},
        close() {},
        drain() {},
      },
    });

    try {
      // The parent connection is adopted as the active session.
      expect(await waitFor(() => internals._socket !== null, 2000)).toBe(true);

      // A stray client connects; the Client rejects it with end(). Its close
      // event must NOT tear down the active parent session.
      await Bun.connect({
        unix: path,
        socket: {
          data() {},
          error() {},
          close() {
            strayClosed = true;
          },
          drain() {},
        },
      });

      await waitFor(() => strayClosed, 2000);
      // Give the server-side close handler time to run.
      await new Promise((r) => setTimeout(r, 150));

      expect(disconnectedCount).toBe(0);
      expect(internals._socket).not.toBeNull();

      // The active session must still work end-to-end.
      const request = buildFrame(
        { methodId: 1, flags: 0, requestId: 77 },
        msgpackCodec.serialize({ hello: "world" }),
      );
      parent.write(request);

      expect(await waitFor(() => responses.length > 0, 2000)).toBe(true);
      const response = responses[0]!;
      expect(response.header.requestId).toBe(77);
      expect(hasFlag(response.header.flags, Flags.IS_RESPONSE)).toBe(true);
      expect(msgpackCodec.deserialize(response.payload)).toEqual({ hello: "world" });
    } finally {
      parent.end();
      internals._server?.stop(true);
      try {
        unlinkSync(path);
      } catch {
        /* already removed */
      }
    }
  }, 15000);

  it("ignores stray-socket data so it cannot poison the active session's framing", async () => {
    const path = tmpSock();

    const client = new Client().handle("echo", async (data, ctx) => {
      await ctx.respond(data);
    });

    const internals = client as unknown as {
      _methodNameToId: Map<string, number>;
      _methodIdToName: Map<number, string>;
      _createPipeServer(pipePath: string): Promise<void>;
      _socket: unknown;
      _server: { stop(force?: boolean): void } | null;
    };

    internals._methodNameToId.set("echo", 1);
    internals._methodIdToName.set(1, "echo");
    await internals._createPipeServer(path);

    const responses: Frame[] = [];
    const parentBuffer = new FrameBuffer();

    const parent = await Bun.connect({
      unix: path,
      socket: {
        data(_socket, data: Buffer) {
          responses.push(...parentBuffer.push(Buffer.from(data)));
        },
        error() {},
        close() {},
        drain() {},
      },
    });

    try {
      expect(await waitFor(() => internals._socket !== null, 2000)).toBe(true);

      // The stray connection races garbage bytes against the server's end().
      // Identity checks must keep those bytes out of the active FrameBuffer.
      const stray = await Bun.connect({
        unix: path,
        socket: {
          open(socket) {
            // Half a header: if this reaches the active session's
            // FrameBuffer, all subsequent parsing desyncs.
            (socket as unknown as { write(d: Buffer): number }).write(
              Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]),
            );
          },
          data() {},
          error() {},
          close() {},
          drain() {},
        },
      });

      await new Promise((r) => setTimeout(r, 150));

      // The active session must still round-trip cleanly.
      const request = buildFrame(
        { methodId: 1, flags: 0, requestId: 88 },
        msgpackCodec.serialize({ ping: 1 }),
      );
      parent.write(request);

      expect(await waitFor(() => responses.length > 0, 2000)).toBe(true);
      expect(responses[0]!.header.requestId).toBe(88);
      expect(msgpackCodec.deserialize(responses[0]!.payload)).toEqual({ ping: 1 });

      stray.end();
    } finally {
      parent.end();
      internals._server?.stop(true);
      try {
        unlinkSync(path);
      } catch {
        /* already removed */
      }
    }
  }, 15000);
});

// ═══════════════════════════════════════════════════════════════════════════
// Bug W2 (bun-client): writeAll must serialize concurrent senders.
//
// A partial write suspends at waitForDrain() mid-frame. Without a write
// queue, a concurrently submitted frame (e.g. a response racing an event
// emission on the shared socket) slips between the written prefix and the
// pending tail and corrupts the framing. (Found by Codex review on PR #49.)
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug W2 (bun-client): concurrent writeAll calls must not interleave frames", () => {
  it("keeps frames contiguous when a second send is submitted mid-partial-write", async () => {
    const wire: Buffer[] = [];
    let firstWrite = true;
    const socket = {
      write(d: Buffer): number {
        if (firstWrite) {
          firstWrite = false;
          const n = Math.floor(d.length / 2);
          wire.push(Buffer.from(d.subarray(0, n)));
          return n; // partial: sender must suspend and retry the tail
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
});

// ═══════════════════════════════════════════════════════════════════════════
// Bug W7 (bun-client): the control reader used for-await over
// Bun.stdin.stream(), so the SUSPENDED read kept the event loop alive and
// the "stopped" flag only took effect when the next chunk arrived - i.e.
// never, once the parent had said its last word. Every graceful shutdown
// therefore cost the parent's full force-kill grace period plus a signal.
// EOF handling was also missing: a dead parent left the child orphaned
// (Node fixed that as Bug W3).
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug W7 (bun-client): the stdin reader must not pin the child's event loop", () => {
  function makeControlStream(): {
    stream: ReadableStream<Uint8Array>;
    push(s: string): void;
    close(): void;
    cancelled(): boolean;
  } {
    let ctrl: ReadableStreamDefaultController<Uint8Array> | null = null;
    let wasCancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        ctrl = c;
      },
      cancel() {
        wasCancelled = true;
      },
    });
    return {
      stream,
      push: (s: string) => ctrl!.enqueue(new TextEncoder().encode(s)),
      close: () => ctrl!.close(),
      cancelled: () => wasCancelled,
    };
  }

  interface ReaderInternals {
    _server: { stop(force?: boolean): void } | null;
    _socket: unknown;
    _startControlReader(input?: ReadableStream<Uint8Array>): Promise<void>;
    _sendControl(msg: unknown): void;
  }

  it("shutdown() cancels the pending stdin read so the loop can exit", async () => {
    const client = new Client();
    const internals = client as unknown as ReaderInternals;
    internals._server = { stop: () => {} };

    const cs = makeControlStream();
    const readerDone = internals._startControlReader(cs.stream);
    await new Promise((r) => setTimeout(r, 20));

    await client.shutdown();

    const outcome = await Promise.race([
      readerDone.then(() => "finished"),
      new Promise<string>((r) => setTimeout(() => r("hung"), 750)),
    ]);
    expect(outcome).toBe("finished");
    expect(cs.cancelled()).toBe(true);
  });

  it("EOF on the control stream shuts the child down (orphan prevention)", async () => {
    const client = new Client();
    const internals = client as unknown as ReaderInternals;
    let stopped = 0;
    internals._server = {
      stop: () => {
        stopped++;
      },
    };

    const cs = makeControlStream();
    const readerDone = internals._startControlReader(cs.stream);
    await new Promise((r) => setTimeout(r, 20));

    cs.close(); // parent died -> stdin EOF
    await Promise.race([readerDone, new Promise((r) => setTimeout(r, 750))]);

    expect(stopped).toBe(1);
  });

  it("parses control lines split across chunks (multi-byte safe)", async () => {
    const client = new Client();
    const internals = client as unknown as ReaderInternals;
    internals._server = { stop: () => {} };

    const sent: string[] = [];
    const origSend = internals._sendControl.bind(client);
    (client as unknown as { _sendControl(msg: unknown): void })._sendControl = (msg) => {
      sent.push(JSON.stringify(msg));
    };

    const cs = makeControlStream();
    const readerDone = internals._startControlReader(cs.stream);

    cs.push('{"jsonrpc":"2.0","method":"$pi');
    await new Promise((r) => setTimeout(r, 10));
    cs.push('ng"}\n');
    await new Promise((r) => setTimeout(r, 30));

    expect(sent.some((l) => l.includes("$pong"))).toBe(true);

    (client as unknown as { _sendControl(msg: unknown): void })._sendControl = origSend;
    await client.shutdown();
    await Promise.race([readerDone, new Promise((r) => setTimeout(r, 500))]);
  });
});
