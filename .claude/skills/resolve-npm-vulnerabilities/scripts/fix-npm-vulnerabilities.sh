#!/usr/bin/env bash
# Resolve pnpm audit advisories in two passes, then prove the workspace still builds.
#
# Pass 1 (`--fix update`) bumps declared ranges where a patched version satisfies them.
# Pass 2 (`--fix override`) pins transitive deps that no direct bump can reach, by
# writing `pnpm.overrides` entries. An override is a supply-chain assertion about a
# package we don't declare, so review every one it adds rather than accepting blind.
#
# Each fix step is followed by `pnpm install` because both passes rewrite manifests
# without touching node_modules or the lockfile.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)" || exit 1

pnpm install

pnpm audit --fix update
pnpm install

pnpm audit --fix override
pnpm install

# Typecheck is per-package here; the root has no such script, so `-r` covers api + web.
pnpm -r --parallel run typecheck
pnpm build
