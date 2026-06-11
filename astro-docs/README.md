# Procwire Docs (astro-docs)

Documentation site for Procwire, built with [Astro Starlight](https://starlight.astro.build/). Deployed to [procwire.dev](https://procwire.dev) via GitHub Pages.

## Content

- **Guides** — hand-written pages in `src/content/docs/guides/` (getting started, concepts, architecture).
- **API Reference** — generated at build time by [starlight-typedoc](https://github.com/HiDeoo/starlight-typedoc) from the source of `@procwire/protocol`, `@procwire/codecs`, `@procwire/core`, and `@procwire/client` (see `astro.config.mjs`).
- **llms.txt** — an LLM-friendly export produced by `starlight-llms-txt`.

## Commands

Run from the repository root:

```bash
pnpm --filter astro-docs dev     # Dev server at localhost:4321
pnpm --filter astro-docs build   # Production build to astro-docs/dist/
```

The build requires the [D2](https://d2lang.com/) binary for diagram rendering (`curl -fsSL https://d2lang.com/install.sh | sh -s --`).

## Deployment

`.github/workflows/deploy-docs.yml` builds and deploys the site to GitHub Pages on pushes to `main` that touch docs-related files.
