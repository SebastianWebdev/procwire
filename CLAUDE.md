# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **pnpm monorepo** for Node.js/TypeScript IPC (Inter-Process Communication) building blocks under the `@procwire/*` namespace. The project provides a modular, high-performance IPC transport library with zero runtime dependencies in the core package.

**STATUS: v2.0 refactoring in progress** - The library is being refactored to use a binary protocol for the data plane. See `docs/next/` for the new architecture.

### Packages

- `@procwire/transport` - Core transport library (zero runtime dependencies)
- `@procwire/codec-msgpack` - MessagePack codec (peer dep: `@msgpack/msgpack`)
- `@procwire/codec-protobuf` - Protocol Buffers codec (peer dep: `protobufjs`)
- `@procwire/codec-arrow` - Apache Arrow IPC codec (peer dep: `apache-arrow`)

## Architecture (v2.0 - in development)

The library is being refactored to v2.0 with a new binary protocol for the data plane.

### Key Architecture Documents

- [`docs/next/ARCHITECTURE-CONTEXT.md`](docs/next/ARCHITECTURE-CONTEXT.md) - **READ THIS FIRST** - Explains why the architecture changed
- [`docs/next/PLAN.md`](docs/next/PLAN.md) - Implementation plan with all tasks
- [`docs/next/CHECKLIST.md`](docs/next/CHECKLIST.md) - Agent guidelines and checkpoints

### Dual-Channel Architecture

```
Control Plane (stdio)     - JSON-RPC 2.0    - Handshake, heartbeat, lifecycle
Data Plane (named pipe)   - BINARY PROTOCOL - User data, high throughput
```

**CRITICAL RULE**: Data Plane = Binary Protocol = ZERO JSON

The old architecture used JSON-RPC on both channels, which destroyed performance (~30 MB/s vs ~2.5 GB/s).

### Wire Format (Data Plane)

```
+----------+-------+----------+----------+----------------------+
| Method ID| Flags | Req ID   | Length   | Payload              |
| 2 bytes  | 1 byte| 4 bytes  | 4 bytes  | N bytes              |
+----------+-------+----------+----------+----------------------+
```

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
cd packages/transport
pnpm typecheck           # TypeScript check (no emit)
pnpm build               # Compile TypeScript
pnpm test                # Run Vitest tests
pnpm clean               # Remove dist/ and build artifacts
```

## Codebase Structure

### Transport Package Structure

```
packages/transport/
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
│   │   └── types.ts          # Protocol interfaces (JSON-RPC for control plane)
│   ├── channel/
│   │   ├── index.ts
│   │   └── types.ts          # Channel interfaces (TO BE REFACTORED)
│   ├── process/
│   │   ├── index.ts
│   │   └── types.ts          # ProcessManager interfaces (TO BE REFACTORED)
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

- [`docs/next/`](docs/next/) - v2.0 architecture documentation (source of truth)
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
- Run tests: `pnpm test` (root) or `pnpm -r test` (all packages)

## Task Completion Checklist

**IMPORTANT**: Before completing any coding task, ALWAYS run these commands to verify code quality:

```bash
pnpm format              # Format code with Prettier
pnpm lint                # Check ESLint rules
pnpm typecheck           # Verify TypeScript types
pnpm test                # Run all tests
```

All four checks MUST pass before considering a task complete. Fix any errors before committing.

## Git Diff for Review

When the user requests a git diff (for code review purposes), **always save it to a file** instead of outputting to console. Use this pattern:

```bash
git diff <commit-range> > <filename>.diff
```

Examples:

- `git diff HEAD~1 > task-a5.diff` - Last commit
- `git diff main..HEAD > feature-branch.diff` - All commits on current branch vs main
- `git diff --staged > staged-changes.diff` - Staged changes only

This allows for easier review of larger diffs in an editor with syntax highlighting.

## CI/CD

- CI workflow: `.github/workflows/release.yml` (for automated releases)
- Uses Changesets for version management
- Manual publishing workflow documented in README

## Monorepo Management

- Uses **pnpm workspaces** with workspace protocol (`workspace:*`, `workspace:^`)
- All packages share dev dependencies (hoisted to root)
- Each codec package has its own peer dependencies
