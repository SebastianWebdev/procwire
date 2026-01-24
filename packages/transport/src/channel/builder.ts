import type { Transport } from "../transport/types.js";
import type { FramingCodec } from "../framing/types.js";
import type { SerializationCodec } from "../serialization/types.js";
import type { Protocol } from "../protocol/types.js";
import type { ResponseAccessor, ChannelMiddleware, Channel, ChannelOptions } from "./types.js";
import { RequestChannel } from "./request-channel.js";
import type { MetricsCollector } from "../utils/metrics.js";

/**
 * Fluent API builder for creating channels.
 * Provides ergonomic configuration with validation.
 *
 * @example
 * ```ts
 * const channel = new ChannelBuilder()
 *   .withTransport(transport)
 *   .withFraming(new LineDelimitedFraming())
 *   .withSerialization(new JsonCodec())
 *   .withProtocol(new JsonRpcProtocol())
 *   .withTimeout(5000)
 *   .build();
 * ```
 */
export class ChannelBuilder<TReq = unknown, TRes = unknown, TNotif = unknown> {
  private transport?: Transport;
  private framing?: FramingCodec;
  private serialization?: SerializationCodec;
  private protocol?: Protocol<TReq, TRes, TNotif>;
  private timeout?: number;
  private responseAccessor?: ResponseAccessor;
  private middleware: ChannelMiddleware[] = [];
  private metrics?: MetricsCollector;
  private maxInboundFrames?: number;
  private bufferEarlyNotifications?: number;
  private pendingRequestPoolSize?: number;

  /**
   * Sets the transport layer.
   */
  withTransport(transport: Transport): this {
    this.transport = transport;
    return this;
  }

  /**
   * Sets the framing codec.
   */
  withFraming(framing: FramingCodec): this {
    this.framing = framing;
    return this;
  }

  /**
   * Sets the serialization codec.
   */
  withSerialization(serialization: SerializationCodec): this {
    this.serialization = serialization;
    return this;
  }

  /**
   * Sets the protocol layer.
   */
  withProtocol<R, S, N>(protocol: Protocol<R, S, N>): ChannelBuilder<R, S, N> {
    (this as unknown as ChannelBuilder<R, S, N>).protocol = protocol;
    return this as unknown as ChannelBuilder<R, S, N>;
  }

  /**
   * Sets the default request timeout in milliseconds.
   */
  withTimeout(timeoutMs: number): this {
    this.timeout = timeoutMs;
    return this;
  }

  /**
   * Sets the response accessor for interpreting response messages.
   */
  withResponseAccessor(accessor: ResponseAccessor): this {
    this.responseAccessor = accessor;
    return this;
  }

  /**
   * Adds middleware to the channel.
   */
  withMiddleware(middleware: ChannelMiddleware): this {
    this.middleware.push(middleware);
    return this;
  }

  /**
   * Sets the metrics collector for channel instrumentation.
   */
  withMetrics(metrics: MetricsCollector): this {
    this.metrics = metrics;
    return this;
  }

  /**
   * Sets the maximum inbound frames limit.
   */
  withMaxInboundFrames(max: number): this {
    this.maxInboundFrames = max;
    return this;
  }

  /**
   * Sets the buffer size for early notifications.
   * Notifications received before handlers are registered will be buffered.
   */
  withBufferEarlyNotifications(size: number): this {
    this.bufferEarlyNotifications = size;
    return this;
  }

  /**
   * Sets the pending request pool size (0 disables pooling).
   */
  withPendingRequestPoolSize(size: number): this {
    this.pendingRequestPoolSize = size;
    return this;
  }

  /**
   * Builds and returns the configured channel.
   * @throws {Error} if required configuration is missing
   */
  build(): Channel<TReq, TRes, TNotif> {
    if (!this.transport) {
      throw new Error("ChannelBuilder: transport is required");
    }
    if (!this.framing) {
      throw new Error("ChannelBuilder: framing is required");
    }
    if (!this.serialization) {
      throw new Error("ChannelBuilder: serialization is required");
    }
    if (!this.protocol) {
      throw new Error("ChannelBuilder: protocol is required");
    }

    const options: ChannelOptions<TReq, TRes, TNotif> = {
      transport: this.transport,
      framing: this.framing,
      serialization: this.serialization,
      protocol: this.protocol,
    };

    if (this.timeout !== undefined) {
      options.timeout = this.timeout;
    }
    if (this.responseAccessor !== undefined) {
      options.responseAccessor = this.responseAccessor;
    }
    if (this.middleware.length > 0) {
      options.middleware = this.middleware;
    }
    if (this.metrics !== undefined) {
      options.metrics = this.metrics;
    }
    if (this.maxInboundFrames !== undefined) {
      options.maxInboundFrames = this.maxInboundFrames;
    }
    if (this.bufferEarlyNotifications !== undefined) {
      options.bufferEarlyNotifications = this.bufferEarlyNotifications;
    }
    if (this.pendingRequestPoolSize !== undefined) {
      options.pendingRequestPoolSize = this.pendingRequestPoolSize;
    }

    return new RequestChannel<TReq, TRes, TNotif>(options);
  }
}
