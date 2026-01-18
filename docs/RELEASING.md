# Release Guide

This guide explains how to release new versions of `@aspect-ipc/*` packages to npm.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Release Process](#release-process)
  - [1. Create a Changeset](#1-create-a-changeset)
  - [2. Bump Versions](#2-bump-versions)
  - [3. Publish to npm](#3-publish-to-npm)
- [Automated Release (CI)](#automated-release-ci)
- [Manual Release](#manual-release)
- [Version Policy](#version-policy)
- [Recovery from Failed Publish](#recovery-from-failed-publish)
- [Best Practices](#best-practices)

## Overview

This monorepo uses [Changesets](https://github.com/changesets/changesets) for version management and publishing. Changesets provides:

- **Atomic versioning** - Version multiple packages together
- **Changelog generation** - Automatically generate changelogs from changesets
- **Monorepo support** - Handle workspace dependencies correctly
- **CI integration** - Automated releases via GitHub Actions

## Prerequisites

Before releasing, ensure:

1. **You have npm publish access** to `@aspect-ipc/*` packages
2. **All CI checks pass** - Run `pnpm ci` locally and verify CI passes on main
3. **Changes are merged to `main`** - All release-ready changes are on main branch
4. **NPM_TOKEN is configured** (for automated releases) - Set in GitHub Secrets

### Verify Your npm Access

```bash
npm whoami
npm access ls-packages
```

You should see `@aspect-ipc/transport`, `@aspect-ipc/codec-msgpack`, `@aspect-ipc/codec-protobuf`, and `@aspect-ipc/codec-arrow` with `read-write` access.

## Release Process

### 1. Create a Changeset

A changeset describes what changed and which packages are affected.

```bash
pnpm changeset
```

This interactive prompt will ask:

1. **Which packages changed?** - Select one or more packages
2. **What type of change?** - Major, minor, or patch (see [Version Policy](#version-policy))
3. **Summary of changes** - Brief description (becomes changelog entry)

**Example:**

```
🦋  Which packages would you like to include?
◉ @aspect-ipc/transport
◯ @aspect-ipc/codec-msgpack
◯ @aspect-ipc/codec-protobuf
◯ @aspect-ipc/codec-arrow

🦋  What kind of change is this for @aspect-ipc/transport?
◉ minor - New features

🦋  Please enter a summary for this change:
Add Unix socket transport support
```

This creates a file in `.changeset/` with a random name like `.changeset/happy-pumas-walk.md`:

```md
---
"@aspect-ipc/transport": minor
---

Add Unix socket transport support
```

Commit this changeset file:

```bash
git add .changeset
git commit -m "chore: add changeset for Unix socket support"
git push
```

### 2. Bump Versions

When ready to release, bump versions and update changelogs:

```bash
pnpm version-packages
```

This command:

- Reads all changesets in `.changeset/`
- Updates package versions in `package.json`
- Updates `CHANGELOG.md` in each affected package
- Updates dependencies between workspace packages
- Deletes consumed changeset files

**Review the changes:**

```bash
git diff
```

**Commit the version bump:**

```bash
git add .
git commit -m "chore: version packages"
git push
```

### 3. Publish to npm

After versions are bumped and committed to main, publish to npm:

```bash
# Ensure you're on main and up to date
git checkout main
git pull

# Ensure packages are built
pnpm ci

# Publish to npm
pnpm release
```

This runs `changeset publish` which:

1. Publishes all packages with new versions to npm
2. Creates git tags for each version (e.g., `@aspect-ipc/transport@1.2.0`)
3. Pushes tags to GitHub

**Verify the publish:**

```bash
npm view @aspect-ipc/transport version
npm view @aspect-ipc/codec-msgpack version
```

## Automated Release (CI)

The repository has automated release support via GitHub Actions ([.github/workflows/release.yml](../.github/workflows/release.yml)).

### How it Works

1. **On push to `main`** - The release workflow runs automatically
2. **If changesets exist** - Creates a "Version Packages" PR that bumps versions
3. **When PR is merged** - Automatically publishes to npm with provenance

### Using Automated Releases

**Workflow:**

1. Create changesets for your changes (during development or in PRs)
2. Merge PRs with changesets to `main`
3. GitHub Actions creates a "Version Packages" PR
4. Review and merge the PR
5. Packages are automatically published to npm

**Manual Trigger:**

You can also manually trigger a release:

1. Go to **Actions** tab on GitHub
2. Select **Release** workflow
3. Click **Run workflow**
4. Select `main` branch
5. Click **Run workflow**

### Prerequisites for CI Releases

The automated workflow requires:

1. **NPM_TOKEN secret** - Set in repository Settings → Secrets → Actions
   - Generate token at https://www.npmjs.com/settings/tokens
   - Use **Automation** type token
   - Add as `NPM_TOKEN` secret

2. **GITHUB_TOKEN** - Automatically provided by GitHub Actions

## Manual Release

If you need to publish manually (e.g., CI is unavailable):

```bash
# 1. Ensure you're on main and up to date
git checkout main
git pull

# 2. Create changeset (if not already done)
pnpm changeset

# 3. Commit changeset
git add .changeset
git commit -m "chore: add changeset"
git push

# 4. Bump versions
pnpm version-packages

# 5. Commit version bump
git add .
git commit -m "chore: version packages"
git push

# 6. Run full CI pipeline
pnpm ci

# 7. Publish to npm
pnpm release

# 8. Push tags
git push --follow-tags
```

## Version Policy

We follow [Semantic Versioning (SemVer)](https://semver.org/):

- **Major (1.0.0 → 2.0.0)** - Breaking changes
  - API changes that break existing code
  - Removed features or options
  - Changed behavior that could break consumers

- **Minor (1.0.0 → 1.1.0)** - New features (backwards-compatible)
  - New APIs, functions, or options
  - New features that don't break existing code
  - Performance improvements

- **Patch (1.0.0 → 1.0.1)** - Bug fixes (backwards-compatible)
  - Bug fixes
  - Documentation updates
  - Internal refactoring (no API changes)

### Pre-1.0 Releases

For `0.x.y` versions (unstable/experimental):

- **Minor bumps (0.1.0 → 0.2.0)** can include breaking changes
- **Patch bumps (0.1.0 → 0.1.1)** should be backwards-compatible

### Version Strategy for Monorepo

- **Independent versioning** - Each package has its own version
- **Workspace dependencies** - Use `workspace:*` in package.json, resolved to exact versions during publish
- **Synchronized major versions** - Consider keeping core + codecs on same major version for clarity

## Recovery from Failed Publish

If a publish fails partway through:

### Scenario 1: Some packages published, others failed

```bash
# Check which packages were published
npm view @aspect-ipc/transport version
npm view @aspect-ipc/codec-msgpack version
npm view @aspect-ipc/codec-protobuf version
npm view @aspect-ipc/codec-arrow version

# Re-run publish (changesets will skip already-published versions)
pnpm release
```

### Scenario 2: Publish succeeded but git tags weren't pushed

```bash
# Push tags manually
git push --follow-tags
```

### Scenario 3: Wrong version was published

**You cannot unpublish within 72 hours unless the package is < 24h old.**

If you must fix:

```bash
# Option A: Deprecate the bad version
npm deprecate @aspect-ipc/transport@1.2.3 "Deprecated due to critical bug, use 1.2.4 instead"

# Option B: Publish a patch version
pnpm changeset # Create patch changeset
pnpm version-packages
pnpm ci
pnpm release
```

### Scenario 4: CI publish failed

1. Check the **Actions** tab for error logs
2. Common issues:
   - Missing `NPM_TOKEN` secret
   - Expired npm token
   - Build/test failures before publish
3. Fix the issue and re-run the workflow manually

## Best Practices

### Before Publishing

- ✅ **Run `pnpm ci` locally** - Verify lint, typecheck, test, and build all pass
- ✅ **Review changelogs** - Ensure generated changelogs are accurate
- ✅ **Verify version bumps** - Check that version increments are correct
- ✅ **Test in downstream projects** - If possible, test with `npm link` or local file install
- ✅ **Check for uncommitted changes** - `git status` should be clean

### During Publishing

- ✅ **Publish from `main`** - Always publish from the main branch
- ✅ **Don't publish on unstable connection** - Use stable internet
- ✅ **Monitor the publish** - Watch for errors in output

### After Publishing

- ✅ **Verify on npm** - Check https://www.npmjs.com/package/@aspect-ipc/transport
- ✅ **Test installation** - Run `npm install @aspect-ipc/transport` in a test project
- ✅ **Check GitHub Releases** - Verify git tags are pushed and GitHub Releases are created
- ✅ **Update documentation** - If needed, update docs for new features

### General Tips

- **Small, frequent releases** - Better than large, infrequent releases
- **Document breaking changes** - Clearly describe what breaks and how to migrate
- **Keep changesets small** - One logical change per changeset
- **Use conventional commit style** - e.g., "feat:", "fix:", "docs:", "chore:"
- **Coordinate monorepo changes** - If changes span multiple packages, create changesets for all affected packages

## Troubleshooting

### "No changeset found"

**Problem:** `pnpm version-packages` says "No changesets found"

**Solution:** Create a changeset first with `pnpm changeset`

### "Package not found" when installing

**Problem:** `npm install @aspect-ipc/transport` fails with 404

**Possible causes:**

1. Package not published yet
2. Wrong package name/scope
3. npm registry issues (try `npm cache clean --force`)

### "Authentication failed" during publish

**Problem:** `pnpm release` fails with authentication error

**Solution:**

```bash
# Log in to npm
npm login

# Verify authentication
npm whoami

# Try publishing again
pnpm release
```

### Workspace protocol (`workspace:*`) in published package

**Problem:** Published package has `"@aspect-ipc/transport": "workspace:*"` in dependencies

**Solution:** This should be automatically converted by Changesets. Ensure:

1. Using latest `@changesets/cli`
2. Running `pnpm release` (not `npm publish` directly)
3. Check `.changeset/config.json` has correct settings

## Additional Resources

- [Changesets Documentation](https://github.com/changesets/changesets)
- [Semantic Versioning Spec](https://semver.org/)
- [npm Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [GitHub Actions - Publishing Node.js packages](https://docs.github.com/en/actions/publishing-packages/publishing-nodejs-packages)

## Questions?

Open an issue on [GitHub](https://github.com/SebastianWebdev/aspect-ipc/issues) if you have questions about the release process.
