---
"@procwire/core": minor
"@procwire/bun-core": minor
---

Bound requests with a default timeout.

`send()` to a method with no configured timeout previously waited forever if the child never replied. It is now bounded by a default request timeout (30s). Override it per module with `requestTimeout(ms)`, or pass `0` to restore the previous unbounded behaviour.
