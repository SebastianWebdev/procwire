---
"@procwire/protocol": patch
---

Fix streaming-mode `FrameBuffer` corrupting every frame whose 11-byte header straddles a chunk boundary. Header fill progress was derived from the pre-allocated buffer's `.length` (always 11), so after a partial header the next chunk decoded a zero-padded half-header: wrong `requestId`, `payloadLength` 0, and permanent desync of all subsequent frames. The fill count is now tracked explicitly, verified by byte-level regression tests covering every split point plus a 500-frame random-chunking fuzz.

Hardening in the same area:

- `setStreamHandler()` now throws when switching handlers mid-frame (previously it silently corrupted subsequent parsing).
- After a streaming protocol error (`onError`), the buffer rejects further `push()` calls until `clear()` instead of parsing against poisoned state.
- `hasPartialFrame` now reports `true` for an in-progress streamed frame (header or payload outstanding), not just buffered batch bytes.
