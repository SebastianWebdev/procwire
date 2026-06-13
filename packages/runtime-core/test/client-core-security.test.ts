/**
 * ClientCore security hardening (Workstream C), tested against a fake transport.
 *
 * Pins the two child-side guarantees:
 *  - the data-plane socket path is unguessable (crypto, not Math.random) and
 *    lands in a per-user runtime dir;
 *  - when a token is configured, a connection is held until its FIRST frame
 *    proves the token, and only then adopted (a mismatch / non-auth first frame
 *    drops the connection without poisoning the single-parent slot).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { buildFrame, AUTH_METHOD_ID } from "@procwire/protocol";
import { msgpackCodec } from "@procwire/codecs";
import { ClientCore } from "../src/client-core.js";
import type { ClientOptions } from "../src/client-types.js";
import { FakeTransport } from "./fake-transport.js";

/** Concrete ClientCore exposing the protected entry points + adoption count. */
class TestClient extends ClientCore {
  adoptCount = 0;

  protected _createPipeServer(_pipePath: string): Promise<void> {
    return Promise.resolve();
  }
  protected _startControlReader(): void {}
  protected _stopControlReader(): void {}
  protected _closeServer(): void {}
  protected override _onConnectionAdopted(): void {
    this.adoptCount++;
  }

  accept(transport: FakeTransport): boolean {
    return this._acceptConnection(transport);
  }
  data(chunk: Buffer): void {
    this._handleTransportData(chunk);
  }
  disconnect(): void {
    this._handleDisconnect();
  }
  pipePath(): string {
    return this._generatePipePath();
  }
}

function makeClient(options?: ClientOptions): TestClient {
  return new TestClient(options).handle("echo", async (data, ctx) => {
    await ctx.respond(data);
  }) as TestClient;
}

/** start() assigns method ids; swallow the $init line it writes to stdout. */
async function started(client: TestClient): Promise<TestClient> {
  const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  await client.start();
  spy.mockRestore();
  return client;
}

function authFrame(token: string): Buffer {
  return buildFrame(
    { methodId: AUTH_METHOD_ID, flags: 0, requestId: 0 },
    Buffer.from(token, "utf8"),
  );
}

function requestFrame(methodId: number, requestId: number, data: unknown): Buffer {
  return buildFrame({ methodId, flags: 0, requestId }, msgpackCodec.serialize(data));
}

describe("ClientCore: socket path generation (Workstream C.1)", () => {
  const ORIG = {
    XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR,
    TMPDIR: process.env.TMPDIR,
  };

  afterEach(() => {
    process.env.XDG_RUNTIME_DIR = ORIG.XDG_RUNTIME_DIR;
    process.env.TMPDIR = ORIG.TMPDIR;
    vi.restoreAllMocks();
    if (ORIG.XDG_RUNTIME_DIR === undefined) delete process.env.XDG_RUNTIME_DIR;
    if (ORIG.TMPDIR === undefined) delete process.env.TMPDIR;
  });

  it("uses a crypto RNG, not Math.random (paths differ even under a fixed seed)", () => {
    // Pin Math.random to a constant: a Math.random-derived id would now repeat.
    vi.spyOn(Math, "random").mockReturnValue(0.42);
    const client = makeClient();

    const a = client.pipePath();
    const b = client.pipePath();

    expect(a).not.toBe(b);
  });

  it.skipIf(process.platform === "win32")(
    "honors XDG_RUNTIME_DIR for the per-user runtime dir",
    () => {
      process.env.XDG_RUNTIME_DIR = "/run/user/4242";
      delete process.env.TMPDIR;
      const path = makeClient().pipePath();

      expect(path.startsWith("/run/user/4242/procwire-")).toBe(true);
      expect(path.endsWith(".sock")).toBe(true);
      expect(path).toContain(`-${process.pid}-`);
    },
  );

  it.skipIf(process.platform === "win32")("falls back to TMPDIR, then /tmp", () => {
    delete process.env.XDG_RUNTIME_DIR;
    process.env.TMPDIR = "/custom/tmp/";
    expect(makeClient().pipePath().startsWith("/custom/tmp/procwire-")).toBe(true);

    delete process.env.TMPDIR;
    expect(makeClient().pipePath().startsWith("/tmp/procwire-")).toBe(true);
  });

  it.skipIf(process.platform !== "win32")("uses the Windows named-pipe namespace", () => {
    expect(makeClient().pipePath().startsWith("\\\\.\\pipe\\procwire-")).toBe(true);
  });
});

describe("ClientCore: data-plane auth gate (Workstream C.2)", () => {
  it("adopts on accept when no token is configured (backward compatible)", async () => {
    const client = await started(makeClient());
    const transport = new FakeTransport();

    expect(client.accept(transport)).toBe(true);
    expect(client.adoptCount).toBe(1);

    // A normal request is handled immediately, no auth needed.
    client.data(requestFrame(1, 7, { hi: 1 }));
    await vi.waitFor(() => expect(transport.frames).toHaveLength(1));
    expect(msgpackCodec.deserialize(transport.frames[0]!.payload)).toEqual({ hi: 1 });
  });

  it("defers adoption until a matching AUTH frame arrives, then handles requests", async () => {
    const client = await started(makeClient({ authToken: "s3cret-token" }));
    const transport = new FakeTransport();

    expect(client.accept(transport)).toBe(true);
    // Pending: not adopted yet, the listener must stay open.
    expect(client.adoptCount).toBe(0);

    client.data(authFrame("s3cret-token"));
    expect(client.adoptCount).toBe(1);

    client.data(requestFrame(1, 9, { ok: true }));
    await vi.waitFor(() => expect(transport.frames).toHaveLength(1));
    expect(msgpackCodec.deserialize(transport.frames[0]!.payload)).toEqual({ ok: true });
  });

  it("drops a connection whose first frame is not the AUTH frame", () => {
    const client = makeClient({ authToken: "s3cret-token" });
    const transport = new FakeTransport();
    client.accept(transport);

    // A normal request as the first frame: rejected, never handled.
    client.data(requestFrame(1, 1, { sneaky: true }));

    expect(client.adoptCount).toBe(0);
    expect(transport.closeCount).toBe(1);
    expect(transport.frames).toHaveLength(0);
    // The single-parent slot is freed so the real parent can still connect.
    expect(client.accept(new FakeTransport())).toBe(true);
  });

  it("drops a connection presenting the wrong token", () => {
    const client = makeClient({ authToken: "s3cret-token" });
    const transport = new FakeTransport();
    client.accept(transport);

    client.data(authFrame("wrong-token"));

    expect(client.adoptCount).toBe(0);
    expect(transport.closeCount).toBe(1);
    expect(client.connected).toBe(false);
    expect(client.accept(new FakeTransport())).toBe(true);
  });

  it("does not emit 'disconnected' when an un-adopted (pending) connection drops", () => {
    const client = makeClient({ authToken: "s3cret-token" });
    const disconnected = vi.fn();
    client.on("disconnected", disconnected);

    client.accept(new FakeTransport());
    client.disconnect(); // socket closed before authenticating

    expect(disconnected).not.toHaveBeenCalled();
    // Slot freed.
    expect(client.accept(new FakeTransport())).toBe(true);
  });

  it("falls back to PROCWIRE_TOKEN from the environment", () => {
    const prev = process.env.PROCWIRE_TOKEN;
    process.env.PROCWIRE_TOKEN = "env-token";
    try {
      const client = makeClient();
      const transport = new FakeTransport();
      client.accept(transport);
      // Auth required (from env): a non-auth first frame is dropped.
      client.data(requestFrame(1, 1, {}));
      expect(transport.closeCount).toBe(1);
      expect(client.adoptCount).toBe(0);
    } finally {
      if (prev === undefined) delete process.env.PROCWIRE_TOKEN;
      else process.env.PROCWIRE_TOKEN = prev;
    }
  });

  it("does not dispatch a request batched after a failed-auth frame in the same chunk", async () => {
    let handled = false;
    const client = (await started(
      new TestClient({ authToken: "s3cret-token" }).handle("echo", async (data, ctx) => {
        handled = true;
        await ctx.respond(data);
      }) as TestClient,
    )) as TestClient;
    const transport = new FakeTransport();
    client.accept(transport);

    // One packet: a bad-auth frame followed by a valid request. The drop must
    // halt processing of the rest of the batch, so the request never runs.
    client.data(Buffer.concat([authFrame("wrong"), requestFrame(1, 5, { x: 1 })]));

    expect(handled).toBe(false);
    expect(client.adoptCount).toBe(0);
    expect(transport.closeCount).toBe(1);
  });

  it("still processes a request batched after a VALID auth frame in the same chunk", async () => {
    let handled = false;
    const client = (await started(
      new TestClient({ authToken: "s3cret-token" }).handle("echo", async (data, ctx) => {
        handled = true;
        await ctx.respond(data);
      }) as TestClient,
    )) as TestClient;
    const transport = new FakeTransport();
    client.accept(transport);

    // The legit fast path: AUTH + first request in one packet -> adopt AND serve.
    client.data(Buffer.concat([authFrame("s3cret-token"), requestFrame(1, 6, { y: 2 })]));

    await vi.waitFor(() => expect(transport.frames).toHaveLength(1));
    expect(handled).toBe(true);
    expect(client.adoptCount).toBe(1);
    expect(msgpackCodec.deserialize(transport.frames[0]!.payload)).toEqual({ y: 2 });
  });
});
