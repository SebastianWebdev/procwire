---
"@procwire/transport": minor
---

## Add comprehensive resilience features for IPC process management

This release introduces a complete resilience layer for managing child processes with health monitoring, automatic recovery, and graceful shutdown capabilities.

### Heartbeat Manager (`HeartbeatManager`)

Health monitoring through ping/pong protocol:

- Configurable ping interval, timeout, and max missed threshold
- Automatic dead detection when `maxMissed` pongs are not received
- Recovery detection when communication resumes after missed heartbeats
- Implicit heartbeat support (any message counts as heartbeat)
- Worker load reporting in pong responses (CPU, memory, queue depth)
- Events: `heartbeat:ping`, `heartbeat:pong`, `heartbeat:missed`, `heartbeat:recovered`, `heartbeat:dead`

### Reconnect Manager (`ReconnectManager`)

Automatic reconnection with sophisticated retry logic:

- Exponential backoff with configurable base delay, multiplier, and max delay
- Optional jitter (0-1) to prevent thundering herd
- Request queueing during reconnection with configurable timeout
- Circuit breaker pattern with max attempts limit
- Detailed state tracking (attempt count, queue size, timing)
- Events: `reconnect:attempting`, `reconnect:success`, `reconnect:failed`, `reconnect:request-queued`, `reconnect:request-timeout`

### Shutdown Manager (`ShutdownManager`)

Graceful shutdown protocol with escalation:

- Sends `__shutdown__` request to allow worker cleanup
- Waits for `__shutdown_ack__` with pending request count
- Listens for `__shutdown_complete__` notification
- Configurable graceful timeout before force kill
- Escalation: graceful request → SIGTERM → SIGKILL
- Events: `shutdown:start`, `shutdown:ack`, `shutdown:complete`, `shutdown:done`, `shutdown:timeout`

### ResilientProcessHandle

Unified wrapper combining all resilience features:

- Wraps standard `ProcessHandle` with resilience capabilities
- All features independently configurable or disableable (`false`)
- Partial options merged with sensible defaults
- Health status tracking (`isHealthy`, `isReconnecting`)
- Request queueing during reconnection attempts
- Forwards all underlying handle events plus resilience events
- Clean resource management with `start()`, `stop()`, `close()`

### Reserved Methods Protocol

Standard wire protocol for resilience features:

- `__heartbeat_ping__` / `__heartbeat_pong__` - Health check protocol
- `__shutdown__` / `__shutdown_ack__` / `__shutdown_complete__` - Graceful shutdown protocol
- Type definitions: `HeartbeatPingParams`, `HeartbeatPongParams`, `ShutdownParams`, `ShutdownAckResult`
- Method validation utilities: `isReservedMethod()`, `validateReservedMethod()`

### New Exports

```typescript
// Heartbeat
export { HeartbeatManager, DEFAULT_HEARTBEAT_OPTIONS } from "./heartbeat";
export type { HeartbeatOptions, HeartbeatEventMap, HeartbeatState, WorkerLoad } from "./heartbeat";

// Reconnect
export { ReconnectManager, DEFAULT_RECONNECT_OPTIONS } from "./reconnect";
export type { ReconnectOptions, ReconnectEventMap, ReconnectState, Reconnectable } from "./reconnect";

// Shutdown
export { ShutdownManager, DEFAULT_SHUTDOWN_OPTIONS } from "./shutdown";
export type { ShutdownOptions, ShutdownEventMap, ShutdownState, Shutdownable } from "./shutdown";

// Resilience (unified)
export { ResilientProcessHandle, DEFAULT_RESILIENT_OPTIONS } from "./resilience";
export type { ResilientProcessOptions, ResilientProcessEvents, IResilientProcessHandle } from "./resilience";

// Reserved methods
export { ReservedMethods, isReservedMethod, validateReservedMethod } from "./protocol";
export type { HeartbeatPingParams, HeartbeatPongParams, ShutdownParams, ShutdownAckResult, ShutdownReason } from "./protocol";
```

### Example Usage

```typescript
import { ProcessManager, ResilientProcessHandle } from "@procwire/transport";

const manager = new ProcessManager();
const handle = await manager.spawn("worker", { executablePath: "node", args: ["worker.js"] });

const resilient = new ResilientProcessHandle(handle, {
  heartbeat: { interval: 5000, timeout: 1000, maxMissed: 3 },
  reconnect: { maxAttempts: 5, initialDelay: 100, maxDelay: 5000 },
  shutdown: { gracefulTimeoutMs: 10000 },
});

resilient.on("heartbeatDead", () => console.log("Worker unresponsive"));
resilient.on("reconnecting", ({ attempt }) => console.log(`Reconnect attempt ${attempt}`));
resilient.on("shutdownComplete", ({ graceful }) => console.log(`Shutdown ${graceful ? "graceful" : "forced"}`));

resilient.start();

// Later...
await resilient.shutdown("user_requested");
```
