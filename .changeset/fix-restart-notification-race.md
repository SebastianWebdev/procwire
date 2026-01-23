---
"@procwire/transport": patch
---

Fix race condition in ProcessManager.restartProcess()

Applies the same control channel initialization order fix from f85abba to the restartProcess() method. The control channel must be started before the transport connects to ensure event subscriptions are in place before the child process begins emitting data.

This fixes intermittent test failures in CI where notifications sent immediately after process restart were lost.
