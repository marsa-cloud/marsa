---
name: resolve-npm-vulnerabilities
description: Resolve pnpm audit vulnerabilities across the workspace. Use when auditing and resolving dependency vulnerabilities, or when the Dependency audit CI check fails.
---

# Resolve pnpm vulnerabilities

## Workflow

Do **not** run `pnpm audit` before starting — run the resolver first and audit afterwards
to confirm. Reading the advisory list up front costs a lot of context and changes nothing
about the first two steps.

1. Run the resolver:

   ```bash
   bash .claude/skills/resolve-npm-vulnerabilities/scripts/fix-npm-vulnerabilities.sh
   ```

2. Fix any build or type errors caused by the package updates. A major bump is the usual
   cause; check that package's changelog rather than guessing at the new API.

3. Review every `pnpm.overrides` entry the second pass added. An override pins a
   **transitive** dependency the workspace never declared, which is a supply-chain
   assertion — that the pinned version is compatible with whatever depends on it. Keep
   only the ones the audit actually needed, and leave a comment saying which advisory
   each one closes so a future reader can drop it once the parent catches up.

4. Confirm the result and record the residue:

   ```bash
   pnpm audit --audit-level=critical   # what CI blocks on
   pnpm audit                          # the full picture
   ```

   CI (`.github/workflows/security.yml`) blocks only on **critical**. Anything left at
   high or below should be stated explicitly in the PR body, not left silent.

## This repo's constraints

- **`minimumReleaseAge: 10080`** (7 days) in `pnpm-workspace.yaml` is deliberate
  supply-chain hardening — pnpm refuses any version published more recently. If a fix
  needs a just-published version, the install fails rather than resolving. Add a
  narrowly-scoped `minimumReleaseAgeExclude` entry for that package only, and say why in
  the PR. Do not widen it to unrelated scopes, and do not lower the global age.
- **Versions live in the catalog.** Workspace packages use `"foo": "catalog:"`, so a bump
  belongs in the `catalog:` block of `pnpm-workspace.yaml`, not in a package's
  `package.json`. If the resolver edits a `package.json` for a catalogued dep, move the
  change to the catalog.
- **`pnpm-lock.yaml` must be committed** — CI installs with `--frozen-lockfile`.
- Typecheck is per-package (`api`, `web`); there is no root `typecheck` script.

## When not to use this

A single known advisory with a known fix is faster to bump by hand in the catalog. This
skill is for a full sweep, or when the Dependency audit check goes red and the advisory
set is unknown.
