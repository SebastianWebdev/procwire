# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **pnpm monorepo** for Node.js/TypeScript IPC (Inter-Process Communication) building blocks under the `@procwire/*` namespace. The project provides a modular, high-performance IPC transport library with zero runtime dependencies in the core package.

### Packages

- `@procwire/transport` - Core transport library (zero runtime dependencies)
- `@procwire/codec-msgpack` - MessagePack codec (peer dep: `@msgpack/msgpack`)
- `@procwire/codec-protobuf` - Protocol Buffers codec (peer dep: `protobufjs`)
- `@procwire/codec-arrow` - Apache Arrow IPC codec (peer dep: `apache-arrow`)

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
pnpm changeset           # Create a changeset (interactive CLI)
pnpm version-packages    # Bump versions and update changelogs
pnpm release             # Publish to npm
```

#### Creating Changesets Manually (for Claude Code)

The `pnpm changeset` command requires an interactive CLI which Claude Code cannot use. To create a changeset manually, create a markdown file in `.changeset/` directory with a descriptive name (e.g., `.changeset/my-feature.md`):

```markdown
---
"@procwire/transport": minor
"@procwire/codec-msgpack": patch
---

Description of the changes. Use `minor` for new features, `patch` for bug fixes, `major` for breaking changes.
```

The YAML frontmatter lists affected packages and their bump types. The body contains the changelog entry.

### Per-Package Commands

All packages support the same scripts when run from their directory:

```bash
cd transport
pnpm typecheck           # TypeScript check (no emit)
pnpm build               # Compile TypeScript
pnpm test                # Run Vitest tests
pnpm clean               # Remove dist/ and build artifacts
```

### Working with Examples

Examples are located in the `examples/` directory and demonstrate real-world usage:

```bash
# Build all examples
pnpm --filter "./examples/**" build

# Run a specific example
pnpm --filter ./examples/basic-stdio dev
pnpm --filter ./examples/dual-channel dev

# Rust worker example (requires Cargo)
cd examples/rust-worker/rust && cargo build --release && cd ../../..
pnpm --filter ./examples/rust-worker dev

# Clean examples
pnpm --filter "./examples/**" clean
```

Note: Examples are excluded from ESLint checks (see [eslint.config.js](eslint.config.js)).

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

- **Zero dependencies** in core package (`@procwire/transport`)
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
│   ├── process/
│   │   ├── index.ts
│   │   └── types.ts          # ProcessManager interfaces
│   └── utils/                # Internal utilities
│       ├── assert.ts         # Assertion helpers
│       ├── disposables.ts    # Disposable pattern
│       ├── errors.ts         # Error types and factories
│       ├── events.ts         # Event emitter utilities
│       ├── pipe-path.ts      # Cross-platform pipe path resolution
│       ├── platform.ts       # Platform detection
│       └── time.ts           # Timeout and timing utilities
├── test/
│   └── sanity.test.ts
└── package.json
```

### Package Exports

The transport package uses subpath exports for selective imports:

- `@procwire/transport` - Main entry (re-exports all)
- `@procwire/transport/transport` - Transport layer only
- `@procwire/transport/framing` - Framing layer only
- `@procwire/transport/serialization` - Serialization layer only
- `@procwire/transport/protocol` - Protocol layer only
- `@procwire/transport/channel` - Channel layer only
- `@procwire/transport/process` - Process management only

### Important Files

- [`docs/procwire-transport-architecture.md`](docs/procwire-transport-architecture.md) - Comprehensive architecture documentation with diagrams, interfaces, and usage examples
- [`pnpm-workspace.yaml`](pnpm-workspace.yaml) - Workspace configuration
- [`package.json`](package.json) - Root package with shared scripts
- [`tsconfig.base.json`](tsconfig.base.json) - Base TypeScript config
- [`eslint.config.js`](eslint.config.js) - ESLint configuration
- [`.prettierrc.json`](.prettierrc.json) - Prettier formatting rules

## TypeScript Configuration

- **Module**: ESM (`"type": "module"` in package.json)
- **Target**: ES2022+
- **Module Resolution**: NodeNext (supports both ESM and CommonJS interop)
- Uses TypeScript project references for incremental builds
- Each package has two configs:
  - `tsconfig.json` - Development config (includes tests, extends base config)
  - `tsconfig.build.json` - Production build config (excludes tests, used by `pnpm build`)
- Base config at [`tsconfig.base.json`](tsconfig.base.json) with strict type checking enabled
- Path mappings allow importing packages via `@procwire/transport` during development

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

The project is in **early development**. The architecture documentation in [`docs/procwire-transport-architecture.md`](docs/procwire-transport-architecture.md) is comprehensive but the implementation has only stub files with type definitions. Key files currently contain only interface definitions without implementations.

### Implementation Patterns

When implementing features in this codebase:

1. **Each layer has a `types.ts`** - All interfaces and types are defined in separate `types.ts` files
2. **Export via `index.ts`** - Each module exports its public API through an `index.ts` file
3. **Utilities are internal** - The `utils/` directory contains shared internal utilities (events, errors, disposables, platform detection, etc.)
4. **Cross-platform support** - Use `utils/platform.ts` for OS detection and `utils/pipe-path.ts` for path resolution
5. **Error handling** - Use custom error types from `utils/errors.ts`
6. **Resource cleanup** - Use the disposable pattern from `utils/disposables.ts` for cleanup

## Task Completion Checklist

**IMPORTANT**: Before completing any coding task, ALWAYS run these commands to verify code quality:

```bash
pnpm format              # Format code with Prettier
pnpm lint                # Check ESLint rules
pnpm typecheck           # Verify TypeScript types
pnpm test                # Run all tests
```

All four checks MUST pass before considering a task complete. Fix any errors before committing.

## CI/CD

- CI workflow: `.github/workflows/release.yml` (for automated releases)
- Uses Changesets for version management
- Manual publishing workflow documented in README

## Monorepo Management

- Uses **pnpm workspaces** with workspace protocol (`workspace:*`, `workspace:^`)
- All packages share dev dependencies (hoisted to root)
- Each codec package has its own peer dependencies
