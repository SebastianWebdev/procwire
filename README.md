# Procwire

High-performance, type-safe IPC (Inter-Process Communication) for Node.js and Bun. `@procwire/protocol` has **zero runtime dependencies**; `core` and `client` depend only on `@procwire/codecs` (MessagePack + Arrow).

Procwire connects a parent process to child worker processes over a **dual-channel** transport:

- **Control plane** — child stdio, JSON-RPC 2.0. Handshake, heartbeat, lifecycle.
- **Data plane** — named pipe / Unix domain socket, a compact **binary protocol** (11-byte header). User data, high throughput (target >1 GB/s).

JSON-RPC stays on the small, infrequent control messages; user data never pays the JSON tax.

## Packages

| Package                                                  | Role                                                                          |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **[@procwire/protocol](packages/protocol)**              | Wire format, framing, flags (11-byte header), `FrameBuffer`                   |
| **[@procwire/codecs](packages/codecs)**                  | `rawCodec`, `msgpackCodec`, `arrowCodec`                                      |
| **[@procwire/core](packages/core)**                      | Parent side: `ModuleManager`, `Module` (spawn, lifecycle, restart, heartbeat) |
| **[@procwire/client](packages/client)**                  | Child side: `Client`, `RequestContext`                                        |
| **[@procwire/bun-core](packages/procwire-bun-core)**     | Parent side for the Bun runtime                                               |
| **[@procwire/bun-client](packages/procwire-bun-client)** | Child side for the Bun runtime                                                |

The Node and Bun implementations are identical on the wire.

Two workspace tools are not published to npm: `packages/bench` (benchmarks) and `dashboard/` (benchmark dashboard).

## Quick Start

**Child** (the worker — `@procwire/client`):

```typescript
import { Client } from "@procwire/client";
import { msgpackCodec } from "@procwire/codecs";

const client = new Client()
  .handle(
    "process",
    async (data, ctx) => {
      ctx.respond(await doWork(data));
    },
    { codec: msgpackCodec },
  )
  .event("progress");

await client.start();
client.emitEvent("progress", { percent: 50 });
```

**Parent** (spawns and talks to the worker — `@procwire/core`):

```typescript
import { Module, ModuleManager } from "@procwire/core";
import { msgpackCodec } from "@procwire/codecs";

const worker = new Module("worker")
  .executable("node", ["worker.js"])
  .method("process", { codec: msgpackCodec })
  .event("progress");

const manager = new ModuleManager();
manager.register(worker);
await manager.spawn("worker");

const result = await worker.send("process", data);
worker.onEvent("progress", (p) => console.log(`${p.percent}%`));

await manager.shutdown();
```

Each package's README has the full API. On Bun, use `@procwire/bun-core` / `@procwire/bun-client` — same API.

## Features

- **Binary data plane** — zero JSON for user data; target >1 GB/s for large payloads.
- **Response types** — `result`, `stream`, `ack`, `none`.
- **Lifecycle** — spawn, restart policies with backoff, graceful shutdown, opt-in heartbeat/liveness.
- **Backpressure** — bounded memory under slow consumers.
- **Cancellation** — `AbortController` support.
- **Type-safe** — builder pattern with generics; the parent defines the schema.
- **Cross-platform** — Named Pipes on Windows, Unix Domain Sockets on Linux/macOS.
- **Lean dependencies** — zero runtime dependencies in `@procwire/protocol`; `core`/`client` depend only on `@procwire/codecs` (MessagePack + Arrow).

## Architecture

```
Control Plane (stdio)      - JSON-RPC 2.0  - Handshake, heartbeat, lifecycle
Data Plane (named pipe)    - Binary        - User data, high throughput
```

Binary frame (data plane):

```
+----------+-------+----------+----------+----------------------+
| Method ID| Flags | Req ID   | Length   | Payload              |
| 2 bytes  | 1 byte| 4 bytes  | 4 bytes  | N bytes              |
+----------+-------+----------+----------+----------------------+
```

The `astro-docs/` site (Astro Starlight) holds the architecture notes and guides.

## Development

Requirements: **Node.js >= 22**, pnpm via Corepack.

```bash
corepack enable
pnpm install
pnpm ci          # lint + typecheck + test + build
```

Common commands:

```bash
pnpm lint        # ESLint
pnpm typecheck   # TypeScript
pnpm test        # Vitest
pnpm build       # Build all packages
pnpm format      # Prettier
pnpm clean       # Remove build artifacts
```

## Publishing

Versioning uses [Changesets](https://github.com/changesets/changesets):

```bash
pnpm changeset          # describe a change (interactive)
pnpm version-packages   # bump versions + changelogs
pnpm release            # build + publish to npm
```

CI release automation lives in [.github/workflows/release.yml](.github/workflows/release.yml); pushing to `main` with changesets triggers a release. See [docs/RELEASING.md](docs/RELEASING.md) for the full process.

## Platform Support

- **Runtimes:** Node.js >= 22, Bun (via the `@procwire/bun-*` packages).
- **OS:** Linux & macOS (Unix Domain Sockets), Windows (Named Pipes).

## License

MIT — see [LICENSE](LICENSE).
