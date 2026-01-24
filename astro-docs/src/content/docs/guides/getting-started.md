---
title: Getting Started
description: Learn how to install and use Procwire Transport in your Node.js projects
sidebar:
  order: 0
---

## Installation

Procwire Transport is a modular IPC library. Install the core package and any codec packages you need:

```bash
# Core package (zero runtime dependencies)
pnpm add @procwire/transport

# Optional codec packages
pnpm add @procwire/codec-msgpack @msgpack/msgpack
pnpm add @procwire/codec-protobuf protobufjs
pnpm add @procwire/codec-arrow apache-arrow
```

## Quick Start

### Basic Stdio Communication

Create a simple worker process that communicates via stdio:

**worker.js**

```javascript
import { createStdioChannel } from "@procwire/transport/channel";

const channel = createStdioChannel();

// Handle incoming requests
channel.onRequest(async (method, params) => {
  if (method === "greet") {
    return { message: `Hello, ${params.name}!` };
  }
  throw new Error(`Unknown method: ${method}`);
});

await channel.connect();
console.error("Worker ready"); // Log to stderr
```

**main.js**

```javascript
import { createStdioChannel } from "@procwire/transport/channel";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const channel = createStdioChannel({
  executablePath: "node",
  args: [join(__dirname, "worker.js")],
});

await channel.connect();

// Send request
const response = await channel.request("greet", { name: "World" });
console.log(response); // { message: 'Hello, World!' }

await channel.disconnect();
```

### Using Named Pipes / Unix Sockets

For inter-process communication without spawning child processes:

**server.js**

```javascript
import { createPipeChannel } from "@procwire/transport/channel";

const server = createPipeChannel({
  isServer: true,
  path: process.platform === "win32" ? "\\\\.\\pipe\\my-app" : "/tmp/my-app.sock",
});

server.onRequest(async (method, params) => {
  return { echo: params };
});

await server.connect();
console.log("Server listening...");
```

**client.js**

```javascript
import { createPipeChannel } from "@procwire/transport/channel";

const client = createPipeChannel({
  path: process.platform === "win32" ? "\\\\.\\pipe\\my-app" : "/tmp/my-app.sock",
});

await client.connect();

const result = await client.request("echo", { data: "test" });
console.log(result); // { echo: { data: 'test' } }

await client.disconnect();
```

## Advanced Usage

### Custom Channel Configuration

Use the [ChannelBuilder](/api/transport/src/classes/channelbuilder/) for fine-grained control:

```javascript
import { ChannelBuilder } from "@procwire/transport/channel";
import { StdioTransport } from "@procwire/transport/transport";
import { LineDelimitedFraming } from "@procwire/transport/framing";
import { JsonCodec } from "@procwire/transport/serialization";
import { JsonRpcProtocol } from "@procwire/transport/protocol";

const transport = new StdioTransport({
  executablePath: "node",
  args: ["worker.js"],
});

const channel = new ChannelBuilder()
  .withTransport(transport)
  .withFraming(new LineDelimitedFraming())
  .withSerialization(new JsonCodec())
  .withProtocol(new JsonRpcProtocol())
  .withTimeout(5000)
  .build();

await channel.connect();
```

### Using MessagePack Codec

For better performance with binary data:

```javascript
import { ChannelBuilder } from "@procwire/transport/channel";
import { MessagePackCodec } from "@procwire/codec-msgpack";
import { LineDelimitedFraming } from "@procwire/transport/framing";
import { JsonRpcProtocol } from "@procwire/transport/protocol";
import { StdioTransport } from "@procwire/transport/transport";

const codec = new MessagePackCodec();

const channel = new ChannelBuilder()
  .withTransport(transport)
  .withFraming(new LineDelimitedFraming())
  .withSerialization(codec)
  .withProtocol(new JsonRpcProtocol())
  .build();
```

## Next Steps

- Read about [Core Concepts](/guides/concepts/) to understand the architecture
- Explore the [API Reference](/api/) for detailed documentation
- Check out the [examples](https://github.com/SebastianWebdev/procwire/tree/main/examples) in the repository

## Test Mermaid

```mermaid
graph TD;
    A-->B;
    A-->C;
    B-->D;
    C-->D;
```

## Sekcja D2

```d2
x -> y
```
