# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ FIRST: Read Agent Memory

**PRZED ROZPOCZĘCIEM PRACY** przeczytaj [`AGENT_MEMORY.md`](AGENT_MEMORY.md) - zawiera krótkie podsumowanie projektu, ostatnich decyzji, bugów i ważnych informacji między sesjami.

### Kiedy aktualizować Agent Memory

**ZAWSZE** aktualizuj `AGENT_MEMORY.md` na koniec sesji lub po zakończeniu znaczącego taska:

1. **Ukończone taski** - dodaj do sekcji "TODO / W Trakcie" z checkboxem `[x]`
2. **Nowe taski** - dodaj do sekcji "TODO / W Trakcie" z checkboxem `[ ]`
3. **Ważne decyzje architektoniczne** - dodaj do "Ostatnie Ważne Decyzje" z datą
4. **Naprawione bugi** - dodaj krótki postmortem do "Ostatnie Ważne Decyzje"
5. **Benchmark results** - aktualizuj tabelę jeśli wyniki się zmieniły
6. **Nowe notatki** - dodaj do "Notatki dla Agenta" jeśli odkryłeś coś ważnego

### Co zapisywać (przykłady)

```markdown
### 2026-01-31: Nazwa decyzji/buga

**Problem:** Krótki opis problemu
**Root cause:** Co było przyczyną
**Fix:** Jak naprawiono
**Commit:** `abc1234` (opcjonalnie)
```

### Czego NIE zapisywać

- Drobne refaktory bez wpływu na architekturę
- Poprawki literówek, formatowania
- Zmiany w dokumentacji (chyba że znaczące)
- Rzeczy już udokumentowane w `docs/next/`

## Task Management (docs/next/tasks/)

Folder `docs/next/tasks/` to centralne miejsce zarządzania taskami projektu.

### Struktura

```
docs/next/tasks/
├── todo/           # Taski do zrobienia (TASK-XX-nazwa.md)
├── done/           # Ukończone taski (przenoszone z todo/)
└── README.md       # Opis konwencji (opcjonalnie)
```

### Gdy user prosi o "napisanie taska" lub "zrobienie taska"

1. **Napisanie taska** = utworzenie pliku `docs/next/tasks/todo/TASK-XX-nazwa.md`
2. **Zrobienie taska** = implementacja według pliku z `todo/`, potem przeniesienie do `done/`

### Format pliku taska

```markdown
# TASK-XX: Krótki tytuł

## Cel

Co chcemy osiągnąć.

## Zakres

- [ ] Subtask 1
- [ ] Subtask 2

## Kontekst

Dlaczego to robimy, powiązane pliki, decyzje.

## Definition of Done

- Testy przechodzą
- Dokumentacja zaktualizowana
- Code review (jeśli wymagane)
```

### Po ukończeniu taska - OBOWIĄZKOWE

1. **Przenieś plik** z `todo/` do `done/`
2. **Zaktualizuj `AGENT_MEMORY.md`**:
   - Dodaj wpis `[x] TASK-XX: ...` w sekcji "TODO / W Trakcie"
   - Jeśli wystąpił bug lub ważna decyzja → dodaj do "Ostatnie Ważne Decyzje"
   - Jeśli odkryłeś coś przydatnego → dodaj do "Notatki dla Agenta"

**PAMIĘTAJ:** Memory musi zawierać wzmiankę o każdym zrealizowanym tasku. Jeśli podczas pracy wyszedł jakiś bug, edge case lub istotna informacja architektoniczna - zapisz to w memory, aby kolejne sesje mogły z tego skorzystać.

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
