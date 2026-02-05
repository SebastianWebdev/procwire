# @procwire/bun-client

Child-side API for Procwire IPC — **Bun.js optimized**.

Drop-in alternative to `@procwire/client` using Bun-native APIs (`Bun.listen()` for named pipe server, Bun socket handlers) for lower overhead and tighter runtime integration.

## Highlights

- **Client** — Fluent builder for registering handlers
- **RequestContext** — `respond`, `ack`, `chunk`, `end`, `error`
- **Event emission** to parent process
- **Cancellation** via `ctx.aborted` and `ctx.onAbort()`
- **Async response methods** — backpressure-safe via `BunDrainWaiter`
- **Bun-native I/O** — `Bun.listen()` for pipe server, no cork/uncork

## Installation

```bash
bun add @procwire/bun-client
```

**Requirements:** Bun >= 1.0

**Dependencies:** `@procwire/protocol`, `@procwire/codecs`

## Quick Start

```typescript
import { Client } from "@procwire/bun-client";

const client = new Client()
  .handle("query", async (data, ctx) => {
    const results = await search(data);
    await ctx.respond(results);
  })
  .handle("insert", async (data, ctx) => {
    await ctx.ack({ accepted: true });
    await processInBackground(data);
  })
  .event("progress");

await client.start();

// Emit events to parent
await client.emitEvent("progress", { percent: 50 });
```

## API Reference

### Client

Fluent builder for registering method handlers and events.

```typescript
const client = new Client(options?)
  .handle(name, handler, definition?)
  .event(name, definition?)
  .start();
```

#### Constructor Options

```typescript
interface ClientOptions {
  defaultCodec?: Codec;  // Default codec for all methods/events
}
```

#### `.handle(name, handler, definition?)`

Register a method handler.

```typescript
client.handle("process", async (data, ctx) => {
  // Handle request and send response
  await ctx.respond(result);
}, {
  response: "result",      // "result" | "stream" | "ack" | "none"
  codec: msgpackCodec,     // Optional, defaults to msgpack
  cancellable: true,       // Support AbortSignal from parent
});
```

#### `.event(name, definition?)`

Register an event that can be emitted to parent.

```typescript
client.event("progress", { codec: msgpackCodec });
```

#### `.start()`

Start listening for requests from parent.

```typescript
await client.start();
// Client is now ready to receive requests
```

#### `.emitEvent(name, data)`

Emit an event to the parent process.

```typescript
await client.emitEvent("progress", { percent: 75 });
```

#### `.shutdown()`

Graceful shutdown — closes socket and pipe server.

```typescript
await client.shutdown();
```

### RequestContext

Passed to method handlers to send responses back to parent.

```typescript
interface RequestContext {
  readonly requestId: number;   // For correlation
  readonly method: string;      // Method being handled
  readonly aborted: boolean;    // Was request aborted?

  onAbort(callback: () => void): void;  // Abort callback

  respond(data: unknown): Promise<void>;  // Full response
  ack(data?: unknown): Promise<void>;     // Acknowledgment only
  chunk(data: unknown): Promise<void>;    // Stream chunk
  end(): Promise<void>;                   // End stream
  error(err: Error | string): Promise<void>;  // Error response
}
```

**Important:** All response methods are async to handle backpressure. Always `await` them.

### Streaming Responses

```typescript
client.handle("generate", async (data, ctx) => {
  for (const item of data.items) {
    if (ctx.aborted) break;
    await ctx.chunk(process(item));
  }
  await ctx.end();
}, { response: "stream", cancellable: true });
```

### Cancellation

```typescript
client.handle("longTask", async (data, ctx) => {
  const resources = await acquireResources();

  // Register cleanup on abort
  ctx.onAbort(() => {
    resources.release();
  });

  // Check abort status periodically
  for (const item of items) {
    if (ctx.aborted) {
      return;  // Stop processing
    }
    await ctx.chunk(process(item));
  }

  await ctx.end();
}, { response: "stream", cancellable: true });
```

### Error Handling

```typescript
import { ProcwireClientError, ClientErrors } from "@procwire/bun-client";

// Error factories
ClientErrors.cannotAddHandlerAfterStart();  // handle() called after start()
ClientErrors.alreadyStarted();              // start() called twice
ClientErrors.notConnected();                // Operation before connection
ClientErrors.unknownEvent("unknown");       // Unknown event name
ClientErrors.responseAlreadySent();         // Double response
```

## Differences from `@procwire/client`

This package has the **same API surface** as `@procwire/client` but uses Bun-native primitives under the hood:

| Concern       | `@procwire/client` (Node.js)               | `@procwire/bun-client` (Bun)                     |
| ------------- | ------------------------------------------ | ------------------------------------------------ |
| Pipe server   | `net.createServer()`                       | `Bun.listen()`                                   |
| Backpressure  | `socket.cork()`/`uncork()` + `drain` event | `BunDrainWaiter` + `socket.write()` return value |
| Atomic writes | cork/uncork batching                       | `Buffer.concat()` before write                   |
| Tests         | Vitest                                     | `bun:test`                                       |

Switching between runtimes requires only changing the import:

```diff
-import { Client } from "@procwire/client";
+import { Client } from "@procwire/bun-client";
```

## Architecture

```
┌─────────────────────────────────────────┐
│            Parent Process               │
│  ┌───────────────────────────────────┐  │
│  │  Module (uses @procwire/bun-core) │  │
│  │   - send(), stream(), onEvent()   │  │
│  └───────────────┬───────────────────┘  │
└──────────────────┼──────────────────────┘
                   │
    ┌──────────────┴──────────────┐
    │  Control: stdio (JSON-RPC)  │
    │  Data: named pipe (BINARY)  │
    └──────────────┬──────────────┘
                   │
┌──────────────────┼──────────────────────┐
│            Child Process                │
│  ┌───────────────┴───────────────────┐  │
│  │ Client (uses @procwire/bun-client)│  │
│  │  - handle(), event(), emitEvent() │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## License

MIT