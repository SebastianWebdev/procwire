import type { Channel } from "./types.js";
import type { StdioTransportOptions } from "../transport/stdio-transport.js";
import type { SocketTransportOptions } from "../transport/socket-transport.js";
import { TransportFactory } from "../transport/factory.js";
import { LineDelimitedFraming } from "../framing/line-delimited.js";
import { LengthPrefixedFraming } from "../framing/length-prefixed.js";
import { JsonCodec } from "../serialization/json.js";
import { JsonRpcProtocol } from "../protocol/jsonrpc.js";
import { ChannelBuilder } from "./builder.js";

/**
 * Options for stdio channel creation.
 */
export interface StdioChannelOptions extends Omit<StdioTransportOptions, "executablePath"> {
  /**
   * Request timeout in milliseconds.
   * @default 30000
   */
  timeout?: number;
}

/**
 * Options for pipe channel creation.
 */
export interface PipeChannelOptions extends Omit<SocketTransportOptions, "path"> {
  /**
   * Request timeout in milliseconds.
   * @default 30000
   */
  timeout?: number;

  /**
   * Use line-delimited framing instead of length-prefixed.
   * @default false (uses length-prefixed)
   */
  useLineDelimited?: boolean;
}

/**
 * Creates a ready-to-use stdio channel with sensible defaults.
 *
 * - Transport: StdioTransport (spawns child process)
 * - Framing: LineDelimitedFraming (best for JSON-RPC over stdio)
 * - Serialization: JsonCodec
 * - Protocol: JsonRpcProtocol
 *
 * The channel is automatically started and ready to send/receive messages.
 *
 * @param executablePath - Path to executable to spawn
 * @param options - Optional configuration
 * @returns Started channel instance
 *
 * @example
 * ```ts
 * const channel = await createStdioChannel('node', {
 *   args: ['worker.js'],
 *   cwd: process.cwd(),
 *   timeout: 5000
 * });
 *
 * const result = await channel.request('calculate', { expr: '2+2' });
 * console.log(result); // 4
 *
 * await channel.close();
 * ```
 */
export async function createStdioChannel(
  executablePath: string,
  options?: StdioChannelOptions,
): Promise<Channel> {
  const transport = TransportFactory.createStdio({
    executablePath,
    ...options,
  });

  const channel = new ChannelBuilder()
    .withTransport(transport)
    .withFraming(new LineDelimitedFraming())
    .withSerialization(new JsonCodec())
    .withProtocol(new JsonRpcProtocol())
    .withTimeout(options?.timeout ?? 30000)
    .build();

  await channel.start();

  return channel;
}

/**
 * Creates a ready-to-use pipe/socket channel with sensible defaults.
 *
 * - Transport: SocketTransport (connects to named pipe/unix socket)
 * - Framing: LengthPrefixedFraming (best for binary/large data)
 * - Serialization: JsonCodec
 * - Protocol: JsonRpcProtocol
 *
 * Platform-specific paths:
 * - Windows: `\\\\.\\pipe\\my-pipe`
 * - Unix: `/tmp/my-socket.sock`
 *
 * The channel is automatically started and ready to send/receive messages.
 *
 * @param path - Pipe/socket path
 * @param options - Optional configuration
 * @returns Started channel instance
 *
 * @example
 * ```ts
 * const path = isWindows()
 *   ? '\\\\.\\pipe\\my-app'
 *   : '/tmp/my-app.sock';
 *
 * const channel = await createPipeChannel(path, {
 *   connectionTimeout: 5000,
 *   timeout: 10000
 * });
 *
 * const result = await channel.request('getStatus');
 * console.log(result);
 *
 * await channel.close();
 * ```
 */
export async function createPipeChannel(
  path: string,
  options?: PipeChannelOptions,
): Promise<Channel> {
  const transportOptions: SocketTransportOptions = { path };
  if (options?.connectionTimeout !== undefined) {
    transportOptions.connectionTimeout = options.connectionTimeout;
  }

  const transport = TransportFactory.createPipeClient(transportOptions);

  const framing = options?.useLineDelimited
    ? new LineDelimitedFraming()
    : new LengthPrefixedFraming();

  const channel = new ChannelBuilder()
    .withTransport(transport)
    .withFraming(framing)
    .withSerialization(new JsonCodec())
    .withProtocol(new JsonRpcProtocol())
    .withTimeout(options?.timeout ?? 30000)
    .build();

  await channel.start();

  return channel;
}
