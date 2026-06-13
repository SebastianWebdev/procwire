---
"@procwire/codecs": major
---

Codecs hardening (Phase 4 / Workstream E).

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
