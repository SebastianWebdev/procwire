---
"@procwire/protocol": minor
"@procwire/runtime-core": minor
"@procwire/core": minor
"@procwire/client": minor
"@procwire/bun-core": minor
"@procwire/bun-client": minor
---

Phase 4 / Workstream C: data-plane security hardening (socket paths, opt-in auth token, listener hygiene). All cross-runtime behavior lives once in the shared core.

- **Unguessable socket paths (all runtimes, child side):** the data-plane pipe path now uses `crypto.randomBytes(16)` instead of `Math.random()`, and on POSIX it is created in a per-user runtime directory (`XDG_RUNTIME_DIR` → `TMPDIR` → `/tmp`) instead of always world-writable `/tmp`. The Windows named-pipe namespace is unchanged. A predictable, brute-forceable path on a shared host is no longer the only thing guarding the data plane.
- **Opt-in data-plane authentication (`spawnPolicy({ auth: true })`):** the manager generates a per-spawn crypto-random token, passes it to the child via the `PROCWIRE_TOKEN` environment variable, and sends it as the FIRST data-plane frame (a new `AUTH_METHOD_ID = 0xFFFE` frame, reserved next to `ABORT_METHOD_ID`). The child requires a matching token (constant-time compared) before adopting the connection; a missing/mismatched token drops the connection while the listener stays open for the real parent. A stray local process that connects to the socket first is therefore rejected. Disabled by default and wire-compatible: with auth off no token is set and no AUTH frame is sent, so existing peers are unaffected. The `@procwire/client` / `@procwire/bun-client` children enforce it automatically when `PROCWIRE_TOKEN` is present (also overridable via the new `ClientOptions.authToken`). `@procwire/protocol` exports the new `AUTH_METHOD_ID`; `docs/rust-client-compatibility.md` documents the AUTH frame for external clients.
- **Listener hygiene (all runtimes, child side):** the pipe server now unlinks a stale socket file before `listen` (so a crashed predecessor's leftover `.sock` can't cause `EADDRINUSE`), stops listening once the single parent connects (no stray client can connect afterwards; re-listening on disconnect is intentionally not done — crash recovery respawns the child), and removes the socket file on `shutdown()`.
