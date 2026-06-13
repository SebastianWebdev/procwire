# @procwire/bun-client

## 1.3.0

### Minor Changes

- [#56](https://github.com/SebastianWebdev/procwire/pull/56) [`936585f`](https://github.com/SebastianWebdev/procwire/commit/936585f4f94407a2661ab8107e0de6befbdabd15) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Phase 4 / A2: extract the shared IPC core behind a `FrameTransport` seam.
  - `@procwire/protocol` gains the transport seam and both socket adapters: `FrameTransport`, `NodeSocketTransport` (zero-copy cork/uncork writes + `DrainWaiter`) and `BunSocketTransport` (single-`write()` concat path + `BunDrainWaiter`).
  - `@procwire/runtime-core` now hosts the ENTIRE protocol logic exactly once: `ModuleCore` (frame dispatch, correlation maps, stream generator with HWM/LWM backpressure, abort handling, typed builder/schema accumulation), `ModuleManagerCore` (spawn retry/backoff, crash-restart window, per-module shutdown guard, heartbeat state machine), `ClientCore` (handler registry, $init schema, control-line handling, abort bookkeeping) and the shared `RequestContextImpl`.
  - The four runtime packages shrink to thin adapters (process spawn/exit wiring, control-plane IO, socket lifecycle + Bun identity checks); ~3.000 duplicated lines deleted. Public APIs are unchanged.
  - Behavior unification: the Bun manager now uses the per-module shutdown guard (Node's W4 fix) instead of a global flag, the Bun parent gained the exception-safe per-request decode paths previously Node-only, and the Bun packages now carry the same `Module<S>`/`Client<S>` generics as Node.
  - New cross-runtime E2E suites (Node parent <-> Bun child and Bun parent <-> Node child over real sockets and real spawned processes) pin the "identical on the wire" claim; the Bun CI job runs both directions.
  - `RequestContextImpl`'s constructor now takes a `FrameTransport` instead of a raw socket + drain waiter (it was exported as an internal implementation detail; handler-facing `RequestContext` is unchanged).

- [#57](https://github.com/SebastianWebdev/procwire/pull/57) [`6049015`](https://github.com/SebastianWebdev/procwire/commit/6049015ac9c1bfd28f930e9ba12d3a22020850b1) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Phase 4 / B: first-class typed schema API on the Bun packages.

  The `Module<S>`/`Client<S>` generics arrived with the shared core (A2); this completes the workstream:
  - Both Bun packages now re-export the full set of schema typing helpers, matching their Node counterparts: `AddMethod`/`AddMethodSymmetric`/`AddEvent`/`SendReturn`/`MethodsWith(out)ResponseType`/`DualCodecMethodConfig`/`SingleCodecMethodConfig`/`TypedEventConfig` plus the `@procwire/codecs` conveniences (`Schema`, `EmptySchema`, `ExtractSchema`, ...). `@procwire/bun-client` also exports `TypedRequestContext`.
  - Compile-only type tests (`test/type-safety.typecheck.ts`, checked by `tsc --noEmit` in CI; `expectTypeOf` is vitest-only) pin the typing in both Bun packages, mirroring the Node type-safety suites.
  - READMEs: the "typed generics are Node-only" caveat is gone - the drop-in claim now includes the type level. The untyped string fallback (a typo'd method name on a typed module resolves to `unknown` instead of failing the build) is now documented.

- [#59](https://github.com/SebastianWebdev/procwire/pull/59) [`79c5f7e`](https://github.com/SebastianWebdev/procwire/commit/79c5f7e77073000c522ffdad82ae71f97eed2aab) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Phase 4 / Workstream C: data-plane security hardening (socket paths, opt-in auth token, listener hygiene). All cross-runtime behavior lives once in the shared core.
  - **Unguessable socket paths (all runtimes, child side):** the data-plane pipe path now uses `crypto.randomBytes(16)` instead of `Math.random()`, and on POSIX it is created in a per-user runtime directory (`XDG_RUNTIME_DIR` → `TMPDIR` → `/tmp`) instead of always world-writable `/tmp`. The Windows named-pipe namespace is unchanged. A predictable, brute-forceable path on a shared host is no longer the only thing guarding the data plane.
  - **Opt-in data-plane authentication (`spawnPolicy({ auth: true })`):** the manager generates a per-spawn crypto-random token, passes it to the child via the `PROCWIRE_TOKEN` environment variable, and sends it as the FIRST data-plane frame (a new `AUTH_METHOD_ID = 0xFFFE` frame, reserved next to `ABORT_METHOD_ID`). The child requires a matching token (constant-time compared) before adopting the connection; a missing/mismatched token drops the connection while the listener stays open for the real parent. A stray local process that connects to the socket first is therefore rejected. Disabled by default and wire-compatible: with auth off no token is set and no AUTH frame is sent, so existing peers are unaffected. The `@procwire/client` / `@procwire/bun-client` children enforce it automatically when `PROCWIRE_TOKEN` is present (also overridable via the new `ClientOptions.authToken`). `@procwire/protocol` exports the new `AUTH_METHOD_ID`; `docs/rust-client-compatibility.md` documents the AUTH frame for external clients.
  - **Listener hygiene (all runtimes, child side):** the pipe server now unlinks a stale socket file before `listen` (so a crashed predecessor's leftover `.sock` can't cause `EADDRINUSE`), stops listening once the single parent connects (no stray client can connect afterwards; re-listening on disconnect is intentionally not done — crash recovery respawns the child), and removes the socket file on `shutdown()`.

### Patch Changes

- [#54](https://github.com/SebastianWebdev/procwire/pull/54) [`7542585`](https://github.com/SebastianWebdev/procwire/commit/7542585d6f4e52c546de9104b397f6050ec26eee) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Phase 4 / A1: deduplicate the runtime packages (first step of the shared-core extraction).
  - `BunDrainWaiter` (incl. `writeAll`) moved from `@procwire/bun-core` / `@procwire/bun-client` into `@procwire/protocol` (new exports: `BunDrainWaiter`, `BunWritableSocket`). Both Bun packages keep re-exporting `BunDrainWaiter`, so existing imports continue to work.
  - D7 fix: `BunDrainWaiter.clear()` now REJECTS pending drain waiters (matching Node's `DrainWaiter`) instead of resolving them — a sender suspended on backpressure no longer "succeeds" against a dead socket. The dead `markClosed()` method was removed.
  - The duplicated `types` / `errors` / `events` modules of all four runtime packages now live exactly once in the new `@procwire/runtime-core` package and are re-exported unchanged; public APIs are unaffected.

- [#58](https://github.com/SebastianWebdev/procwire/pull/58) [`c5e0c27`](https://github.com/SebastianWebdev/procwire/commit/c5e0c2783222f9f82d4b53e3d829200f2ad2151d) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Phase 4 / Workstream D hardening batch (D1–D10; D7 landed earlier with the drain-waiter unification). Every fix lives once in the shared core unless noted.
  - **D1 (runtime-core, core, bun-core):** process exits are now generation-checked. A late `exit` from a previous (killed/replaced) child no longer detaches a freshly respawned module; adapters pass the exited process into `handleProcessExit`.
  - **D2 (runtime-core):** double-spawn guard. `spawn()` rejects unless the module is `created`/`closed`/`disconnected`, so a second spawn can no longer orphan a live child; an explicit spawn also cancels a pending crash-restart timer instead of racing it.
  - **D3 (runtime-core):** a data-channel-only loss (socket closed while the process lives) no longer wedges the module. In-flight requests and streams are rejected immediately, the manager emits `module:error` and kills the child so the normal crash/restart policy applies. A crashed child whose socket close beats its exit event now restarts correctly too.
  - **D4 (runtime-core):** the parent's explicit per-method `timeout` now outranks the child schema's timeout (the child can no longer extend a deadline the embedder chose), and declared response types are validated during the handshake — a parent/child disagreement (e.g. `result` vs `stream`) fails the spawn with a descriptive error instead of surfacing later.
  - **D5 (runtime-core):** frames with `requestId 0` and `IS_RESPONSE` set are dropped instead of being dispatched as events (method and event id spaces overlap).
  - **D6 (protocol):** `validateHeader` is now enforced by `FrameBuffer` on every parsed header (batch and streaming modes): reserved flag bits 6–7 must be zero and `methodId 0` is rejected. Perf-gated: streaming and 10k-frame benchmarks stay within noise of the Phase-1 baselines.
  - **D8 (bun-core):** every "force" kill (init timeout, heartbeat timeout, cleanup, shutdown force-kill) now sends `SIGKILL` like the Node manager — a hung child with a SIGTERM handler no longer survives. The shutdown exit wait uses `await proc.exited` instead of a 100 ms `exitCode` poll, removing the interval leak in the force-kill path.
  - **D9 (runtime-core, bun-core):** heartbeat config is validated at spawn (`intervalMs`/`timeoutMs` must be > 0; `intervalMs: 0` previously meant ~1 ms ping spam); a malformed `$init` now fails the spawn with `invalid $init format` instead of a confusing `TypeError`; `socketBufferSize` is documented as Node-only (accepted but ignored on Bun, which has no socket buffer sizing API). The dead `_draining` field was already removed by the shared-core extraction.
  - **D10 (runtime-core, client, bun-client):** control-plane writes (`$init`, `$pong`) go through `process.stdout.write` instead of `console.log`, so a user-patched console can no longer break or spoof the control plane. The embedder contract ("stdout is the control plane — don't print bare JSON-RPC lines") is documented in both client READMEs.

- Updated dependencies [[`7542585`](https://github.com/SebastianWebdev/procwire/commit/7542585d6f4e52c546de9104b397f6050ec26eee), [`936585f`](https://github.com/SebastianWebdev/procwire/commit/936585f4f94407a2661ab8107e0de6befbdabd15), [`c5e0c27`](https://github.com/SebastianWebdev/procwire/commit/c5e0c2783222f9f82d4b53e3d829200f2ad2151d), [`79c5f7e`](https://github.com/SebastianWebdev/procwire/commit/79c5f7e77073000c522ffdad82ae71f97eed2aab)]:
  - @procwire/protocol@1.1.0
  - @procwire/runtime-core@1.1.0
  - @procwire/codecs@1.1.1

## 1.2.1

### Patch Changes

- [#49](https://github.com/SebastianWebdev/procwire/pull/49) [`c54b2e8`](https://github.com/SebastianWebdev/procwire/commit/c54b2e85dc7836da24cb3fccea14bc7832979f26) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Fix critical data-plane transport bugs on Bun:
  - **Partial socket writes corrupted the wire protocol under backpressure.** Bun's `socket.write()` returns the number of bytes written (possibly partial, `-1` when closed), but every send path treated it as a boolean: a partial write silently dropped the frame tail and desynced the peer's framing, and a zero-byte write waited for drain but never re-sent the frame. All send paths (`send`, `stream`, abort frames, responses via `respond`/`ack`/`chunk`/`end`/`error`, events, error responses) now go through `BunDrainWaiter.writeAll()`, which re-writes the unwritten remainder after each drain event. `writeAll()` calls are serialized in FIFO order per socket, so concurrent senders suspended on backpressure cannot interleave bytes inside one frame. Verified with real-socket regression tests that push 4MB frames through a paused receiver, plus deterministic interleave tests for concurrent sends.
  - **bun-client: a stray connection tore down the active session.** `Bun.listen` shares one handler object across all connections, and the `close`/`data`/`error`/`drain` handlers ignored which socket fired. A rejected second connection's close event ran the disconnect teardown against the live parent session (aborting all in-flight work), and stray bytes could poison the active session's framing. All handlers now check socket identity.
  - **send()/stream() no longer orphan pending state when the initial send fails** (e.g. the codec throws): the pending entry and abort listener are cleaned up immediately, so the orphaned response promise can no longer surface as an unhandled rejection that kills the process.

- [#49](https://github.com/SebastianWebdev/procwire/pull/49) [`c54b2e8`](https://github.com/SebastianWebdev/procwire/commit/c54b2e85dc7836da24cb3fccea14bc7832979f26) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - P1 reliability hardening - failure paths and lifecycle races (each fix covered by a regression test written first against the buggy behavior):
  - **core**: the parent's data-plane receive path is now exception-safe. A frame exceeding `maxPayloadSize` drops that module's connection (guarded `error` emit) instead of throwing out of the socket `data` handler and killing the parent supervisor; a corrupt response/stream/event payload rejects the affected request, errors the affected stream, or drops the event instead of crashing the process.
  - **core**: writes to a dying child's stdin (heartbeat `$ping`, `$shutdown`) no longer crash the parent: stdin gets a guard `error` listener at spawn and both writes tolerate synchronous EPIPE.
  - **core**: the shutdown guard is per-module instead of one global flag. Shutting down one module no longer suppresses crash detection/restart for every other module, and overlapping `shutdown()` calls no longer race on a shared flag (the second module's exit was previously reported as a spurious crash).
  - **client**: stdin EOF now triggers a clean shutdown. Previously a hard parent crash (SIGKILL) left the child running forever - the still-listening pipe server kept the event loop alive - leaking processes and `/tmp` sockets.
  - **bun-core**: `Bun.connect()` failures reject `connectDataChannel` cleanly via a `connectError` handler; previously the floating connect promise landed in the unhandled-rejection queue (process-fatal by default).
  - **bun-core**: socket handlers pass the firing socket through to the Module, which ignores events from a stale (replaced) connection - a late `close`/`data`/`drain` from a previous socket can no longer flip a freshly restarted session to `disconnected` or poison its framing (port of the Node C8 fix).
  - **bun-core**: receive-path hardening ported from core (oversized frame drops the connection; corrupt payloads reject the affected request instead of crashing).
  - **bun-client**: the control reader uses an explicit stdin reader that `shutdown()` cancels, so a suspended read no longer pins the event loop - graceful shutdown completes immediately instead of waiting out the parent's force-kill grace period. stdin EOF (parent death) now shuts the child down instead of orphaning it, and split multi-byte control lines decode correctly (`stream: true`).
  - **bun-core**: added an end-to-end canary (real `ModuleManager` spawn of a real bun-client child) pinning down that heavy synchronous stdout logging does not deadlock the handshake or responses on current Bun.

- [#51](https://github.com/SebastianWebdev/procwire/pull/51) [`8846afc`](https://github.com/SebastianWebdev/procwire/commit/8846afce107317cfb578ffff11be9a9628d3f0ca) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Publishing hygiene and documentation accuracy:
  - **LICENSE is now actually included in every published tarball.** The `files` entry pointed at a LICENSE file that did not exist in the package directories, so npm silently dropped it. A new CI check (`scripts/check-publish-artifacts.mjs`) verifies tarball contents (LICENSE, README, dist entrypoints) for all publishable packages.
  - **Internal dependency ranges publish as caret ranges.** `workspace:*` rewrites to an exact version pin on publish, which causes needless peer/dedup conflicts for consumers; `workspace:^` keeps published ranges caret-compatible. Enforced by the same CI check.
  - **`@procwire/codecs` no longer declares an unused peer dependency on `@procwire/protocol`** - the codec interfaces are structurally typed and never import it, so consumers were forced to install protocol for nothing.
  - READMEs now document the v1.2 behavior: the 30s default request timeout (`requestTimeout()`), the `spawnPolicy.heartbeat` liveness option, graceful `$shutdown`, and automatic child shutdown on stdin EOF (parent death). The Bun package READMEs state explicitly that typed schema generics are currently Node-only.
  - The "zero runtime dependencies" claim is now scoped truthfully to `@procwire/protocol` (core/client depend on `@procwire/codecs`, which ships MessagePack and Arrow).
  - Stale source comments fixed: the ~2GB cap in `wire-format.ts` is a deliberate conservative limit (not a Node Buffer limitation on Node >= 22), and the msgpack Buffer ext encoder no longer claims to be zero-copy (it copies on encode).

- Updated dependencies [[`c54b2e8`](https://github.com/SebastianWebdev/procwire/commit/c54b2e85dc7836da24cb3fccea14bc7832979f26), [`8846afc`](https://github.com/SebastianWebdev/procwire/commit/8846afce107317cfb578ffff11be9a9628d3f0ca)]:
  - @procwire/protocol@1.0.2
  - @procwire/codecs@1.1.1

## 1.2.0

### Minor Changes

- [#47](https://github.com/SebastianWebdev/procwire/pull/47) [`c120c45`](https://github.com/SebastianWebdev/procwire/commit/c120c45d4e8b0d1eb928da09cb328148e8cdfad8) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Graceful shutdown and an incoming frame-size guard on the child.
  - **Graceful `$shutdown`:** the child now shuts down cleanly when the parent requests it (closing its pipe and exiting) instead of waiting to be force-killed after the grace period, so teardown is prompt.
  - **`maxPayloadSize` option:** the client can now bound the size of incoming frames; an oversized/invalid frame drops the connection instead of being allocated, guarding against OOM from a malformed or hostile peer.

- [#47](https://github.com/SebastianWebdev/procwire/pull/47) [`c120c45`](https://github.com/SebastianWebdev/procwire/commit/c120c45d4e8b0d1eb928da09cb328148e8cdfad8) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Add an opt-in control-plane heartbeat for liveness detection.

  Enable it per module with `spawnPolicy({ heartbeat: { intervalMs, timeoutMs } })`: the parent pings the child over the control plane and, if no reply arrives within `timeoutMs` of an outstanding ping, treats the child as dead and runs the normal crash/restart path — catching a hung child that hasn't exited. The child answers `$ping` with `$pong`. Disabled by default, so existing behaviour is unchanged unless you opt in.

### Patch Changes

- [#47](https://github.com/SebastianWebdev/procwire/pull/47) [`c120c45`](https://github.com/SebastianWebdev/procwire/commit/c120c45d4e8b0d1eb928da09cb328148e8cdfad8) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Production-readiness hardening across the parent and child, with the Bun packages brought to parity.
  - An unobserved socket error no longer crashes the parent or child process.
  - `requestId` now wraps correctly at the `uint32` boundary (skipping the reserved `0`) instead of overflowing.
  - Abort-signal and socket listeners are removed when a request settles or a connection detaches (no leaks / `MaxListenersExceededWarning`).
  - Fixed a restart↔shutdown race that could resurrect a module being shut down, and added a timeout when connecting the data channel.
  - Remote error payloads keep a useful message (a structured `{ message, … }` object no longer collapses to `"[object Object]"`).
  - Receive-side flow control bounds memory when a stream consumer falls behind (the socket is paused past a high-water mark and resumed below a low-water mark).
  - The child cleans up pending state on disconnect and rejects a second inbound connection.
  - Internal: removed a redundant per-send header buffer pool on the Node packages (no behaviour change).

## 1.1.0

### Minor Changes

- [#45](https://github.com/SebastianWebdev/procwire/pull/45) [`5e7e9a3`](https://github.com/SebastianWebdev/procwire/commit/5e7e9a3c6a6c8374f7062592afee4ff89e42f3e9) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Add end-to-end type-safe request/response system with dual-codec support.

  **Type Safety:**
  - Codecs carry type information via `MsgPackCodec<TIn, TOut>` and `msgpack()` factory
  - `Module<S>` and `Client<S>` infer schema from generics with typed `send()`, `stream()`, `handle()`, and `emitEvent()`
  - `ExtractSchema<typeof module>` enables sharing types between parent and child

  **Dual-Codec API (for asymmetric codecs like Arrow):**
  - `MethodDescriptor` now stores 4 types: `reqIn`, `reqOut`, `resIn`, `resOut`
  - `Module.method()` accepts `{ requestCodec, responseCodec }` for full control
  - `Module.method()` accepts `{ codec }` shorthand for symmetric codecs
  - `Client.handle()` accepts same codec config patterns
  - Helper types: `ParentRequestType`, `ParentResponseType`, `ChildRequestType`, `ChildResponseType`

  **Breaking Changes:** None. Zero runtime changes, full backward compatibility.

### Patch Changes

- Updated dependencies [[`5e7e9a3`](https://github.com/SebastianWebdev/procwire/commit/5e7e9a3c6a6c8374f7062592afee4ff89e42f3e9)]:
  - @procwire/codecs@1.1.0

## 1.0.2

### Patch Changes

- [#43](https://github.com/SebastianWebdev/procwire/pull/43) [`6bbbe62`](https://github.com/SebastianWebdev/procwire/commit/6bbbe62cf128a9680692f44acea2a1352d00befd) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Add README.md files to Bun.js packages with full API reference, usage examples, and comparison with Node.js counterparts.

## 1.0.1

### Patch Changes

- [#39](https://github.com/SebastianWebdev/procwire/pull/39) [`903e11f`](https://github.com/SebastianWebdev/procwire/commit/903e11fe2afc235838db2807ba754c164c52837f) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Fix missing repository metadata in package.json files that caused npm publish failures with sigstore provenance verification.

## 1.0.1

### Patch Changes

- Updated dependencies [[`05547df`](https://github.com/SebastianWebdev/procwire/commit/05547dfd69303b5e1da55edbac4bbcf5cbe97a6d)]:
  - @procwire/protocol@1.0.1
  - @procwire/codecs@1.0.1
