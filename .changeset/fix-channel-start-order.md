---
"@procwire/transport": patch
---

Fix critical race condition in ProcessManager channel initialization

Fixed a critical bug where `transport.connect()` was called before `controlChannel.start()`, causing the channel to miss subscribing to transport events before the child process started emitting data.

**The Problem:**

When ProcessManager spawned a child process, it would:
1. Call `transport.connect()` - spawning the child process
2. Call `controlChannel.start()` - which would see the transport was already connected and skip resubscribing to events

This meant that any data emitted by the child process immediately after spawn (like `runtime.ready` notifications) would be lost, as the channel hadn't subscribed to transport events yet.

**The Fix:**

Changed the initialization order in ProcessManager.spawn() to call `controlChannel.start()` BEFORE the transport connects. Since `RequestChannel.start()` internally calls `transport.connect()` if needed, this ensures:
1. Channel subscribes to transport events FIRST
2. Transport connects (spawning the child process) SECOND
3. Any early data from the child process is captured

This issue was particularly evident in CI environments where timing characteristics differ from local development machines.
