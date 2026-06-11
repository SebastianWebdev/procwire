# @procwire/client

## 1.2.1

### Patch Changes

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

## 1.0.1

### Patch Changes

- [#39](https://github.com/SebastianWebdev/procwire/pull/39) [`903e11f`](https://github.com/SebastianWebdev/procwire/commit/903e11fe2afc235838db2807ba754c164c52837f) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Fix missing repository metadata in package.json files that caused npm publish failures with sigstore provenance verification.

## 1.0.1

### Patch Changes

- [#37](https://github.com/SebastianWebdev/procwire/pull/37) [`05547df`](https://github.com/SebastianWebdev/procwire/commit/05547dfd69303b5e1da55edbac4bbcf5cbe97a6d) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Add README.md files to all published packages and fix @module JSDoc tags for better documentation sidebar names.

- Updated dependencies [[`05547df`](https://github.com/SebastianWebdev/procwire/commit/05547dfd69303b5e1da55edbac4bbcf5cbe97a6d)]:
  - @procwire/protocol@1.0.1
  - @procwire/codecs@1.0.1
