---
"@procwire/transport": minor
---

### Stability & Reliability Fixes

**Critical Fixes:**
- Fix race condition in `RequestChannel.start()` - clean up transport subscriptions when `connect()` fails, preventing memory leaks
- Fix `maxInboundFrames` limit enforcement - check limit before processing each frame (DoS protection)
- Make `terminateAll()` resilient to individual failures using `Promise.allSettled`

**High Priority Fixes:**
- Fix memory leak in notification buffer by enforcing sliding window limit
- Add Unix socket path length validation (104 char limit for cross-platform compatibility)
- Replace hardcoded `/tmp` with configurable `baseDir` using `os.tmpdir()`
- Use `transitionState()` consistently in `SocketTransport` and `StdioTransport` for validated state transitions

**New Features:**
- Add metrics hooks (`onBytesReceived`, `onBytesSent`, `onFrameDecoded`, `onFrameEncoded`) to transports, framing, and channels
- Add `onMiddlewareError` callback option for middleware error handling
- Add optional signal handlers (SIGTERM/SIGINT) for `ProcessManager`
- Add constructor validation for `SocketTransport`, `StdioTransport`, `LineDelimitedFraming`, `LengthPrefixedFraming`, `ProcessManager`, `RequestChannel`

**Testing & Documentation:**
- Add performance benchmarks (throughput, latency percentiles, payload sizes)
- Add memory leak tests (repeated requests, concurrent, connect/disconnect cycles)
- Add comprehensive tests for all stability fixes
- Enhance JSDoc documentation with `@example`, `@throws`, `@see` annotations
