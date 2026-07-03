---
name: procwire-patterns
description: >-
  Design patterns and copy-paste recipes for building applications on Procwire
  IPC (@procwire/*). Covers parent/child setup, end-to-end type-safe schemas,
  choosing response types (result/stream/ack/none) and codecs
  (raw/rawChunks/msgpack/arrow), lifecycle/restart/heartbeat/auth config,
  backpressure and cancellation, error handling, the stdout pitfall, Bun parity,
  building Rust workers with the official procwire-client crate (crates.io), and
  the wire contract for porting a client to another language. Use when
  implementing, reviewing, or debugging an app that uses Procwire on Node or Bun,
  or a Rust / other-language Procwire worker. For pure contract/wire-format
  lookups use the procwire-contracts skill.
---

# Procwire: design patterns for building apps

Procwire links a **parent** (spawns & calls workers, `@procwire/core`) to one or
more **child** workers (`@procwire/client`) over two channels: a JSON-RPC
**control plane** (stdio) for lifecycle and a **binary data plane** (named pipe /
Unix socket) for user data. On Bun use `@procwire/bun-core` / `@procwire/bun-client`
— identical API and wire format.

**Mental model:** the **parent declares the contract** (methods, events, response
types, codecs); the **child implements the handlers**. The child announces its
schema in `$init`; the parent validates it against its own declaration before
going `ready`. Keep the two in sync — ideally share a TypeScript type (see
_Type-safe schemas_).

> Before building, skim `astro-docs/src/content/docs/guides/concepts.md` and the
> `procwire-contracts` skill for the wire/API contracts. The patterns below
> assume Node.js ≥ 22; switch the import line for Bun.

---

## 1. Quick start — minimal parent + child

**`worker.ts`** (child):

```typescript
import { Client } from "@procwire/client";
import { msgpackCodec } from "@procwire/codecs";

const client = new Client()
  .handle(
    "process",
    async (data, ctx) => {
      // Emit events only once the parent is connected — inside a handler is safe.
      await client.emitEvent("progress", { percent: 50 });
      const result = await doWork(data);
      await ctx.respond(result); // always await response methods (backpressure)
    },
    { codec: msgpackCodec, response: "result" },
  )
  .event("progress", { codec: msgpackCodec });

await client.start();
```

> `emitEvent` throws `Client not connected` until the parent connects — it is
> **not** connected the instant `start()` returns (that only listens and sends
> `$init`). Emit from inside a handler (as above) or guard with
> `if (client.connected)`.

**`main.ts`** (parent):

```typescript
import { Module, ModuleManager } from "@procwire/core";
import { msgpackCodec } from "@procwire/codecs";

const worker = new Module("worker")
  .executable("node", ["worker.js"]) // or tsx/ts-node for .ts; see "Spawning a TS worker"
  .method("process", { codec: msgpackCodec, response: "result" })
  .event("progress", { codec: msgpackCodec });

const manager = new ModuleManager();
manager.register(worker);
manager.on("module:error", (name, err) => console.error(`[${name}]`, err));

await manager.spawn("worker");

worker.onEvent("progress", (p) => console.log(`${p.percent}%`));
const result = await worker.send("process", { input: "data" });

await manager.shutdown();
```

**Spawning a TypeScript worker** — point `executable` at the runtime + loader,
not the `.ts` file directly (mirrors `packages/bench/src/lifecycle.ts`):

```typescript
.executable(process.execPath, ["--import", "tsx", "./worker.ts"])
```

---

## 2. End-to-end type safety (share one schema)

The builder accumulates a typed schema `S`. Extract it from the parent module and
apply it to the child `Client` so `send`/`stream`/`handle`/`emitEvent` are all
type-checked against the _same_ contract. Use the typed `msgpack<T>()` factory
(the bare `msgpackCodec` singleton infers `unknown`).

**`contract.ts`** (defines the module once; the parent imports the value to
spawn it, the child imports only the type):

```typescript
import { Module } from "@procwire/core";
import { msgpack } from "@procwire/codecs";
import type { ExtractSchema } from "@procwire/codecs";

interface SearchQuery {
  query: string;
  limit: number;
}
interface SearchResult {
  items: string[];
  total: number;
}
interface Progress {
  percent: number;
}

// Define the module shape once. (Configure executable/policy where you spawn it.)
export const searchModule = new Module("search")
  .method("search", {
    requestCodec: msgpack<SearchQuery>(),
    responseCodec: msgpack<SearchResult>(),
    response: "result",
  })
  .event("progress", { codec: msgpack<Progress>() });

export type SearchSchema = ExtractSchema<typeof searchModule>;
```

**Parent**: `searchModule.executable(…); manager.register(searchModule);` then
`const r = await searchModule.send("search", { query: "x", limit: 10 });` — `r`
is `SearchResult`.

**Child**: import the schema as a **type only** so the `Module` value (and its
`@procwire/core` dependency) is erased from the worker bundle:

```typescript
import { Client } from "@procwire/client";
import type { SearchSchema } from "./contract.js"; // `import type` — erased at runtime

const client = new Client<SearchSchema>()
  .handle("search", async (data, ctx) => {
    // data: SearchQuery
    await ctx.respond({ items: [], total: 0 }); // must be SearchResult
  })
  .event("progress");
```

`emitEvent("progress", …)` now requires `Progress`. (A plain value import of
`searchModule` into the child would bundle `@procwire/core` into the worker —
always use `import type` for the schema.)

**Caveats** (documented in the package READMEs):

- The typed overloads keep an **untyped string fallback**, so a _typo'd_ method
  name still compiles (resolves to `unknown`). Where it matters, take names from
  `keyof ExtractSchema<typeof module>["methods"]`.
- `send()` on a `stream` method is a compile error (returns `never`) — use
  `stream()`, and vice-versa.
- Bun packages ship the same generics; the typing is identical by construction.

---

## 3. Choosing a response type

Declare it with `response:` on both sides (must agree).

| Use                       | Type     | Parent                         | Child                                            |
| ------------------------- | -------- | ------------------------------ | ------------------------------------------------ |
| One request → one reply   | `result` | `await send()`                 | `await ctx.respond(x)`                           |
| One request → many chunks | `stream` | `for await (… of stream())`    | `await ctx.chunk(x)` × N, then `await ctx.end()` |
| Accept now, finish later  | `ack`    | `await send()` returns the ack | `await ctx.ack(meta)` then keep working          |
| Tell, don't reply         | `none`   | `send()` resolves immediately  | handler returns; sends nothing                   |

```typescript
// stream (child)
client.handle(
  "generate",
  async (data, ctx) => {
    for (const item of produce(data)) {
      if (ctx.aborted) return; // cooperative cancellation
      await ctx.chunk(item); // await → respects backpressure
    }
    await ctx.end();
  },
  { response: "stream", codec: msgpackCodec, cancellable: true },
);

// ack + background work (child)
client.handle(
  "enqueue",
  async (data, ctx) => {
    await ctx.ack({ queued: true, position: nextPos() });
    await processInBackground(data); // runs after the parent's send() resolved
  },
  { response: "ack" },
);

// fire-and-forget (child) — no ctx response
client.handle(
  "log",
  (data) => {
    logger.info(data);
  },
  { response: "none" },
);
```

`ctx` is one-shot: `respond`/`ack`/`end`/`error` may be called **once** (throws
`responseAlreadySent` otherwise). `chunk` may be called many times before `end`.

---

## 4. Choosing a codec

Pick per method/event by the _shape_ of the data. Request and response can use
**different** codecs (`requestCodec` + `responseCodec`).

| Data shape                                   | Codec                                     | Import                                          |
| -------------------------------------------- | ----------------------------------------- | ----------------------------------------------- |
| JS objects, configs, events, errors          | `msgpackCodec` / `msgpack<T>()` (default) | `@procwire/codecs`                              |
| Already-serialized bytes, images, audio      | `rawCodec` (`Buffer`)                     | `@procwire/codecs`                              |
| Large files / streams, avoid copies          | `rawChunksCodec` (`Buffer[]`, zero-copy)  | `@procwire/codecs`                              |
| Embeddings, numeric/columnar, cross-language | `arrowCodec`                              | `@procwire/codecs/arrow` (needs `apache-arrow`) |

```typescript
// dual codec: msgpack request, Arrow columnar response
.method("embed", {
  requestCodec: msgpack<{ texts: string[] }>(),
  responseCodec: arrowCodec,
  response: "stream",
})
```

`msgpackCodec` preserves `Buffer` and `Date` (extension types). Arrow lives
behind the opt-in subpath so raw/msgpack-only apps never pull in `apache-arrow`
— install it (`npm i apache-arrow`) only when you use it.

---

## 5. Lifecycle & resilience (`spawnPolicy`)

```typescript
new Module("worker")
  .executable("node", ["worker.js"])
  .method("process", { codec: msgpackCodec })
  .spawnPolicy({
    initTimeout: 30_000, // wait for $init
    maxRetries: 3, // spawn attempts
    retryDelay: { type: "exponential", base: 1000, max: 30_000 },
    restartOnCrash: true, // respawn on unexpected exit
    restartLimit: { maxRestarts: 5, windowMs: 60_000 }, // stop crash loops
    heartbeat: { intervalMs: 5_000, timeoutMs: 15_000 }, // liveness (off by default)
    socketBufferSize: 4 * 1024 * 1024, // Node only; ignored on Bun
    auth: true, // data-plane auth (off by default)
  })
  .requestTimeout(60_000); // default per-request timeout; 0 disables (default 30s)
```

- **Heartbeat** detects a hung-but-alive worker: the parent sends `$ping` over
  the control plane every `intervalMs`; a missing `$pong` within `timeoutMs`
  kills the child and runs the normal crash/restart path. Off unless configured.
- **Request timeout precedence** (per `module-core.ts`): per-method config
  `timeout` → child schema timeout → module `requestTimeout` (default 30s). The
  parent's explicit per-method timeout wins so the child can't extend a deadline
  the parent chose; `0` disables. So `send()` never hangs forever by default.
- **Graceful shutdown**: `manager.shutdown(name?)` sends `$shutdown`; the child
  closes its pipe server and exits on its own. Only an unresponsive child is
  force-killed after 5s.
- **Retry with a fresh Module** (supervisor pattern): a module stays registered
  after a terminal `SpawnError` or `shutdown()`. `await manager.unregister(name)`
  frees the name (cancelling any pending restart/retry timers) so a rebuilt
  `Module` — e.g. with new CLI args — can be registered and spawned;
  `{ force: true }` shuts a running module down first, and
  `register(module, { replace: true })` swaps a non-running one in one call.
- **Orphan prevention**: if the parent dies, the child sees stdin EOF and shuts
  itself down.

**Observe lifecycle** (don't fly blind — and an unobserved `error` event would
otherwise be noisy):

```typescript
import { ManagerEvents } from "@procwire/core";
manager.on(ManagerEvents.READY, (name) => log(`${name} ready`));
manager.on(ManagerEvents.ERROR, (name, err) => log.error(name, err));
manager.on(ManagerEvents.RESTARTING, (name) => log(`${name} restarting`));
manager.on(ManagerEvents.SPAWN_FAILED, (name, err) => log.error(name, err));
```

---

## 6. Backpressure — the one rule

**Always `await` every `ctx.respond` / `ctx.ack` / `ctx.chunk` / `ctx.end` and
`client.emitEvent`.** They resolve only once bytes are handed to the OS (after
any drain). A producer that fires `ctx.chunk()` without awaiting (e.g.
`void ctx.chunk(x)` in a tight loop) defeats flow control and can OOM.

The framework bounds memory automatically when you await: the send side waits for
socket drain; the parent's receive side pauses the socket once a slow stream
consumer's queue passes 256 buffered chunks and resumes below 64. Your job is
just to await and to consume streams promptly.

---

## 7. Cancellation

Mark the method `cancellable: true` on **both** sides. The parent passes a
`signal`; on abort it sends an abort frame (`ABORT_METHOD_ID`), and the child
handler observes it.

```typescript
// parent
const ac = new AbortController();
const it = worker.stream("longTask", input, { signal: ac.signal });
setTimeout(() => ac.abort(), 5_000);
for await (const chunk of it) {
  use(chunk);
}

// child
client.handle(
  "longTask",
  async (data, ctx) => {
    const res = acquire();
    ctx.onAbort(() => res.release()); // cleanup hook
    for (const item of data.items) {
      if (ctx.aborted) return; // stop promptly
      await ctx.chunk(work(item));
    }
    await ctx.end();
  },
  { response: "stream", cancellable: true },
);
```

On data-channel loss the child also fires `onAbort` for in-flight requests, so
cleanup runs whether cancellation is explicit or a disconnect.

---

## 8. Error handling

```typescript
// child: surface failures to the parent
client.handle(
  "validate",
  async (data, ctx) => {
    try {
      await ctx.respond(validate(data));
    } catch (e) {
      await ctx.error(e); // sends an error frame; parent's send() rejects
    }
  },
  { response: "result" },
);
```

The Node/Bun `ctx.error()` accepts only `Error | string` and sends the message
text. On the parent, the rejection is a `ProcwireError` exposing `.message` and a
`.data` payload. When an error frame carries a **structured** object (e.g. from a
non-JS child such as the Rust crate, which serializes its own `{ message, code }`),
the parent derives `.message` from the object's `message` field and preserves the
whole object on `error.data` — a parent-side receive capability, not something the
JS `ctx.error` API exposes.

```typescript
// parent
import { ProcwireError, SpawnError } from "@procwire/core";
try {
  await worker.send("validate", bad);
} catch (e) {
  if (e instanceof ProcwireError) console.error(e.message, e.data);
}
try {
  await manager.spawn("worker");
} catch (e) {
  if (e instanceof SpawnError) console.error(e.attempts, e.lastError);
}
```

If a handler throws and hasn't responded, the core auto-sends an error response —
but prefer explicit `ctx.error` so you control the payload. Uncaught handler
exceptions never crash the parent: a bad frame/payload rejects only the affected
request or drops the connection, never the supervisor.

---

## 9. Security (shared hosts)

The socket path is already crypto-random and unguessable, and the child stops
listening once the parent connects. For defense-in-depth add `auth: true`:

```typescript
.spawnPolicy({ auth: true })
```

The manager generates a per-spawn token, passes it to the child via the
`PROCWIRE_TOKEN` env var, and sends it as the **first** data-plane frame (an AUTH
frame, `0xFFFE`). The bundled `@procwire/client` / `@procwire/bun-client` enforce
it automatically when `PROCWIRE_TOKEN` is set. A non-JS data-plane client must
implement the AUTH frame to interoperate with `auth: true` (see §11).

---

## 10. Critical pitfalls (check these first when something is "weird")

1. **stdout is the control plane.** From handler/worker code, **log to stderr**
   (`console.error`) and never print a bare line starting with `{` to stdout — it
   can be parsed as a control message and corrupt the channel.
2. **Schema mismatch throws at spawn.** Methods, events, and `response` types
   must match between `Module` (parent) and `Client` (child). Keep them in one
   shared type (§2).
3. **`send` vs `stream`.** `send()` on a stream method (or `stream()` on a
   non-stream method) throws/`never`-types. Match the API to the response type.
4. **Await response methods** (§6) — the #1 cause of memory blowups and
   out-of-order data.
5. **Child must `start()` before the parent can connect** — `start()` listens,
   _then_ emits `$init`. Don't reorder.
6. **Don't install `apache-arrow`** unless you import `@procwire/codecs/arrow`.
7. **One parent per child.** The pipe server adopts a single connection.

---

## 11. Rust workers — use the official `procwire-client` crate

If a worker is written in Rust, **use the official client crate — do not
re-implement the wire protocol.** The parent stays Node/Bun
(`@procwire/core` / `@procwire/bun-core`); the Rust process is just another
child, spawned with `.executable("./my-worker", [])`.

- **Crate:** [`procwire-client`](https://crates.io/crates/procwire-client) (latest **1.1.0**)
- **Repo / issues:** <https://github.com/SebastianWebdev/procwire-rust>
- **API docs:** <https://docs.rs/procwire-client>
- **Stack:** Tokio (async), Serde + MsgPack codec, MSRV Rust 1.85. Streaming,
  ack, cancellation (`CancellationToken`), heartbeat, and the AUTH handshake are
  built in.

```toml
# Cargo.toml — run `cargo add procwire-client`; pin "1" (the README's "0.1" is stale)
[dependencies]
procwire-client = "1"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
```

**Minimal Rust worker** (the child):

```rust
use procwire_client::ClientBuilder;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct EchoRequest { message: String }
#[derive(Serialize, Deserialize)]
struct EchoResponse { message: String }

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = ClientBuilder::new()
        .handle("echo", |payload: EchoRequest, ctx| async move {
            ctx.respond(&EchoResponse { message: payload.message }).await
        })
        .start()
        .await?;

    client.wait_for_shutdown().await?; // returns on $shutdown / parent death
    Ok(())
}
```

**Matching Node parent** — nothing special; spawn the compiled binary:

```typescript
const worker = new Module("rust-worker")
  .executable("./target/release/my-worker", []) // the Rust binary
  .method("echo", { codec: msgpackCodec, response: "result" });
manager.register(worker);
await manager.spawn("rust-worker");
const r = await worker.send("echo", { message: "hi" });
```

**Rust ↔ Node concept map:**

| Concept      | Node child (`@procwire/client`)    | Rust child (`procwire-client`)                                |
| ------------ | ---------------------------------- | ------------------------------------------------------------- | --------------- | ---------------------------- |
| Builder      | `new Client().handle(…)`           | `ClientBuilder::new().handle(…)`                              |
| Handler      | `async (data, ctx) => {}`          | `                                                             | payload: T, ctx | async move {}` (Serde-typed) |
| Single reply | `await ctx.respond(x)`             | `ctx.respond(&x).await?`                                      |
| Ack          | `await ctx.ack(x)`                 | `ctx.ack().await?`                                            |
| Stream       | `await ctx.chunk(x)` … `ctx.end()` | `ctx.chunk(&x).await?` … `ctx.end().await?`                   |
| Error        | `await ctx.error(e)`               | `ctx.error("msg").await?`                                     |
| Cancellation | `ctx.aborted` / `ctx.onAbort(cb)`  | `ctx.is_cancelled()` / `select! { _ = ctx.cancelled() => … }` |
| Emit event   | `await client.emitEvent(n, d)`     | `client.emit(n, &d).await?`                                   |
| Stay alive   | (kept alive by the pipe server)    | `client.wait_for_shutdown().await?`                           |
| Codec        | `msgpackCodec` (default)           | MsgPack via Serde (default)                                   |

**Correctness notes:**

- The Node/Bun parent still **declares the contract** and validates it against
  the Rust child's `$init` at spawn. The `response` type the parent declares per
  method must match what the Rust handler does (`respond`→`result`,
  `chunk`/`end`→`stream`, `ack`→`ack`); see the crate docs for how the Rust side
  sets a handler's response type. Method/event **names** must match on both sides.
- Serde structs must (de)serialize to the same MsgPack shape the Node side
  sends/expects.
- For shared hosts, the crate honours `PROCWIRE_TOKEN`, so `auth: true` on the
  parent works with no extra Rust code.

### Maintaining the crate, or porting to a third language

You only need the raw wire contract below when you maintain `procwire-rust`
itself or implement a client in **another** language. The child role: create the
pipe **server**, listen, _then_ announce `$init`, then serve frames. Node and Bun
are byte-for-byte identical on the wire, so one implementation matches both.

**Authoritative spec: `docs/rust-client-compatibility.md`** — maps each change to
REQUIRED / RECOMMENDED / OPTIONAL with source-of-truth file pointers. Base
protocol in `packages/protocol/src/wire-format.ts`; tables in the
`procwire-contracts` skill.

**Must-do checklist:**

| Item                                                              | Priority                    | What                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `$ping` → `$pong`                                                 | **REQUIRED**                | On `$ping` from stdin, immediately write `{"jsonrpc":"2.0","method":"$pong"}\n` to stdout. Stateless. A heartbeat-enabled parent kills a child that doesn't answer.                                                                  |
| Bound incoming `payloadLength`                                    | **REQUIRED**                | Before allocating, check the 4-byte length against a configurable max (default 1 GiB, ceiling 2 GiB−1). Oversized/invalid → tear down the connection; never `alloc(huge)`.                                                           |
| AUTH frame (`0xFFFE`)                                             | **REQUIRED if `auth:true`** | If `PROCWIRE_TOKEN` is set, require the **first** frame on an accepted connection to be an AUTH frame whose raw-bytes payload equals the env value (constant-time compare); else drop. If unset, behave as before (adopt on accept). |
| Graceful `$shutdown`                                              | RECOMMENDED                 | On `$shutdown` close the pipe server + connection and exit promptly; don't let the stdin reader block exit. Otherwise the parent force-kills after 5s.                                                                               |
| Honour send-side backpressure                                     | RECOMMENDED                 | If a pipe write would block, wait for drain before writing more. Don't buffer outgoing chunks unboundedly. Tolerate the parent pausing reads.                                                                                        |
| Single connection / disconnect cleanup / no crash on socket error | RECOMMENDED                 | Accept one parent; reject extras. On disconnect, clean up in-flight state. A socket error must not crash the process. **Listen on the pipe before emitting `$init`** (parent connect is timed).                                      |
| `requestId` opaque `u32`, wraps, skips 0                          | CHECK                       | As responder, echo it back unchanged; don't assume small/monotonic. If you allocate ids, wrap and skip 0.                                                                                                                            |
| Structured error payloads                                         | OPTIONAL                    | A string message still works; you _may_ send `{ "message": …, "code": … }`.                                                                                                                                                          |
| Default request timeout                                           | INFO (caller-only)          | Only if the non-JS side acts as a _parent_. As responder, just answer promptly.                                                                                                                                                      |

**Verify interop** against this repo's Node parent (compatibility doc §5): drive
the non-JS child from a small Node harness (mirror
`packages/bench/src/lifecycle.ts` + `workers/benchmark-worker.ts`, but spawn your
binary as the executable). Check: handshake + `result`/`ack`/`stream` for
raw+msgpack; heartbeat survival then forced miss → restart; graceful shutdown in
tens of ms; oversized-frame rejection; bounded RSS under a slow consumer;
`requestId = 0xFFFFFFFF`; and (with `auth:true`) adopt on correct token / drop on
wrong token. The Node/Bun `regression.test.ts` files are executable specs.

---

## 12. Recipes

**Worker pool** — register N modules, spawn all, round-robin `send`:

```typescript
const pool = Array.from({ length: 4 }, (_, i) =>
  new Module(`w${i}`).executable("node", ["worker.js"]).method("job", { codec: msgpackCodec }),
);
const manager = new ModuleManager();
pool.forEach((m) => manager.register(m));
await manager.spawn(); // all
let rr = 0;
const run = (job) => pool[rr++ % pool.length].send("job", job);
```

**Stream a large file zero-copy** — `rawChunksCodec`, await each chunk:

```typescript
// child
client.handle(
  "download",
  async ({ path }, ctx) => {
    for await (const chunk of fs.createReadStream(path)) await ctx.chunk([chunk]);
    await ctx.end();
  },
  { response: "stream", codec: rawChunksCodec },
);
```

**Progress events alongside a result** — emit events while handling:

```typescript
client.handle(
  "import",
  async (rows, ctx) => {
    for (let i = 0; i < rows.length; i++) {
      await ingest(rows[i]);
      if (i % 100 === 0) await client.emitEvent("progress", { percent: (i / rows.length) * 100 });
    }
    await ctx.respond({ imported: rows.length });
  },
  { response: "result" },
);
```

---

## 13. Pre-flight checklist (before you call it done)

- [ ] Parent `Module` and child `Client` agree on method names, events, and
      `response` types (ideally one shared `ExtractSchema` type).
- [ ] Every `ctx.*` response method and `emitEvent` is `await`ed.
- [ ] Worker logs go to **stderr**, never bare JSON to stdout.
- [ ] `spawnPolicy` set deliberately (retries / `restartOnCrash` / timeouts);
      `manager.on('module:error', …)` wired.
- [ ] Long/abortable work declares `cancellable: true` and checks `ctx.aborted` /
      registers `ctx.onAbort`.
- [ ] Codec matches the data shape; `apache-arrow` installed only if Arrow used.
- [ ] `pnpm format && pnpm lint && pnpm typecheck && pnpm test` pass.
- [ ] Non-JS client: the two REQUIRED items (`$pong`, bounded payload) done, plus
      AUTH if `auth:true`; interop-checked against the Node parent.
