---
"@procwire/client": major
---

BREAKING CHANGE: All RequestContext response methods are now async.

This fixes a critical deadlock bug that occurred with payloads larger than 20KB.
The deadlock happened because response methods did not properly wait for socket
drain events when the buffer was full, causing both parent and child processes
to block indefinitely.

**Migration required:**

All handlers must be updated to await response methods:

```typescript
// Before (sync)
.handle("query", (data, ctx) => {
  ctx.respond(result);
})

// After (async)
.handle("query", async (data, ctx) => {
  await ctx.respond(result);
})
```

**Affected methods:**

- `ctx.respond(data)` → `await ctx.respond(data)`
- `ctx.ack(data?)` → `await ctx.ack(data?)`
- `ctx.chunk(data)` → `await ctx.chunk(data)`
- `ctx.end()` → `await ctx.end()`
- `ctx.error(err)` → `await ctx.error(err)`
- `client.emitEvent(name, data)` → `await client.emitEvent(name, data)`

**What's fixed:**

- Payloads >20KB no longer cause deadlocks
- Streaming responses work correctly with backpressure
- All payload sizes from 1KB to 10MB+ are now supported
