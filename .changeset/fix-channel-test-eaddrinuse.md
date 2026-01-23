---
"@procwire/transport": patch
---

Fix EADDRINUSE test failures in fast CI environments

Improves test reliability by preventing named pipe conflicts in channel-integration tests. Uses high-resolution unique identifiers and adds cleanup delay to handle Windows named pipe resource timing.
