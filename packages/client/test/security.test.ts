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
import { once } from "node:events";
import { Client } from "../src/client.js";

const SKIP = process.platform === "win32";

/** Client pinned to a known socket path with the stdin reader disabled. */
class TestClient extends Client {
  constructor(private readonly _path: string) {
    super();
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

  function makeClient(path: string): TestClient {
    if (!restoreStdout) {
      // start() writes $init to stdout - swallow it for the duration of the test.
      const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      restoreStdout = () => spy.mockRestore();
    }
    const client = new TestClient(path).handle("echo", async (data, ctx) => {
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
});
