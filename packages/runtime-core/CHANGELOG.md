# @procwire/runtime-core

## 1.3.0

### Minor Changes

- [#66](https://github.com/SebastianWebdev/procwire/pull/66) [`f85130a`](https://github.com/SebastianWebdev/procwire/commit/f85130aa530c17b18fa26ae1d1618584495d0184) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Add `ModuleManager.unregister(name, { force? })` to remove a module from the registry so the name can be re-registered with a fresh `Module` instance (e.g. retry after a terminal `SpawnError` with rebuilt executable config). Unregistering cancels pending crash-restart and spawn-retry timers, detaches the manager's listeners, and clears all per-module bookkeeping, so nothing can resurrect the removed name. A running or mid-spawn module throws unless `force: true` is set, which performs a graceful `shutdown()` first; an unknown name returns `false` (idempotent). Also adds `register(module, { replace: true })` to swap a non-running module in one call, and a `ManagerEvents.UNREGISTERED` (`module:unregistered`) event.

### Patch Changes

- [#68](https://github.com/SebastianWebdev/procwire/pull/68) [`4bdf1e0`](https://github.com/SebastianWebdev/procwire/commit/4bdf1e0c11e0ff3178a159bb9bff394d78f0e8c9) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Fix stream error frames from `ctx.error()` being silently dropped by the parent, which hung the consumer's `for await` forever.

  A stream handler's `ctx.error()` (and the fallback path where a stream handler throws) previously sent its frame with `IS_RESPONSE | IS_ERROR` but **without** `IS_STREAM`. The parent routed it to `_handleResponse` (which looks up pending _requests_) instead of the stream path (pending _streams_), so the lookup missed and the frame was discarded — streams have no timeout, so the consumer waited forever with no diagnostic.

  Two complementary routing fixes:
  - **Child:** `ctx.error()` now tags the frame with `IS_STREAM` when the method's response type is `stream`, so the parent routes it to the stream (this also works against older parents, which already handle `IS_STREAM | IS_ERROR`).
  - **Parent (defensive):** when `_handleResponse` finds no pending request, an `IS_ERROR` frame that matches a pending stream now fails that stream instead of being dropped — keeping new parents compatible with older children that predate the child-side fix.

  Additionally, error-message payloads are now encoded and decoded with a fixed msgpack codec on both sides, independent of the method's data codec. Previously `ctx.error()` serialized the error string with the method's response codec, so a stream (or any method) using a binary codec (`raw`/`rawChunks`/`arrow`) threw while serializing the string; the throw was swallowed and — for streams, which have no timeout — the consumer hung forever for the very same reason this fix targets. For the default msgpack codec the wire bytes are unchanged.

  Non-stream `ctx.error()` behavior is unchanged for the common (msgpack) case.

## 1.2.0

### Minor Changes

- [#64](https://github.com/SebastianWebdev/procwire/pull/64) [`c4ddb48`](https://github.com/SebastianWebdev/procwire/commit/c4ddb487367fbb5530bc84f2d28e699c4094816a) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Hide the worker's console window on Windows by default.

  `Module.executable(command, args, options)` now accepts a `windowsHide` option,
  and the parent passes it through to the spawn (Node `child_process.spawn` and
  `Bun.spawn`). It defaults to `true`, so a packaged app (e.g. Electron) no longer
  flashes a console window for each spawned worker — a Procwire worker is a
  headless IPC child, so no console is wanted in normal use. The flag has no effect
  on Linux/macOS. Pass `windowsHide: false` to spawn a worker with a visible
  console for debugging.

## 1.1.0

### Minor Changes

- [#56](https://github.com/SebastianWebdev/procwire/pull/56) [`936585f`](https://github.com/SebastianWebdev/procwire/commit/936585f4f94407a2661ab8107e0de6befbdabd15) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Phase 4 / A2: extract the shared IPC core behind a `FrameTransport` seam.
  - `@procwire/protocol` gains the transport seam and both socket adapters: `FrameTransport`, `NodeSocketTransport` (zero-copy cork/uncork writes + `DrainWaiter`) and `BunSocketTransport` (single-`write()` concat path + `BunDrainWaiter`).
  - `@procwire/runtime-core` now hosts the ENTIRE protocol logic exactly once: `ModuleCore` (frame dispatch, correlation maps, stream generator with HWM/LWM backpressure, abort handling, typed builder/schema accumulation), `ModuleManagerCore` (spawn retry/backoff, crash-restart window, per-module shutdown guard, heartbeat state machine), `ClientCore` (handler registry, $init schema, control-line handling, abort bookkeeping) and the shared `RequestContextImpl`.
  - The four runtime packages shrink to thin adapters (process spawn/exit wiring, control-plane IO, socket lifecycle + Bun identity checks); ~3.000 duplicated lines deleted. Public APIs are unchanged.
  - Behavior unification: the Bun manager now uses the per-module shutdown guard (Node's W4 fix) instead of a global flag, the Bun parent gained the exception-safe per-request decode paths previously Node-only, and the Bun packages now carry the same `Module<S>`/`Client<S>` generics as Node.
  - New cross-runtime E2E suites (Node parent <-> Bun child and Bun parent <-> Node child over real sockets and real spawned processes) pin the "identical on the wire" claim; the Bun CI job runs both directions.
  - `RequestContextImpl`'s constructor now takes a `FrameTransport` instead of a raw socket + drain waiter (it was exported as an internal implementation detail; handler-facing `RequestContext` is unchanged).

- [#59](https://github.com/SebastianWebdev/procwire/pull/59) [`79c5f7e`](https://github.com/SebastianWebdev/procwire/commit/79c5f7e77073000c522ffdad82ae71f97eed2aab) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Phase 4 / Workstream C: data-plane security hardening (socket paths, opt-in auth token, listener hygiene). All cross-runtime behavior lives once in the shared core.
  - **Unguessable socket paths (all runtimes, child side):** the data-plane pipe path now uses `crypto.randomBytes(16)` instead of `Math.random()`, and on POSIX it is created in a per-user runtime directory (`XDG_RUNTIME_DIR` → `TMPDIR` → `/tmp`) instead of always world-writable `/tmp`. The Windows named-pipe namespace is unchanged. A predictable, brute-forceable path on a shared host is no longer the only thing guarding the data plane.
  - **Opt-in data-plane authentication (`spawnPolicy({ auth: true })`):** the manager generates a per-spawn crypto-random token, passes it to the child via the `PROCWIRE_TOKEN` environment variable, and sends it as the FIRST data-plane frame (a new `AUTH_METHOD_ID = 0xFFFE` frame, reserved next to `ABORT_METHOD_ID`). The child requires a matching token (constant-time compared) before adopting the connection; a missing/mismatched token drops the connection while the listener stays open for the real parent. A stray local process that connects to the socket first is therefore rejected. Disabled by default and wire-compatible: with auth off no token is set and no AUTH frame is sent, so existing peers are unaffected. The `@procwire/client` / `@procwire/bun-client` children enforce it automatically when `PROCWIRE_TOKEN` is present (also overridable via the new `ClientOptions.authToken`). `@procwire/protocol` exports the new `AUTH_METHOD_ID`; `docs/rust-client-compatibility.md` documents the AUTH frame for external clients.
  - **Listener hygiene (all runtimes, child side):** the pipe server now unlinks a stale socket file before `listen` (so a crashed predecessor's leftover `.sock` can't cause `EADDRINUSE`), stops listening once the single parent connects (no stray client can connect afterwards; re-listening on disconnect is intentionally not done — crash recovery respawns the child), and removes the socket file on `shutdown()`.

### Patch Changes

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

- Updated dependencies [[`7542585`](https://github.com/SebastianWebdev/procwire/commit/7542585d6f4e52c546de9104b397f6050ec26eee), [`936585f`](https://github.com/SebastianWebdev/procwire/commit/936585f4f94407a2661ab8107e0de6befbdabd15), [`c5e0c27`](https://github.com/SebastianWebdev/procwire/commit/c5e0c2783222f9f82d4b53e3d829200f2ad2151d), [`9f8516f`](https://github.com/SebastianWebdev/procwire/commit/9f8516f2cafe3b8499dfa1767b61969057aaac7f), [`79c5f7e`](https://github.com/SebastianWebdev/procwire/commit/79c5f7e77073000c522ffdad82ae71f97eed2aab)]:
  - @procwire/protocol@1.1.0
  - @procwire/codecs@2.0.0
