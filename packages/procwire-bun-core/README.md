# @procwire/bun-core

Parent-side module system for Procwire IPC — **Bun.js optimized**.

Drop-in alternative to `@procwire/core` using Bun-native APIs (`Bun.spawn()`, `Bun.listen()`, `Bun.connect()`) for lower overhead and tighter runtime integration.

## Highlights

- **Module** — Fluent builder for defining worker processes
- **ModuleManager** — Spawn, lifecycle management, restart policies
- **Response types** — `result`, `stream`, `ack`, `none`
- **Automatic retry/restart** on failure with configurable backoff
- **AbortController** cancellation support
- **Bun-native I/O** — `Bun.spawn()` + `Bun.connect()` instead of Node.js child_process/net
- **BunDrainWaiter** — backpressure handling via Bun socket drain callbacks

## Installation

```bash
bun add @procwire/bun-core
```

**Requirements:** Bun >= 1.0

**Dependencies:** `@procwire/protocol`, `@procwire/codecs`

## Quick Start

```typescript
import { Module, ModuleManager } from "@procwire/bun-core";
import { msgpackCodec, arrowCodec } from "@procwire/codecs";

// Define a module
const worker = new Module("worker")
  .executable("python", ["worker.py"])
  .method("process", { codec: msgpackCodec })
  .method("batch", { codec: arrowCodec, response: "stream" })
  .event("progress");

// Spawn via manager
const manager = new ModuleManager();
manager.register(worker);
await manager.spawn();

// Single response
const result = await worker.send("process", data);

// Streaming response
for await (const chunk of worker.stream("batch", items)) {
  console.log(chunk);
}

// Listen to events
worker.onEvent("progress", (p) => console.log(`${p}%`));

// Shutdown
await manager.shutdown();
```

## API Reference

### Module

Fluent builder for defining a worker module.

```typescript
const module = new Module("name")
  .executable(command, args, options?)
  .method(name, config)
  .event(name, config?)
  .spawnPolicy(policy)
  .maxPayloadSize(bytes);
```

#### `.executable(command, args, options?)`

Set the command to spawn the worker process.

```typescript
module.executable("python", ["worker.py"], {
  cwd: "/path/to/working/dir",
  env: { CUSTOM_VAR: "value" },
});
```

#### `.method(name, config)`

Register a method the worker can handle.

```typescript
module.method("process", {
  codec: msgpackCodec,        // Serialization codec
  response: "result",         // "result" | "stream" | "ack" | "none"
  timeout: 30000,             // Optional timeout in ms
  cancellable: true,          // Support AbortController
});
```

#### `.event(name, config?)`

Register an event the worker can emit.

```typescript
module.event("progress", { codec: msgpackCodec });
```

#### `.spawnPolicy(policy)`

Configure spawn and restart behavior.

```typescript
module.spawnPolicy({
  initTimeout: 30000,         // Timeout for $init message
  maxRetries: 3,              // Spawn retry attempts
  retryDelay: { type: "exponential", base: 1000, max: 30000 },
  restartOnCrash: true,       // Auto-restart on unexpected exit
  restartLimit: { maxRestarts: 5, windowMs: 60000 },
  socketBufferSize: 4 * 1024 * 1024,  // 4MB for large payloads
});
```

### Communication

#### `module.send(method, data, options?)`

Send a request and wait for response.

```typescript
const result = await module.send("process", { input: "data" });

// With cancellation
const controller = new AbortController();
const result = await module.send("process", data, {
  signal: controller.signal,
});
// controller.abort() to cancel
```

#### `module.stream(method, data, options?)`

Send a request and iterate over streamed chunks.

```typescript
for await (const chunk of module.stream("batch", items)) {
  processChunk(chunk);
}
```

#### `module.onEvent(name, callback)`

Listen to events from the worker.

```typescript
module.onEvent("progress", (data) => {
  console.log(`Progress: ${data.percent}%`);
});
```

### ModuleManager

Orchestrates module lifecycle.

```typescript
const manager = new ModuleManager();

// Register modules
manager.register(worker1);
manager.register(worker2);

// Spawn all or specific
await manager.spawn();           // All registered
await manager.spawn("worker1");  // Specific module

// Get module
const mod = manager.get("worker1");

// Check registration
if (manager.has("worker1")) { ... }

// Shutdown all or specific
await manager.shutdown();          // All
await manager.shutdown("worker1"); // Specific
```

### Module States

```typescript
type ModuleState =
  | "created"       // Defined but not spawned
  | "initializing"  // Process started, waiting for $init
  | "connecting"    // Connecting data channel
  | "ready"         // Fully operational
  | "disconnected"  // Lost connection (may restart)
  | "closed";       // Terminated
```

### Response Types

| Type     | Description         | Parent API                               |
| -------- | ------------------- | ---------------------------------------- |
| `result` | Single response     | `await module.send()`                    |
| `stream` | Multiple chunks     | `for await (... of module.stream())`     |
| `ack`    | Acknowledgment only | `await module.send()` (returns ack data) |
| `none`   | Fire-and-forget     | `module.send()` (returns immediately)    |

### Error Handling

```typescript
import { ProcwireError, SpawnError, ModuleErrors, ManagerErrors } from "@procwire/bun-core";

try {
  await manager.spawn();
} catch (e) {
  if (e instanceof SpawnError) {
    console.log(`Failed after ${e.attempts} attempts`);
    console.log(`Last error: ${e.lastError}`);
  }
}

// Error factories
ModuleErrors.notReady("worker", "created");
ModuleErrors.unknownMethod("unknown");
ModuleErrors.timeout("process");

ManagerErrors.notRegistered("worker");
ManagerErrors.alreadyRegistered("worker");
```

### Events

```typescript
import { ManagerEvents, ModuleEvents } from "@procwire/bun-core";

// Manager events
manager.on(ManagerEvents.READY, (name) => console.log(`${name} ready`));
manager.on(ManagerEvents.ERROR, (name, err) => console.error(`${name} error:`, err));
manager.on(ManagerEvents.RESTARTING, (name) => console.log(`${name} restarting`));
manager.on(ManagerEvents.SPAWN_FAILED, (name, err) => console.error(`${name} spawn failed`));

// Module events
module.on(ModuleEvents.STATE, (state) => console.log(`State: ${state}`));
module.on(ModuleEvents.ERROR, (err) => console.error(err));
module.on(ModuleEvents.DISCONNECTED, () => console.log("Disconnected"));
```

## Differences from `@procwire/core`

This package has the **same API surface** as `@procwire/core` but uses Bun-native primitives under the hood:

| Concern        | `@procwire/core` (Node.js)                 | `@procwire/bun-core` (Bun)                       |
| -------------- | ------------------------------------------ | ------------------------------------------------ |
| Process spawn  | `child_process.spawn()`                    | `Bun.spawn()`                                    |
| Socket connect | `net.connect()`                            | `Bun.connect()`                                  |
| Backpressure   | `socket.cork()`/`uncork()` + `drain` event | `BunDrainWaiter` + `socket.write()` return value |
| Atomic writes  | cork/uncork batching                       | `Buffer.concat()` before write                   |
| Tests          | Vitest                                     | `bun:test`                                       |

Switching between runtimes requires only changing the import:

```diff
-import { Module, ModuleManager } from "@procwire/core";
+import { Module, ModuleManager } from "@procwire/bun-core";
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Parent Process (Bun)                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   ModuleManager                       │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │   Module    │  │   Module    │  │   Module    │  │  │
│  │  │  "worker1"  │  │  "worker2"  │  │  "worker3"  │  │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │  │
│  └─────────┼────────────────┼────────────────┼─────────┘  │
└────────────┼────────────────┼────────────────┼────────────┘
             │                │                │
    ┌────────┴───────┐ ┌──────┴──────┐ ┌───────┴──────┐
    │ Child Process  │ │ Child Proc  │ │ Child Proc   │
    │   (Python)     │ │   (Bun)     │ │   (Rust)     │
    └────────────────┘ └─────────────┘ └──────────────┘
```

Communication channels:
- **Control Plane (stdio):** JSON-RPC 2.0 — handshake, heartbeat
- **Data Plane (named pipe):** Binary protocol — user data

## License

MIT