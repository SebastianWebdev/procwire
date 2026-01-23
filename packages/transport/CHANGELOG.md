# @procwire/transport

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
