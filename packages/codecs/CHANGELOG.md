# @procwire/codecs

## 2.0.0

### Major Changes

- [#60](https://github.com/SebastianWebdev/procwire/pull/60) [`9f8516f`](https://github.com/SebastianWebdev/procwire/commit/9f8516f2cafe3b8499dfa1767b61969057aaac7f) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Codecs hardening (Phase 4 / Workstream E).

  **BREAKING — Arrow moved to an opt-in subpath.** The Arrow codec is no longer
  re-exported from the package root; import it from `@procwire/codecs/arrow`
  instead. `apache-arrow` is now an **optional `peerDependency`** rather than a
  hard dependency, so raw/MsgPack-only installs (including every `@procwire/core`
  and `@procwire/client` consumer) no longer pull in Arrow's multi-MB footprint.

  Migration:

  ```diff
  -import { arrowCodec } from "@procwire/codecs";
  +import { arrowCodec } from "@procwire/codecs/arrow";
  ```

  …and install the peer when you use it: `npm install apache-arrow`.

  Also in this release:
  - **msgpack:** the `MsgPackCodec` now holds a reusable `Encoder`/`Decoder` pair
    per instance instead of allocating a fresh encoder (and a ≥2 KB scratch
    buffer) on every call — a ~2.3× speedup on small messages locally. Encode
    still returns an independent copy (safe to hold across the backpressure await
    before the socket write); the Buffer extension keeps copy-on-encode /
    alias-on-decode semantics.
  - **arrow:** object-input columns are now validated. Mixed-type
    (e.g. `[1, "x"]`) and unsupported element types throw a clear, column-named
    error instead of being silently coerced by Arrow; `null`/`undefined` are
    tolerated as Arrow nulls, and empty/all-null columns default to a stable
    `Float64`.

## 1.1.1

### Patch Changes

- [#51](https://github.com/SebastianWebdev/procwire/pull/51) [`8846afc`](https://github.com/SebastianWebdev/procwire/commit/8846afce107317cfb578ffff11be9a9628d3f0ca) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Publishing hygiene and documentation accuracy:
  - **LICENSE is now actually included in every published tarball.** The `files` entry pointed at a LICENSE file that did not exist in the package directories, so npm silently dropped it. A new CI check (`scripts/check-publish-artifacts.mjs`) verifies tarball contents (LICENSE, README, dist entrypoints) for all publishable packages.
  - **Internal dependency ranges publish as caret ranges.** `workspace:*` rewrites to an exact version pin on publish, which causes needless peer/dedup conflicts for consumers; `workspace:^` keeps published ranges caret-compatible. Enforced by the same CI check.
  - **`@procwire/codecs` no longer declares an unused peer dependency on `@procwire/protocol`** - the codec interfaces are structurally typed and never import it, so consumers were forced to install protocol for nothing.
  - READMEs now document the v1.2 behavior: the 30s default request timeout (`requestTimeout()`), the `spawnPolicy.heartbeat` liveness option, graceful `$shutdown`, and automatic child shutdown on stdin EOF (parent death). The Bun package READMEs state explicitly that typed schema generics are currently Node-only.
  - The "zero runtime dependencies" claim is now scoped truthfully to `@procwire/protocol` (core/client depend on `@procwire/codecs`, which ships MessagePack and Arrow).
  - Stale source comments fixed: the ~2GB cap in `wire-format.ts` is a deliberate conservative limit (not a Node Buffer limitation on Node >= 22), and the msgpack Buffer ext encoder no longer claims to be zero-copy (it copies on encode).

## 1.1.0

### Minor Changes

- [#45](https://github.com/SebastianWebdev/procwire/pull/45) [`5e7e9a3`](https://github.com/SebastianWebdev/procwire/commit/5e7e9a3c6a6c8374f7062592afee4ff89e42f3e9) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Add end-to-end type-safe request/response system with dual-codec support.

  **Type Safety:**
  - Codecs carry type information via `MsgPackCodec<TIn, TOut>` and `msgpack()` factory
  - `Module<S>` and `Client<S>` infer schema from generics with typed `send()`, `stream()`, `handle()`, and `emitEvent()`
  - `ExtractSchema<typeof module>` enables sharing types between parent and child

  **Dual-Codec API (for asymmetric codecs like Arrow):**
  - `MethodDescriptor` now stores 4 types: `reqIn`, `reqOut`, `resIn`, `resOut`
  - `Module.method()` accepts `{ requestCodec, responseCodec }` for full control
  - `Module.method()` accepts `{ codec }` shorthand for symmetric codecs
  - `Client.handle()` accepts same codec config patterns
  - Helper types: `ParentRequestType`, `ParentResponseType`, `ChildRequestType`, `ChildResponseType`

  **Breaking Changes:** None. Zero runtime changes, full backward compatibility.

## 1.0.1

### Patch Changes

- [#37](https://github.com/SebastianWebdev/procwire/pull/37) [`05547df`](https://github.com/SebastianWebdev/procwire/commit/05547dfd69303b5e1da55edbac4bbcf5cbe97a6d) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Add README.md files to all published packages and fix @module JSDoc tags for better documentation sidebar names.

- Updated dependencies [[`05547df`](https://github.com/SebastianWebdev/procwire/commit/05547dfd69303b5e1da55edbac4bbcf5cbe97a6d)]:
  - @procwire/protocol@1.0.1
