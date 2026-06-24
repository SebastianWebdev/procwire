---
name: procwire-contracts
description: >-
  Read and navigate Procwire's contracts and documentation — the binary
  data-plane wire format, the control-plane JSON-RPC protocol, the public API of
  every @procwire/* package (protocol, codecs, runtime-core, core, client,
  bun-core, bun-client), the TypeScript schema/type contracts, errors, and
  events. Use when answering questions about how Procwire works, locating the
  source-of-truth file for a contract, verifying an API signature, or auditing
  wire/behaviour compatibility. This is a map + reference, not a how-to-build
  guide — for implementing apps use the procwire-patterns skill.
---

# Procwire: reading contracts & documentation

Procwire is a pnpm monorepo of Node/Bun IPC building blocks under `@procwire/*`.
It connects a **parent** process to **child** worker processes over a
**dual-channel** transport:

- **Control plane** — child stdio, newline-delimited **JSON-RPC 2.0**. Handshake,
  heartbeat, lifecycle. Small and infrequent.
- **Data plane** — named pipe / Unix domain socket, a compact **binary protocol**
  (11-byte header). User data, high throughput.

> **CRITICAL INVARIANT:** Data plane = binary protocol = **zero JSON**. JSON-RPC
> never carries user data. Method _names_ never travel on the data plane — only
> the numeric IDs exchanged in the handshake.

## The golden rule

**The source files are the source of truth. Read them; do not guess.** Package
READMEs and the `astro-docs/` site can lag the code. When a contract matters
(wire format, a signature, a flag bit, a default), open the file named below and
read it. The runtime packages (`core`, `client`, `bun-*`) are **thin adapters**
— almost all real logic lives once in `@procwire/runtime-core`.

## Package map

| Package                  | Role                                                                                                                                        | Key source files                                                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@procwire/protocol`     | Wire format, 11-byte header, flags, framing, transport, backpressure. **Zero runtime deps.**                                                | `src/wire-format.ts`, `src/frame-buffer.ts`, `src/transport.ts`, `src/drain-waiter.ts`                                                                                                                              |
| `@procwire/codecs`       | `rawCodec`, `rawChunksCodec`, `msgpackCodec`, `arrowCodec` (opt-in subpath), `Codec` interface, schema type helpers                         | `src/types.ts`, `src/raw-codec.ts`, `src/msgpack-codec.ts`, `src/arrow-codec.ts`, `src/schema-types.ts`                                                                                                             |
| `@procwire/runtime-core` | **The shared IPC engine.** ModuleCore, ClientCore, manager lifecycle policies, RequestContext, types/errors/events. Internal but published. | `src/module-core.ts`, `src/client-core.ts`, `src/manager-core.ts`, `src/request-context.ts`, `src/types.ts`, `src/client-types.ts`, `src/schema-types.ts`, `src/errors.ts`, `src/client-errors.ts`, `src/events.ts` |
| `@procwire/core`         | Parent side (Node): `Module`, `ModuleManager`                                                                                               | `src/module.ts`, `src/manager.ts`, `src/index.ts`                                                                                                                                                                   |
| `@procwire/client`       | Child side (Node): `Client`, `RequestContext`                                                                                               | `src/client.ts`, `src/index.ts`                                                                                                                                                                                     |
| `@procwire/bun-core`     | Parent side (Bun) — same API & wire format                                                                                                  | `packages/procwire-bun-core/src/*`                                                                                                                                                                                  |
| `@procwire/bun-client`   | Child side (Bun) — same API & wire format                                                                                                   | `packages/procwire-bun-client/src/*`                                                                                                                                                                                |
| `packages/bench`         | Benchmarks + runnable example workers (not published)                                                                                       | `workers/benchmark-worker.ts`, `src/lifecycle.ts`                                                                                                                                                                   |
| `astro-docs/`            | Starlight docs site + `llms.txt` + TypeDoc API reference                                                                                    | `src/content/docs/guides/*`                                                                                                                                                                                         |
| `docs/`                  | Long-form docs incl. cross-language compat                                                                                                  | `docs/rust-client-compatibility.md`                                                                                                                                                                                 |

### Official clients (child role)

Three first-party clients implement the child side; all speak the same wire
format against a `@procwire/core` / `@procwire/bun-core` parent:

- **Node:** `@procwire/client` (this repo)
- **Bun:** `@procwire/bun-client` (this repo)
- **Rust:** [`procwire-client`](https://crates.io/crates/procwire-client) — a
  **separate published crate** (repo `SebastianWebdev/procwire-rust`, docs at
  <https://docs.rs/procwire-client>), not part of this monorepo. It is the
  reference cross-language implementation. For _using_ it, see the
  `procwire-patterns` skill; `docs/rust-client-compatibility.md` is the
  wire-compat spec for maintaining it or porting to a third language.

## Where to find each contract (routing table)

Open the file in the right-hand column.

| If you need to know…                                                                                                                         | Read                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Header layout, endianness, `encodeHeader`/`decodeHeader`, `validateHeader`, constants                                                        | `packages/protocol/src/wire-format.ts` (+ `packages/protocol/README.md`)                                     |
| Flag bits and their meaning                                                                                                                  | `packages/protocol/src/wire-format.ts` (`Flags`), README "Flags Byte" table                                  |
| How bytes accumulate into frames / batch vs streaming / oversized-frame guard                                                                | `packages/protocol/src/frame-buffer.ts`                                                                      |
| Send-side backpressure / drain                                                                                                               | `packages/protocol/src/drain-waiter.ts`, `src/*-socket-transport.ts`                                         |
| Codec interface + which codec for which data                                                                                                 | `packages/codecs/src/types.ts`, `packages/codecs/README.md`                                                  |
| MsgPack extension types (Buffer, Date), typed `msgpack<T>()` factory                                                                         | `packages/codecs/src/msgpack-codec.ts`                                                                       |
| Arrow codec (columnar) — opt-in `@procwire/codecs/arrow` subpath                                                                             | `packages/codecs/src/arrow-codec.ts`, `src/arrow.ts`                                                         |
| Parent builder + `send`/`stream`/`onEvent` semantics, request-id allocation, timeout precedence, stream backpressure HWM/LWM                 | `packages/runtime-core/src/module-core.ts`                                                                   |
| Child builder + `handle`/`event`/`emitEvent`/`start`, frame dispatch, auth gate, `$ping`/`$shutdown` handling, `$init` shape                 | `packages/runtime-core/src/client-core.ts`                                                                   |
| `ctx.respond/ack/chunk/end/error` semantics, one-shot guard, empty-payload rules                                                             | `packages/runtime-core/src/request-context.ts`                                                               |
| Spawn/restart/heartbeat/auth lifecycle, schema validation, force-kill grace                                                                  | `packages/runtime-core/src/manager-core.ts`                                                                  |
| Parent-side types: `ModuleState`, `SpawnPolicy`, `MethodConfig`, `ModuleSchema`, `InitMessage`, `ResponseType`                               | `packages/runtime-core/src/types.ts`                                                                         |
| Child-side types: `ClientOptions`, `MethodDefinition`, `RequestContext`, `TypedRequestContext`, `MethodHandler`                              | `packages/runtime-core/src/client-types.ts`                                                                  |
| End-to-end type-safety primitives: `Schema`, `EmptySchema`, `ExtractSchema`, `InferCodecInput/Output`, Parent/Child request/response helpers | `packages/codecs/src/schema-types.ts`                                                                        |
| Builder schema accumulation (`AddMethod`, `AddEvent`, `SendReturn`, `MethodsWithResponseType`)                                               | `packages/runtime-core/src/schema-types.ts`                                                                  |
| Parent error classes & factories (`ProcwireError`, `ModuleErrors`, `ManagerErrors`, `SpawnError`)                                            | `packages/runtime-core/src/errors.ts`, `packages/core/src/manager.ts` (`SpawnError`)                         |
| Child error classes & factories (`ProcwireClientError`, `ClientErrors`)                                                                      | `packages/runtime-core/src/client-errors.ts`                                                                 |
| Event name constants (`ManagerEvents`, `ModuleEvents`)                                                                                       | `packages/runtime-core/src/events.ts`                                                                        |
| Control-plane protocol & reliability narrative                                                                                               | `astro-docs/src/content/docs/guides/architecture.mdx`                                                        |
| Concepts: response types, codecs, lifecycle, backpressure, cancellation                                                                      | `astro-docs/src/content/docs/guides/concepts.md`                                                             |
| Official Rust client (the cross-language reference implementation)                                                                           | crate `procwire-client` (crates.io), repo `SebastianWebdev/procwire-rust`, <https://docs.rs/procwire-client> |
| Wire & behaviour compatibility for porting/maintaining a non-JS client                                                                       | `docs/rust-client-compatibility.md`                                                                          |
| What's exported from a package (the actual public surface)                                                                                   | that package's `src/index.ts`                                                                                |
| Executable behaviour specs (exact expected behaviour, edge cases)                                                                            | `packages/*/test/*.test.ts` (esp. `regression.test.ts`, `type-safety.test.ts`)                               |

## Wire format quick reference (data plane)

Every data-plane message is an **11-byte header** (all integers **big-endian**)
followed by the codec-encoded payload. Verify against
`packages/protocol/src/wire-format.ts`.

```
 offset  size  field          type
 ------  ----  -------------  ---------
   0      2    methodId       uint16 BE   (handshake-assigned; reserved IDs below)
   2      1    flags          uint8       (bitfield)
   3      4    requestId      uint32 BE   (correlation; 0 = fire-and-forget / event)
   7      4    payloadLength  uint32 BE
  11      N    payload        bytes       (codec output)
```

**Flags bitfield** (bits 6–7 reserved, MUST be 0):

| bit | value  | name                  | meaning                         |
| --- | ------ | --------------------- | ------------------------------- |
| 0   | `0x01` | `DIRECTION_TO_PARENT` | 0 = to child, 1 = to parent     |
| 1   | `0x02` | `IS_RESPONSE`         | 0 = request/event, 1 = response |
| 2   | `0x04` | `IS_ERROR`            | 1 = error response              |
| 3   | `0x08` | `IS_STREAM`           | 1 = stream chunk                |
| 4   | `0x10` | `STREAM_END`          | 1 = final chunk (empty payload) |
| 5   | `0x20` | `IS_ACK`              | 1 = ack only (no full result)   |

**Constants** (`wire-format.ts`):

| Constant                    | Value     | Meaning                                                     |
| --------------------------- | --------- | ----------------------------------------------------------- |
| `HEADER_SIZE`               | `11`      | Fixed header size                                           |
| `ABORT_METHOD_ID`           | `0xFFFF`  | Cancellation frame (empty payload)                          |
| `AUTH_METHOD_ID`            | `0xFFFE`  | Opt-in data-plane AUTH frame (first frame, raw token bytes) |
| `DEFAULT_MAX_PAYLOAD_SIZE`  | 1 GiB     | Default receive cap                                         |
| `ABSOLUTE_MAX_PAYLOAD_SIZE` | 2 GiB − 1 | Hard ceiling (Buffer limit)                                 |
| `HEADER_POOL_SIZE`          | `16`      | Header ring-buffer pool                                     |

`FrameBuffer` enforces the full header contract on every parsed frame:
`methodId 0` is rejected, reserved flag bits 6–7 must be zero, and
`payloadLength` is validated against `maxPayloadSize` **before** allocation
(oversized → connection dropped, no giant alloc).

## Control-plane message catalogue (stdio, JSON-RPC 2.0)

Newline-delimited JSON. **child → parent on stdout; parent → child on stdin.** A
reader **ignores any line that does not start with `{`** — so never write
non-JSON logs to stdout (use stderr). Verify in `client-core.ts`
(`_handleControlLine`, `_sendInit`) and `manager-core.ts`.

| Method      | Direction      | When                                                                                   |
| ----------- | -------------- | -------------------------------------------------------------------------------------- |
| `$init`     | child → parent | once, after the pipe server is listening; carries `{ pipe, schema, version: "1.0.0" }` |
| `$error`    | child → parent | handshake/init failure (optional)                                                      |
| `$ping`     | parent → child | heartbeat tick (only when `spawnPolicy.heartbeat` enabled)                             |
| `$pong`     | child → parent | reply to `$ping` (stateless reflex)                                                    |
| `$shutdown` | parent → child | graceful stop request                                                                  |

`$init` shape (copy byte-for-byte; see `_sendInit`):

```jsonc
{
  "jsonrpc": "2.0",
  "method": "$init",
  "params": {
    "pipe": "<pipe-path>",
    "schema": {
      /* methods+events with numeric ids */
    },
    "version": "1.0.0",
  },
}
```

## Public API surface cheat-sheet

Condensed. The authoritative signatures live in `src/index.ts` (exports) and the
`*-core.ts` files. Confirm there before relying on a detail.

### Parent — `@procwire/core` (`Module`, `ModuleManager`)

```typescript
// Builder (returns a Module<S> with an accumulated, typed schema S)
new Module(name)
  .executable(command, args?, { cwd?, env? }?)
  .method(name, config?)   // config: { codec } | { requestCodec, responseCodec }, response?, timeout?, cancellable?
  .event(name, { codec }?)
  .spawnPolicy(policy)     // see SpawnPolicy below
  .maxPayloadSize(bytes)
  .requestTimeout(ms);     // default 30000; 0 disables

// Communication (after manager.spawn())
await module.send(method, data, { signal? }?);          // result | ack | none
for await (const chunk of module.stream(method, data, { signal? }?)) { … }  // stream
const off = module.onEvent(name, (data) => { … });

// Manager
const m = new ModuleManager();
m.register(module); m.has(name); m.get(name); m.moduleNames;
await m.spawn(name?);      // omit name → all registered
await m.shutdown(name?);   // omit name → all
m.on(ManagerEvents.READY | ERROR | RESTARTING | RETRYING | SPAWN_FAILED | CLOSED, cb);
```

`SpawnPolicy` (`runtime-core/src/types.ts`):
`initTimeout` (30s), `maxRetries` (3), `retryDelay` (`{type:"fixed",delay}` |
`{type:"exponential",base,max}`), `restartOnCrash` (false), `restartLimit`
(`{maxRestarts,windowMs}`), `heartbeat` (`{intervalMs,timeoutMs}` | null, off),
`socketBufferSize` (Node only; ignored on Bun), `auth` (false).

`ModuleState`: `created → initializing → connecting → ready`, then
`disconnected` / `closed`.

### Child — `@procwire/client` (`Client`, `RequestContext`)

```typescript
new Client(options?)            // { defaultCodec?, maxPayloadSize?, authToken? }
  .handle(name, async (data, ctx) => { … }, { response?, codec? | requestCodec+responseCodec, cancellable? }?)
  .event(name, { codec }?);
await client.start();           // creates pipe server, then sends $init, then reads control plane
await client.emitEvent(name, data);
await client.shutdown();

// RequestContext (ctx) — ALL response methods are async; await them (backpressure)
ctx.requestId; ctx.method; ctx.aborted; ctx.onAbort(cb);
await ctx.respond(data);   // result
await ctx.ack(data?);      // ack (early), keep working after
await ctx.chunk(data);     // stream chunk
await ctx.end();           // stream end
await ctx.error(err);      // error response
```

### Codecs — `@procwire/codecs`

```typescript
import {
  rawCodec,
  rawChunksCodec,
  msgpackCodec,
  msgpack,
  codecDeserialize,
} from "@procwire/codecs";
import { arrowCodec } from "@procwire/codecs/arrow"; // opt-in; needs apache-arrow peer dep
```

| Codec            | Input → Output                              | Zero-copy  | Use for                                      |
| ---------------- | ------------------------------------------- | ---------- | -------------------------------------------- |
| `rawCodec`       | `Buffer → Buffer`                           | no         | pre-serialized binary                        |
| `rawChunksCodec` | `Buffer[] → Buffer[]`                       | yes        | large files / streaming                      |
| `msgpackCodec`   | `object → object` (Buffer & Date ext types) | no         | structured objects, events, errors (default) |
| `arrowCodec`     | `Table/object → Table`                      | yes (read) | embeddings, columnar/numeric, cross-language |

`Codec<TInput, TOutput>` = `{ serialize, deserialize, deserializeChunks?, name }`.
`msgpack<TReq, TRes=TReq>()` returns a typed codec instance for compile-time
safety.

### Response types

| Type     | Parent API                    | Child sets via                  |
| -------- | ----------------------------- | ------------------------------- |
| `result` | `await send()` → value        | `ctx.respond()`                 |
| `stream` | `for await (… of stream())`   | `ctx.chunk()` … `ctx.end()`     |
| `ack`    | `await send()` → ack value    | `ctx.ack()` (then keep working) |
| `none`   | `send()` resolves immediately | (nothing)                       |

## Architecture invariants (assert these when reviewing)

1. **Data plane is binary, zero JSON.** Anything putting JSON on the pipe is wrong.
2. **stdout is the control plane.** Library writes use `process.stdout.write`
   directly. Handler/user code must log to **stderr**, never print bare
   `{…}` JSON-RPC lines to stdout.
3. **Schema must match.** The parent's declared methods/events/response-types are
   validated against the child's `$init` schema; mismatches throw at spawn
   (`ManagerErrors.schemaMissing*` / `schemaResponseMismatch`).
4. **Single connection.** The child pipe server adopts exactly one parent; extra
   connections are rejected. It stops listening once the parent connects.
5. **The child must listen on the pipe before emitting `$init`.**
6. **`requestId` is an opaque wrapping `uint32` that skips 0.** A responder echoes
   it back unchanged.
7. **Bounded memory.** Send side waits for drain; receive side pauses the socket
   past the stream HWM (256 chunks) and resumes below LWM (64).
8. **Force-kill is a fallback only.** `manager.shutdown()` sends `$shutdown`; an
   unresponsive child is SIGKILLed after 5s (`FORCE_KILL_TIMEOUT_MS`).
9. **Node and Bun are byte-for-byte identical on the wire.**

## Published / generated docs

- **Guides** (human + LLM): `astro-docs/src/content/docs/guides/`
  (`getting-started`, `concepts`, `architecture`, `index`).
- **LLM context file**: `astro-docs` builds `/llms.txt` via `starlight-llms-txt`
  (config in `astro-docs/astro.config.mjs`). `getting-started` and `concepts`
  are promoted; `changelog`/`team` excluded.
- **API reference**: auto-generated from package `src/index.ts` entry points via
  `starlight-typedoc` into `astro-docs/.../api/`.
- Per-package **README.md** files document each public API with examples.

## Answering common questions — which file?

- _"What does flag bit 4 mean / what's the abort method id?"_ →
  `packages/protocol/src/wire-format.ts`.
- _"What's the default request timeout and how is precedence resolved?"_ →
  `runtime-core/src/module-core.ts` (`DEFAULT_REQUEST_TIMEOUT_MS`, the
  `methodConfig.timeout ?? schemaMethod.timeout ?? _defaultRequestTimeout` line).
- _"How does the child authenticate the data plane?"_ →
  `runtime-core/src/client-core.ts` (`_acceptConnection`, `_handleAuthFrame`,
  `_authMatches`) + `docs/rust-client-compatibility.md` §4.9.
- _"What exactly is sent in `$init`?"_ → `client-core.ts` `_sendInit`.
- _"Is `socketBufferSize` honoured on Bun?"_ → No;
  `runtime-core/src/types.ts` `SpawnPolicy.socketBufferSize` doc comment.
- _"What's the public surface of `@procwire/core`?"_ → `packages/core/src/index.ts`.

When the answer is behavioural, prefer the matching `test/*.test.ts` — those are
executable specifications.
