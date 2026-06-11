# @procwire/client

Child-side API for Procwire IPC.

## Highlights

- **Client** - Fluent builder for registering handlers
- **RequestContext** - `respond`, `ack`, `chunk`, `end`, `error`
- **Event emission** to parent process
- **Cancellation** via `ctx.aborted` and `ctx.onAbort()`
- **Async response methods** - backpressure-safe
- **~2.5 GB/s throughput** on named pipes

## Installation

```bash
npm install @procwire/client
```

**Requirements:** Node.js >= 22

**Dependencies:** `@procwire/protocol`, `@procwire/codecs`

## Quick Start

```typescript
import { Client } from "@procwire/client";

const client = new Client()
  .handle("query", async (data, ctx) => {
    const results = await search(data);
    ctx.respond(results);
  })
  .handle("insert", async (data, ctx) => {
    ctx.ack({ accepted: true });
    await processInBackground(data);
  })
  .event("progress");

await client.start();

// Emit events to parent
client.emitEvent("progress", { percent: 50 });
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
  defaultCodec?: Codec; // Default codec for all methods/events
  maxPayloadSize?: number; // Max accepted inbound payload in bytes
}
```

`maxPayloadSize` guards against oversized frames: a frame declaring a larger payload is rejected and the connection is dropped. Defaults to the `FrameBuffer` default (1GB).

#### `.handle(name, handler, definition?)`

Register a method handler.

```typescript
client.handle(
  "process",
  async (data, ctx) => {
    // Handle request and send response
    ctx.respond(result);
  },
  {
    response: "result", // "result" | "stream" | "ack" | "none"
    codec: msgpackCodec, // Optional, defaults to msgpack
    cancellable: true, // Support AbortSignal from parent
  },
);
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
client.emitEvent("progress", { percent: 75 });
```

#### `.shutdown()`

Graceful shutdown — closes the data socket and pipe server so the process can exit.

```typescript
await client.shutdown();
```

### Lifecycle

The client also shuts down automatically in two cases:

- **`$shutdown` from the parent** — when the parent calls `manager.shutdown()`, it sends a `$shutdown` control message; the client shuts down cleanly so the parent never has to force-kill it.
- **stdin EOF (parent death)** — if the parent process dies (or closes the child's stdin), the control stream ends and the client shuts down, so the child exits instead of living on as an orphan.

### RequestContext

Passed to method handlers to send responses back to parent.

```typescript
interface RequestContext {
  readonly requestId: number; // For correlation
  readonly method: string; // Method being handled
  readonly aborted: boolean; // Was request aborted?

  onAbort(callback: () => void): void; // Abort callback

  respond(data: unknown): Promise<void>; // Full response
  ack(data?: unknown): Promise<void>; // Acknowledgment only
  chunk(data: unknown): Promise<void>; // Stream chunk
  end(): Promise<void>; // End stream
  error(err: Error | string): Promise<void>; // Error response
}
```

**Important:** All response methods are async to handle backpressure. Always `await` them.

### Response Patterns

#### Single Response (`result`)

```typescript
client.handle(
  "query",
  async (data, ctx) => {
    const result = await processQuery(data);
    await ctx.respond(result);
  },
  { response: "result" },
);
```

#### Streaming Response (`stream`)

```typescript
client.handle(
  "generate",
  async (data, ctx) => {
    for (const item of generateItems(data)) {
      await ctx.chunk(item);
    }
    await ctx.end();
  },
  { response: "stream" },
);
```

#### Acknowledgment (`ack`)

```typescript
client.handle(
  "enqueue",
  async (data, ctx) => {
    await ctx.ack({ queued: true, position: 42 });
    // Continue processing after acknowledgment
    await processInBackground(data);
  },
  { response: "ack" },
);
```

#### Fire-and-Forget (`none`)

```typescript
client.handle(
  "log",
  (data, ctx) => {
    logger.info(data);
    // No response needed
  },
  { response: "none" },
);
```

#### Error Response

```typescript
client.handle("validate", async (data, ctx) => {
  try {
    const result = validate(data);
    await ctx.respond(result);
  } catch (e) {
    await ctx.error(e);
  }
});
```

### Cancellation

Handle request cancellation from parent.

```typescript
client.handle(
  "longTask",
  async (data, ctx) => {
    const resources = await acquireResources();

    // Register cleanup on abort
    ctx.onAbort(() => {
      resources.release();
    });

    // Check abort status periodically
    for (const item of items) {
      if (ctx.aborted) {
        return; // Stop processing
      }
      await ctx.chunk(process(item));
    }

    await ctx.end();
  },
  { response: "stream", cancellable: true },
);
```

### Error Handling

```typescript
import { ProcwireClientError, ClientErrors } from "@procwire/client";

// Error factories
ClientErrors.methodNotFound("unknown"); // Unknown method called
ClientErrors.handlerError("process", err); // Handler threw error
ClientErrors.alreadyStarted(); // start() called twice
```

## Architecture

```
┌─────────────────────────────────────────┐
│            Parent Process               │
│  ┌───────────────────────────────────┐  │
│  │   Module (uses @procwire/core)    │  │
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
│  │  Client (uses @procwire/client)   │  │
│  │  - handle(), event(), emitEvent() │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## License

MIT
