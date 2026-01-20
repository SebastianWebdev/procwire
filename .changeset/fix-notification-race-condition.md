---
"@procwire/transport": patch
---

Fix race condition in notification handling for child processes

This patch fixes a critical race condition where notifications sent by child processes immediately after spawn could be lost due to timing issues between process startup and handler registration. The issue was particularly evident in CI environments on Windows.

**Changes:**

1. **Event subscription ordering** - RequestChannel now subscribes to transport events before connecting, ensuring no early data is lost
2. **Early notification buffering** - Added automatic buffering (default: 10 messages) for notifications received before handlers are registered
3. **Automatic delivery** - Buffered notifications are automatically delivered when handlers are registered
4. **ProcessManager integration** - All channels created by ProcessManager now have early notification buffering enabled by default

**API Additions:**

- `ChannelOptions.bufferEarlyNotifications?: number` - Configure buffer size for early notifications
- `ChannelBuilder.withBufferEarlyNotifications(size: number)` - Fluent API to set buffer size

This is a backwards-compatible change with no breaking changes to existing APIs.
