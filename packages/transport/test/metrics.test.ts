import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SocketServer } from "../src/transport/socket-server.js";
import { SocketTransport } from "../src/transport/socket-transport.js";
import { LengthPrefixedFraming } from "../src/framing/length-prefixed.js";
import { JsonCodec } from "../src/serialization/json.js";
import { JsonRpcProtocol } from "../src/protocol/jsonrpc.js";
import { ChannelBuilder } from "../src/channel/builder.js";
import { PipePath } from "../src/utils/pipe-path.js";
import type { MetricsCollector } from "../src/utils/metrics.js";
import type { Channel } from "../src/channel/types.js";

type MetricEntry = {
  name: string;
  value: number;
  tags: Record<string, string> | undefined;
};

class MockMetricsCollector implements MetricsCollector {
  counters: MetricEntry[] = [];
  gauges: MetricEntry[] = [];
  histograms: MetricEntry[] = [];

  incrementCounter(name: string, value: number = 1, tags?: Record<string, string>): void {
    this.counters.push({ name, value, tags });
  }

  recordGauge(name: string, value: number, tags?: Record<string, string>): void {
    this.gauges.push({ name, value, tags });
  }

  recordHistogram(name: string, value: number, tags?: Record<string, string>): void {
    this.histograms.push({ name, value, tags });
  }
}

describe("Metrics hooks", () => {
  let server: SocketServer | undefined;
  let serverChannel: Channel | undefined;
  let clientChannel: Channel | undefined;
  let socketPath: string;

  beforeEach(() => {
    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    socketPath = PipePath.forModule("test-metrics", uniqueId);
  });

  afterEach(async () => {
    if (clientChannel) {
      await clientChannel.close().catch(() => {});
      clientChannel = undefined;
    }
    if (serverChannel) {
      await serverChannel.close().catch(() => {});
      serverChannel = undefined;
    }
    if (server) {
      await server.close().catch(() => {});
      server = undefined;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  it("should record request and framing metrics", async () => {
    server = new SocketServer();
    await server.listen(socketPath);

    const serverConnectionPromise = new Promise<Channel>((resolve) => {
      server?.onConnection((transport) => {
        const channel = new ChannelBuilder()
          .withTransport(transport)
          .withFraming(new LengthPrefixedFraming())
          .withSerialization(new JsonCodec())
          .withProtocol(new JsonRpcProtocol())
          .build();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        channel.onRequest((request: any): any => {
          if (request.method === "ping") {
            return { ok: true };
          }
          throw new Error("Unknown method");
        });

        channel.start().then(() => resolve(channel));
      });
    });

    const clientMetrics = new MockMetricsCollector();
    const clientTransport = new SocketTransport({ path: socketPath });
    clientChannel = new ChannelBuilder()
      .withTransport(clientTransport)
      .withFraming(new LengthPrefixedFraming())
      .withSerialization(new JsonCodec())
      .withProtocol(new JsonRpcProtocol())
      .withMetrics(clientMetrics)
      .build();

    await clientChannel.start();
    serverChannel = await serverConnectionPromise;

    const result = await clientChannel.request("ping");
    expect(result).toEqual({ ok: true });

    expect(
      clientMetrics.counters.some(
        (entry) => entry.name === "channel.request" && entry.tags?.method === "ping",
      ),
    ).toBe(true);

    expect(
      clientMetrics.histograms.some(
        (entry) =>
          entry.name === "channel.request_latency_ms" && entry.tags?.status === "success",
      ),
    ).toBe(true);

    expect(
      clientMetrics.histograms.some(
        (entry) =>
          entry.name === "framing.frame_size_bytes" && entry.tags?.direction === "inbound",
      ),
    ).toBe(true);
  });

  it("should record error counters with error type", async () => {
    server = new SocketServer();
    await server.listen(socketPath);

    const serverMetrics = new MockMetricsCollector();
    const serverConnectionPromise = new Promise<Channel>((resolve) => {
      server?.onConnection((transport) => {
        const channel = new ChannelBuilder()
          .withTransport(transport)
          .withFraming(new LengthPrefixedFraming())
          .withSerialization(new JsonCodec())
          .withProtocol(new JsonRpcProtocol())
          .withMetrics(serverMetrics)
          .build();

        channel.start().then(() => resolve(channel));
      });
    });

    const clientTransport = new SocketTransport({ path: socketPath });
    clientChannel = new ChannelBuilder()
      .withTransport(clientTransport)
      .withFraming(new LengthPrefixedFraming())
      .withSerialization(new JsonCodec())
      .withProtocol(new JsonRpcProtocol())
      .build();

    await clientChannel.start();
    serverChannel = await serverConnectionPromise;

    const invalidMessage = { not: "a valid jsonrpc message" };
    const serialized = new JsonCodec().serialize(invalidMessage);
    const framed = new LengthPrefixedFraming().encode(serialized);
    await clientTransport.write(framed);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(
      serverMetrics.counters.some(
        (entry) => entry.name === "channel.error" && entry.tags?.type === "ProtocolError",
      ),
    ).toBe(true);
  });

  it("should record transport connect/disconnect counters", async () => {
    server = new SocketServer();
    await server.listen(socketPath);

    const transportMetrics = new MockMetricsCollector();
    const clientTransport = new SocketTransport({ path: socketPath, metrics: transportMetrics });
    await clientTransport.connect();
    await clientTransport.disconnect();

    expect(
      transportMetrics.counters.some(
        (entry) => entry.name === "transport.connect" && entry.tags?.transport === "socket",
      ),
    ).toBe(true);

    expect(
      transportMetrics.counters.some(
        (entry) => entry.name === "transport.disconnect" && entry.tags?.transport === "socket",
      ),
    ).toBe(true);
  });
});
