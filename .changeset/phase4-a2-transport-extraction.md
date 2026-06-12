---
"@procwire/protocol": minor
"@procwire/runtime-core": minor
"@procwire/core": minor
"@procwire/client": minor
"@procwire/bun-core": minor
"@procwire/bun-client": minor
---

Phase 4 / A2: extract the shared IPC core behind a `FrameTransport` seam.

- `@procwire/protocol` gains the transport seam and both socket adapters: `FrameTransport`, `NodeSocketTransport` (zero-copy cork/uncork writes + `DrainWaiter`) and `BunSocketTransport` (single-`write()` concat path + `BunDrainWaiter`).
- `@procwire/runtime-core` now hosts the ENTIRE protocol logic exactly once: `ModuleCore` (frame dispatch, correlation maps, stream generator with HWM/LWM backpressure, abort handling, typed builder/schema accumulation), `ModuleManagerCore` (spawn retry/backoff, crash-restart window, per-module shutdown guard, heartbeat state machine), `ClientCore` (handler registry, $init schema, control-line handling, abort bookkeeping) and the shared `RequestContextImpl`.
- The four runtime packages shrink to thin adapters (process spawn/exit wiring, control-plane IO, socket lifecycle + Bun identity checks); ~3.000 duplicated lines deleted. Public APIs are unchanged.
- Behavior unification: the Bun manager now uses the per-module shutdown guard (Node's W4 fix) instead of a global flag, the Bun parent gained the exception-safe per-request decode paths previously Node-only, and the Bun packages now carry the same `Module<S>`/`Client<S>` generics as Node.
- New cross-runtime E2E suites (Node parent <-> Bun child and Bun parent <-> Node child over real sockets and real spawned processes) pin the "identical on the wire" claim; the Bun CI job runs both directions.
- `RequestContextImpl`'s constructor now takes a `FrameTransport` instead of a raw socket + drain waiter (it was exported as an internal implementation detail; handler-facing `RequestContext` is unchanged).
