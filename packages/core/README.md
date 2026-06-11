# @procwire/core

Parent-side module system for Procwire IPC.

## Highlights

- **Module** - Fluent builder for defining worker processes
- **ModuleManager** - Spawn, lifecycle management, restart policies
- **Response types** - `result`, `stream`, `ack`, `none`
- **Automatic retry/restart** on failure with configurable backoff
- **AbortController** cancellation support
- **~2.5 GB/s throughput** on named pipes

## Installation

```bash
npm install @procwire/core
```

**Requirements:** Node.js >= 22

**Dependencies:** `@procwire/protocol`, `@procwire/codecs`

## Quick Start

```typescript
import { Module, ModuleManager } from "@procwire/core";
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
  .maxPayloadSize(bytes)
  .requestTimeout(ms);
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
  codec: msgpackCodec, // Serialization codec
  response: "result", // "result" | "stream" | "ack" | "none"
  timeout: 30000, // Optional timeout in ms
  cancellable: true, // Support AbortController
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
  initTimeout: 30000, // Timeout for $init message
  maxRetries: 3, // Spawn retry attempts
  retryDelay: { type: "exponential", base: 1000, max: 30000 },
  restartOnCrash: true, // Auto-restart on unexpected exit
  restartLimit: { maxRestarts: 5, windowMs: 60000 },
  heartbeat: { intervalMs: 5000, timeoutMs: 15000 }, // Liveness check (off by default)
  socketBufferSize: 4 * 1024 * 1024, // 4MB for large payloads
});
```

##### Heartbeat (liveness)

The optional `heartbeat` policy detects a worker that is still running but hung. The parent sends `$ping` over the control plane (stdin) every `intervalMs`; if the matching `$pong` does not arrive within `timeoutMs`, the worker is killed and the normal crash/restart path runs (so `restartOnCrash` applies). Disabled by default.

```typescript
module.spawnPolicy({
  restartOnCrash: true,
  heartbeat: { intervalMs: 5000, timeoutMs: 15000 },
});
```

#### `.requestTimeout(ms)`

Set the default per-request timeout for `result`/`ack` methods. **By default, requests time out after 30 seconds (30000 ms)** — `send()` never hangs forever out of the box. Pass `0` to disable the default for this module.

Precedence per request: child schema timeout → per-method `timeout` → this module default.

```typescript
module.requestTimeout(60000); // 60s default for all methods
module.requestTimeout(0); // disable the default timeout
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

#### Graceful shutdown

`manager.shutdown()` sends a `$shutdown` message over the control plane; a Procwire client closes its pipe server and exits on its own — no signal needed. If the process has not exited within 5 seconds, it is force-killed (SIGKILL) as a fallback.

### Module States

```typescript
type ModuleState =
  | "created" // Defined but not spawned
  | "initializing" // Process started, waiting for $init
  | "connecting" // Connecting data channel
  | "ready" // Fully operational
  | "disconnected" // Lost connection (may restart)
  | "closed"; // Terminated
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
import { ProcwireError, SpawnError, ModuleErrors, ManagerErrors } from "@procwire/core";

try {
  await manager.spawn();
} catch (e) {
  if (e instanceof SpawnError) {
    console.log(`Failed after ${e.attempts} attempts`);
    console.log(`Last error: ${e.lastError}`);
  }
}

// Error factories
ModuleErrors.notReady("worker"); // Module not ready
ModuleErrors.methodNotFound("unknown"); // Unknown method
ModuleErrors.timeout("process", 30000); // Request timeout

ManagerErrors.notRegistered("worker"); // Module not registered
ManagerErrors.alreadyRegistered("worker"); // Duplicate registration
```

### Events

```typescript
import { ManagerEvents, ModuleEvents } from "@procwire/core";

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

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Parent Process                          │
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
    │   (Python)     │ │   (Node)    │ │   (Rust)     │
    └────────────────┘ └─────────────┘ └──────────────┘
```

Communication channels:

- **Control Plane (stdio):** JSON-RPC 2.0 - handshake, heartbeat
- **Data Plane (named pipe):** Binary protocol - user data (~2.5 GB/s)

## License

MIT
