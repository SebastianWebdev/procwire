---
"@procwire/runtime-core": minor
"@procwire/core": minor
"@procwire/bun-core": minor
---

Add `ModuleManager.unregister(name, { force? })` to remove a module from the registry so the name can be re-registered with a fresh `Module` instance (e.g. retry after a terminal `SpawnError` with rebuilt executable config). Unregistering cancels pending crash-restart and spawn-retry timers, detaches the manager's listeners, and clears all per-module bookkeeping, so nothing can resurrect the removed name. A running or mid-spawn module throws unless `force: true` is set, which performs a graceful `shutdown()` first; an unknown name returns `false` (idempotent). Also adds `register(module, { replace: true })` to swap a non-running module in one call, and a `ManagerEvents.UNREGISTERED` (`module:unregistered`) event.
