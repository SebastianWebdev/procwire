# @procwire/sdk

## 1.0.0

### Patch Changes

- [#33](https://github.com/SebastianWebdev/procwire/pull/33) [`3a50087`](https://github.com/SebastianWebdev/procwire/commit/3a50087247dd2fc9fe5c4e177e2a734e295d3b32) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - perf(framing): optimize LengthPrefixedFraming to avoid Buffer.concat overhead

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

- Updated dependencies [[`3a50087`](https://github.com/SebastianWebdev/procwire/commit/3a50087247dd2fc9fe5c4e177e2a734e295d3b32)]:
  - @procwire/transport@0.4.0
