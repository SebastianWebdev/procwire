---
title: Core Concepts
description: Core concepts for Procwire IPC library
---

# Core Concepts

## Dual-Channel Architecture

Procwire uses a dual-channel architecture to optimize for different use cases:

| Channel           | Transport                | Protocol     | Characteristics                             |
| ----------------- | ------------------------ | ------------ | ------------------------------------------- |
| **Control Plane** | stdio                    | JSON-RPC 2.0 | Small messages (<1KB), rare, infrastructure |
| **Data Plane**    | Named Pipe / Unix Socket | Binary       | Large messages (MB/GB), frequent, user data |

## Why Two Channels?

### Control Plane (stdio)

- Handshake at startup
- Heartbeat (health checks)
- Shutdown commands
- Schema exchange
- JSON-RPC is fine here - messages are small and rare

### Data Plane (named pipe)

- User data: embeddings, vectors, images
- Computation results
- Streaming data
- **Binary protocol required** - JSON-RPC would destroy performance

## Key Insight

> JSON-RPC on Data Plane = ~30 MB/s
> Binary Protocol on Data Plane = ~2.5 GB/s

This 80x difference is why Procwire uses a binary wire format on the data plane.

## Highlights

- **Binary wire format** with 11-byte header
- **Zero JSON serialization** for user data
- **Zero-copy accumulation** for large payloads
- **Schema-first design** - parent defines the contract

## Response Types

Every method declares one of four response types:

| Type     | Behavior                                                         | Parent API                           |
| -------- | ---------------------------------------------------------------- | ------------------------------------ |
| `result` | Single full response                                             | `await module.send()`                |
| `stream` | Multiple chunks, then an end-of-stream frame                     | `for await (... of module.stream())` |
| `ack`    | Early acknowledgment; the handler may keep working in background | `await module.send()`                |
| `none`   | Fire-and-forget; no response frame at all                        | `module.send()` resolves immediately |

The child sets the response with `ctx.respond()`, `ctx.ack()`, `ctx.chunk()`/`ctx.end()`, or `ctx.error()`.

## Codecs

Codecs turn values into payload bytes (and back). Each method and event picks its own codec; request and response can even use different codecs.

- **`rawCodec`** — Buffer pass-through, no serialization. `RawChunksCodec` additionally returns the received chunks as `Buffer[]` for true zero-copy handling of large binary payloads.
- **`msgpackCodec`** — the default. MessagePack for structured objects, with `Buffer` and `Date` supported as extension types.
- **`arrowCodec`** — Apache Arrow IPC format for columnar/numeric data (embeddings, query results). Zero-copy reads and cross-language compatible (Python, Rust, ...).

## Lifecycle & Restart Policy

A module moves through `created → initializing → connecting → ready`, and to `disconnected`/`closed` on failure or shutdown. `spawnPolicy()` controls the supervisor: `initTimeout` (default 30s), `maxRetries` with fixed or exponential `retryDelay`, `restartOnCrash`, and a `restartLimit` window that stops infinite crash loops.

Requests have a default 30-second timeout so `send()` never hangs forever; override it per method (`timeout`) or per module (`requestTimeout(ms)`, `0` disables). On `manager.shutdown()` the parent sends `$shutdown` over the control plane, the child closes its pipe server and exits cleanly, and only an unresponsive child is force-killed after 5 seconds. If the parent dies, the child detects stdin EOF and shuts itself down instead of becoming an orphan.

## Heartbeat

Opt-in liveness detection for hung-but-alive workers: with `spawnPolicy({ heartbeat: { intervalMs, timeoutMs } })` the parent sends `$ping` over the control plane on every interval. If the matching `$pong` does not arrive within `timeoutMs`, the child is killed and the normal crash/restart path runs.

## Backpressure

Both sides bound their memory. On the send side, writes wait for the socket `drain` event before continuing when the OS buffer is full. On the receive side, a slow stream consumer causes the socket to be paused once 256 chunks are buffered, and resumed when the queue drains below 64 — so a fast producer cannot grow the queue without limit.

## Cancellation

Methods marked `cancellable: true` support `AbortController`: pass a `signal` to `send()`/`stream()`, and on abort the parent sends a dedicated abort frame (reserved method ID `0xFFFF`) over the data plane. The child handler observes it via `ctx.aborted` and `ctx.onAbort(cb)` to stop work and release resources.
