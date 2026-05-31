# Procwire v2 — Rust Client Compatibility Guide

> **Audience:** the coding agent maintaining the **Rust** procwire client (separate repo).
> **Purpose:** everything you need to check and change so the Rust client stays
> wire- and behaviour-compatible with the changes landed on the Node/Bun side
> in this repo (branch `claude/inspiring-goodall-gliGU`, PR #47).
>
> The Node and Bun implementations are byte-for-byte identical on the wire, so a
> single Rust implementation must match **both**. Where this guide says
> "reference", it points at files in the procwire monorepo that are the source
> of truth — read them, don't guess.

---

## 0. How to use this guide

1. Read **§1 (architecture)** and **§2 (wire format)** to confirm the Rust client
   already matches the unchanged base protocol. If it doesn't, fix that first.
2. Work through the **§4 change checklist** top to bottom. Each item says whether
   it is **REQUIRED** (interop breaks without it), **RECOMMENDED** (robustness /
   behaviour parity), or **NONE** (internal Node/Bun detail, no Rust action).
3. Run the **§5 interop checks** against this repo's Node parent to verify.

The two **REQUIRED** items are: **`$ping`/`$pong` heartbeat (§4.1)** and
**bounded incoming frame size (§4.4)**. Everything else is robustness/parity.

---

## 1. Architecture recap (unchanged)

Procwire is a **dual-channel** parent↔child IPC library.

```
Control plane  : child stdio (stdin/stdout)   — JSON-RPC 2.0, newline-delimited TEXT
Data plane     : named pipe / unix socket     — custom BINARY framing
```

- **Parent** = `@procwire/core` (`ModuleManager`) — spawns the child process,
  connects to the child's data-plane pipe, sends requests.
- **Child / "client"** = `@procwire/client` (`Client`) — the role the **Rust
  client implements**: it is spawned, creates the pipe **server**, announces
  itself with `$init`, then serves requests/streams.

Lifecycle:
1. Parent spawns the child process.
2. Child creates the pipe server, **starts listening**, then writes `$init`
   (with the pipe path + method/event schema) to **stdout**.
3. Parent reads `$init`, connects to the pipe, validates the schema → `ready`.
4. Requests/responses flow over the **data plane**; lifecycle/liveness over the
   **control plane**.

---

## 2. Data-plane wire format (UNCHANGED — verify Rust matches)

**Reference:** `packages/protocol/src/wire-format.ts`.

11-byte header, **big-endian**, followed by the codec-encoded payload:

```
 offset  size  field          type
 ------  ----  -------------  ---------
   0      2    methodId       uint16 BE
   2      1    flags          uint8 (bitfield)
   3      4    requestId      uint32 BE
   7      4    payloadLength  uint32 BE
  11      N    payload        bytes (codec output)
```

**Flags** (bitfield, bits 6–7 reserved = 0):

| bit | value | name                | meaning                              |
|-----|-------|---------------------|--------------------------------------|
| 0   | 0x01  | DIRECTION_TO_PARENT | 0 = to child, 1 = to parent          |
| 1   | 0x02  | IS_RESPONSE         | 0 = request/event, 1 = response      |
| 2   | 0x04  | IS_ERROR            | 1 = error response                   |
| 3   | 0x08  | IS_STREAM           | 1 = stream chunk                     |
| 4   | 0x10  | STREAM_END          | 1 = final stream chunk (empty payload)|
| 5   | 0x20  | IS_ACK              | 1 = ack only (no full result)        |

**Constants:** `ABORT_METHOD_ID = 0xFFFF`, `DEFAULT_MAX_PAYLOAD_SIZE = 1 GiB`,
`ABSOLUTE_MAX_PAYLOAD_SIZE = 2 GiB − 1`.

> None of the framing, flags, codecs (raw / msgpack / arrow), or `ABORT_METHOD_ID`
> changed in this work. If the Rust client already speaks this, no change needed
> here — but **§4.4** adds a *receive-side size guard* you should confirm exists.

---

## 3. Control-plane protocol (stdio, newline-delimited JSON-RPC 2.0)

**References:** child side `packages/client/src/client.ts` (`_startControlReader`,
`_handleControlLine`, `_sendControl`, `_sendInit`); parent side
`packages/core/src/manager.ts` (heartbeat + `$shutdown`).

Rules:
- Each message is **one line** = a JSON object terminated by `\n`.
- **child → parent** goes on the child's **stdout**; **parent → child** on the
  child's **stdin**.
- A reader **ignores any line that does not start with `{`**. ⇒ **Never write
  non-JSON logs to stdout** — send logs to **stderr**.

### Message catalogue

| Method        | Direction      | When                          | Status in this work |
|---------------|----------------|-------------------------------|---------------------|
| `$init`       | child → parent | once, after pipe is listening | unchanged           |
| `$error`      | child → parent | handshake/init failure (opt.) | unchanged           |
| `$shutdown`   | parent → child | graceful stop request         | **child must now act on it (§4.2)** |
| `$ping`       | parent → child | heartbeat tick (opt-in)       | **NEW (§4.1)**      |
| `$pong`       | child → parent | reply to `$ping`              | **NEW (§4.1)**      |

Exact shapes (copy these byte-for-byte):

```jsonc
// child → parent, once, after the pipe server is listening
{"jsonrpc":"2.0","method":"$init","params":{"pipe":"<pipe-path>","schema":{ /* methods+events */ },"version":"2.0.0"}}

// parent → child, heartbeat tick   (NEW)
{"jsonrpc":"2.0","method":"$ping"}

// child → parent, reply to a ping   (NEW)
{"jsonrpc":"2.0","method":"$pong"}

// parent → child, graceful shutdown request
{"jsonrpc":"2.0","method":"$shutdown","params":{}}

// child → parent, init failure (optional; parent listens for it)
{"jsonrpc":"2.0","method":"$error","params":{"message":"<text>"}}
```

> The schema object inside `$init` did **not** change; keep whatever the Rust
> client already sends. `version` stays `"2.0.0"`.

---

## 4. Change checklist (do these)

### 4.1 — `$ping` / `$pong` heartbeat — **REQUIRED**
**What changed:** the parent gained an **opt-in liveness heartbeat** (`D1`). When
an app configures `spawnPolicy({ heartbeat: { intervalMs, timeoutMs } })`, the
parent, every `intervalMs`, writes `$ping` to the child's **stdin** and expects a
`$pong` on the child's **stdout**. If no `$pong` is seen within `timeoutMs`, the
parent **treats the child as dead and kills it** (then restarts per policy).

**Why it matters for Rust:** a Rust child that does not answer `$ping` will be
**killed** by any heartbeat-enabled parent. Today the Node/Bun parent only enables
it on demand, but the Rust client must support it to be safe with such parents.

**Action:**
- In the control-plane stdin reader, handle `method === "$ping"` by writing
  `{"jsonrpc":"2.0","method":"$pong"}\n` to stdout. Promptly, on every ping.
- No state needed; it's a stateless reflex. The parent tracks timing.

**Acceptance:** with a parent using `{ intervalMs: 50, timeoutMs: 500 }`, the Rust
child stays alive indefinitely under load and idle.
**Reference:** `packages/client/src/client.ts` `_handleControlLine`; parent
`packages/core/src/manager.ts` (`startHeartbeat`/`startPongReader`/`handlePong`).

### 4.2 — Graceful `$shutdown` — **RECOMMENDED**
**What changed:** the child now **acts on `$shutdown`** (parent → child stdin) by
shutting itself down cleanly (close the pipe server + connection, stop, exit),
instead of ignoring it and being **force-killed after a 5 s grace period**
(`FORCE_KILL_TIMEOUT_MS = 5000`). On Node we also `process.stdin.unref()` so that
*reading the control plane does not by itself keep the process alive*.

**Action for Rust:**
- Handle `method === "$shutdown"` → close the pipe server + any data connection,
  flush, and **exit the process promptly**.
- Ensure your stdin-reader loop **does not block process exit**: the pipe server
  keeps you alive during normal operation; once it closes on `$shutdown` the
  process should be able to exit. (Spawn the stdin reader on a thread that won't
  hold the runtime open, or break its loop on shutdown.)

**Why:** without this the parent still works (it force-kills after 5 s), but
shutdown is 5 s slower per child and not graceful. Matching the new behaviour
keeps fast, clean teardown.
**Acceptance:** `manager.shutdown(name)` returns in tens of ms (not ~5 s).
**Reference:** `packages/client/src/client.ts` (`_handleControlLine` `$shutdown`,
`shutdown()`), `packages/core/src/manager.ts` `shutdownModule`.

### 4.3 — Send-side backpressure on streams/responses — **RECOMMENDED (correctness)**
**What changed:** `D2` hardened flow control. Two sides:
- **Parent receive-side (new):** when a stream consumer falls behind, the parent
  **pauses the data socket** once its receive queue passes a high-water mark
  (256 chunks) and resumes below the low-water mark (64). This is transparent at
  the protocol level — there is **no new frame** — but it means **the parent may
  stop reading**, which applies OS backpressure to the child's writes.
- **Send-side:** the producer must **respect write backpressure**.

**Action for Rust:** when the Rust child produces stream chunks (or large
responses), it **must honour write backpressure** — if a pipe write would block /
the socket buffer is full, **wait for it to drain before writing more** instead of
buffering unboundedly. Equivalently: your writer must tolerate the peer pausing
reads (your writes will block — that is expected and correct). Do **not** spin-loop
writing or accumulate an unbounded in-memory queue of outgoing chunks.

**Why:** the bug `D2` fixed was unbounded memory growth (OOM) when one side
outpaces the other. A Rust producer that ignores backpressure re-introduces that
risk on the child side.
**Acceptance:** stream a few hundred MB to a deliberately slow parent consumer →
the Rust child's RSS stays bounded (it stalls on writes), no OOM.
**Reference:** parent `packages/core/src/module.ts`
(`_pauseSocketForBackpressure`/`_resumeSocketForBackpressure`, high/low-water
marks), `packages/protocol/src/drain-waiter.ts`.

### 4.4 — Bound incoming frame size — **REQUIRED (robustness/security)**
**What changed:** `C4b` — the child validates the **declared `payloadLength`**
against a configurable `maxPayloadSize` (`Client` option). On an oversized/invalid
frame it **does not allocate** the payload; it drops the connection
(`socket.destroy()`) and surfaces an error instead of crashing/OOMing.

**Action for Rust:** before allocating a payload buffer from the 4-byte
`payloadLength`, **check it against a maximum** (default reference:
`DEFAULT_MAX_PAYLOAD_SIZE = 1 GiB`, hard ceiling `ABSOLUTE_MAX_PAYLOAD_SIZE =
2 GiB − 1`). If exceeded (or otherwise invalid), **tear down the connection**
rather than `Vec::with_capacity(huge)`. Make the limit configurable.

**Why:** `payloadLength` is attacker/peer-controlled (up to ~4 GiB). Unbounded
allocation is a DoS/OOM vector. This is the one *receive-side* robustness change
the Rust client must mirror.
**Acceptance:** feed a header claiming a 3 GiB payload → connection is closed, no
giant allocation, process survives.
**Reference:** `packages/protocol/src/wire-format.ts` `validateHeader`;
`packages/client/src/client.ts` (frame-buffer `push` guarded with
`maxPayloadSize`, `socket.destroy()` on throw).

### 4.5 — `requestId` is a wrapping `uint32`, `0` reserved — **CHECK**
**What changed:** `C6` — the request-id allocator wraps within the `uint32` range
and **skips `0`** (`0` is reserved). Sequence: `…, 0xFFFFFFFF, 1, 2, …` (never 0).

**Action for Rust:**
- As a **responder** (child): treat `requestId` as an opaque `u32` and **echo it
  back unchanged** in the response/stream/error frames. Don't assume it's small,
  monotonic, or non-wrapping.
- If the Rust side ever **allocates** request-ids (parent role, or client-emitted
  events that need ids), use the same rule: `u32`, wrap on overflow, skip `0`.

**Acceptance:** a request with `requestId = 0xFFFFFFFF` is answered with the same
id; ids never collide with the reserved `0`.
**Reference:** `packages/core/src/module.ts` `_allocateRequestId`;
`packages/core/test/regression.test.ts` (Bug C6).

### 4.6 — Remote error payloads — **OPTIONAL (you may now send structured errors)**
**What changed:** `M1` — the parent now derives a useful message from a **structured
error payload** (an object with a string `message`) instead of producing
`"[object Object]"`, and it preserves the original payload on `error.data`. A
plain string still works.

**Action for Rust:** none required (a serialized **string** message is still
correct). *Optionally*, you may now send an error as a structured object
`{ "message": "...", "code": ..., ... }`; the parent will surface `.message` and
keep the whole object on `error.data`. Error frames carry the
`IS_RESPONSE | IS_ERROR | DIRECTION_TO_PARENT` flags; the payload is encoded with
the **method's response codec** (default codec is **msgpack**).

**Reference:** `packages/core/src/errors.ts` `extractErrorMessage`/`remoteError`;
child send: `packages/client/src/request-context.ts` `error()`,
`packages/client/src/client.ts` `_sendErrorResponse`.

### 4.7 — Connection/disconnect robustness — **RECOMMENDED**
Several child-side hardening fixes; mirror the behaviours, not the code:
- **`C4a`** — the pipe **server accepts a single connection** (the parent). A
  second/extra inbound connection must be **rejected/closed**, not allowed to
  replace or corrupt the active one.
- **`C3`** — on data-plane **disconnect**, **clean up all pending state**
  (in-flight request contexts, stream producers, buffers) so nothing leaks or
  resolves against a dead socket.
- **`C5`** — a **socket error must not crash** the process; handle/observe it and
  tear the connection down cleanly.
- **`C9` (parent-side, implication for child):** the parent now applies a
  **timeout when connecting** to the child's pipe. ⇒ the Rust child **must be
  listening on the pipe *before* it emits `$init`** (it already should). Don't
  announce `$init` and then start listening.

**Reference:** `packages/client/src/client.ts`; `packages/client/test/regression.test.ts`
(Bugs C3/C4a/C5/C4b); `packages/core/src/manager.ts` (C9 `connectDataChannel`).

### 4.8 — Default request timeout — **INFO (parent behaviour)**
**What changed:** `C2/C1` — the **parent** now bounds every `send()` with a default
request timeout (30 s) unless overridden (`requestTimeout(0)` disables it).

**Action for Rust:** only relevant if the Rust side acts as a **parent/caller**
(then add an equivalent default timeout). As a **responder**, just **answer
promptly** — a child that never responds will now make the parent reject with a
timeout after ~30 s (previously it hung forever).
**Reference:** `packages/core/src/module.ts` (default request timeout), regression
Bug C2.

---

## 5. How to verify the Rust client (interop against this repo)

Use this repo's Node parent as the reference peer. Build core/client first
(`pnpm -w build`), then drive the Rust child from a small Node harness (mirror
`packages/bench/src/lifecycle.ts` / `packages/bench/workers/benchmark-worker.ts`,
but spawn the Rust binary as the module executable).

Checklist:
1. **Handshake:** Rust child spawns → sends `$init` → parent reaches `ready`;
   a basic `result`/`ack`/`stream` round-trips for raw + msgpack codecs.
2. **Heartbeat (§4.1):** register the module with
   `spawnPolicy({ heartbeat: { intervalMs: 50, timeoutMs: 500 } })`; the child
   must stay alive idle and under load (it answers `$pong`). Then make the child
   intentionally stop answering → the parent must emit `module:error` and restart.
3. **Graceful shutdown (§4.2):** `manager.shutdown(name)` should return in tens of
   ms (not ~5 s) and leave no orphan process.
4. **Oversized frame (§4.4):** have the Rust child receive a frame whose header
   claims a multi-GiB payload → it must close the connection without a huge
   allocation and keep running.
5. **Backpressure (§4.3):** stream a few hundred MB to a slow consumer → the Rust
   child's RSS stays bounded.
6. **requestId wrap (§4.5):** exercise a request with `requestId = 0xFFFFFFFF`.

The Node/Bun **regression tests** are executable specifications — read them to see
exact expected behaviour: `packages/client/test/regression.test.ts`,
`packages/core/test/regression.test.ts` (and the Bun mirrors under
`packages/procwire-bun-*/test/`).

---

## 6. Things that did **NOT** change (no Rust action)

- Header layout, endianness, flag bits, `ABORT_METHOD_ID`, codec formats
  (raw / msgpack / arrow), `$init` schema shape, `version` `"2.0.0"`.
- **`P1`/`P2`** (header buffer pooling/copy) and other internal Node/Bun
  perf/lifecycle fixes (`C7`, `C8`, `C10`) — implementation details with **no
  wire or behavioural contract change**.
- Benchmarks added here (`bench:lifecycle/heartbeat/backpressure`) are Node-side
  tooling; not protocol.

---

## 7. Priority summary

| # | Item | Priority | Type |
|---|------|----------|------|
| 4.1 | Answer `$ping` with `$pong` | **REQUIRED** | control-plane (new) |
| 4.4 | Bound incoming `payloadLength` | **REQUIRED** | data-plane (robustness) |
| 4.2 | Act on `$shutdown`, don't block exit | RECOMMENDED | control-plane |
| 4.3 | Honour send-side write backpressure | RECOMMENDED | data-plane (correctness) |
| 4.7 | Single connection / disconnect cleanup / no crash on socket error | RECOMMENDED | behaviour |
| 4.5 | `requestId` opaque `u32`, wraps, skip `0` | CHECK | data-plane |
| 4.6 | Optionally send structured error objects | OPTIONAL | data-plane |
| 4.8 | Default request timeout (only if Rust is caller) | INFO | behaviour |
