---
"@procwire/core": patch
"@procwire/client": patch
"@procwire/bun-core": patch
"@procwire/bun-client": patch
---

Production-readiness hardening across the parent and child, with the Bun packages brought to parity.

- An unobserved socket error no longer crashes the parent or child process.
- `requestId` now wraps correctly at the `uint32` boundary (skipping the reserved `0`) instead of overflowing.
- Abort-signal and socket listeners are removed when a request settles or a connection detaches (no leaks / `MaxListenersExceededWarning`).
- Fixed a restart↔shutdown race that could resurrect a module being shut down, and added a timeout when connecting the data channel.
- Remote error payloads keep a useful message (a structured `{ message, … }` object no longer collapses to `"[object Object]"`).
- Receive-side flow control bounds memory when a stream consumer falls behind (the socket is paused past a high-water mark and resumed below a low-water mark).
- The child cleans up pending state on disconnect and rejects a second inbound connection.
- Internal: removed a redundant per-send header buffer pool on the Node packages (no behaviour change).
