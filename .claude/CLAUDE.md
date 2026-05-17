# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Marsa is an open-source, self-hostable PaaS (Heroku/Railway-style) that deploys onto Kubernetes (K3s). Early-stage MVP — APIs and architecture change frequently.

## Repo layout

pnpm monorepo (`pnpm-workspace.yaml`, packages under `apps/*` and `packages/*`). Node >= 22, pnpm 9.15.0.

- `apps/api` — NestJS 11 backend on Fastify. **See `apps/api/CLAUDE.md`** for backend-specific architecture, build pipeline, test harness, and import conventions.
- `apps/web` — Nuxt 4 + Nuxt UI + Tailwind 4 frontend (non-SSR, deployable to a CDN).
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

`.github/workflows/ci.yml` runs on push/PR to `main`: `format:check` → `lint` → `build:api` → `build:web` → `pnpm --filter api test`. CI uses `pnpm install --frozen-lockfile`, so commit `pnpm-lock.yaml` updates alongside dependency changes.
