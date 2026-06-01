# @procwire/core

## 1.2.0

### Minor Changes

- [#47](https://github.com/SebastianWebdev/procwire/pull/47) [`c120c45`](https://github.com/SebastianWebdev/procwire/commit/c120c45d4e8b0d1eb928da09cb328148e8cdfad8) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Bound requests with a default timeout.

  `send()` to a method with no configured timeout previously waited forever if the child never replied. It is now bounded by a default request timeout (30s). Override it per module with `requestTimeout(ms)`, or pass `0` to restore the previous unbounded behaviour.

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

- [#37](https://github.com/SebastianWebdev/procwire/pull/37) [`05547df`](https://github.com/SebastianWebdev/procwire/commit/05547dfd69303b5e1da55edbac4bbcf5cbe97a6d) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Add README.md files to all published packages and fix @module JSDoc tags for better documentation sidebar names.

- Updated dependencies [[`05547df`](https://github.com/SebastianWebdev/procwire/commit/05547dfd69303b5e1da55edbac4bbcf5cbe97a6d)]:
  - @procwire/protocol@1.0.1
  - @procwire/codecs@1.0.1
