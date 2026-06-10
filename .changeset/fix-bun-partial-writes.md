---
"@procwire/bun-core": patch
"@procwire/bun-client": patch
---

Fix critical data-plane transport bugs on Bun:

- **Partial socket writes corrupted the wire protocol under backpressure.** Bun's `socket.write()` returns the number of bytes written (possibly partial, `-1` when closed), but every send path treated it as a boolean: a partial write silently dropped the frame tail and desynced the peer's framing, and a zero-byte write waited for drain but never re-sent the frame. All send paths (`send`, `stream`, abort frames, responses via `respond`/`ack`/`chunk`/`end`/`error`, events, error responses) now go through `BunDrainWaiter.writeAll()`, which re-writes the unwritten remainder after each drain event. `writeAll()` calls are serialized in FIFO order per socket, so concurrent senders suspended on backpressure cannot interleave bytes inside one frame. Verified with real-socket regression tests that push 4MB frames through a paused receiver, plus deterministic interleave tests for concurrent sends.
- **bun-client: a stray connection tore down the active session.** `Bun.listen` shares one handler object across all connections, and the `close`/`data`/`error`/`drain` handlers ignored which socket fired. A rejected second connection's close event ran the disconnect teardown against the live parent session (aborting all in-flight work), and stray bytes could poison the active session's framing. All handlers now check socket identity.
- **send()/stream() no longer orphan pending state when the initial send fails** (e.g. the codec throws): the pending entry and abort listener are cleaned up immediately, so the orphaned response promise can no longer surface as an unhandled rejection that kills the process.
