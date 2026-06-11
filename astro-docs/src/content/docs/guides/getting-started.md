---
title: Getting Started
description: Getting started guide for Procwire
sidebar:
  order: 0
---

## Features

Procwire provides:

- **Binary protocol** for the data plane (JSON-RPC only on the control plane)
- **Builder pattern** for a type-safe API
- **Response types**: none, ack, result, stream
- **Cancellation** with AbortController support
- **Target performance**: >1 GB/s for large payloads

## Installation

The parent process needs `@procwire/core`, the child (worker) process needs `@procwire/client`, and both use codecs from `@procwire/codecs`:

```bash
# Parent process
npm i @procwire/core @procwire/codecs

# Child process
npm i @procwire/client @procwire/codecs
```

On Bun, use `@procwire/bun-core` / `@procwire/bun-client` instead — same runtime API and wire format (the typed schema generics from the Node packages are not yet available on Bun).

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

## What happens under the hood

1. `manager.spawn()` starts the child process and reads its stdout (the JSON-RPC control plane).
2. The child's `client.start()` creates a named pipe server (Unix domain socket on Linux/macOS, Named Pipe on Windows) and sends a `$init` message over stdout carrying the pipe path and its method/event schema.
3. The parent validates the schema against the `Module` definition and connects to the pipe.
4. From then on, all user data flows over the pipe as binary frames (11-byte header + codec-encoded payload) — zero JSON. The stdio control plane is only used for lifecycle messages (`$ping`/`$pong` heartbeat, `$shutdown`).

## Next steps

- [Core Concepts](/guides/concepts/) — response types, codecs, lifecycle, backpressure, cancellation
- [Architecture](/guides/architecture/) — wire format and control-plane protocol
