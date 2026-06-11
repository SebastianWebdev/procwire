# @procwire/runtime-core

Shared runtime-agnostic building blocks for the Procwire runtime packages.

This package is the single source of truth for the types, error factories and
event-name constants used by both the Node.js packages
([`@procwire/core`](https://www.npmjs.com/package/@procwire/core),
[`@procwire/client`](https://www.npmjs.com/package/@procwire/client)) and their
Bun counterparts
([`@procwire/bun-core`](https://www.npmjs.com/package/@procwire/bun-core),
[`@procwire/bun-client`](https://www.npmjs.com/package/@procwire/bun-client)).
Previously these definitions were maintained as near-identical copies in each
package; they now live here exactly once.

## Should I depend on this directly?

No. This package is internal plumbing for the `@procwire/*` runtime packages,
which re-export everything from here as part of their public API. Import from
`@procwire/core`, `@procwire/client`, `@procwire/bun-core` or
`@procwire/bun-client` instead — their APIs are stable; the layout of this
package is not.

## What's inside

Parent side (`core` / `bun-core`):

- Types: `ModuleState`, `ExecutableConfig`, `ResponseType`, `MethodConfig`,
  `EventConfig`, `RetryDelayConfig`, `RestartLimitConfig`, `HeartbeatConfig`,
  `SpawnPolicy`, `ModuleSchema`, `InitMessage`
- Errors: `ProcwireError`, `ModuleErrors`, `ManagerErrors`
- Events: `ManagerEvents`, `ModuleEvents`

Child side (`client` / `bun-client`):

- Types: `MethodDefinition`, `EventDefinition`, `ClientOptions`,
  `MethodHandler`, `RequestContext`, `TypedRequestContext`
- Errors: `ProcwireClientError`, `ClientErrors`

## License

MIT
