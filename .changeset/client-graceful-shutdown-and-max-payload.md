---
"@procwire/client": minor
"@procwire/bun-client": minor
---

Graceful shutdown and an incoming frame-size guard on the child.

- **Graceful `$shutdown`:** the child now shuts down cleanly when the parent requests it (closing its pipe and exiting) instead of waiting to be force-killed after the grace period, so teardown is prompt.
- **`maxPayloadSize` option:** the client can now bound the size of incoming frames; an oversized/invalid frame drops the connection instead of being allocated, guarding against OOM from a malformed or hostile peer.
