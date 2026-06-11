# Phase 4 Plan — Shared Core, Typed Bun API, Security, Remaining Hardening

> Working document for the final quality phase ("10/10"). Written to be
> self-contained: a fresh session (human or agent) should be able to execute
> this plan without any prior context. Read this file top to bottom before
> touching code.

## 1. Where the codebase stands (post PR #49 and PR #51)

| Phase                      | PR  | Status | Contents                                                                                                                                                                                                 |
| -------------------------- | --- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 critical fixes          | #49 | merged | streaming split-header fix (protocol), orphaned-pending fix (`send()`/`stream()`), Bun numeric `write()` + FIFO `writeAll` serialization, bun-client socket identity, real `prettier --check` CI gate    |
| P1 hardening (W1–W8)       | #49 | merged | exception-safe parent receive path, EPIPE-safe stdin writes, stdin-EOF orphan prevention, per-module shutdown guard, Bun `connectError`, stale-socket isolation, cancellable Bun stdin reader, W6 canary |
| P2 publishing/CI + P3 docs | #51 | merged | LICENSE in tarballs, `workspace:^`, codecs peer removed, `scripts/check-publish-artifacts.mjs` in CI, "Dashboard, Bench & Docs" CI job, truthful README/CLAUDE/RELEASING/astro-docs                      |

Current health: ~500 tests green across 7 suites (incl. real-process E2E on
Node and real-socket/spawn tests on Bun), full `pnpm ci` green, all six
packages publish-ready. Assessed quality ≈ 8.2/10. Everything below is what
separates that from 10/10.

**Process facts the next session needs:**

- TDD is mandatory in this repo's workflow: write the regression test first,
  run it RED against current code, then fix to GREEN. Real-execution tests
  preferred (real sockets / real spawned children) — see
  `packages/procwire-bun-core/test/transport-regression.test.ts` for the
  house style.
- Performance is a hard constraint: protocol perf tests
  (`packages/protocol/test/*.perf.test.ts`, ~2.2 GB/s streaming) must not
  regress, and the Bun send fast path must stay "one `write()` call" deep.
- Quality gates before any push: `pnpm format && pnpm lint && pnpm typecheck
&& pnpm test` plus `node scripts/check-publish-artifacts.mjs`.
- Changesets are created manually as files in `.changeset/` (see CLAUDE.md).
- `git push` works normally in fresh clones (the old deny rule lived in a
  developer-local settings file that is no longer tracked).
- Squash-merge PRs; one workstream per PR (A is two PRs — see below).

## 2. Workstream A — Shared core (`Transport` abstraction) **[largest, do first]**

### Problem

`@procwire/bun-core`/`@procwire/bun-client` are ~70–75% verbatim copies of
`@procwire/core`/`@procwire/client`. Git history proves the fork tax: ~13
fixes were written twice, at least one (Node C8) was missed on the Bun side
for months, and one port introduced a new critical bug. Every future fix to
duplicated logic must be written and reviewed twice.

Identical or near-identical today:

- `types.ts`, `errors.ts`, `events.ts` — 100% minus header comments
  (core↔bun-core; client↔bun-client analogous).
- `drain-waiter.ts` — byte-identical copies in bun-core and bun-client
  (`BunDrainWaiter` + `writeAll`); the Node `DrainWaiter` lives in
  `@procwire/protocol`.
- `module.ts` — frame dispatch (`_handleFrame`/`_handleResponse`/
  `_handleStreamChunk`/`_handleEvent`), pending request/stream maps,
  `_allocateRequestId`, abort bookkeeping, the stream generator with
  HWM(256)/LWM(64) socket-pause backpressure, builder API.
- `manager.ts` — retry/backoff, restart-window accounting, per-module
  shutdown guard, heartbeat state machine (`heartbeatPingAt` logic).
- `request-context.ts` — ~91% identical.

What genuinely differs (runtime adapters only): process spawn
(`child_process.spawn` + events vs `Bun.spawn` + `onExit`/`exited`), control
plane stdio (readline vs WHATWG stream reader), data plane sockets
(`net` per-socket listeners + cork/uncork vs `Bun.listen/connect` fixed
handler object + numeric `write()`), and the drain-wait mechanism.

### Design

Introduce a small internal transport seam (suggested home: a new
**private** package `packages/runtime-core` (`@procwire/runtime-core`,
`"private": true` initially — decide later whether to publish; if published
it must go through the artifact check):

```ts
interface FrameTransport {
  /** Write header+payload contiguously; resolves when fully handed to the OS. */
  writeFrame(header: Buffer, payload: Buffer): Promise<void>;
  pause(): void;
  resume(): void;
  close(): void;
}
// Inbound path stays callback-based: the adapter calls
// onData(chunk) / onClose() / onError(err) on the shared core.
```

- Node adapter: cork/write/write/uncork + `DrainWaiter` (keeps the
  zero-copy large-payload path — do NOT concat on Node).
- Bun adapter: `Buffer.concat` + `BunDrainWaiter.writeAll` (FIFO-serialized,
  partial-write loop — semantics already correct after #49, just move it).
- Shared core owns: correlation maps, dispatch, stream generator,
  backpressure ref-counting, abort handling, builder/schema logic, manager
  policies (retry/restart/heartbeat/shutdown bookkeeping).
- Adapters own: spawn/exit wiring, control-plane IO, socket lifecycle +
  identity checks, drain delivery.

### Execution order (two PRs)

- **A1 (mechanical, low risk):** move `BunDrainWaiter` (incl. `writeAll`)
  into `@procwire/protocol` (it is dependency-free; both Bun packages
  already depend on protocol); unify `types/errors/events` into the shared
  package; delete the byte-identical copies. Also unify the drain `clear()`
  semantics while moving it — see D7. All existing tests must pass
  unchanged (they pin behavior, not file layout); update imports only.
- **A2 (the real extraction):** shared `ModuleCore`/`ClientCore` consuming
  `FrameTransport`. Port test suites so the shared logic is tested ONCE
  against a fake transport plus per-runtime adapter suites against real
  sockets. Target: each runtime package shrinks to adapters + re-exports
  (~150–300 lines each).

### Acceptance (A)

- No wire-format change; Node↔Bun cross-runtime E2E still passes (add one:
  Node parent ↔ Bun child and vice versa — these do not exist yet and are
  cheap once W6-canary-style fixtures exist on both sides).
- Full suite green; protocol perf tests unchanged; Bun fast path still one
  `write()`.
- A grep for `_handleResponse` (and friends) matches exactly one
  implementation.

## 3. Workstream B — Typed schema API for Bun

Port the Node generics so the "drop-in" claim becomes fully true again:
`Module<S>` builder accumulation (`AddMethod`/`AddMethodSymmetric`/
`AddEvent`), typed `send`/`stream` constrained by response type,
`ExtractSchema`, `Client<S>` + `TypedRequestContext`. Sources of truth:
`packages/core/src/schema-types.ts`, the overloads in
`packages/core/src/module.ts` (`method`/`send`/`stream`) and
`packages/client/src/client.ts` (`handle`/`emitEvent`), and the type tests
in `packages/{core,client}/test/type-safety.test.ts`.

Notes:

- If Workstream A lands first, the generics belong on the shared core and B
  becomes mostly re-export plumbing — prefer that ordering.
- `expectTypeOf` is vitest-only; for the Bun packages add a compile-only
  type test file checked by `tsc -p tsconfig.json --noEmit` (already run in
  CI) using `@ts-expect-error` assertions.
- Update both Bun READMEs to drop the "typed generics are Node-only" caveat
  (added in #51) once true.
- Consider tightening the untyped string fallback overloads (a typo'd
  method name on a fully typed module currently still compiles, resolving
  to `unknown`) — at minimum document it; a breaking removal is a major.

## 4. Workstream C — Security hardening

Current state (both runtimes, child side — `_generatePipePath` in
`packages/client/src/client.ts` and `packages/procwire-bun-client/src/client.ts`):
socket path = `Math.random().toString(36)` (~41 bits, non-crypto) + pid in
hardcoded world-writable `/tmp`; no peer authentication (first connection
wins and gets every handler); `.sock` files never unlinked; the server keeps
listening after the parent connects (single-parent model rejects extras, but
the listener remains a target).

1. **Paths:** `crypto.randomBytes(16).toString("hex")`; honor
   `XDG_RUNTIME_DIR` then `TMPDIR` then `/tmp` on POSIX (Windows named-pipe
   namespace unchanged). Test: generated paths differ under a fixed
   `Math.random` seed (proves the RNG source changed) and land in
   `XDG_RUNTIME_DIR` when set.
2. **Handshake token (wire addition — coordinate carefully):** parent
   generates a token, passes it via env (`PROCWIRE_TOKEN`); child requires
   the FIRST data-plane frame to be an AUTH frame carrying it (reserve a
   control method id next to `ABORT_METHOD_ID = 0xFFFF`, e.g. `0xFFFE`)
   before adopting the connection; non-matching/missing token ⇒ drop. This
   touches the wire protocol: bump protocol minor, make the token optional
   for one release (enabled when env is present) for cross-version
   compatibility, and UPDATE `docs/rust-client-compatibility.md` — external
   clients must implement the AUTH frame.
3. **Hygiene:** unlink the socket file on `shutdown()` AND before `listen`
   (stale file from a crashed predecessor); close/stop the listener after
   the first accepted connection (re-listen on disconnect is NOT needed —
   crash recovery respawns the child).
4. Keep `spawn` shell-free (already true — just don't regress it).

## 5. Workstream D — Remaining correctness items (from the original audit)

Each gets the standard treatment: red test first, file:line in the commit
message. References point at `@procwire/core`/`client`; mirror on Bun (or
fix once in the shared core if A landed — strongly preferred).

| #   | Item                                                                                                                                                                                                                                              | Where / sketch                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Stale `exit` events not generation-checked: a late exit from a killed previous process can detach a freshly respawned module                                                                                                                      | `core/src/manager.ts` `handleProcessExit` — guard `if (module.process !== childProcess) return;` with the spawning process captured per attempt                                                                                       |
| D2  | No double-spawn guard: `spawn()` twice (or racing a pending crash-restart) orphans the first child                                                                                                                                                | `manager.ts spawnModule` — reject unless state is `created`/`closed`/`disconnected`; also cancel a pending restart timer for that module                                                                                              |
| D3  | Data-channel-only loss leaves the module wedged: socket `close` while the process lives rejects nothing, triggers nothing                                                                                                                         | `core/src/module.ts` close handler — reject pendings/streams, then let the manager decide (emit `module:error`; optionally kill the child so the normal restart path runs — recommended)                                              |
| D4  | Child schema outranks the parent's explicit timeout, and response-type agreement is never validated                                                                                                                                               | `module.ts` timeout precedence → parent method config first; `manager.ts validateSchema` → compare declared response types, fail handshake on mismatch                                                                                |
| D5  | `requestId === 0` frames with `IS_RESPONSE` can be misparsed as events (method/event id spaces overlap)                                                                                                                                           | `module.ts _handleFrame`/`_handleEvent` — reject frames with `IS_RESPONSE` set on the event path                                                                                                                                      |
| D6  | `validateHeader` is dead code: reserved flag bits and `methodId 0` are never enforced at runtime                                                                                                                                                  | either call it in `FrameBuffer` header parse (cheap: 2 compares — measure with perf tests) or delete it and document that enforcement is the embedder's job. Prefer wiring it in: forward-compat of reserved bits is worth 2 compares |
| D7  | Drain semantics drift: Node `DrainWaiter.clear()` rejects waiters, `BunDrainWaiter.clear()` resolves them (sender "succeeds" on a dead socket); `markClosed()` is dead code in both copies                                                        | unify on REJECT during A1; delete `markClosed`                                                                                                                                                                                        |
| D8  | Bun kill-signal drift: bare `proc.kill()` (SIGTERM) where Node uses SIGKILL (init-timeout, heartbeat-timeout, force-kill, cleanup) — a hung child with a SIGTERM handler survives the "force" kill                                                | `procwire-bun-core/src/manager.ts` (4 sites) → `kill("SIGKILL")`; also replace the 100ms `checkExit` poll with `await proc.exited` and clear the interval leak in the force-kill path                                                 |
| D9  | Misc small: heartbeat config unvalidated (`intervalMs: 0` ⇒ 1ms spam), `socketBufferSize` accepted-but-ignored on Bun, dead `_draining` field, `ManagerErrors.invalidInitFormat` unused while malformed `$init` surfaces as a confusing TypeError | one cleanup commit, individually tested where behavioral                                                                                                                                                                              |
| D10 | Control plane shares stdout with user `console.log` (spoofable / breakable by patched console)                                                                                                                                                    | switch library writes to `process.stdout.write` and document the "don't print bare JSON-RPC lines to stdout" contract; full fix (dedicated fd) is out of scope                                                                        |

## 6. Workstream E — Codecs

1. **SEMVER DECISION (owner input needed):** `apache-arrow` is ~95% of the
   install weight of every `@procwire/core` consumer. Recommended: subpath
   export `@procwire/codecs/arrow` with arrow moved to `optionalDependencies`
   or a peer; root re-export kept but deprecated for one minor. Document the
   migration in the changeset. This is at minimum a minor; decide before
   starting.
2. msgpack: hold a reusable `Encoder`/`Decoder` pair per codec instance
   (functional `encode()` allocates a fresh encoder and pins a ≥2KB buffer
   per message); benchmark before/after with `pnpm bench:quick`.
3. msgpack Buffer ext: decide aliasing semantics — true zero-copy encode
   (`new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)`) changes
   mutation visibility; if adopted, document it loudly. Decode already
   aliases (documented in #51).
4. Arrow object-input type sniffing (`typeof arr[0]`): reject mixed-type
   arrays explicitly, derive schema from the full column or an explicit
   schema option, and stabilize empty-column typing. Red tests: mixed array
   throws; empty vs non-empty column produce the same schema.

## 7. Workstream F — Tests & CI

- Replace `{ retry: 2 }` on the core E2E suite with deterministic race
  tests (the W4/D1/D2 unit patterns show how); keep retry only if a test is
  irreducibly timing-bound, and say why inline.
- Add a Windows leg to the Bun CI job — named pipes
  (`\\.\pipe\procwire-*`) are advertised but never exercised.
- Cross-runtime E2E (Node parent ↔ Bun child, Bun parent ↔ Node child) —
  cheap after A, high confidence value ("identical on the wire" is the
  core marketing claim).
- Dashboard: sync `dashboard/src/server/routes/scenarios.ts` with the real
  catalog in `packages/bench/src/scenarios.ts` (currently lists scenarios
  that don't exist); give the dashboard its own ESLint project config
  (currently excluded; ~6.4k issues under `--no-ignore`, mostly stylistic).
- Bench: run with `--expose-gc` in the documented commands so the existing
  `global.gc()` calls actually fire.

## 8. Suggested sequencing

```
PR-1  A1  drain-waiter unification (+D7), shared types/errors/events
PR-2  A2  Transport extraction + cross-runtime E2E       <- the big one
PR-3  B   typed schema API on the shared core
PR-4  D   D1–D10 hardening batch (TDD per item)
PR-5  C   security (paths, token [protocol minor], hygiene)
PR-6  E   codecs (arrow subpath decision first!) + F leftovers
```

Rationale: A first so every later fix is written once; C's wire change and
E's packaging change are the two externally visible steps — keep them late
and isolated so they can ship as deliberate minors.

## 9. Definition of done (10/10)

- [ ] One implementation of the IPC core; runtime packages are adapters.
- [ ] `Module<S>`/`Client<S>` typing identical across runtimes; READMEs say
      "drop-in" without caveats and it is true.
- [ ] Crypto-random socket paths in a per-user dir, opt-in AUTH token on the
      data plane, no stale `.sock` files, listener closed after accept.
- [ ] D1–D10 closed with red-first regression tests.
- [ ] Arrow no longer a forced install for msgpack-only users (decision
      executed either way and documented).
- [ ] No `retry` masking in the integration suites; Windows named pipes and
      cross-runtime pairs covered in CI.
- [ ] `pnpm ci`, artifact check, docs build: green; perf tests within noise
      of the Phase-1 baselines (streaming ≈ 2.2 GB/s, 10k frames ≈ 23 ms).
