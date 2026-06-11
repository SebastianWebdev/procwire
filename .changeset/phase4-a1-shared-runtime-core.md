---
"@procwire/protocol": minor
"@procwire/core": patch
"@procwire/client": patch
"@procwire/bun-core": patch
"@procwire/bun-client": patch
---

Phase 4 / A1: deduplicate the runtime packages (first step of the shared-core extraction).

- `BunDrainWaiter` (incl. `writeAll`) moved from `@procwire/bun-core` / `@procwire/bun-client` into `@procwire/protocol` (new exports: `BunDrainWaiter`, `BunWritableSocket`). Both Bun packages keep re-exporting `BunDrainWaiter`, so existing imports continue to work.
- D7 fix: `BunDrainWaiter.clear()` now REJECTS pending drain waiters (matching Node's `DrainWaiter`) instead of resolving them — a sender suspended on backpressure no longer "succeeds" against a dead socket. The dead `markClosed()` method was removed.
- The duplicated `types` / `errors` / `events` modules of all four runtime packages now live exactly once in the new `@procwire/runtime-core` package and are re-exported unchanged; public APIs are unaffected.
