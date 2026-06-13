/**
 * Node Client adapter — socket hygiene (Workstream C.3).
 *
 * Over a real unix-domain server:
 *  - a stale socket file from a crashed predecessor is removed before listen;
 *  - the listener is closed after the single parent connects (a second connect
 *    is refused);
 *  - the socket file is removed on shutdown().
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { createConnection } from "node:net";
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { EventEmitter, once } from "node:events";
import { buildFrame, AUTH_METHOD_ID } from "@procwire/protocol";
import { msgpackCodec } from "@procwire/codecs";
import type { ClientOptions } from "@procwire/runtime-core";
import { Client } from "../src/client.js";

const SKIP = process.platform === "win32";

/**
 * Minimal net.Socket stand-in: an EventEmitter with the surface NodeSocketTransport
 * touches (cork/uncork/write/pause/resume/destroy + writableNeedDrain). Lets a
 * test drive the adapter's connection handlers with an exact, deterministic
 * event order instead of racing real sockets.
 */
interface FakeSocket extends EventEmitter {
  write: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  cork: ReturnType<typeof vi.fn>;
  uncork: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  destroyed: boolean;
  writableNeedDrain: boolean;
}

function createFakeSocket(): FakeSocket {
  const s = new EventEmitter() as FakeSocket;
  s.write = vi.fn().mockReturnValue(true);
  s.destroy = vi.fn();
  s.cork = vi.fn();
  s.uncork = vi.fn();
  s.pause = vi.fn();
  s.resume = vi.fn();
  s.destroyed = false;
  s.writableNeedDrain = false;
  return s;
}

/** Client pinned to a known socket path with the stdin reader disabled. */
class TestClient extends Client {
  constructor(
    private readonly _path: string,
    options?: ClientOptions,
  ) {
    super(options);
  }
  protected override _generatePipePath(): string {
    return this._path;
  }
  // Don't attach to process.stdin in the worker.
  protected override _startControlReader(): void {}
}

describe.skipIf(SKIP)("Client: socket hygiene (Workstream C.3)", () => {
  const clients: Client[] = [];
  let restoreStdout: (() => void) | null = null;

  afterEach(async () => {
    for (const c of clients) await c.shutdown();
    clients.length = 0;
    restoreStdout?.();
    restoreStdout = null;
  });

  function makeClient(path: string, options?: ClientOptions): TestClient {
    if (!restoreStdout) {
      // start() writes $init to stdout - swallow it for the duration of the test.
      const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      restoreStdout = () => spy.mockRestore();
    }
    const client = new TestClient(path, options).handle("echo", async (data, ctx) => {
      await ctx.respond(data);
    });
    clients.push(client);
    return client;
  }

  it("creates the socket file on start and removes it on shutdown", async () => {
    const path = join(tmpdir(), `pw-hygiene-${randomBytes(6).toString("hex")}.sock`);
    const client = makeClient(path);

    await client.start();
    expect(existsSync(path)).toBe(true);

    await client.shutdown();
    expect(existsSync(path)).toBe(false);
  });

  it("removes a stale socket file left by a crashed predecessor before listening", async () => {
    const path = join(tmpdir(), `pw-stale-${randomBytes(6).toString("hex")}.sock`);
    // A leftover regular file at the path would make listen() fail with EADDRINUSE.
    writeFileSync(path, "stale");
    expect(existsSync(path)).toBe(true);

    const client = makeClient(path);
    await expect(client.start()).resolves.toBeUndefined();
    expect(existsSync(path)).toBe(true); // now it's the live socket
  });

  it("closes the listener after the single parent connects", async () => {
    const path = join(tmpdir(), `pw-listener-${randomBytes(6).toString("hex")}.sock`);
    const client = makeClient(path);
    await client.start();

    // First connection is adopted (no auth) -> the listener closes.
    const first = createConnection(path);
    await once(first, "connect");

    // Give the adopt hook a tick to run server.close().
    await new Promise((r) => setTimeout(r, 50));

    // A second connection must fail: the listener is gone. Node tears down the
    // unix socket file when it stops listening, so the error is ENOENT (file
    // already removed) or ECONNREFUSED (file present, nobody accepting) - either
    // proves no second client can be adopted.
    const second = createConnection(path);
    const [err] = (await once(second, "error")) as [NodeJS.ErrnoException];
    expect(["ENOENT", "ECONNREFUSED"]).toContain(err.code);

    first.destroy();
    second.destroy();
  });

  // Regression (deterministic, via fake sockets so the event order is exact):
  // with auth on, a rejected pre-auth connection clears the shared transport so
  // the real parent can be accepted before the rejected socket's async `close`
  // fires. The Node per-socket handlers must be identity-scoped, or that stale
  // close runs _handleDisconnect() against the freshly authenticated parent and
  // tears it down.
  it("a rejected pre-auth connection's late close must not tear down the authenticated parent", () => {
    const token = "regression-token-" + randomBytes(4).toString("hex");
    // No real server needed: drive _handleConnection directly with fake sockets.
    const client = makeClient("/unused.sock", { authToken: token });
    const internals = client as unknown as {
      _handleConnection(socket: FakeSocket): void;
      _methodNameToId: Map<string, number>;
      _methodIdToName: Map<number, string>;
      _socket: unknown;
    };
    internals._methodNameToId.set("echo", 1);
    internals._methodIdToName.set(1, "echo");

    let disconnected = false;
    client.on("disconnected", () => {
      disconnected = true;
    });

    // 1. A stray connection is accepted (auth pending).
    const stray = createFakeSocket();
    internals._handleConnection(stray);
    expect(internals._socket).toBe(stray);

    // 2. Its first frame is NOT the AUTH frame -> the auth gate drops it. The
    //    shared transport is cleared (slot freed) and the socket is destroyed,
    //    but its `close` event has not fired yet.
    stray.emit(
      "data",
      buildFrame({ methodId: 1, flags: 0, requestId: 1 }, msgpackCodec.serialize({})),
    );
    expect(stray.destroy).toHaveBeenCalled();

    // 3. The real parent connects into the freed slot and authenticates.
    const parent = createFakeSocket();
    internals._handleConnection(parent);
    expect(internals._socket).toBe(parent);
    parent.emit(
      "data",
      buildFrame({ methodId: AUTH_METHOD_ID, flags: 0, requestId: 0 }, Buffer.from(token, "utf8")),
    );
    expect(client.connected).toBe(true);

    // 4. NOW the stray's late close fires - it must be ignored (identity-scoped),
    //    not tear down the adopted parent.
    stray.emit("close");

    expect(disconnected).toBe(false);
    expect(internals._socket).toBe(parent);
    expect(client.connected).toBe(true);

    // The authenticated parent's own close still tears its session down.
    parent.emit("close");
    expect(disconnected).toBe(true);
  });
});
