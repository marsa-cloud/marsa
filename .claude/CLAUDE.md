# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Marsa is an open-source, self-hostable PaaS (Heroku/Railway-style) that deploys onto Kubernetes (K3s). Early-stage MVP — APIs and architecture change frequently.

## Repo layout

pnpm monorepo (`pnpm-workspace.yaml`, packages under `apps/*` and `packages/*`). Node >= 22, pnpm 9.15.0.

- `apps/api` — NestJS 11 server running on **Fastify** (not Express, despite `@nestjs/platform-express` being a transitive dep). Entrypoint: `apps/api/src/entrypoints/api.ts`. Global prefix `/api`, URI versioning enabled.
- `apps/web` — Nuxt 4 + Nuxt UI + Tailwind 4 frontend.
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
```

API package scripts (`pnpm --filter api <script>`):

- `dev`, `start`, `start:debug`, `start:prod`
- `lint`, `lint:fix`
- `test:all` — `clean && build && test:setup && test:run` (the test pipeline runs against **compiled output** in `dist/`, not ts-node)
- `test:setup` — `node --env-file=.env.test dist/src/test/setup/global-setup.js`
- `test:run` — currently empty, wire up when adding real tests

Tests use the **Node.js built-in test runner** (`node:test` + `node:assert/strict`), not Jest. Example specs: `apps/api/src/app.controller.spec.ts`, `apps/api/src/app.e2e-spec.ts`. The `test:setup` step initializes a `TestModule` (e.g. for migrations) before the run.

## API architecture

Module composition is layered so tests can swap pieces:

- `AppModule.forRoot(modules)` — root dynamic module; takes a list of feature modules to mount. Defined in `apps/api/src/app.module.ts`.
- `ApiModule` (`src/modules/api/api.module.ts`) — production composition; imports `AppModule.forRoot()` + future feature modules. This is what `entrypoints/api.ts` boots.
- `TestModule.forRoot(modules, migrationsRun)` (`src/test/test.module.ts`) — test composition, parallel to `AppModule`.

Test harness (`src/test/setup/test-bench.ts`):

- `TestBench.setupEndToEndTest()` boots the full `ApiModule`.
- `TestBench.setupModuleTest(MyModule)` boots `AppModule.forRoot([MyModule])` — isolates a feature module.
- `TestBench.setupIntegrationTest(module)` — generic; both helpers above delegate to it. Caches the booted app per module so repeated calls in the same run reuse it. Requires `NODE_ENV=test`.
- `TestSetup` (`src/test/setup/test-setup.ts`) wraps the booted app and is where DB transactions / auth context will be plumbed.

The Fastify adapter is configured in **two places** and they should stay in sync: `src/entrypoints/api.ts` (prod) and `TestBench.createApp` (tests). Both use a `qs`-based querystring parser and identical router options.

## Imports (enforced by ESLint)

- The `api` package uses **subpath imports** instead of relative paths: `#src/*` → `./src/*`, `#test/*` → `./src/test/*` (mapped in `apps/api/tsconfig.json` `paths` and `apps/api/package.json` `imports`). Relative imports (`./*`, `../*`) are a lint error — use the alias.
- Import order is enforced by `simple-import-sort`. In `apps/api` the group order is: side-effects → `node:` → packages → `#src/*` → `#test/*` → other.
- Unused imports/vars are errors (auto-fixable). Prefix intentionally-unused args with `_` to silence.
- A blank line is required between the last import and the next statement (`padding-line-between-statements`).
- Editor save-on-fix is wired up in `.vscode/settings.json` (works in VS Code and Windsurf) and uses the unified `js/ts.*` setting keys. Auto-import prefers non-relative module specifiers so it inserts `#src/...` paths.

## CI

`.github/workflows/ci.yml` runs on push/PR to `main`: `format:check` → `lint` → `build:api` → `build:web` → `pnpm --filter api test`. CI uses `pnpm install --frozen-lockfile` so commit `pnpm-lock.yaml` updates alongside dependency changes.

## Deployment target

The API is intended to run behind a K3s ingress. If/when adding `trustProxy` to the Fastify adapter, the loopback default (`127.0.0.1/8`) is wrong for in-cluster traffic — use the cluster CIDRs (`10.42.0.0/16` pods, `10.43.0.0/16` services) or the broader RFC1918 ranges.
