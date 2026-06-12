---
"@procwire/runtime-core": patch
"@procwire/protocol": patch
"@procwire/core": patch
"@procwire/client": patch
"@procwire/bun-core": patch
"@procwire/bun-client": patch
---

Phase 4 / Workstream D hardening batch (D1–D10; D7 landed earlier with the drain-waiter unification). Every fix lives once in the shared core unless noted.

- **D1 (runtime-core, core, bun-core):** process exits are now generation-checked. A late `exit` from a previous (killed/replaced) child no longer detaches a freshly respawned module; adapters pass the exited process into `handleProcessExit`.
- **D2 (runtime-core):** double-spawn guard. `spawn()` rejects unless the module is `created`/`closed`/`disconnected`, so a second spawn can no longer orphan a live child; an explicit spawn also cancels a pending crash-restart timer instead of racing it.
- **D3 (runtime-core):** a data-channel-only loss (socket closed while the process lives) no longer wedges the module. In-flight requests and streams are rejected immediately, the manager emits `module:error` and kills the child so the normal crash/restart policy applies. A crashed child whose socket close beats its exit event now restarts correctly too.
- **D4 (runtime-core):** the parent's explicit per-method `timeout` now outranks the child schema's timeout (the child can no longer extend a deadline the embedder chose), and declared response types are validated during the handshake — a parent/child disagreement (e.g. `result` vs `stream`) fails the spawn with a descriptive error instead of surfacing later.
- **D5 (runtime-core):** frames with `requestId 0` and `IS_RESPONSE` set are dropped instead of being dispatched as events (method and event id spaces overlap).
- **D6 (protocol):** `validateHeader` is now enforced by `FrameBuffer` on every parsed header (batch and streaming modes): reserved flag bits 6–7 must be zero and `methodId 0` is rejected. Perf-gated: streaming and 10k-frame benchmarks stay within noise of the Phase-1 baselines.
- **D8 (bun-core):** every "force" kill (init timeout, heartbeat timeout, cleanup, shutdown force-kill) now sends `SIGKILL` like the Node manager — a hung child with a SIGTERM handler no longer survives. The shutdown exit wait uses `await proc.exited` instead of a 100 ms `exitCode` poll, removing the interval leak in the force-kill path.
- **D9 (runtime-core, bun-core):** heartbeat config is validated at spawn (`intervalMs`/`timeoutMs` must be > 0; `intervalMs: 0` previously meant ~1 ms ping spam); a malformed `$init` now fails the spawn with `invalid $init format` instead of a confusing `TypeError`; `socketBufferSize` is documented as Node-only (accepted but ignored on Bun, which has no socket buffer sizing API). The dead `_draining` field was already removed by the shared-core extraction.
- **D10 (runtime-core, client, bun-client):** control-plane writes (`$init`, `$pong`) go through `process.stdout.write` instead of `console.log`, so a user-patched console can no longer break or spoof the control plane. The embedder contract ("stdout is the control plane — don't print bare JSON-RPC lines") is documented in both client READMEs.
