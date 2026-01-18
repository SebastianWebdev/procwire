---
"@aspect-ipc/transport": major
"@aspect-ipc/codec-msgpack": major
"@aspect-ipc/codec-protobuf": major
"@aspect-ipc/codec-arrow": major
---

Initial release of @aspect-ipc packages

This is the first public release of the @aspect-ipc monorepo, providing modular IPC building blocks for Node.js.

**Core Package:**

- `@aspect-ipc/transport` - Zero-dependency IPC transport library
  - Multiple transports: stdio, named pipes (Windows), Unix sockets (Linux/macOS)
  - Pluggable framing: line-delimited, length-prefixed
  - Built-in serialization: JSON, raw binary
  - Protocol support: JSON-RPC 2.0, custom protocols
  - ProcessManager with configurable restart policies
  - Full TypeScript support with comprehensive type definitions

**Codec Packages:**

- `@aspect-ipc/codec-msgpack` - MessagePack serialization codec (20-50% smaller than JSON)
- `@aspect-ipc/codec-protobuf` - Protocol Buffers codec with schema validation
- `@aspect-ipc/codec-arrow` - Apache Arrow IPC codec for columnar data

**Features:**

- Modular architecture - replace any layer independently
- Type-safe with full TypeScript generics
- Cross-platform support (Windows, macOS, Linux)
- Zero runtime dependencies in core package
- Production-ready with error handling and process management
