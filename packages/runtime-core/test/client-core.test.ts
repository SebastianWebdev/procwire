/**
 * ClientCore tested ONCE against a fake transport.
 *
 * Pins the shared child-side logic: handler dispatch, response flags,
 * single-parent connection guard, abort frames and disconnect teardown.
 */
import { describe, it, expect, vi } from "vitest";
import { buildFrame, encodeHeader, Flags, hasFlag, ABORT_METHOD_ID } from "@procwire/protocol";
import { msgpackCodec } from "@procwire/codecs";
import { ClientCore } from "../src/client-core.js";
import { FakeTransport } from "./fake-transport.js";

/** Minimal concrete ClientCore for tests - the runtime hooks are stubs. */
class TestClient extends ClientCore {
  protected _createPipeServer(_pipePath: string): Promise<void> {
    return Promise.resolve();
  }
  protected _startControlReader(): void {}
  protected _stopControlReader(): void {}
  protected _closeServer(): void {}

  // Re-expose the protected core entry points for the test harness.
  accept(transport: FakeTransport): boolean {
    return this._acceptConnection(transport);
  }
  data(chunk: Buffer): void {
    this._handleTransportData(chunk);
  }
  disconnect(): void {
    this._handleDisconnect();
  }
  controlLine(line: string): void {
    this._handleControlLine(line);
  }
}

function requestFrame(methodId: number, requestId: number, data: unknown): Buffer {
  return buildFrame({ methodId, flags: 0, requestId }, msgpackCodec.serialize(data));
}

async function startedClient(client: TestClient): Promise<TestClient> {
  // Swallow the $init control line (library writes go to process.stdout
  // directly - see D10).
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  await client.start();
  stdoutSpy.mockRestore();
  return client;
}

describe("ClientCore: dispatch", () => {
  it("routes a request to its handler and writes the response with IS_RESPONSE", async () => {
    const client = new TestClient().handle("echo", async (data, ctx) => {
      await ctx.respond(data);
    }) as TestClient;
    await startedClient(client);

    const transport = new FakeTransport();
    expect(client.accept(transport)).toBe(true);

    client.data(requestFrame(1, 7, { hello: "world" }));
    await vi.waitFor(() => expect(transport.frames).toHaveLength(1));

    const frame = transport.frames[0]!;
    expect(frame.header.requestId).toBe(7);
    expect(hasFlag(frame.header.flags, Flags.IS_RESPONSE)).toBe(true);
    expect(msgpackCodec.deserialize(frame.payload)).toEqual({ hello: "world" });
  });

  it("answers an unknown method id with an IS_ERROR response", async () => {
    const client = new TestClient().handle("known", () => {}) as TestClient;
    await startedClient(client);

    const transport = new FakeTransport();
    client.accept(transport);

    client.data(requestFrame(999, 3, {}));
    await vi.waitFor(() => expect(transport.frames).toHaveLength(1));

    expect(hasFlag(transport.frames[0]!.header.flags, Flags.IS_ERROR)).toBe(true);
  });

  it("turns a thrown handler error into an IS_ERROR response", async () => {
    const client = new TestClient().handle("boom", () => {
      throw new Error("handler boom");
    }) as TestClient;
    await startedClient(client);

    const transport = new FakeTransport();
    client.accept(transport);

    client.data(requestFrame(1, 5, {}));
    await vi.waitFor(() => expect(transport.frames).toHaveLength(1));

    const frame = transport.frames[0]!;
    expect(hasFlag(frame.header.flags, Flags.IS_ERROR)).toBe(true);
    expect(msgpackCodec.deserialize(frame.payload)).toBe("handler boom");
  });
});

describe("ClientCore: single-parent guard", () => {
  it("rejects a second connection while one is active", async () => {
    const client = await startedClient(new TestClient().handle("x", () => {}) as TestClient);

    expect(client.accept(new FakeTransport())).toBe(true);
    expect(client.accept(new FakeTransport())).toBe(false);
  });
});

describe("ClientCore: abort frames", () => {
  it("marks the context aborted and fires onAbort callbacks", async () => {
    let observedAbort = false;
    let ctxRef: { aborted: boolean } | null = null;

    const client = new TestClient().handle("slow", (_data, ctx) => {
      ctxRef = ctx;
      ctx.onAbort(() => {
        observedAbort = true;
      });
      // Never responds - waits for the abort.
      return new Promise<void>(() => {});
    }) as TestClient;
    await startedClient(client);

    const transport = new FakeTransport();
    client.accept(transport);

    client.data(requestFrame(1, 11, {}));
    client.data(
      Buffer.from(
        encodeHeader({ methodId: ABORT_METHOD_ID, flags: 0, requestId: 11, payloadLength: 0 }),
      ),
    );

    expect(observedAbort).toBe(true);
    expect(ctxRef!.aborted).toBe(true);
  });
});

describe("ClientCore: disconnect teardown", () => {
  it("aborts in-flight contexts, fires onAbort and emits 'disconnected'", async () => {
    let abortFired = false;
    let ctxRef: { aborted: boolean } | null = null;

    const client = new TestClient().handle("slow", (_data, ctx) => {
      ctxRef = ctx;
      ctx.onAbort(() => {
        abortFired = true;
      });
      return new Promise<void>(() => {});
    }) as TestClient;
    await startedClient(client);

    const transport = new FakeTransport();
    client.accept(transport);
    client.data(requestFrame(1, 21, {}));

    const disconnected = vi.fn();
    client.on("disconnected", disconnected);

    client.disconnect();

    expect(abortFired).toBe(true);
    expect(ctxRef!.aborted).toBe(true);
    expect(disconnected).toHaveBeenCalledTimes(1);
    expect(client.connected).toBe(false);
    // The transport's pending backpressure waiters were rejected.
    expect(transport.closeCount).toBe(1);
  });
});

describe("ClientCore: control plane (D10)", () => {
  it("D10: control-plane writes bypass a user-patched console.log", async () => {
    // User code routinely patches console.log (loggers, test frameworks,
    // silencers). The JSON-RPC control plane must not break because of it:
    // library writes go through process.stdout.write directly.
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const originalLog = console.log;
    console.log = () => {}; // a patched console that swallows everything
    try {
      const client = new TestClient().handle("x", () => {}) as TestClient;
      await client.start();

      const initLine = stdoutSpy.mock.calls
        .map((call) => String(call[0]))
        .find((line) => line.includes('"$init"'));
      expect(initLine).toBeDefined();
      expect(JSON.parse(initLine!.trim())).toMatchObject({ method: "$init" });

      client.controlLine(JSON.stringify({ jsonrpc: "2.0", method: "$ping" }));
      const pongLine = stdoutSpy.mock.calls
        .map((call) => String(call[0]))
        .find((line) => line.includes('"$pong"'));
      expect(pongLine).toBeDefined();
    } finally {
      console.log = originalLog;
      stdoutSpy.mockRestore();
    }
  });
});

describe("ClientCore: control plane", () => {
  it("answers $ping with $pong and shuts down on $shutdown", async () => {
    const client = await startedClient(new TestClient().handle("x", () => {}) as TestClient);

    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const shutdownSpy = vi.spyOn(client, "shutdown").mockResolvedValue(undefined);
    try {
      client.controlLine(JSON.stringify({ jsonrpc: "2.0", method: "$ping" }));
      expect(JSON.parse(String(stdoutSpy.mock.calls[0]![0]))).toMatchObject({ method: "$pong" });

      client.controlLine(JSON.stringify({ jsonrpc: "2.0", method: "$shutdown" }));
      expect(shutdownSpy).toHaveBeenCalledTimes(1);

      client.controlLine("not json");
      client.controlLine(JSON.stringify({ method: "$unknown" }));
      expect(stdoutSpy).toHaveBeenCalledTimes(1);
    } finally {
      shutdownSpy.mockRestore();
      stdoutSpy.mockRestore();
    }
  });
});
