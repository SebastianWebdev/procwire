---
"@procwire/transport": minor
"@procwire/sdk": patch
---

perf(framing): optimize LengthPrefixedFraming to avoid Buffer.concat overhead

Replace `Buffer.concat()` calls with pre-allocated buffers and direct copying in `encode()`, `peekBytes()`, and `takeBytes()` methods. This eliminates the O(n) memory reallocation that occurred with each TCP chunk for large payloads.

**Performance improvement for 100MB payloads:**
- Before: ~7 MB/s throughput
- After: ~1.1 GB/s throughput (~150x faster)

fix(transport): implement Wire Protocol Spec for data channel connection timing

ProcessManager now waits for `__data_channel_ready__` notification from worker before connecting to the data channel socket. This prevents race conditions where the manager tries to connect before the worker has created the socket.

feat(transport): implement graceful shutdown per Wire Protocol Spec 7.3

ProcessManager now sends `__shutdown__` request and waits for worker to drain pending requests before cleanup.

fix(sdk): add data channel ready notification support

WorkerChannel now sends `__data_channel_ready__` notification when data channel is established.
