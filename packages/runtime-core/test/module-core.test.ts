/**
 * ModuleCore tested ONCE against a fake transport.
 *
 * Per the Phase-4 plan (Workstream A2), the shared parent-side logic -
 * dispatch, correlation, stream backpressure, abort and detach semantics -
 * is pinned here, runtime-free. The Node/Bun packages only re-test their
 * adapters against real sockets.
 */
import { describe, it, expect, vi } from "vitest";
import { buildFrame, encodeHeader, Flags, ABORT_METHOD_ID } from "@procwire/protocol";
import { msgpackCodec } from "@procwire/codecs";
import { ModuleCore } from "../src/module-core.js";
import { FakeTransport } from "./fake-transport.js";

function setupReadyModule(opts: { cancellable?: boolean; response?: "result" | "ack" } = {}): {
  mod: ModuleCore;
  transport: FakeTransport;
} {
  const mod = new ModuleCore("worker").executable("node", ["w.js"]).method("foo", {
    response: opts.response ?? "result",
    codec: msgpackCodec,
    cancellable: opts.cancellable ?? false,
  }) as ModuleCore;
  mod._attachSchema({
    methods: { foo: { id: 1, response: opts.response ?? "result" } },
    events: {},
  });
  const transport = new FakeTransport();
  mod._attachTransport(transport);
  mod._setState("ready");
  return { mod, transport };
}

function respondTo(mod: ModuleCore, requestId: number, data: unknown, flags: number): void {
  mod._handleTransportData(
    buildFrame({ methodId: 1, flags, requestId }, msgpackCodec.serialize(data)),
  );
}

describe("ModuleCore: request/response correlation", () => {
  it("resolves send() with the deserialized response", async () => {
    const { mod, transport } = setupReadyModule();

    const pending = mod.send("foo", { q: 1 });
    expect(transport.frames).toHaveLength(1);
    const requestId = transport.frames[0]!.header.requestId;

    respondTo(mod, requestId, { ok: true }, Flags.IS_RESPONSE | Flags.DIRECTION_TO_PARENT);

    await expect(pending).resolves.toEqual({ ok: true });
  });

  it("rejects send() with the remote error payload", async () => {
    const { mod, transport } = setupReadyModule();

    const pending = mod.send("foo", {});
    const requestId = transport.frames[0]!.header.requestId;

    respondTo(
      mod,
      requestId,
      "remote boom",
      Flags.IS_RESPONSE | Flags.IS_ERROR | Flags.DIRECTION_TO_PARENT,
    );

    await expect(pending).rejects.toThrow("remote boom");
  });

  it("a 'result' method ignores a bare ACK and keeps waiting", async () => {
    const { mod, transport } = setupReadyModule({ response: "result" });

    const pending = mod.send("foo", {});
    const requestId = transport.frames[0]!.header.requestId;

    respondTo(mod, requestId, null, Flags.IS_RESPONSE | Flags.IS_ACK | Flags.DIRECTION_TO_PARENT);
    respondTo(mod, requestId, 42, Flags.IS_RESPONSE | Flags.DIRECTION_TO_PARENT);

    await expect(pending).resolves.toBe(42);
  });

  it("a corrupt response payload rejects THAT request without crashing the receive path", async () => {
    const bomb = {
      name: "bomb",
      serialize: (d: unknown) => msgpackCodec.serialize(d),
      deserialize: (): unknown => {
        throw new Error("decode boom");
      },
    };
    const mod = new ModuleCore("worker")
      .executable("node", ["w.js"])
      .method("foo", { codec: bomb }) as ModuleCore;
    mod._attachSchema({ methods: { foo: { id: 1, response: "result" } }, events: {} });
    const transport = new FakeTransport();
    mod._attachTransport(transport);
    mod._setState("ready");

    const pending = mod.send("foo", {});
    const requestId = transport.frames[0]!.header.requestId;

    expect(() =>
      respondTo(mod, requestId, {}, Flags.IS_RESPONSE | Flags.DIRECTION_TO_PARENT),
    ).not.toThrow();
    await expect(pending).rejects.toThrow("decode boom");
  });

  it("a failed send cleans its pending entry (no orphaned unhandled rejection)", async () => {
    const { mod, transport } = setupReadyModule();
    transport.failWith = new Error("write boom");

    await expect(mod.send("foo", {})).rejects.toThrow("write boom");

    const pendings = (mod as unknown as { _pendingRequests: Map<number, unknown> })
      ._pendingRequests;
    expect(pendings.size).toBe(0);
  });

  it("detach rejects every pending request with 'Module disconnected'", async () => {
    const { mod } = setupReadyModule();

    const pending = mod.send("foo", {});
    mod._detach();

    await expect(pending).rejects.toThrow("Module disconnected");
  });
});

describe("ModuleCore: abort", () => {
  it("sends an ABORT frame and rejects with AbortError when the signal fires", async () => {
    const { mod, transport } = setupReadyModule({ cancellable: true });
    const controller = new AbortController();

    const pending = mod.send("foo", {}, { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toThrow("Aborted");
    // request frame + abort frame
    expect(transport.frames).toHaveLength(2);
    expect(transport.frames[1]!.header.methodId).toBe(ABORT_METHOD_ID);
  });
});

describe("ModuleCore: streams", () => {
  function setupStreamModule(): { mod: ModuleCore; transport: FakeTransport } {
    const mod = new ModuleCore("worker")
      .executable("node", ["w.js"])
      .method("st", { response: "stream", codec: msgpackCodec }) as ModuleCore;
    mod._attachSchema({ methods: { st: { id: 1, response: "stream" } }, events: {} });
    const transport = new FakeTransport();
    mod._attachTransport(transport);
    mod._setState("ready");
    return { mod, transport };
  }

  function chunkTo(mod: ModuleCore, requestId: number, data: unknown): void {
    mod._handleTransportData(
      buildFrame(
        {
          methodId: 1,
          flags: Flags.IS_RESPONSE | Flags.IS_STREAM | Flags.DIRECTION_TO_PARENT,
          requestId,
        },
        msgpackCodec.serialize(data),
      ),
    );
  }

  function endStream(mod: ModuleCore, requestId: number): void {
    mod._handleTransportData(
      Buffer.from(
        encodeHeader({
          methodId: 1,
          flags: Flags.IS_RESPONSE | Flags.IS_STREAM | Flags.STREAM_END | Flags.DIRECTION_TO_PARENT,
          requestId,
          payloadLength: 0,
        }),
      ),
    );
  }

  it("yields chunks in order and finishes on STREAM_END", async () => {
    const { mod, transport } = setupStreamModule();

    const gen = mod.stream("st", {});
    const first = gen.next();
    await vi.waitFor(() => expect(transport.frames.length).toBe(1));
    const requestId = transport.frames[0]!.header.requestId;

    chunkTo(mod, requestId, "a");
    chunkTo(mod, requestId, "b");
    endStream(mod, requestId);

    expect((await first).value).toBe("a");
    expect((await gen.next()).value).toBe("b");
    expect((await gen.next()).done).toBe(true);
  });

  it("pauses the transport past the high-water mark and resumes after draining", async () => {
    const { mod, transport } = setupStreamModule();

    const gen = mod.stream("st", {});
    // Start the generator so the request frame is written.
    const first = gen.next();
    await vi.waitFor(() => expect(transport.frames.length).toBe(1));
    const requestId = transport.frames[0]!.header.requestId;

    // Flood past the HWM (256) while the consumer is NOT pulling.
    chunkTo(mod, requestId, 0); // consumed by `first`
    for (let i = 1; i <= 300; i++) {
      chunkTo(mod, requestId, i);
    }
    expect(transport.pauseCount).toBe(1);
    expect(transport.resumeCount).toBe(0);

    endStream(mod, requestId);

    // Drain everything; crossing the LWM must resume the transport.
    await first;
    let done = false;
    while (!done) {
      done = Boolean((await gen.next()).done);
    }
    expect(transport.resumeCount).toBe(1);
  });

  it("errors the stream when the child sends an error frame", async () => {
    const { mod, transport } = setupStreamModule();

    const gen = mod.stream("st", {});
    const first = gen.next();
    await vi.waitFor(() => expect(transport.frames.length).toBe(1));
    const requestId = transport.frames[0]!.header.requestId;

    mod._handleTransportData(
      buildFrame(
        {
          methodId: 1,
          flags: Flags.IS_RESPONSE | Flags.IS_STREAM | Flags.IS_ERROR | Flags.DIRECTION_TO_PARENT,
          requestId,
        },
        msgpackCodec.serialize("stream boom"),
      ),
    );

    await expect(first).rejects.toThrow("stream boom");
  });
});

describe("ModuleCore: events", () => {
  it("dispatches child events to onEvent subscribers", () => {
    const mod = new ModuleCore("worker")
      .executable("node", ["w.js"])
      .method("foo")
      .event("progress") as ModuleCore;
    mod._attachSchema({
      methods: { foo: { id: 1, response: "result" } },
      events: { progress: { id: 1 } },
    });
    mod._attachTransport(new FakeTransport());
    mod._setState("ready");

    const seen: unknown[] = [];
    mod.onEvent("progress", (data) => seen.push(data));

    mod._handleTransportData(
      buildFrame(
        { methodId: 1, flags: Flags.DIRECTION_TO_PARENT, requestId: 0 },
        msgpackCodec.serialize({ percent: 50 }),
      ),
    );

    expect(seen).toEqual([{ percent: 50 }]);
  });
});

describe("ModuleCore: framing errors", () => {
  it("closes the transport instead of throwing out of the data handler", () => {
    const mod = new ModuleCore("worker")
      .executable("node", ["w.js"])
      .method("foo")
      .maxPayloadSize(16) as ModuleCore;
    mod._attachSchema({ methods: { foo: { id: 1, response: "result" } }, events: {} });
    const transport = new FakeTransport();
    mod._attachTransport(transport);
    mod._setState("ready");

    const oversized = Buffer.from(
      encodeHeader({ methodId: 1, flags: 0, requestId: 1, payloadLength: 1024 }),
    );

    expect(() => mod._handleTransportData(oversized)).not.toThrow();
    expect(transport.closeCount).toBe(1);
  });
});
