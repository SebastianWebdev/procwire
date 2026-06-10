---
"@procwire/core": patch
"@procwire/client": patch
"@procwire/bun-core": patch
"@procwire/bun-client": patch
---

P1 reliability hardening - failure paths and lifecycle races (each fix covered by a regression test written first against the buggy behavior):

- **core**: the parent's data-plane receive path is now exception-safe. A frame exceeding `maxPayloadSize` drops that module's connection (guarded `error` emit) instead of throwing out of the socket `data` handler and killing the parent supervisor; a corrupt response/stream/event payload rejects the affected request, errors the affected stream, or drops the event instead of crashing the process.
- **core**: writes to a dying child's stdin (heartbeat `$ping`, `$shutdown`) no longer crash the parent: stdin gets a guard `error` listener at spawn and both writes tolerate synchronous EPIPE.
- **core**: the shutdown guard is per-module instead of one global flag. Shutting down one module no longer suppresses crash detection/restart for every other module, and overlapping `shutdown()` calls no longer race on a shared flag (the second module's exit was previously reported as a spurious crash).
- **client**: stdin EOF now triggers a clean shutdown. Previously a hard parent crash (SIGKILL) left the child running forever - the still-listening pipe server kept the event loop alive - leaking processes and `/tmp` sockets.
- **bun-core**: `Bun.connect()` failures reject `connectDataChannel` cleanly via a `connectError` handler; previously the floating connect promise landed in the unhandled-rejection queue (process-fatal by default).
- **bun-core**: socket handlers pass the firing socket through to the Module, which ignores events from a stale (replaced) connection - a late `close`/`data`/`drain` from a previous socket can no longer flip a freshly restarted session to `disconnected` or poison its framing (port of the Node C8 fix).
- **bun-core**: receive-path hardening ported from core (oversized frame drops the connection; corrupt payloads reject the affected request instead of crashing).
- **bun-client**: the control reader uses an explicit stdin reader that `shutdown()` cancels, so a suspended read no longer pins the event loop - graceful shutdown completes immediately instead of waiting out the parent's force-kill grace period. stdin EOF (parent death) now shuts the child down instead of orphaning it, and split multi-byte control lines decode correctly (`stream: true`).
- **bun-core**: added an end-to-end canary (real `ModuleManager` spawn of a real bun-client child) pinning down that heavy synchronous stdout logging does not deadlock the handshake or responses on current Bun.
