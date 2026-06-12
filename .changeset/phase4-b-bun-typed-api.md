---
"@procwire/bun-core": minor
"@procwire/bun-client": minor
---

Phase 4 / B: first-class typed schema API on the Bun packages.

The `Module<S>`/`Client<S>` generics arrived with the shared core (A2); this completes the workstream:

- Both Bun packages now re-export the full set of schema typing helpers, matching their Node counterparts: `AddMethod`/`AddMethodSymmetric`/`AddEvent`/`SendReturn`/`MethodsWith(out)ResponseType`/`DualCodecMethodConfig`/`SingleCodecMethodConfig`/`TypedEventConfig` plus the `@procwire/codecs` conveniences (`Schema`, `EmptySchema`, `ExtractSchema`, ...). `@procwire/bun-client` also exports `TypedRequestContext`.
- Compile-only type tests (`test/type-safety.typecheck.ts`, checked by `tsc --noEmit` in CI; `expectTypeOf` is vitest-only) pin the typing in both Bun packages, mirroring the Node type-safety suites.
- READMEs: the "typed generics are Node-only" caveat is gone - the drop-in claim now includes the type level. The untyped string fallback (a typo'd method name on a typed module resolves to `unknown` instead of failing the build) is now documented.
