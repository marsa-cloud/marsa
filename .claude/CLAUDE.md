# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Marsa is an open-source, self-hostable PaaS (Heroku/Railway-style) that deploys onto Kubernetes (K3s). Early-stage MVP — APIs and architecture change frequently.

## Project management

GitHub issues, PRs, branch/commit conventions, and SDLC gates follow the **ApexYard** framework that governs this repo — not a marsa-local process doc. Use its structured skills (`/feature`, `/bug`, `/task`, `/spike`, `/migration`) to create issues, and follow its ticket/PR conventions (title prefixes, branch naming, merge gates). Milestones and labels live in GitHub itself.

## Recommendations: lead with best practice, flag anti-patterns

When proposing options (tooling, structure, naming, libraries, patterns), the **recommended** option must be what is genuinely best-practice in the relevant ecosystem — not what's symmetric with another package in this monorepo, easiest to implement, or already familiar. If the cross-package symmetric choice isn't the FE/BE community standard, say so explicitly. Actively flag anti-patterns ("this is unusual in <ecosystem> — most projects do X because Y") rather than presenting them neutrally. If the user asks to implement something that is clearly an anti-pattern, **push back and explain why** before proceeding — don't silently implement it. Symmetry across `apps/api` and `apps/web` is not a tiebreaker; pick the right convention for each stack.

## Repo layout

pnpm monorepo (`pnpm-workspace.yaml`, packages under `apps/*` and `packages/*`). Node >= 22, pnpm 9.15.0.

- `apps/api` — NestJS 11 backend on Fastify. **See `apps/api/CLAUDE.md`** for backend-specific architecture, build pipeline, test harness, and import conventions.
- `apps/web` — Nuxt 4 + Nuxt UI + Tailwind 4 frontend, SPA-only (`ssr: false`). **See `apps/web/.claude/CLAUDE.md`** for frontend-specific testing setup and conventions, incl. Nuxt UI dashboard gotchas (panel/sidebar slots) and MCP-driven visual/browser testing.
- `packages/` — currently empty; reserved for shared libs.

Dependency versions live in a **pnpm catalog** (root `pnpm-workspace.yaml`). Workspace packages reference them as `"foo": "catalog:"` — bump versions in the catalog, not in package.json files.

## Web ↔ API communication

`apps/web` talks to `apps/api` over **REST**, with an **OpenAPI document as the single source of truth**. The api emits a committed `apps/api/openapi.json` (`@nestjs/swagger`); the web generates TypeScript types + Zod schemas from it (`@hey-api/openapi-ts`, **no SDK/client**) and calls the api through Nuxt's own `$fetch`, validating responses against the generated Zod at the boundary. The contract is regenerated and **drift-checked in CI**, so the committed `openapi.json` and web `app/api/*` must be regenerated and committed whenever endpoints change. Backend details live in `apps/api/.claude/CLAUDE.md` (OpenAPI generation, `operationId` convention); frontend consumption lives in `apps/web/.claude/CLAUDE.md`. Decision record: `docs/agdr/AgDR-0001-web-api-communication.md`.

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

## Running the FE locally without a cluster

To click through the web UI locally **without** a k3d/k3s cluster and **without** real GitHub login, run the api in test mode (which wires the network-free `MockDeployBackend` + mock GitHub client, so it boots with no cluster) and use the `seed-dev` entrypoint to seed data + mint a login cookie:

```bash
docker compose up -d                       # Postgres (marsa_test)
cp apps/api/.env.test apps/api/.env        # NODE_ENV=test → mock backends, boots without a cluster
pnpm --filter api build

# Seed a dev operator + sample apps and print a session cookie (idempotent):
node --env-file=apps/api/.env apps/api/dist/src/entrypoints/seed-dev.js

pnpm dev:api                               # api on :3000 (mock backends)
pnpm dev:web                               # web on :3001 (auto-picks a free port; proxies /api → :3000)
```

Then paste the printed `marsa_session=…` cookie into the browser (DevTools → Application → Cookies) for the web origin and reload — the web's `get-current-user` now resolves the seeded operator and the app renders authenticated. The cookie is a real `@fastify/secure-session` cookie minted with the fixed dev `AUTH_SESSION_SECRET_KEY`, so it stays valid across restarts; re-run `seed-dev.js` to reprint it. Real GitHub login + real deploys are exercised on the k3d path (issue #122), not here.

## Code style

- Prettier is the source of truth for formatting (`pnpm format`). It is **not** wired into ESLint — running lint will not flag formatting; CI runs `format:check` and `lint` as separate steps.
- ESLint flat config at the root (`eslint.config.mjs`) sets shared rules: `simple-import-sort`, `unused-imports`, padding between imports, and `eslint-config-prettier` to disable conflicting style rules. Each package extends this with its own `eslint.config.mjs`.
- Editor save-on-fix is wired up in `.vscode/settings.json` (works in VS Code and Windsurf) using the unified `js/ts.*` setting keys. Auto-import prefers non-relative module specifiers.

## Git workflow

Always branch off `main` for any feature, bug fix, or chore — never commit directly to `main`. Branch naming: `feat/<topic>`, `fix/<topic>`, `chore/<topic>`. Open a PR to merge back.

Releases are cut by tagging `main` with `v<semver>` (e.g. `v1.0.0`); the CD workflow (`.github/workflows/cd.yml`) triggers on `v*` tags and publishes semver-tagged images to GHCR.

Additional git-workflow rules: @.claude/rules/git-workflow.md

## CI

`.github/workflows/ci.yml` runs on push/PR to `main`: `format:check` → `lint` → typecheck (`api` + `web`) → `build:web` → `pnpm --filter api test` → web unit/component tests → web e2e. The API is type-checked (`tsc --noEmit`) rather than built separately, since `pnpm --filter api test` rebuilds internally. CI uses `pnpm install --frozen-lockfile`, so commit `pnpm-lock.yaml` updates alongside dependency changes.

### Test coverage gates

Both test suites enforce a **minimum coverage threshold** — the test step fails (and so does CI) when coverage drops below the floor. The gates ride the existing test steps; there is no separate coverage job.

- **web** (`vitest.config.ts` → `test.coverage`): v8 provider, scoped to hand-written `app/**` source (generated `app/api/*` and config files excluded). Floors **temporarily lowered** to lines/statements 28%, branches 30%, functions 12% after the vitest v4 upgrade changed instrumentation (it now counts Nuxt-bootstrap-loaded files + untested starter scaffolding that v3 did not) — see [#66](https://github.com/marsa-cloud/marsa/issues/66) to add tests and ratchet them back toward ~88/90/60.
- **api** (`test:run` script): Node's built-in `--experimental-test-coverage` with `--test-coverage-lines=80 --test-coverage-branches=80 --test-coverage-functions=90`; test files and `src/test/**` are excluded. Source-mapped back to `.ts` via `--enable-source-maps`.

These are **ratchet floors**, set a few points below the coverage measured when the gate was introduced (web ~90% lines, api ~85% lines — see issue #39). Raise them as coverage improves; never lower them to make a red build pass — add tests instead.
