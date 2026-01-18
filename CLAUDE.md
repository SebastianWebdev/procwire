# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **pnpm monorepo** for Node.js/TypeScript IPC (Inter-Process Communication) building blocks under the `@aspect-ipc/*` namespace. The project provides a modular, high-performance IPC transport library with zero runtime dependencies in the core package.

### Packages

- `@aspect-ipc/transport` - Core transport library (zero runtime dependencies)
- `@aspect-ipc/codec-msgpack` - MessagePack codec (peer dep: `@msgpack/msgpack`)
- `@aspect-ipc/codec-protobuf` - Protocol Buffers codec (peer dep: `protobufjs`)
- `@aspect-ipc/codec-arrow` - Apache Arrow IPC codec (peer dep: `apache-arrow`)

## Commands

### Setup

```bash
corepack enable
pnpm install
```

### Development

```bash
pnpm ci                  # Lint + typecheck + test + build (CI pipeline)
pnpm lint                # ESLint check
pnpm typecheck           # TypeScript type checking
pnpm test                # Run tests with Vitest
pnpm build               # Build all packages
pnpm format              # Format with Prettier
pnpm clean               # Remove build artifacts
```

### Publishing

```bash
pnpm changeset           # Create a changeset
pnpm version-packages    # Bump versions and update changelogs
pnpm release             # Publish to npm
```

### Per-Package Commands

All packages support the same scripts when run from their directory:

```bash
cd transport
pnpm typecheck           # TypeScript check (no emit)
pnpm build               # Compile TypeScript
pnpm test                # Run Vitest tests
pnpm clean               # Remove dist/ and build artifacts
```

## Architecture

The library uses a **layered architecture** where each layer is independent and replaceable:

```
Application Layer (ProcessManager, ChannelPair)
         ↓
Channel Layer (RequestChannel, StreamChannel)
         ↓
Protocol Layer (JSON-RPC 2.0, custom protocols)
         ↓
Serialization Layer (JSON, MessagePack, Protobuf, Arrow)
         ↓
Framing Layer (line-delimited, length-prefixed)
         ↓
Transport Layer (stdio, named pipes, unix sockets)
         ↓
OS Layer (child_process, net.Server/Socket)
```

### Core Abstractions

1. **Transport**: Raw byte transfer between endpoints (stdio, pipes, sockets)
2. **Framing**: Message boundary detection in byte streams
3. **Serialization**: Conversion between objects and binary representation
4. **Protocol**: Application-level message protocol (request/response, notifications)
5. **Channel**: High-level communication combining all layers

### Key Design Principles

- **Zero dependencies** in core package (`@aspect-ipc/transport`)
- **Modular**: Each layer is independent and replaceable
- **Type-safe**: Full TypeScript support with generics
- **Cross-platform**: Windows (Named Pipes), macOS/Linux (Unix sockets)

## Codebase Structure

### Transport Package Structure

```
transport/
├── src/
│   ├── index.ts              # Re-exports all modules
│   ├── transport/
│   │   ├── index.ts          # Public exports
│   │   └── types.ts          # Transport interfaces
│   ├── framing/
│   │   ├── index.ts
│   │   └── types.ts          # FramingCodec interface
│   ├── serialization/
│   │   ├── index.ts
│   │   └── types.ts          # SerializationCodec interface
│   ├── protocol/
│   │   ├── index.ts
│   │   └── types.ts          # Protocol interfaces
│   ├── channel/
│   │   ├── index.ts
│   │   └── types.ts          # Channel interfaces
│   └── process/
│       ├── index.ts
│       └── types.ts          # ProcessManager interfaces
├── test/
│   └── sanity.test.ts
└── package.json
```

### Package Exports

The transport package uses subpath exports for selective imports:

- `@aspect-ipc/transport` - Main entry (re-exports all)
- `@aspect-ipc/transport/transport` - Transport layer only
- `@aspect-ipc/transport/framing` - Framing layer only
- `@aspect-ipc/transport/serialization` - Serialization layer only
- `@aspect-ipc/transport/protocol` - Protocol layer only
- `@aspect-ipc/transport/channel` - Channel layer only
- `@aspect-ipc/transport/process` - Process management only

### Important Files

- [`docs/aspect-ipc-transport-architecture.md`](docs/aspect-ipc-transport-architecture.md) - Comprehensive architecture documentation with diagrams, interfaces, and usage examples
- [`pnpm-workspace.yaml`](pnpm-workspace.yaml) - Workspace configuration
- [`package.json`](package.json) - Root package with shared scripts
- [`tsconfig.base.json`](tsconfig.base.json) - Base TypeScript config
- [`eslint.config.js`](eslint.config.js) - ESLint configuration
- [`.prettierrc.json`](.prettierrc.json) - Prettier formatting rules

## TypeScript Configuration

- **Module**: ESM (`"type": "module"` in package.json)
- **Target**: ES2022+
- Uses TypeScript project references for incremental builds
- Each package has `tsconfig.json` (for development) and `tsconfig.build.json` (for production builds)

## Code Style

### ESLint Rules

- Prefer type imports: `import type { Foo } from './foo.js'`
- Unused vars must be prefixed with `_`
- Standard TypeScript recommended rules

### Prettier Rules

- Print width: 100
- Tab width: 2
- Double quotes
- Semicolons required
- Trailing commas: all

### File Extensions

- All imports must use `.js` extension (for ESM compatibility), even when importing `.ts` files
- TypeScript will resolve `.ts` files during compilation

## Testing

- Uses **Vitest** for testing
- Tests are in `test/` directories within each package
- Currently has sanity tests; implementation tests are not yet written
- Run tests: `pnpm test` (root) or `pnpm -r test` (all packages)

## Implementation Status

The project is in **early development**. The architecture documentation in [`docs/aspect-ipc-transport-architecture.md`](docs/aspect-ipc-transport-architecture.md) is comprehensive but the implementation has only stub files with type definitions. Key files currently contain only interface definitions without implementations.

## CI/CD

- CI workflow: `.github/workflows/release.yml` (for automated releases)
- Uses Changesets for version management
- Manual publishing workflow documented in README

## Monorepo Management

- Uses **pnpm workspaces** with workspace protocol (`workspace:*`, `workspace:^`)
- All packages share dev dependencies (hoisted to root)
- Each codec package has its own peer dependencies
