# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Marsa is an open-source, self-hostable PaaS (Heroku/Railway-style) that deploys onto Kubernetes (K3s). Early-stage MVP — APIs and architecture change frequently.

## Project management

GitHub issues, milestones, labels, and project workflow follow the conventions in **`.claude/project-management.md`**. Read it before creating or grooming issues — it defines the Milestone → Feature → Task hierarchy (via sub-issues), the label taxonomy, status entry criteria, and the issue template.

## Recommendations: lead with best practice, flag anti-patterns

When proposing options (tooling, structure, naming, libraries, patterns), the **recommended** option must be what is genuinely best-practice in the relevant ecosystem — not what's symmetric with another package in this monorepo, easiest to implement, or already familiar. If the cross-package symmetric choice isn't the FE/BE community standard, say so explicitly. Actively flag anti-patterns ("this is unusual in <ecosystem> — most projects do X because Y") rather than presenting them neutrally. If the user asks to implement something that is clearly an anti-pattern, **push back and explain why** before proceeding — don't silently implement it. Symmetry across `apps/api` and `apps/web` is not a tiebreaker; pick the right convention for each stack.

## Repo layout

pnpm monorepo (`pnpm-workspace.yaml`, packages under `apps/*` and `packages/*`). Node >= 22, pnpm 9.15.0.

- `apps/api` — NestJS 11 backend on Fastify. **See `apps/api/CLAUDE.md`** for backend-specific architecture, build pipeline, test harness, and import conventions.
- `apps/web` — Nuxt 4 + Nuxt UI + Tailwind 4 frontend, SPA-only (`ssr: false`). **See `apps/web/.claude/CLAUDE.md`** for frontend-specific testing setup and conventions.
- `packages/` — currently empty; reserved for shared libs.

Dependency versions live in a **pnpm catalog** (root `pnpm-workspace.yaml`). Workspace packages reference them as `"foo": "catalog:"` — bump versions in the catalog, not in package.json files.

## Common commands

Run from the repo root:

```bash
pnpm install                    # install everything

pnpm dev:api                    # api dev (nest start --watch)
pnpm dev:web                    # web dev (nuxt dev)

pnpm build                      # build all packages
pnpm build:api                  # api only (nest build)
pnpm build:web                  # web only (nuxt build)

pnpm lint                       # run lint in every package (parallel)
pnpm lint:root                  # lint with the root flat config only
pnpm format                     # prettier --write .
pnpm format:check               # used in CI

pnpm test                       # run test in every package (parallel)
pnpm clean                      # fan out to workspace clean scripts (artifacts only, leaves node_modules alone)
```

Per-package scripts: `pnpm --filter <api|web> <script>`.

## Code style

- Prettier is the source of truth for formatting (`pnpm format`). It is **not** wired into ESLint — running lint will not flag formatting; CI runs `format:check` and `lint` as separate steps.
- ESLint flat config at the root (`eslint.config.mjs`) sets shared rules: `simple-import-sort`, `unused-imports`, padding between imports, and `eslint-config-prettier` to disable conflicting style rules. Each package extends this with its own `eslint.config.mjs`.
- Editor save-on-fix is wired up in `.vscode/settings.json` (works in VS Code and Windsurf) using the unified `js/ts.*` setting keys. Auto-import prefers non-relative module specifiers.

## CI

`.github/workflows/ci.yml` runs on push/PR to `main`: `format:check` → `lint` → typecheck (`api` + `web`) → `build:web` → `pnpm --filter api test` → web unit/component tests → web e2e. The API is type-checked (`tsc --noEmit`) rather than built separately, since `pnpm --filter api test` rebuilds internally. CI uses `pnpm install --frozen-lockfile`, so commit `pnpm-lock.yaml` updates alongside dependency changes.
