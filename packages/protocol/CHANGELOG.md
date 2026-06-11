# @procwire/protocol

## 1.0.2

### Patch Changes

- [#49](https://github.com/SebastianWebdev/procwire/pull/49) [`c54b2e8`](https://github.com/SebastianWebdev/procwire/commit/c54b2e85dc7836da24cb3fccea14bc7832979f26) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Fix streaming-mode `FrameBuffer` corrupting every frame whose 11-byte header straddles a chunk boundary. Header fill progress was derived from the pre-allocated buffer's `.length` (always 11), so after a partial header the next chunk decoded a zero-padded half-header: wrong `requestId`, `payloadLength` 0, and permanent desync of all subsequent frames. The fill count is now tracked explicitly, verified by byte-level regression tests covering every split point plus a 500-frame random-chunking fuzz.

  Hardening in the same area:
  - `setStreamHandler()` now throws when switching handlers mid-frame (previously it silently corrupted subsequent parsing).
  - After a streaming protocol error (`onError`), the buffer rejects further `push()` calls until `clear()` instead of parsing against poisoned state.
  - `hasPartialFrame` now reports `true` for an in-progress streamed frame (header or payload outstanding), not just buffered batch bytes.

- [#51](https://github.com/SebastianWebdev/procwire/pull/51) [`8846afc`](https://github.com/SebastianWebdev/procwire/commit/8846afce107317cfb578ffff11be9a9628d3f0ca) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Publishing hygiene and documentation accuracy:
  - **LICENSE is now actually included in every published tarball.** The `files` entry pointed at a LICENSE file that did not exist in the package directories, so npm silently dropped it. A new CI check (`scripts/check-publish-artifacts.mjs`) verifies tarball contents (LICENSE, README, dist entrypoints) for all publishable packages.
  - **Internal dependency ranges publish as caret ranges.** `workspace:*` rewrites to an exact version pin on publish, which causes needless peer/dedup conflicts for consumers; `workspace:^` keeps published ranges caret-compatible. Enforced by the same CI check.
  - **`@procwire/codecs` no longer declares an unused peer dependency on `@procwire/protocol`** - the codec interfaces are structurally typed and never import it, so consumers were forced to install protocol for nothing.
  - READMEs now document the v1.2 behavior: the 30s default request timeout (`requestTimeout()`), the `spawnPolicy.heartbeat` liveness option, graceful `$shutdown`, and automatic child shutdown on stdin EOF (parent death). The Bun package READMEs state explicitly that typed schema generics are currently Node-only.
  - The "zero runtime dependencies" claim is now scoped truthfully to `@procwire/protocol` (core/client depend on `@procwire/codecs`, which ships MessagePack and Arrow).
  - Stale source comments fixed: the ~2GB cap in `wire-format.ts` is a deliberate conservative limit (not a Node Buffer limitation on Node >= 22), and the msgpack Buffer ext encoder no longer claims to be zero-copy (it copies on encode).

## 1.0.1

### Patch Changes

- [#37](https://github.com/SebastianWebdev/procwire/pull/37) [`05547df`](https://github.com/SebastianWebdev/procwire/commit/05547dfd69303b5e1da55edbac4bbcf5cbe97a6d) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Add README.md files to all published packages and fix @module JSDoc tags for better documentation sidebar names.
