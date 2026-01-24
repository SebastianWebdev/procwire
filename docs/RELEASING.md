# Release Guide

This guide explains how to release new versions of `@procwire/*` packages to npm.

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
- [Troubleshooting](#troubleshooting)

## Overview

This monorepo uses [Changesets](https://github.com/changesets/changesets) for version management and publishing, combined with **OIDC Trusted Publishing** for secure, token-free CI/CD releases.

### Key Features

- **Atomic versioning** - Version multiple packages together
- **Changelog generation** - Automatically generate changelogs from changesets
- **Monorepo support** - Handle workspace dependencies correctly
- **OIDC Authentication** - No long-lived npm tokens required
- **Provenance attestations** - Cryptographic proof of build origin

## Prerequisites

Before releasing, ensure:

1. **You have npm publish access** to `@procwire/*` packages
2. **All CI checks pass** - Run `pnpm ci` locally and verify CI passes on main
3. **Changes are merged to `main`** - All release-ready changes are on main branch
4. **Trusted Publisher is configured** - See [Setting Up Trusted Publisher](#setting-up-trusted-publisher)

### Verify Your npm Access

```bash
npm whoami
npm access ls-packages
```

You should see `@procwire/transport`, `@procwire/codec-msgpack`, `@procwire/codec-protobuf`, and `@procwire/codec-arrow` with `read-write` access.

### Setting Up Trusted Publisher

OIDC Trusted Publishing eliminates the need for long-lived npm tokens. Each package must be configured once on npmjs.com:

1. Go to your package settings: `https://www.npmjs.com/package/@procwire/<package-name>/access`
2. Find the **"Trusted Publisher"** section
3. Click **"GitHub Actions"**
4. Fill in the configuration:
   - **Repository owner**: `SebastianWebdev` (must match GitHub URL exactly, including capitalization!)
   - **Repository name**: `procwire`
   - **Workflow filename**: `release.yml`
   - **Environment name**: *(leave empty)*
5. Click **"Save"**

> ⚠️ **Important**: The repository owner name is **case-sensitive**. It must exactly match your GitHub username/organization as shown in the URL (e.g., `SebastianWebdev`, not `sebastianwebdev`).

Repeat this for each package:
- `@procwire/transport`
- `@procwire/codec-msgpack`
- `@procwire/codec-protobuf`
- `@procwire/codec-arrow`

### Package Configuration

Each package's `package.json` must include a `repository` field that exactly matches the GitHub URL:

```json
{
  "name": "@procwire/transport",
  "repository": {
    "type": "git",
    "url": "https://github.com/SebastianWebdev/procwire.git",
    "directory": "packages/transport"
  }
}
```

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
◉ @procwire/transport
◯ @procwire/codec-msgpack
◯ @procwire/codec-protobuf
◯ @procwire/codec-arrow

🦋  What kind of change is this for @procwire/transport?
◉ minor - New features

🦋  Please enter a summary for this change:
Add Unix socket transport support
```

This creates a file in `.changeset/` with a random name like `.changeset/happy-pumas-walk.md`:

```md
---
"@procwire/transport": minor
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

This publishes all packages with new versions to npm.

**Verify the publish:**

```bash
npm view @procwire/transport version
npm view @procwire/codec-msgpack version
```

## Automated Release (CI)

The repository has automated release support via GitHub Actions ([.github/workflows/release.yml](../.github/workflows/release.yml)).

### How it Works

1. **On push to `main`** - The release workflow runs automatically
2. **If changesets exist** - Creates a "Version Packages" PR that bumps versions
3. **When PR is merged** - Automatically publishes to npm using OIDC authentication

### Security Model

The CI release uses **OIDC Trusted Publishing**:

- ✅ **No npm tokens stored** - Authentication happens via GitHub's OIDC provider
- ✅ **Short-lived credentials** - Tokens are valid only for the publish operation
- ✅ **Provenance attestations** - Each package includes cryptographic proof of its build origin
- ✅ **Workflow-specific** - Only the configured workflow can publish

### Using Automated Releases

**Workflow:**

1. Create changesets for your changes (during development or in PRs)
2. Merge PRs with changesets to `main`
3. GitHub Actions creates a "Version Packages" PR
4. Review and merge the PR
5. Packages are automatically published to npm with provenance

**Manual Trigger:**

You can also manually trigger a release:

1. Go to **Actions** tab on GitHub
2. Select **Release** workflow
3. Click **Run workflow**
4. Select `main` branch
5. Click **Run workflow**

### Prerequisites for CI Releases

The automated workflow requires:

1. **Trusted Publisher configured** - For each package on npmjs.com (see [Setting Up Trusted Publisher](#setting-up-trusted-publisher))
2. **GITHUB_TOKEN** - Automatically provided by GitHub Actions
3. **Workflow permissions** - `id-token: write` permission (already configured in workflow)

> 📝 **Note**: No `NPM_TOKEN` secret is required! OIDC Trusted Publishing eliminates the need for stored tokens.

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

# 7. Publish to npm (requires npm login)
npm login
pnpm release

# 8. Push tags
git push --follow-tags
```

> ⚠️ **Note**: Manual publishing from your local machine uses traditional npm authentication (`npm login`), not OIDC. OIDC is only available in GitHub Actions.

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
npm view @procwire/transport version
npm view @procwire/codec-msgpack version
npm view @procwire/codec-protobuf version
npm view @procwire/codec-arrow version

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
npm deprecate @procwire/transport@1.2.3 "Deprecated due to critical bug, use 1.2.4 instead"

# Option B: Publish a patch version
pnpm changeset # Create patch changeset
pnpm version-packages
pnpm ci
pnpm release
```

### Scenario 4: CI publish failed with OIDC error

1. Check the **Actions** tab for error logs
2. Common OIDC issues:
   - **E404 error** - Trusted Publisher configuration mismatch (check case sensitivity!)
   - **ENEEDAUTH** - Trusted Publisher not configured for the package
   - **Workflow filename mismatch** - Ensure `release.yml` matches exactly
3. Verify Trusted Publisher settings on npmjs.com
4. Fix the issue and re-run the workflow manually

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

- ✅ **Verify on npm** - Check https://www.npmjs.com/package/@procwire/transport
- ✅ **Check provenance** - Look for the "Provenance" badge on the npm package page
- ✅ **Test installation** - Run `npm install @procwire/transport` in a test project
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

**Problem:** `npm install @procwire/transport` fails with 404

**Possible causes:**

1. Package not published yet
2. Wrong package name/scope
3. npm registry issues (try `npm cache clean --force`)

### "E404 Not Found" during OIDC publish

**Problem:** CI publish fails with `npm error 404 Not Found - PUT https://registry.npmjs.org/@procwire/...`

**This usually means Trusted Publisher configuration doesn't match.** Check:

1. **Case sensitivity** - Repository owner must match exactly (e.g., `SebastianWebdev` not `sebastianwebdev`)
2. **Workflow filename** - Must be exactly `release.yml` (with `.yml` extension)
3. **Repository name** - Must be `procwire`
4. **No environment name** - Leave the environment field empty

### "ENEEDAUTH" during publish

**Problem:** `npm error code ENEEDAUTH` / "need auth"

**Solutions:**

For CI (OIDC):
- Verify Trusted Publisher is configured for the package
- Check that `id-token: write` permission is set in workflow
- Ensure `registry-url` is set in `setup-node` action

For manual publish:
```bash
npm login
npm whoami  # Verify authentication
pnpm release
```

### Workspace protocol (`workspace:*`) in published package

**Problem:** Published package has `"@procwire/transport": "workspace:*"` in dependencies

**Solution:** This should be automatically converted by Changesets. Ensure:

1. Using latest `@changesets/cli`
2. Running `pnpm release` (not `npm publish` directly)
3. Check `.changeset/config.json` has correct settings

### Provenance not showing on npm

**Problem:** Package published but no "Provenance" badge on npmjs.com

**Possible causes:**

1. Package published from private repository (provenance not supported)
2. OIDC authentication wasn't used (manual publish)
3. npm CLI version too old (requires npm >= 11.5.1 for trusted publishing)

## Additional Resources

- [Changesets Documentation](https://github.com/changesets/changesets)
- [npm Trusted Publishing Guide](https://docs.npmjs.com/trusted-publishers/)
- [Semantic Versioning Spec](https://semver.org/)
- [npm Provenance Documentation](https://docs.npmjs.com/generating-provenance-statements/)
- [GitHub Actions OIDC](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect)

## Questions?

Open an issue on [GitHub](https://github.com/SebastianWebdev/procwire/issues) if you have questions about the release process.
