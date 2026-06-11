#!/usr/bin/env node
/**
 * Publish-artifact checks for all publishable @procwire/* packages.
 *
 * Asserts, per package:
 *  1. `npm pack` would include LICENSE, README.md and the dist entrypoints
 *     (a `files` entry pointing at a missing LICENSE is silently ignored by
 *     npm - that is exactly the bug this guards against);
 *  2. no runtime/peer dependency uses the exact-pinning `workspace:*` range
 *     (changesets rewrites it to an exact version on publish; `workspace:^`
 *     keeps published ranges caret-compatible).
 *
 * Run from the repo root: node scripts/check-publish-artifacts.mjs
 * Used by CI; exits non-zero with a per-package report on failure.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PACKAGES = [
  "packages/protocol",
  "packages/codecs",
  "packages/runtime-core",
  "packages/core",
  "packages/client",
  "packages/procwire-bun-core",
  "packages/procwire-bun-client",
];

const REQUIRED_FILES = ["LICENSE", "README.md", "dist/index.js", "dist/index.d.ts"];

let failed = false;
const report = (pkg, ok, msg) => {
  console.log(`${ok ? "  ✓" : "  ✗"} ${msg}`);
  if (!ok) failed = true;
};

for (const dir of PACKAGES) {
  const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  console.log(`\n${manifest.name}@${manifest.version} (${dir})`);

  // 1. Tarball contents via npm pack --dry-run --json
  let packedFiles = [];
  try {
    const out = execSync("npm pack --dry-run --json --silent", {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const parsed = JSON.parse(out);
    packedFiles = (parsed[0]?.files ?? []).map((f) => f.path);
  } catch (err) {
    report(manifest.name, false, `npm pack failed: ${err.message}`);
    continue;
  }

  for (const required of REQUIRED_FILES) {
    report(manifest.name, packedFiles.includes(required), `tarball contains ${required}`);
  }

  // 2. No exact-pinning workspace:* in published dependency ranges
  for (const field of ["dependencies", "peerDependencies"]) {
    for (const [dep, range] of Object.entries(manifest[field] ?? {})) {
      report(
        manifest.name,
        range !== "workspace:*",
        `${field}.${dep} uses a caret-compatible range (got "${range}")`,
      );
    }
  }
}

console.log("");
if (failed) {
  console.error("Publish-artifact checks FAILED.");
  process.exit(1);
}
console.log("Publish-artifact checks passed.");
