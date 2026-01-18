# Basic Stdio IPC Example

Demonstrates the simplest IPC pattern using `@procwire/transport`:

- Parent spawns child process via stdio
- Line-delimited JSON-RPC protocol
- Request/response pattern
- Bidirectional notifications

## Architecture

```
┌─────────────────────────────────────────────┐
│ Parent Process (parent.ts)                  │
│ ┌─────────────────────────────────────────┐ │
│ │ createStdioChannel()                    │ │
│ │  • LineDelimitedFraming                 │ │
│ │  • JsonCodec                            │ │
│ │  • JsonRpcProtocol                      │ │
│ └─────────────────────────────────────────┘ │
└─────────────────┬───────────────────────────┘
                  │ stdin/stdout
                  │ (line-delimited JSON-RPC)
┌─────────────────┴───────────────────────────┐
│ Child Process (worker.js)                   │
│ ┌─────────────────────────────────────────┐ │
│ │ Manual JSON-RPC handler                 │ │
│ │  • readline (stdin)                     │ │
│ │  • console.log (stdout)                 │ │
│ │  • Handler registry                     │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

## Features Demonstrated

1. **Spawning child process** - `createStdioChannel()` convenience helper
2. **Request/response** - `channel.request('add', { a, b })`
3. **Notifications (parent → child)** - `channel.notify('shutdown')`
4. **Notifications (child → parent)** - Worker logs via notifications
5. **Graceful shutdown** - Cleanup on exit

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
Parent: Starting...
Parent: Channel established
Parent: [Worker Log] Worker started
Parent: Sending add(2, 3)...
Parent: [Worker Log] Processed add
Parent: Result: 5
Parent: Sending multiply(4, 5)...
Parent: [Worker Log] Processed multiply
Parent: Result: 20
Parent: Sending greeting...
Parent: [Worker Log] Processed greet
Parent: Result: Hello, Alice!
Parent: Sending shutdown notification...
Parent: [Worker Log] Shutting down...
Parent: Closing channel...
Parent: Done
```

## Key Concepts

### Parent Side

Uses `createStdioChannel()` which provides:
- **StdioTransport** - Spawns child and manages stdio streams
- **LineDelimitedFraming** - Splits stream by newlines
- **JsonCodec** - JSON serialization
- **JsonRpcProtocol** - JSON-RPC 2.0 protocol

```ts
const channel = await createStdioChannel("node", {
  args: ["./worker.js"],
  timeout: 5000,
});

// Request/response
const result = await channel.request("add", { a: 2, b: 3 });

// Notification
channel.notify("shutdown", {});

// Listen for notifications
channel.onNotification("log", (params) => {
  console.log(params.message);
});
```

### Worker Side

Implements JSON-RPC manually using only Node.js built-ins:
- Uses `readline` to read line-delimited JSON from stdin
- Uses `console.log()` to write JSON-RPC messages to stdout
- Handler registry for methods

```js
// Read requests
const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const request = JSON.parse(line);
  handleRequest(request);
});

// Send response
console.log(JSON.stringify({ jsonrpc: "2.0", id, result }));

// Send notification
console.log(JSON.stringify({ jsonrpc: "2.0", method, params }));
```

## Customization

You can customize the channel configuration:

```ts
import { ChannelBuilder, StdioTransport } from "@procwire/transport";
import { LineDelimitedFraming } from "@procwire/transport/framing";
import { JsonCodec } from "@procwire/transport/serialization";
import { JsonRpcProtocol } from "@procwire/transport/protocol";

const transport = new StdioTransport({
  executablePath: "node",
  args: ["worker.js"],
  cwd: process.cwd(),
});

const channel = new ChannelBuilder()
  .withTransport(transport)
  .withFraming(new LineDelimitedFraming())
  .withSerialization(new JsonCodec())
  .withProtocol(new JsonRpcProtocol())
  .withTimeout(5000)
  .build();

await channel.start();
```

## Next Steps

- See [dual-channel](../dual-channel/) for advanced multi-channel setup
- See [rust-worker](../rust-worker/) for cross-language IPC
- Check [transport README](../../transport/README.md) for full API documentation
