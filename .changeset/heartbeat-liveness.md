---
"@procwire/core": minor
"@procwire/client": minor
"@procwire/bun-core": minor
"@procwire/bun-client": minor
---

Add an opt-in control-plane heartbeat for liveness detection.

Enable it per module with `spawnPolicy({ heartbeat: { intervalMs, timeoutMs } })`: the parent pings the child over the control plane and, if no reply arrives within `timeoutMs` of an outstanding ping, treats the child as dead and runs the normal crash/restart path — catching a hung child that hasn't exited. The child answers `$ping` with `$pong`. Disabled by default, so existing behaviour is unchanged unless you opt in.
