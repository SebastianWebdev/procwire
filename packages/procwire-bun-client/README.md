# @procwire/bun-client

Child-side API for Procwire IPC — **Bun.js optimized**.

Alternative to `@procwire/client` using Bun-native APIs (`Bun.listen()` for named pipe server, Bun socket handlers) for lower overhead and tighter runtime integration. It exposes the same runtime API, speaks the same wire format and ships the same typed schema generics (`Client<S>`, `ExtractSchema`) as the Node package — a drop-in replacement.

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
    await ctx.respond(result);
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
await client.emitEvent("progress", { percent: 75 });
```

#### `.shutdown()`

Graceful shutdown — closes socket and pipe server.

```typescript
await client.shutdown();
```

### Lifecycle

The client also shuts down automatically in two cases:

- **`$shutdown` from the parent** — when the parent calls `manager.shutdown()`, it sends a `$shutdown` control message; the client shuts down cleanly so the parent never has to force-kill it.
- **stdin EOF (parent death)** — if the parent process dies (or closes the child's stdin), the control stream ends and the client shuts down, so the child exits instead of living on as an orphan.

Shutdown is immediate: the stdin reader is cancellable, so a pending control-plane read never pins the Bun event loop past `shutdown()`.

### stdout is the control plane

The client talks JSON-RPC to the parent over **stdout** (`$init`, `$pong`).
Library writes go through `process.stdout.write` directly, so a patched or
replaced `console` (loggers, silencers) cannot break the channel. The reverse
contract applies to your handler code: regular logging is fine (the parent
ignores non-JSON lines), but **do not print bare JSON-RPC lines** (text
starting with `{`) to stdout - they could be parsed as control messages.
Prefer `console.error`/stderr for diagnostics.

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

### Streaming Responses

```typescript
client.handle(
  "generate",
  async (data, ctx) => {
    for (const item of data.items) {
      if (ctx.aborted) break;
      await ctx.chunk(process(item));
    }
    await ctx.end();
  },
  { response: "stream", cancellable: true },
);
```

### Cancellation

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
import { ProcwireClientError, ClientErrors } from "@procwire/bun-client";

// Error factories
ClientErrors.cannotAddHandlerAfterStart(); // handle() called after start()
ClientErrors.alreadyStarted(); // start() called twice
ClientErrors.notConnected(); // Operation before connection
ClientErrors.unknownEvent("unknown"); // Unknown event name
ClientErrors.responseAlreadySent(); // Double response
```

## Differences from `@procwire/client`

This package has the same runtime API, wire format and typed schema generics (`Client<S>`, `ExtractSchema`, handlers receiving a `TypedRequestContext`) as `@procwire/client`; only the primitives under the hood are Bun-native. Since both packages share the IPC core in `@procwire/runtime-core`, the typing is identical by construction and pinned by compile-only type tests.

**Type-safety note** (applies to the Node package too): the typed `handle` overload keeps an untyped string fallback for schema-less usage, so a typo'd method name on a fully typed client still compiles — the handler data resolves to `unknown` instead of failing the build. Prefer method names taken from `keyof ExtractSchema<typeof client>["methods"]` where that matters.

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
