# @procwire/* Monorepo

Modular, type-safe IPC (Inter-Process Communication) building blocks for Node.js with **zero runtime dependencies**.

Build production-grade communication between Node.js processes with full control over every layer.

## Packages

### Core Transport

- **[@procwire/transport](transport/)** - Core IPC library (zero runtime dependencies)
  - Multiple transports: stdio, named pipes, unix sockets
  - Pluggable framing: line-delimited, length-prefixed
  - Built-in serialization: JSON, raw binary
  - Protocols: JSON-RPC 2.0, custom
  - ProcessManager with restart policies
  - Full TypeScript support

### Optional Codecs

- **[@procwire/codec-msgpack](codec-msgpack/)** - MessagePack serialization (20-50% smaller than JSON)
- **[@procwire/codec-protobuf](codec-protobuf/)** - Protocol Buffers (schema validation, cross-language)
- **[@procwire/codec-arrow](codec-arrow/)** - Apache Arrow (columnar data, analytics)

## Quick Start

```bash
npm install @procwire/transport
```

```typescript
import { createStdioChannel } from "@procwire/transport";

// Parent process
const channel = await createStdioChannel("node", {
  args: ["worker.js"],
});

const result = await channel.request("calculate", { expr: "2+2" });
console.log(result); // 4

await channel.close();
```

See [transport README](transport/README.md) for complete documentation and API reference.

## Package Naming

This repo uses scoped packages by default: `@procwire/*`.

If you need unscoped packages instead, use the `procwire-*` naming scheme:

- `@procwire/transport` → `procwire-transport`
- `@procwire/codec-msgpack` → `procwire-codec-msgpack`
- `@procwire/codec-protobuf` → `procwire-codec-protobuf`
- `@procwire/codec-arrow` → `procwire-codec-arrow`

Then update your imports similarly (e.g. `@procwire/transport` → `procwire-transport`). Deep imports follow the same rule.

## Examples

Complete, runnable examples in [examples/](examples/):

- **[basic-stdio](examples/basic-stdio/)** - Simple parent/child with JSON-RPC over stdio
- **[dual-channel](examples/dual-channel/)** - Control + data channels with MessagePack
- **[rust-worker](examples/rust-worker/)** - Cross-language IPC with Rust worker

### Running Examples

```bash
# Install dependencies
pnpm install

# Run basic example
pnpm --filter ./examples/basic-stdio dev

# Run dual-channel example
pnpm --filter ./examples/dual-channel dev

# Rust worker (requires Cargo)
cd examples/rust-worker/rust && cargo build --release && cd ../..
pnpm --filter ./examples/rust-worker dev
```

## Features

- **Zero dependencies** - Core package has no runtime dependencies
- **Modular** - Replace any layer (transport, framing, serialization, protocol)
- **Type-safe** - Full TypeScript support with generics
- **Cross-platform** - Windows (Named Pipes), macOS/Linux (Unix Sockets)
- **Performant** - Efficient binary protocols (MessagePack, Protobuf, Arrow)
- **Production-ready** - ProcessManager with restart policies, error handling

## Architecture

```
Application Layer (Your Code)
         ↓
Process Management (ProcessManager)
         ↓
Channel Layer (RequestChannel)
         ↓
Protocol Layer (JSON-RPC, custom)
         ↓
Serialization Layer (JSON, MessagePack, Protobuf, Arrow)
         ↓
Framing Layer (line-delimited, length-prefixed)
         ↓
Transport Layer (stdio, pipes, sockets)
```

Each layer is independent and replaceable. See [architecture documentation](docs/procwire-transport-architecture.md) for details.

## Development

### Requirements

- Node.js `>=18` (recommended: 20+)
- pnpm via Corepack

### Setup

```bash
corepack enable
pnpm install
pnpm ci
```

### Common Commands

```bash
# Lint
pnpm lint

# Type check
pnpm typecheck

# Run tests
pnpm test

# Build all packages
pnpm build

# Format code
pnpm format

# Clean build artifacts
pnpm clean

# Full CI pipeline
pnpm ci
```

### Working with Examples

```bash
# Build examples
pnpm --filter "./examples/**" build

# Run specific example
pnpm --filter ./examples/basic-stdio dev

# Clean examples
pnpm --filter "./examples/**" clean
```

## Publishing

This project uses [Changesets](https://github.com/changesets/changesets) for version management.

### Manual Release

```bash
# 1. Create a changeset
pnpm changeset

# 2. Bump versions and update changelogs
pnpm version-packages

# 3. Build and test
pnpm ci

# 4. Publish to npm
pnpm release
```

### Automated Release (CI)

CI release automation is configured in [.github/workflows/release.yml](.github/workflows/release.yml).

Push to `main` with changesets to trigger automated release.

## Documentation

- **[Transport README](transport/README.md)** - Complete API reference
- **[Architecture Docs](docs/procwire-transport-architecture.md)** - Detailed design documentation
- **[Examples](examples/)** - Runnable code examples

### Codec Documentation

- [MessagePack Codec](codec-msgpack/README.md)
- [Protobuf Codec](codec-protobuf/README.md)
- [Arrow Codec](codec-arrow/README.md)

## Use Cases

- **Microservices**: High-performance process-to-process communication
- **Worker Pools**: Distribute CPU-intensive tasks across processes
- **Plugin Systems**: Isolate plugins in separate processes
- **Cross-Language**: Node.js ↔ Rust/Go/Python workers
- **Data Processing**: Stream large datasets between processes
- **Hot Reload**: Restart workers without downtime

## Performance

Compared to HTTP/REST for local IPC:

- **10-100x lower latency** (no TCP/HTTP overhead)
- **Higher throughput** (efficient binary protocols)
- **Lower memory** (shared memory via pipes)

MessagePack vs JSON:

- **20-50% smaller** payloads
- **2-5x faster** encoding/decoding

See [examples/](examples/) for benchmarks.

## Platform Support

- **Node.js**: >=18
- **Operating Systems**:
  - Linux (Unix Domain Sockets)
  - macOS (Unix Domain Sockets)
  - Windows (Named Pipes)

## Contributing

Contributions are welcome! Please:

1. Open an issue to discuss major changes
2. Follow existing code style (ESLint + Prettier)
3. Add tests for new features
4. Update documentation

## License

MIT - See [LICENSE](LICENSE) for details.

## Roadmap

### v0.1.0 (Current)
- Core transport, framing, serialization, protocol layers
- Stdio and pipe/socket transports
- ProcessManager with restart policies
- Optional codecs: MessagePack, Protobuf, Arrow

### v0.2.0 (Planned)
- HTTP/WebSocket transports
- Streaming support
- Compression layer
- Metrics and monitoring

### v1.0.0 (Future)
- Stable API
- Production-tested
- Performance optimizations

## Support

- **Issues**: [GitHub Issues](https://github.com/your-org/ipc-bridge-core/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/ipc-bridge-core/discussions)
