---
"@procwire/codecs": minor
"@procwire/core": minor
"@procwire/client": minor
"@procwire/bun-core": minor
"@procwire/bun-client": minor
---

Add end-to-end type-safe request/response system with dual-codec support.

**Type Safety:**

- Codecs carry type information via `MsgPackCodec<TIn, TOut>` and `msgpack()` factory
- `Module<S>` and `Client<S>` infer schema from generics with typed `send()`, `stream()`, `handle()`, and `emitEvent()`
- `ExtractSchema<typeof module>` enables sharing types between parent and child

**Dual-Codec API (for asymmetric codecs like Arrow):**

- `MethodDescriptor` now stores 4 types: `reqIn`, `reqOut`, `resIn`, `resOut`
- `Module.method()` accepts `{ requestCodec, responseCodec }` for full control
- `Module.method()` accepts `{ codec }` shorthand for symmetric codecs
- `Client.handle()` accepts same codec config patterns
- Helper types: `ParentRequestType`, `ParentResponseType`, `ChildRequestType`, `ChildResponseType`

**Breaking Changes:** None. Zero runtime changes, full backward compatibility.
