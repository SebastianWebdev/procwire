# @procwire/transport

Standalone, modular IPC (Inter-Process Communication) transport library for Node.js with **zero runtime dependencies**.

Build production-grade IPC channels with full control over every layer: transport, framing, serialization, and protocol.

## Features

- **Zero dependencies** - Core package has no runtime dependencies
- **Modular architecture** - Replace any layer independently
- **Type-safe** - Full TypeScript support with generics
- **Cross-platform** - Windows (Named Pipes), macOS/Linux (Unix Sockets)
- **Multiple transports** - stdio, named pipes, unix sockets
- **Flexible framing** - Line-delimited, length-prefixed, custom
- **Pluggable serialization** - JSON, MessagePack, Protobuf, Arrow, custom
- **Protocol agnostic** - JSON-RPC 2.0, custom protocols
- **ProcessManager** - Managed child processes with restart policies
- **Metrics hooks** - Optional instrumentation for requests, framing, and transports

## Installation

```bash
npm install @procwire/transport
```

Or with optional codecs:

```bash
# With MessagePack support
npm install @procwire/transport @procwire/codec-msgpack @msgpack/msgpack

# With Protocol Buffers support
npm install @procwire/transport @procwire/codec-protobuf protobufjs

# With Apache Arrow support
npm install @procwire/transport @procwire/codec-arrow apache-arrow
```

## Quick Start

### Basic stdio IPC

```typescript
import { createStdioChannel } from "@procwire/transport";

// Parent process
const channel = await createStdioChannel("node", {
  args: ["worker.js"],
  timeout: 5000,
});

// Send request
const result = await channel.request("calculate", { expr: "2+2" });
console.log(result); // 4

// Listen for notifications
channel.onNotification("log", (params) => {
  console.log(params.message);
});

await channel.close();
```

### ProcessManager with dual channels

```typescript
import { ProcessManager } from "@procwire/transport";
import { MessagePackCodec } from "@procwire/codec-msgpack";

const manager = new ProcessManager({
  namespace: "my-app",
  restartPolicy: { enabled: true, maxRestarts: 3 },
});

const handle = await manager.spawn("worker-1", {
  executablePath: "node",
  args: ["worker.js"],

  // Control channel (stdio)
  controlChannel: {},

  // Data channel (pipe/socket with MessagePack)
  dataChannel: {
    enabled: true,
    channel: {
      framing: "length-prefixed",
      serialization: new MessagePackCodec(),
    },
  },
});

// Lightweight commands via control channel
const status = await handle.request("getStatus");

// Bulk data via data channel
const result = await handle.requestViaData("processItems", { items: [...] });
```

### Custom channel with builder

```typescript
import {
  ChannelBuilder,
  TransportFactory,
  LineDelimitedFraming,
  JsonCodec,
  JsonRpcProtocol,
} from "@procwire/transport";

const transport = TransportFactory.createStdio({
  executablePath: "node",
  args: ["worker.js"],
});

const channel = new ChannelBuilder()
  .withTransport(transport)
  .withFraming(new LineDelimitedFraming())
  .withSerialization(new JsonCodec())
  .withProtocol(new JsonRpcProtocol())
  .withTimeout(10000)
  .build();

await channel.start();
```

## Architecture

The library uses a layered architecture where each layer is independent and replaceable:

```
Application Layer (Your Code)
         ↓
Process Management (ProcessManager, ProcessHandle)
         ↓
Channel Layer (RequestChannel, ChannelBuilder)
         ↓
Protocol Layer (JSON-RPC 2.0, custom)
         ↓
Serialization Layer (JSON, MessagePack, Protobuf, Arrow)
         ↓
Framing Layer (line-delimited, length-prefixed)
         ↓
Transport Layer (stdio, named pipes, unix sockets)
         ↓
OS Layer (child_process, net.Server/Socket)
```

### Core Abstractions

1. **Transport**: Raw byte transfer between endpoints
2. **Framing**: Message boundary detection in byte streams
3. **Serialization**: Object ↔ binary conversion
4. **Protocol**: Application-level message protocol
5. **Channel**: High-level request/response communication
6. **Process**: Managed child process lifecycle

## API Reference

### Transports

#### StdioTransport

Spawns child process and communicates via stdin/stdout.

```typescript
import { StdioTransport } from "@procwire/transport";

const transport = new StdioTransport({
  executablePath: "node",
  args: ["worker.js"],
  cwd: process.cwd(),
  env: { ...process.env, CUSTOM_VAR: "value" },
  startupTimeout: 10000,
});

await transport.connect();
transport.write(Buffer.from("data"));
transport.onData((data) => console.log(data));
await transport.close();
```

#### SocketTransport (Client)

Connects to named pipe (Windows) or unix socket (Unix).

```typescript
import { SocketTransport } from "@procwire/transport";
import { isWindows } from "@procwire/transport/utils";

const path = isWindows() ? "\\\\.\\pipe\\my-pipe" : "/tmp/my-socket.sock";

const transport = new SocketTransport({
  path,
  connectionTimeout: 5000,
});

await transport.connect();
```

#### SocketServer

Creates named pipe/unix socket server.

```typescript
import { SocketServer } from "@procwire/transport";

const server = new SocketServer({
  unlinkOnListen: true, // Remove stale socket
});

server.onConnection((transport) => {
  console.log("Client connected");
  transport.onData((data) => {
    transport.write(data); // Echo
  });
});

await server.listen("/tmp/my-socket.sock");
```

#### TransportFactory

Convenience factory for creating transports.

```typescript
import { TransportFactory } from "@procwire/transport";

// Stdio
const stdio = TransportFactory.createStdio({
  executablePath: "node",
  args: ["worker.js"],
});

// Pipe client
const client = TransportFactory.createPipeClient({
  path: "/tmp/socket.sock",
});

// Pipe server
const server = TransportFactory.createPipeServer();
```

### Framing

#### LineDelimitedFraming

Splits messages by newline characters.

```typescript
import { LineDelimitedFraming } from "@procwire/transport/framing";

const framing = new LineDelimitedFraming({
  maxLineLength: 100000, // Default: 100KB
});
```

**Best for**:

- Text protocols (JSON-RPC over stdio)
- Human-readable debugging
- Simple implementations

**Not suitable for**:

- Binary data with embedded newlines
- Very large messages (>1MB)

#### LengthPrefixedFraming

Prefixes each message with 4-byte length (big-endian).

```typescript
import { LengthPrefixedFraming } from "@procwire/transport/framing";

const framing = new LengthPrefixedFraming({
  maxMessageSize: 10 * 1024 * 1024, // Default: 10MB
});
```

**Best for**:

- Binary protocols (MessagePack, Protobuf)
- Large messages
- High throughput

**Format**: `[4-byte length][message]`

### Serialization

#### JsonCodec

JSON serialization using native `JSON.parse`/`JSON.stringify`.

```typescript
import { JsonCodec } from "@procwire/transport/serialization";

const codec = new JsonCodec();
```

**Pros**: Built-in, human-readable, widely supported
**Cons**: Larger payloads, slower for large data

#### RawCodec

Pass-through codec for binary data.

```typescript
import { RawCodec } from "@procwire/transport/serialization";

const codec = new RawCodec();
```

**Use case**: When you handle serialization yourself.

#### CodecRegistry

Dynamically select codec based on content type.

```typescript
import { CodecRegistry } from "@procwire/transport/serialization";
import { JsonCodec } from "@procwire/transport/serialization";
import { MessagePackCodec } from "@procwire/codec-msgpack";

const registry = new CodecRegistry();
registry.register(new JsonCodec());
registry.register(new MessagePackCodec());

// Use with protocol that supports content negotiation
```

#### Custom Codecs

```typescript
import type { SerializationCodec } from "@procwire/transport/serialization";

class MyCodec implements SerializationCodec<MyType> {
  readonly name = "my-codec";
  readonly contentType = "application/x-my-codec";

  serialize(value: MyType): Buffer {
    // ... encoding logic
    return buffer;
  }

  deserialize(buffer: Buffer): MyType {
    // ... decoding logic
    return value;
  }
}
```

### Protocols

#### JsonRpcProtocol

JSON-RPC 2.0 implementation with request/response and notifications.

```typescript
import { JsonRpcProtocol } from "@procwire/transport/protocol";

const protocol = new JsonRpcProtocol();
```

**Request**:

```json
{ "jsonrpc": "2.0", "id": 1, "method": "add", "params": { "a": 2, "b": 3 } }
```

**Response**:

```json
{ "jsonrpc": "2.0", "id": 1, "result": 5 }
```

**Notification** (no response):

```json
{ "jsonrpc": "2.0", "method": "log", "params": { "message": "Hello" } }
```

#### SimpleProtocol

Minimal protocol with method and params.

```typescript
import { SimpleProtocol } from "@procwire/transport/protocol";

const protocol = new SimpleProtocol();
```

**Message**:

```json
{ "method": "add", "params": { "a": 2, "b": 3 } }
```

#### Custom Protocols

```typescript
import type { Protocol } from "@procwire/transport/protocol";

class MyProtocol implements Protocol {
  encodeRequest(method: string, params: unknown, id: number): unknown {
    return { m: method, p: params, i: id };
  }

  encodeResponse(result: unknown, id: number): unknown {
    return { r: result, i: id };
  }

  // ... implement other methods
}
```

### Channels

#### RequestChannel

High-level channel for request/response communication.

```typescript
import type { Channel } from "@procwire/transport/channel";

// Send request
const result = await channel.request<number>("add", { a: 2, b: 3 });

// Send notification (no response)
channel.notify("log", { message: "Hello" });

// Handle incoming requests
channel.onRequest("multiply", async (params) => {
  return params.a * params.b;
});

// Handle incoming notifications
channel.onNotification("shutdown", () => {
  process.exit(0);
});

// Lifecycle
await channel.start();
await channel.close();
```

#### ChannelBuilder

Fluent API for building channels.

```typescript
import { ChannelBuilder } from "@procwire/transport";

const channel = new ChannelBuilder()
  .withTransport(transport)
  .withFraming(framing)
  .withSerialization(serialization)
  .withProtocol(protocol)
  .withTimeout(5000)
  .build();
```

### Process Management

#### ProcessManager

Manages multiple child processes with restart policies.

```typescript
import { ProcessManager } from "@procwire/transport";

const manager = new ProcessManager({
  defaultTimeout: 30000,
  namespace: "my-app",
  restartPolicy: {
    enabled: true,
    maxRestarts: 3,
    backoffMs: 1000,
    maxBackoffMs: 30000,
  },
  gracefulShutdownMs: 5000,
});

// Spawn process
const handle = await manager.spawn("worker-1", {
  executablePath: "node",
  args: ["worker.js"],
  cwd: process.cwd(),
  env: { ...process.env },

  controlChannel: {
    // Optional channel config
  },

  dataChannel: {
    enabled: true,
    path: "/tmp/custom-path.sock", // Optional, auto-generated if omitted
    channel: {
      framing: "length-prefixed",
      serialization: new MessagePackCodec(),
    },
  },

  restartPolicy: {
    enabled: true,
    maxRestarts: 5,
  },
});

// Events
manager.on("spawn", ({ id }) => console.log(`Spawned: ${id}`));
manager.on("ready", ({ id }) => console.log(`Ready: ${id}`));
manager.on("exit", ({ id, code }) => console.log(`Exited: ${id} (${code})`));
manager.on("restart", ({ id, attempt }) => console.log(`Restart: ${id} (${attempt})`));
manager.on("error", ({ id, error }) => console.log(`Error: ${id}`, error));

// Stop process
await manager.stop("worker-1");

// Stop all
await manager.stopAll();
```

#### ProcessHandle

Handle to managed process with dual-channel support.

```typescript
// Control channel (default)
const status = await handle.request("getStatus");

// Data channel
const result = await handle.requestViaData("processItems", { items: [...] });

// Notifications
handle.notify("config", { key: "value" });

// Events
handle.on("exit", ({ code }) => console.log(`Exited: ${code}`));

// Stop
await handle.stop();
```

## Utilities

### PipePath

Generate platform-specific pipe/socket paths.

```typescript
import { PipePath } from "@procwire/transport/utils";

// Auto-generated path
const path = PipePath.forModule("my-app", "worker-1");
// Windows: \\.\pipe\my-app-worker-1
// Unix: /tmp/my-app-worker-1.sock

// Validate path
const isValid = PipePath.isValid(path);

// Cleanup (Unix only)
await PipePath.cleanup(path);
```

### Platform Detection

```typescript
import { isWindows, getProcessId } from "@procwire/transport/utils";

if (isWindows()) {
  // Windows-specific logic
}

const pid = getProcessId();
```

## Metrics

Metrics are fully opt-in. Provide a `MetricsCollector` implementation and pass it to
`ChannelBuilder`, `ProcessManager`, or transport options.

Collected events include:

- `channel.request` counter with `{ method }`
- `channel.request_latency_ms` histogram with `{ method, status }`
- `channel.error` counter with `{ type }`
- `framing.frames` counter and `framing.frame_size_bytes` histogram with `{ direction }`
- `transport.connect` and `transport.disconnect` counters with `{ transport }`
- `transport.error` counter with `{ transport, type }`

### Basic wiring

```typescript
import { ChannelBuilder, ProcessManager, type MetricsCollector } from "@procwire/transport";

const metrics: MetricsCollector = {
  incrementCounter(name, value = 1, tags) {
    console.log("counter", name, value, tags);
  },
  recordGauge(name, value, tags) {
    console.log("gauge", name, value, tags);
  },
  recordHistogram(name, value, tags) {
    console.log("histogram", name, value, tags);
  },
};

const manager = new ProcessManager({ metrics });

const channel = new ChannelBuilder()
  .withTransport(transport)
  .withFraming(framing)
  .withSerialization(serialization)
  .withProtocol(protocol)
  .withMetrics(metrics)
  .build();
```

### Prometheus (prom-client)

```typescript
import { Counter, Histogram } from "prom-client";
import type { MetricsCollector } from "@procwire/transport";

const counters = new Map<string, Counter<string>>();
const histograms = new Map<string, Histogram<string>>();

const metrics: MetricsCollector = {
  incrementCounter(name, value = 1, tags) {
    if (!counters.has(name)) {
      counters.set(
        name,
        new Counter({
          name,
          help: name,
          labelNames: tags ? Object.keys(tags) : [],
        }),
      );
    }
    counters.get(name)!.inc(tags ?? {}, value);
  },
  recordGauge() {},
  recordHistogram(name, value, tags) {
    if (!histograms.has(name)) {
      histograms.set(
        name,
        new Histogram({
          name,
          help: name,
          labelNames: tags ? Object.keys(tags) : [],
        }),
      );
    }
    histograms.get(name)!.observe(tags ?? {}, value);
  },
};
```

### StatsD (hot-shots)

```typescript
import type { MetricsCollector } from "@procwire/transport";
import { StatsD } from "hot-shots";

const client = new StatsD();

const metrics: MetricsCollector = {
  incrementCounter(name, value = 1, tags) {
    client.increment(name, value, tags);
  },
  recordGauge(name, value, tags) {
    client.gauge(name, value, tags);
  },
  recordHistogram(name, value, tags) {
    client.histogram(name, value, tags);
  },
};
```

## Platform Notes

### Windows Named Pipes

- **Path format**: `\\\\.\\pipe\\<name>`
- **Namespace**: Global by default
- **Permissions**: Controlled by ACLs
- **Cleanup**: Automatic on server close

Example:

```typescript
const path = "\\\\.\\pipe\\my-app-worker-1";
```

### Unix Domain Sockets

- **Path format**: Absolute path (e.g., `/tmp/socket.sock`)
- **Max length**: 108 characters (Linux), 104 (macOS)
- **Permissions**: File system permissions (chmod)
- **Cleanup**: Manual (remove socket file)

Example:

```typescript
const path = "/tmp/my-app-worker-1.sock";

// Cleanup stale socket
const server = new SocketServer({ unlinkOnListen: true });
await server.listen(path);
```

### Path Recommendations

- **Development**: Use `/tmp/` on Unix, `\\\\.\\pipe\\` on Windows
- **Production**: Use app-specific directory with proper permissions
- **Multiple instances**: Include PID or unique ID in path

```typescript
import { tmpdir } from "os";
import { join } from "path";

const path = isWindows()
  ? `\\\\.\\pipe\\my-app-${process.pid}`
  : join(tmpdir(), `my-app-${process.pid}.sock`);
```

## Troubleshooting

### Hanging Requests

**Symptoms**: `channel.request()` never resolves.

**Common causes**:

1. **Framing mismatch**: Parent uses line-delimited, child uses length-prefixed
2. **Codec mismatch**: Parent uses JSON, child uses MessagePack
3. **Protocol mismatch**: Parent uses JSON-RPC, child uses custom protocol
4. **Child not responding**: Child crashed or deadlocked

**Solutions**:

- Verify both sides use identical framing/codec/protocol
- Check child process stderr for errors
- Add timeout to requests: `{ timeout: 5000 }`
- Enable debug logging (see below)

### Connection Refused (ECONNREFUSED)

**Symptoms**: `SocketTransport.connect()` fails with ECONNREFUSED.

**Common causes**:

1. Server not listening yet
2. Wrong path
3. Stale socket file (Unix)

**Solutions**:

```typescript
// Increase connection timeout
const transport = new SocketTransport({
  path: "/tmp/socket.sock",
  connectionTimeout: 10000, // Wait up to 10s
});

// Or cleanup stale sockets
const server = new SocketServer({ unlinkOnListen: true });
```

### Buffer Limits Exceeded

**Symptoms**: Errors about message size or buffer limits.

**Common causes**:

- Message exceeds `maxMessageSize` (length-prefixed)
- Line exceeds `maxLineLength` (line-delimited)

**Solutions**:

```typescript
// Increase limits
const framing = new LengthPrefixedFraming({
  maxMessageSize: 100 * 1024 * 1024, // 100MB
});

// Or split large messages
const chunks = splitIntoChunks(largeData, 1024 * 1024);
for (const chunk of chunks) {
  await channel.request("processChunk", chunk);
}
```

### Worker Crashes on Startup

**Symptoms**: `ProcessManager.spawn()` fails or worker exits immediately.

**Common causes**:

1. Syntax error in worker code
2. Missing dependencies
3. Wrong executable path

**Solutions**:

- Test worker standalone: `node worker.js`
- Check stderr: `startupTimeout` should be long enough
- Verify executable path and args

### Memory Leaks

**Symptoms**: Memory usage grows over time.

**Common causes**:

- Unclosed channels
- Unremoved event listeners
- Buffered data not consumed

**Solutions**:

```typescript
// Always close channels
try {
  await channel.request(...);
} finally {
  await channel.close();
}

// Remove listeners
const unsub = channel.onNotification("log", handler);
// Later...
unsub();

// Set maxListeners if needed
channel.setMaxListeners(100);
```

## Debugging

### Enable Debug Logging

```typescript
// Set environment variable
process.env.DEBUG = "@procwire:*";

// Or programmatically (if debug package is used in future)
```

### Inspect Raw Data

```typescript
import { inspect } from "util";

transport.onData((data) => {
  console.error("Raw data:", inspect(data, { depth: null }));
});
```

### Test Worker Standalone

Test child process independently:

```bash
# Send JSON-RPC request manually
echo '{"jsonrpc":"2.0","id":1,"method":"add","params":{"a":2,"b":3}}' | node worker.js
```

## Examples

See the [examples/](../../examples/) directory for complete, runnable examples:

- [basic-stdio](../../examples/basic-stdio/) - Simple parent/child with stdio
- [dual-channel](../../examples/dual-channel/) - Control + data channels with MessagePack
- [rust-worker](../../examples/rust-worker/) - Cross-language IPC with Rust

## Performance Tips

1. **Choose the right framing**:
   - Line-delimited: Best for text protocols (JSON-RPC over stdio)
   - Length-prefixed: Best for binary protocols (MessagePack, Protobuf)

2. **Choose the right codec**:
   - JSON: Human-readable, debugging
   - MessagePack: 20-50% smaller, 2-5x faster than JSON
   - Protobuf: Schema validation, cross-language
   - Arrow: Columnar data, analytics workloads

3. **Use dual channels**:
   - Control channel (stdio): Lightweight commands
   - Data channel (pipe): Bulk data transfer

4. **Batch requests**:
   - Send multiple items in one request instead of many small requests
   - Reduces protocol overhead

5. **Reuse channels**:
   - Keep channels open for multiple requests
   - Avoid spawning processes repeatedly

6. **Monitor resource usage**:
   - Track memory with `process.memoryUsage()`
   - Profile CPU with `--prof` flag
   - Use `clinic` for performance analysis

## TypeScript

Full TypeScript support with generics:

```typescript
interface User {
  id: number;
  name: string;
}

// Typed request
const user = await channel.request<User>("getUser", { id: 123 });
console.log(user.name); // Type-safe

// Typed handler
channel.onRequest<{ id: number }, User>("getUser", async (params) => {
  // params.id is number
  return { id: params.id, name: "Alice" }; // Must return User
});
```

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development setup and guidelines.

## License

MIT - See [LICENSE](../LICENSE) for details.

## Roadmap

### v0.1.0 (Current)

- Core transport, framing, serialization, protocol layers
- Stdio and pipe/socket transports
- JSON-RPC 2.0 and simple protocols
- ProcessManager with restart policies
- Optional codecs: MessagePack, Protobuf, Arrow

### v0.2.0 (Planned)

- HTTP/WebSocket transports
- Streaming support
- Compression layer (gzip, brotli)
- Authentication/authorization hooks
- Metrics and monitoring

### v1.0.0 (Future)

- Production-ready stable API
- Performance optimizations
- Comprehensive docs and examples
- Battle-tested in production

## Related Packages

- [@procwire/codec-msgpack](../codec-msgpack/) - MessagePack serialization
- [@procwire/codec-protobuf](../codec-protobuf/) - Protocol Buffers serialization
- [@procwire/codec-arrow](../codec-arrow/) - Apache Arrow serialization

## Support

- **Issues**: [GitHub Issues](https://github.com/your-org/ipc-bridge-core/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/ipc-bridge-core/discussions)
- **Documentation**: [Architecture Docs](../docs/procwire-transport-architecture.md)
