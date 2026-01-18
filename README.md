# @aspect-ipc/* monorepo

Node.js/TypeScript monorepo for IPC building blocks:

- `@aspect-ipc/transport` (core, zero runtime deps)
- `@aspect-ipc/codec-msgpack` (optional codec)
- `@aspect-ipc/codec-protobuf` (optional codec)
- `@aspect-ipc/codec-arrow` (optional codec)

## Requirements

- Node.js `>=18` (recommended: 20+)
- pnpm via Corepack

## Getting started

```bash
corepack enable
pnpm install
pnpm ci
```

## Common commands

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm format`

## Publishing (manual)

1. Create a changeset: `pnpm changeset`
2. Bump versions + update changelogs: `pnpm version-packages`
3. Build + test: `pnpm ci`
4. Publish: `pnpm release`

CI release automation is wired in `.github/workflows/release.yml`.
