# @procwire/transport

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
