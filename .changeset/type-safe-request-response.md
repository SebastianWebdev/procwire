---
"@procwire/codecs": minor
"@procwire/core": minor
"@procwire/client": minor
---

Add end-to-end type-safe request/response system. Codecs carry type information via `MsgPackCodec<TIn, TOut>` and `msgpack()` factory. `Module<S>` and `Client<S>` infer schema from generics with typed `send()`, `stream()`, `handle()`, and `emitEvent()`. `ExtractSchema<typeof module>` enables sharing types between parent and child. Zero runtime changes, full backward compatibility.
