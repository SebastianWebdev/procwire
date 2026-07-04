---
"@procwire/runtime-core": patch
"@procwire/core": patch
"@procwire/client": patch
"@procwire/bun-core": patch
"@procwire/bun-client": patch
---

Fix stream error frames from `ctx.error()` being silently dropped by the parent, which hung the consumer's `for await` forever.

A stream handler's `ctx.error()` (and the fallback path where a stream handler throws) previously sent its frame with `IS_RESPONSE | IS_ERROR` but **without** `IS_STREAM`. The parent routed it to `_handleResponse` (which looks up pending _requests_) instead of the stream path (pending _streams_), so the lookup missed and the frame was discarded — streams have no timeout, so the consumer waited forever with no diagnostic.

Two complementary routing fixes:

- **Child:** `ctx.error()` now tags the frame with `IS_STREAM` when the method's response type is `stream`, so the parent routes it to the stream (this also works against older parents, which already handle `IS_STREAM | IS_ERROR`).
- **Parent (defensive):** when `_handleResponse` finds no pending request, an `IS_ERROR` frame that matches a pending stream now fails that stream instead of being dropped — keeping new parents compatible with older children that predate the child-side fix.

Additionally, error-message payloads are now encoded and decoded with a fixed msgpack codec on both sides, independent of the method's data codec. Previously `ctx.error()` serialized the error string with the method's response codec, so a stream (or any method) using a binary codec (`raw`/`rawChunks`/`arrow`) threw while serializing the string; the throw was swallowed and — for streams, which have no timeout — the consumer hung forever for the very same reason this fix targets. For the default msgpack codec the wire bytes are unchanged.

Non-stream `ctx.error()` behavior is unchanged for the common (msgpack) case.
