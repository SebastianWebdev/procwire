---
"@procwire/core": patch
---

Fix a crash-by-unhandled-rejection in `send()` and a resource leak in `stream()` when the initial send fails (e.g. `codec.serialize` throws, or the socket closes during a backpressure drain wait). The pending request entry was registered before the send and never cleaned up on failure, so its timeout timer later rejected a response promise that no caller observes - an unhandled promise rejection that kills the parent process by default, even when the caller correctly catches the `send()` error. Both paths now clean up their pending state (entry, timeout timer, abort listener) before rethrowing the send error.
