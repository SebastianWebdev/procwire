# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ FIRST: Read Local Rules

**BEZWZGLĘDNIE** przeczytaj i przestrzegaj zasad z pliku [`.claude/rules/local.md`](.claude/rules/local.md). Ten plik definiuje folder roboczy agenta, zarządzanie taskami i memory. Zasady z `local.md` mają najwyższy priorytet.

## Project Overview

This is a **pnpm monorepo** for Node.js/TypeScript IPC (Inter-Process Communication) building blocks under the `@procwire/*` namespace. The project provides a modular, high-performance IPC transport library with zero runtime dependencies in the core package.

The data plane uses a binary protocol (zero JSON); the control plane uses JSON-RPC over stdio.

### Packages

- `@procwire/protocol` - Wire format, framing, flags (11-byte header)
- `@procwire/codecs` - rawCodec, msgpackCodec, arrowCodec
- `@procwire/core` - Parent-side: ModuleManager, Module
- `@procwire/client` - Child-side: Client, RequestContext
- `@procwire-bun/core` - Parent-side for Bun.js
- `@procwire-bun/client` - Child-side for Bun.js
- `packages/bench` - Benchmarks (not published to npm)

## Architecture

### Dual-Channel Architecture

```
Control Plane (stdio)     - JSON-RPC 2.0    - Handshake, heartbeat, lifecycle
Data Plane (named pipe)   - BINARY PROTOCOL - User data, high throughput
```

**CRITICAL RULE**: Data Plane = Binary Protocol = ZERO JSON

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

## TypeScript Configuration

- **Module**: ESM (`"type": "module"` in package.json)
- **Target**: ES2022+
- **Module Resolution**: NodeNext (supports both ESM and CommonJS interop)
- Uses TypeScript project references for incremental builds
- Each package has two configs:
  - `tsconfig.json` - Development config (includes tests)
  - `tsconfig.build.json` - Production build config (excludes tests)

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

All four checks MUST pass before considering a task complete.

## Git Diff for Review

When the user requests a git diff (for code review purposes), **always save it to a file** instead of outputting to console:

```bash
git diff <commit-range> > <filename>.diff
```

## CI/CD

- CI workflow: `.github/workflows/release.yml` (for automated releases)
- Uses Changesets for version management

## Monorepo Management

- Uses **pnpm workspaces** with workspace protocol (`workspace:*`, `workspace:^`)
- All packages share dev dependencies (hoisted to root)
- Each codec package has its own peer dependencies
