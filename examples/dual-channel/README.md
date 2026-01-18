# Dual-Channel IPC Example

Demonstrates advanced IPC pattern with **separate control and data channels**:

- **Control Channel**: stdio (line-delimited JSON) for lightweight commands
- **Data Channel**: named pipe/unix socket (length-prefixed MessagePack) for bulk data
- ProcessManager with automatic channel setup
- Optimized for different workload types

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Parent Process (parent.ts)                                   │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ ProcessManager                                           │ │
│ │   • spawn() with dataChannel.enabled = true              │ │
│ │   • Auto-generates pipe path                             │ │
│ │   • Creates ProcessHandle                                │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                                │
│ ┌─────────────────────┐   ┌──────────────────────────────┐  │
│ │ Control Channel     │   │ Data Channel                 │  │
│ │  • stdio            │   │  • pipe/socket               │  │
│ │  • line-delimited   │   │  • length-prefixed           │  │
│ │  • JSON             │   │  • MessagePack               │  │
│ │  • JSON-RPC         │   │  • JSON-RPC                  │  │
│ └──────────┬──────────┘   └────────────┬─────────────────┘  │
└────────────┼─────────────────────────────┼────────────────────┘
             │ stdin/stdout                │ named pipe/socket
             │ (lightweight)               │ (bulk data)
┌────────────┼─────────────────────────────┼────────────────────┐
│ Worker Process (worker.ts)               │                    │
│ ┌──────────┴──────────┐   ┌──────────────┴─────────────────┐ │
│ │ Control Handlers    │   │ Data Handlers                  │ │
│ │  • getStatus        │   │  • processItems (1000+ items)  │ │
│ │  • getConfig        │   │  • processMatrix (10k values)  │ │
│ │  • shutdown         │   │  • (optimized for throughput)  │ │
│ └─────────────────────┘   └────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## Why Dual Channels?

### Control Channel (stdio + JSON)
- **Purpose**: Commands, status queries, configuration
- **Characteristics**: Low latency, human-readable, easy to debug
- **Best for**: Infrequent, small messages (<1KB)
- **Examples**: `getStatus()`, `shutdown()`, `reconfigure()`

### Data Channel (pipe + MessagePack)
- **Purpose**: Bulk data transfer, high-throughput processing
- **Characteristics**: Efficient binary, high bandwidth, optimized framing
- **Best for**: Frequent, large messages (>10KB)
- **Examples**: Processing datasets, streaming analytics, file transfers

## Running

### Development (TypeScript with tsx)

```bash
pnpm install
pnpm dev
```

### Production (compiled JavaScript)

```bash
pnpm install
pnpm build
pnpm start
```

## Expected Output

```
Parent: Starting ProcessManager...
Parent: Spawning worker with dual channels...
Parent: Process spawned: worker-1
Worker: Starting...
Worker: Setting up control channel (stdio)...
Worker: Control channel ready
Worker: Setting up data channel at \\.\pipe\dual-channel-example-worker-1...
Worker: Data channel listening
Worker: Data channel client connected
Worker: Data channel ready
Worker: All channels ready
Parent: Process ready: worker-1
Parent: Both channels established

=== Control Channel (stdio) ===
Parent: Status: { status: 'running', uptime: 123 }
Parent: Config: { version: '1.0.0', features: [ 'dual-channel', 'msgpack', 'hot-reload' ] }

=== Data Channel (pipe + MessagePack) ===
Parent: Sending 1000 items via data channel...
Worker: Processing 1000 items...
Parent: Data channel result: { processed: 1000, sum: 49876.234 }
Parent: Sending 100x100 matrix via data channel...
Worker: Processing 100x100 matrix...
Parent: Matrix result: { sum: 5012.456, avg: 0.5012456 }

=== Shutdown ===
Parent: Sending shutdown command...
Worker: Shutting down...
Parent: Process exited: worker-1 (code: 0)
Parent: Stopping all processes...
Parent: Done
```

## Key Concepts

### ProcessManager

Manages child processes with automatic channel setup:

```ts
const manager = new ProcessManager({
  namespace: "my-app", // Used for auto-generating pipe paths
  restartPolicy: {
    enabled: true,
    maxRestarts: 3,
    backoffMs: 1000,
  },
});

const handle = await manager.spawn("worker-1", {
  executablePath: "node",
  args: ["worker.js"],

  // Control channel (always present, uses stdio)
  controlChannel: {
    // Uses defaults: line-delimited + JSON + JSON-RPC
  },

  // Optional data channel
  dataChannel: {
    enabled: true,
    // path auto-generated from namespace + id
    channel: {
      framing: "length-prefixed",
      serialization: new MessagePackCodec(),
      protocol: "jsonrpc",
    },
  },
});
```

### ProcessHandle API

```ts
// Use control channel (default)
await handle.request("getStatus");

// Use data channel explicitly
await handle.requestViaData("processItems", { items: [...] });

// Both use JSON-RPC protocol
```

### Worker Side Setup

Worker must:
1. Set up control channel on stdio
2. Read `ASPECT_IPC_DATA_PATH` env var
3. Create pipe server and listen
4. Handle requests on both channels

```ts
// Control channel (stdio)
const controlTransport = TransportFactory.createStdio({...});
const controlChannel = new ChannelBuilder()
  .withTransport(controlTransport)
  .withFraming(new LineDelimitedFraming())
  .withSerialization(new JsonCodec())
  .withProtocol(new JsonRpcProtocol())
  .build();

// Data channel (pipe server)
const dataPath = process.env.ASPECT_IPC_DATA_PATH;
const server = TransportFactory.createPipeServer();

server.onConnection((transport) => {
  const dataChannel = new ChannelBuilder()
    .withTransport(transport)
    .withFraming(new LengthPrefixedFraming())
    .withSerialization(new MessagePackCodec())
    .withProtocol(new JsonRpcProtocol())
    .build();

  dataChannel.onRequest("processItems", async (params) => {
    // Handle bulk data
  });
});

await server.listen(dataPath);
```

## Performance Considerations

### When to Use Each Channel

| Use Case | Channel | Reason |
|----------|---------|--------|
| Status check | Control | Small payload, infrequent |
| Configuration update | Control | Human-readable, debuggable |
| Process 1000 items | Data | Large payload, binary efficient |
| Stream video frames | Data | High throughput, binary |
| Heartbeat | Control | Low overhead |
| Log aggregation | Data | High volume |

### MessagePack Benefits

Compared to JSON:
- **20-50% smaller** payloads
- **2-5x faster** encode/decode
- **Binary-safe** (no base64 needed)

Example (1000 items):
- JSON: ~80KB, 5ms encode
- MessagePack: ~45KB, 2ms encode

## Platform Notes

### Pipe Path Generation

- **Windows**: `\\.\pipe\<namespace>-<id>`
- **Unix**: `/tmp/<namespace>-<id>.sock`

ProcessManager handles this automatically via `PipePath.forModule()`.

### Manual Path Handling

```ts
import { PipePath } from "@aspect-ipc/transport/utils";

const path = PipePath.forModule("my-app", "worker-1");
// Windows: \\.\pipe\my-app-worker-1
// Unix: /tmp/my-app-worker-1.sock
```

## Troubleshooting

### "Data channel connection timeout"

**Cause**: Worker failed to start pipe server before parent tried to connect.

**Solution**:
- Increase `startupTimeout` in spawn options
- Check worker logs for errors
- Verify `ASPECT_IPC_DATA_PATH` is set

### "EADDRINUSE" on Unix

**Cause**: Stale socket file from previous run.

**Solution**:
```ts
const server = TransportFactory.createPipeServer({
  unlinkOnListen: true, // Remove stale socket
});
```

### MessagePack serialization error

**Cause**: Worker and parent using different codecs.

**Solution**: Ensure both sides use `MessagePackCodec` for data channel.

## Next Steps

- Add custom codecs (Protobuf, Arrow) for specialized data
- Implement streaming over data channel
- Add authentication/encryption layers
- Monitor channel metrics (throughput, latency)

See [transport README](../../transport/README.md) for advanced patterns.
