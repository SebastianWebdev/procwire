# @procwire/transport

## 0.4.0

### Minor Changes

- [#33](https://github.com/SebastianWebdev/procwire/pull/33) [`3a50087`](https://github.com/SebastianWebdev/procwire/commit/3a50087247dd2fc9fe5c4e177e2a734e295d3b32) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - perf(framing): optimize LengthPrefixedFraming to avoid Buffer.concat overhead

  Replace `Buffer.concat()` calls with pre-allocated buffers and direct copying in `encode()`, `peekBytes()`, and `takeBytes()` methods. This eliminates the O(n) memory reallocation that occurred with each TCP chunk for large payloads.

  **Performance improvement for 100MB payloads:**
  - Before: ~7 MB/s throughput
  - After: ~1.1 GB/s throughput (~150x faster)

  fix(transport): implement Wire Protocol Spec for data channel connection timing

  ProcessManager now waits for `__data_channel_ready__` notification from worker before connecting to the data channel socket. This prevents race conditions where the manager tries to connect before the worker has created the socket.

  feat(transport): implement graceful shutdown per Wire Protocol Spec 7.3

  ProcessManager now sends `__shutdown__` request and waits for worker to drain pending requests before cleanup.

  fix(sdk): add data channel ready notification support

  WorkerChannel now sends `__data_channel_ready__` notification when data channel is established.

## 0.3.0

### Minor Changes

- [#30](https://github.com/SebastianWebdev/procwire/pull/30) [`be7cd05`](https://github.com/SebastianWebdev/procwire/commit/be7cd05c9f057a6a900bdab582a2914f9b1ca19c) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - ## Add comprehensive resilience features for IPC process management

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
  export type {
    HeartbeatOptions,
    HeartbeatEventMap,
    HeartbeatState,
    WorkerLoad,
  } from "./heartbeat";

  // Reconnect
  export { ReconnectManager, DEFAULT_RECONNECT_OPTIONS } from "./reconnect";
  export type {
    ReconnectOptions,
    ReconnectEventMap,
    ReconnectState,
    Reconnectable,
  } from "./reconnect";

  // Shutdown
  export { ShutdownManager, DEFAULT_SHUTDOWN_OPTIONS } from "./shutdown";
  export type { ShutdownOptions, ShutdownEventMap, ShutdownState, Shutdownable } from "./shutdown";

  // Resilience (unified)
  export { ResilientProcessHandle, DEFAULT_RESILIENT_OPTIONS } from "./resilience";
  export type {
    ResilientProcessOptions,
    ResilientProcessEvents,
    IResilientProcessHandle,
  } from "./resilience";

  // Reserved methods
  export { ReservedMethods, isReservedMethod, validateReservedMethod } from "./protocol";
  export type {
    HeartbeatPingParams,
    HeartbeatPongParams,
    ShutdownParams,
    ShutdownAckResult,
    ShutdownReason,
  } from "./protocol";
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
  resilient.on("shutdownComplete", ({ graceful }) =>
    console.log(`Shutdown ${graceful ? "graceful" : "forced"}`),
  );

  resilient.start();

  // Later...
  await resilient.shutdown("user_requested");
  ```

## 0.2.0

### Minor Changes

- [#28](https://github.com/SebastianWebdev/procwire/pull/28) [`3bb167b`](https://github.com/SebastianWebdev/procwire/commit/3bb167b4ff333a6c27dbf3cc509b19d54f23e8be) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - ### Stability & Reliability Fixes

  **Critical Fixes:**
  - Fix race condition in `RequestChannel.start()` - clean up transport subscriptions when `connect()` fails, preventing memory leaks
  - Fix `maxInboundFrames` limit enforcement - check limit before processing each frame (DoS protection)
  - Make `terminateAll()` resilient to individual failures using `Promise.allSettled`

  **High Priority Fixes:**
  - Fix memory leak in notification buffer by enforcing sliding window limit
  - Add Unix socket path length validation (104 char limit for cross-platform compatibility)
  - Replace hardcoded `/tmp` with configurable `baseDir` using `os.tmpdir()`
  - Use `transitionState()` consistently in `SocketTransport` and `StdioTransport` for validated state transitions

  **New Features:**
  - Add metrics hooks (`onBytesReceived`, `onBytesSent`, `onFrameDecoded`, `onFrameEncoded`) to transports, framing, and channels
  - Add `onMiddlewareError` callback option for middleware error handling
  - Add optional signal handlers (SIGTERM/SIGINT) for `ProcessManager`
  - Add constructor validation for `SocketTransport`, `StdioTransport`, `LineDelimitedFraming`, `LengthPrefixedFraming`, `ProcessManager`, `RequestChannel`

  **Testing & Documentation:**
  - Add performance benchmarks (throughput, latency percentiles, payload sizes)
  - Add memory leak tests (repeated requests, concurrent, connect/disconnect cycles)
  - Add comprehensive tests for all stability fixes
  - Enhance JSDoc documentation with `@example`, `@throws`, `@see` annotations

## 0.1.3

### Patch Changes

- [#8](https://github.com/SebastianWebdev/procwire/pull/8) [`4317aa6`](https://github.com/SebastianWebdev/procwire/commit/4317aa68c2026d0f31789eeaf219a9edcadcfec0) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Added `provenance: true` to publish configuration to support npm Trusted Publishing.

## 0.1.2

### Patch Changes

- [#5](https://github.com/SebastianWebdev/procwire/pull/5) [`054ff80`](https://github.com/SebastianWebdev/procwire/commit/054ff8084b01ea9525089db7b1d15d75e98fae1a) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Update homepage urls

- [#6](https://github.com/SebastianWebdev/procwire/pull/6) [`100a3e6`](https://github.com/SebastianWebdev/procwire/commit/100a3e6e22f7405aa48d344eb4f03a83c92b043b) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Fix critical race condition in ProcessManager channel initialization

  Fixed a critical bug where `transport.connect()` was called before `controlChannel.start()`, causing the channel to miss subscribing to transport events before the child process started emitting data.

  **The Problem:**

  When ProcessManager spawned a child process, it would:
  1. Call `transport.connect()` - spawning the child process
  2. Call `controlChannel.start()` - which would see the transport was already connected and skip resubscribing to events

  This meant that any data emitted by the child process immediately after spawn (like `runtime.ready` notifications) would be lost, as the channel hadn't subscribed to transport events yet.

  **The Fix:**

  Changed the initialization order in ProcessManager.spawn() to call `controlChannel.start()` BEFORE the transport connects. Since `RequestChannel.start()` internally calls `transport.connect()` if needed, this ensures:
  1. Channel subscribes to transport events FIRST
  2. Transport connects (spawning the child process) SECOND
  3. Any early data from the child process is captured

  This issue was particularly evident in CI environments where timing characteristics differ from local development machines.

- [#6](https://github.com/SebastianWebdev/procwire/pull/6) [`b64c7a7`](https://github.com/SebastianWebdev/procwire/commit/b64c7a7bd1f4a56df734ae6c09e0ed692b0819d0) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Fix EADDRINUSE test failures in fast CI environments

  Improves test reliability by preventing named pipe conflicts in channel-integration tests. Uses high-resolution unique identifiers and adds cleanup delay to handle Windows named pipe resource timing.

- [#5](https://github.com/SebastianWebdev/procwire/pull/5) [`f9f96b4`](https://github.com/SebastianWebdev/procwire/commit/f9f96b40833fa2f3979c6bd0b165f02b598fd66f) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Fix race condition in notification handling for child processes

  This patch fixes a critical race condition where notifications sent by child processes immediately after spawn could be lost due to timing issues between process startup and handler registration. The issue was particularly evident in CI environments on Windows.

  **Changes:**
  1. **Event subscription ordering** - RequestChannel now subscribes to transport events before connecting, ensuring no early data is lost
  2. **Early notification buffering** - Added automatic buffering (default: 10 messages) for notifications received before handlers are registered
  3. **Automatic delivery** - Buffered notifications are automatically delivered when handlers are registered
  4. **ProcessManager integration** - All channels created by ProcessManager now have early notification buffering enabled by default

  **API Additions:**
  - `ChannelOptions.bufferEarlyNotifications?: number` - Configure buffer size for early notifications
  - `ChannelBuilder.withBufferEarlyNotifications(size: number)` - Fluent API to set buffer size

  This is a backwards-compatible change with no breaking changes to existing APIs.

- [#6](https://github.com/SebastianWebdev/procwire/pull/6) [`ea63619`](https://github.com/SebastianWebdev/procwire/commit/ea63619eea639107311f4c749a6b3fa2c952c253) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Fix race condition in ProcessManager.restartProcess()

  Applies the same control channel initialization order fix from f85abba to the restartProcess() method. The control channel must be started before the transport connects to ensure event subscriptions are in place before the child process begins emitting data.

  This fixes intermittent test failures in CI where notifications sent immediately after process restart were lost.

## 0.1.1

### Patch Changes

- Downgrade to 0.1.0 (initial development phase)

## 1.0.0

### Major Changes

- e2a9b04: Initial release of @procwire packages

  This is the first public release of the @procwire monorepo, providing modular IPC building blocks for Node.js.

  **Core Package:**
  - `@procwire/transport` - Zero-dependency IPC transport library
    - Multiple transports: stdio, named pipes (Windows), Unix sockets (Linux/macOS)
    - Pluggable framing: line-delimited, length-prefixed
    - Built-in serialization: JSON, raw binary
    - Protocol support: JSON-RPC 2.0, custom protocols
    - ProcessManager with configurable restart policies
    - Full TypeScript support with comprehensive type definitions

  **Codec Packages:**
  - `@procwire/codec-msgpack` - MessagePack serialization codec (20-50% smaller than JSON)
  - `@procwire/codec-protobuf` - Protocol Buffers codec with schema validation
  - `@procwire/codec-arrow` - Apache Arrow IPC codec for columnar data

  **Features:**
  - Modular architecture - replace any layer independently
  - Type-safe with full TypeScript generics
  - Cross-platform support (Windows, macOS, Linux)
  - Zero runtime dependencies in core package
  - Production-ready with error handling and process management
