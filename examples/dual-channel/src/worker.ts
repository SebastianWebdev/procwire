/**
 * Dual-channel IPC example - Worker process.
 */

import { ChannelBuilder, TransportFactory } from "@procwire/transport";
import { LineDelimitedFraming, LengthPrefixedFraming } from "@procwire/transport/framing";
import { JsonCodec } from "@procwire/transport/serialization";
import { JsonRpcProtocol } from "@procwire/transport/protocol";
import { MessagePackCodec } from "@procwire/codec-msgpack";
import type { Channel } from "@procwire/transport/channel";

const startTime = Date.now();

async function setupControlChannel(): Promise<Channel> {
  console.error("Worker: Setting up control channel (stdio)...");

  const transport = TransportFactory.createStdio({
    executablePath: process.execPath,
  });

  const channel = new ChannelBuilder()
    .withTransport(transport)
    .withFraming(new LineDelimitedFraming())
    .withSerialization(new JsonCodec())
    .withProtocol(new JsonRpcProtocol())
    .build();

  // Register request handler with method routing
  channel.onRequest((request: any): any => {
    switch (request.method) {
      case "getStatus":
        return {
          status: "running",
          uptime: Date.now() - startTime,
        };
      case "getConfig":
        return {
          version: "1.0.0",
          features: ["dual-channel", "msgpack", "hot-reload"],
        };
      case "shutdown":
        console.error("Worker: Shutting down...");
        setTimeout(() => process.exit(0), 100);
        return { success: true };
      default:
        throw new Error(`Unknown method: ${request.method}`);
    }
  });

  await channel.start();

  console.error("Worker: Control channel ready");
  return channel;
}

async function setupDataChannel(): Promise<Channel> {
  const dataPath = process.env.ASPECT_IPC_DATA_PATH;
  if (!dataPath) {
    throw new Error("ASPECT_IPC_DATA_PATH environment variable not set");
  }

  console.error(`Worker: Setting up data channel at ${dataPath}...`);

  const server = TransportFactory.createPipeServer();

  const connectionPromise = new Promise<Channel>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Data channel connection timeout"));
    }, 10000);

    server.onConnection((transport) => {
      clearTimeout(timeout);

      console.error("Worker: Data channel client connected");

      const channel = new ChannelBuilder()
        .withTransport(transport)
        .withFraming(new LengthPrefixedFraming())
        .withSerialization(new MessagePackCodec())
        .withProtocol(new JsonRpcProtocol())
        .build();

      // Register request handler with method routing
      channel.onRequest((request: any): any => {
        switch (request.method) {
          case "processItems": {
            const params = request.params as { items: Array<{ value: number }> };
            console.error(`Worker: Processing ${params.items.length} items...`);
            const sum = params.items.reduce((acc, item) => acc + item.value, 0);
            return { processed: params.items.length, sum };
          }
          case "processMatrix": {
            const params = request.params as { matrix: number[][] };
            console.error(`Worker: Processing ${params.matrix.length}x${params.matrix[0]?.length} matrix...`);
            let sum = 0;
            let count = 0;
            for (const row of params.matrix) {
              for (const val of row) {
                sum += val;
                count++;
              }
            }
            return { sum, avg: sum / count };
          }
          default:
            throw new Error(`Unknown method: ${request.method}`);
        }
      });

      channel.start().then(() => {
        console.error("Worker: Data channel ready");
        resolve(channel);
      });
    });
  });

  await server.listen(dataPath);
  console.error("Worker: Data channel listening");

  return connectionPromise;
}

async function main() {
  console.error("Worker: Starting...");

  try {
    const controlChannel = await setupControlChannel();
    const dataChannel = await setupDataChannel();

    console.error("Worker: All channels ready");

    process.on("SIGTERM", async () => {
      console.error("Worker: Received SIGTERM");
      await Promise.all([controlChannel.close(), dataChannel.close()]);
      process.exit(0);
    });

    process.on("SIGINT", async () => {
      console.error("Worker: Received SIGINT");
      await Promise.all([controlChannel.close(), dataChannel.close()]);
      process.exit(0);
    });
  } catch (error) {
    console.error("Worker: Fatal error:", error);
    process.exit(1);
  }
}

main();
