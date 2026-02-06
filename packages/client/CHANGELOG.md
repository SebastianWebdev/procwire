# @procwire/client

## 1.1.0

### Minor Changes

- [#45](https://github.com/SebastianWebdev/procwire/pull/45) [`5e7e9a3`](https://github.com/SebastianWebdev/procwire/commit/5e7e9a3c6a6c8374f7062592afee4ff89e42f3e9) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Add end-to-end type-safe request/response system with dual-codec support.

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

### Patch Changes

- Updated dependencies [[`5e7e9a3`](https://github.com/SebastianWebdev/procwire/commit/5e7e9a3c6a6c8374f7062592afee4ff89e42f3e9)]:
  - @procwire/codecs@1.1.0

## 1.0.1

### Patch Changes

- [#39](https://github.com/SebastianWebdev/procwire/pull/39) [`903e11f`](https://github.com/SebastianWebdev/procwire/commit/903e11fe2afc235838db2807ba754c164c52837f) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Fix missing repository metadata in package.json files that caused npm publish failures with sigstore provenance verification.

## 1.0.1

### Patch Changes

- [#37](https://github.com/SebastianWebdev/procwire/pull/37) [`05547df`](https://github.com/SebastianWebdev/procwire/commit/05547dfd69303b5e1da55edbac4bbcf5cbe97a6d) Thanks [@SebastianWebdev](https://github.com/SebastianWebdev)! - Add README.md files to all published packages and fix @module JSDoc tags for better documentation sidebar names.

- Updated dependencies [[`05547df`](https://github.com/SebastianWebdev/procwire/commit/05547dfd69303b5e1da55edbac4bbcf5cbe97a6d)]:
  - @procwire/protocol@1.0.1
  - @procwire/codecs@1.0.1
