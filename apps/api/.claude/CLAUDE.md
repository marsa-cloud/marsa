# CLAUDE.md — apps/api

Backend-specific guidance. The root `marsa/.claude/CLAUDE.md` covers monorepo-wide concerns; this file adds api-only detail.

## Stack

NestJS 11 on **Fastify** (`@nestjs/platform-fastify`). `@nestjs/platform-express` is a transitive dep — do not switch the adapter without reason. Package is **ESM** (`"type": "module"`), Node >= 24. Persistence is **Drizzle** (`drizzle-orm/node-postgres`).

## Conventions live in path-scoped rules

Per-file-type conventions are in `.claude/rules/api/`, loaded automatically when you open a matching file. This file keeps only what you need **before** opening one: layout, module composition, and where a new thing belongs.

| Editing                                 | Rule                                 |
| --------------------------------------- | ------------------------------------ |
| `*.table.ts`, `*.enum.ts`, `src/sql/**` | `.claude/rules/api/table.md`         |
| `*.response.ts`                         | `.claude/rules/api/response-dto.md`  |
| `*.command.ts`                          | `.claude/rules/api/command-dto.md`   |
| `*.controller.ts`                       | `.claude/rules/api/controller.md`    |
| `*.use-case.ts`                         | `.claude/rules/api/use-case.md`      |
| `*.repository.ts`                       | `.claude/rules/api/repository.md`    |
| `*.builder.ts`                          | `.claude/rules/api/builder.md`       |
| `*.module.ts`                           | `.claude/rules/api/module-wiring.md` |
| `tests/**`                              | `.claude/rules/api/tests.md`         |
| any `src/**/*.ts` (import style)        | `.claude/rules/api/imports.md`       |
| `.swcrc`, `tsconfig*.json`, build cfg   | `.claude/rules/api/build-config.md`  |

If a rule contradicts the code, the code wins and the rule is a bug — fix the rule.

## Entry, prefix, versioning

`src/entrypoints/api.ts` bootstraps `ApiModule` behind a `FastifyAdapter` configured with a `qs`-based querystring parser. Global prefix `/api`. URI versioning is enabled (`@Controller({ version: '1' })` → `/api/v1/...`).

The Fastify adapter config is duplicated in `src/test/setup/test-bench.ts` (`TestBench.createApp`). **Keep both in sync** — same parser, same router options.

## OpenAPI contract (web consumes this)

`src/entrypoints/generate-open-api.ts` boots `ApiModule` with `{ preview: true }` (no DB connection) and writes a **committed** `apps/api/openapi.json`. Run `pnpm --filter api generate:openapi` after changing any endpoint, DTO, or decorator, and commit it — CI drift-checks it.

Every `operationId` is derived by a global `operationIdFactory` (`src/modules/swagger/operation-id-factory.ts`) from the controller class name plus URI version — `GetApiInfoController` + `v1` → `getApiInfoV1`. **The class name is the contract**: renaming a controller renames its operationId and churns the generated web types, so treat it as a public-surface change. AgDR-0040.

## Source layout

- `src/app/` — **features** (vertical slices), one folder per domain aggregate root: `app-management/`, `release/`, `auth/`, `user/`, `github-app/`.
- `src/modules/` — **support modules**: cross-cutting infrastructure features depend on, plus the production composition module (`api/api.module.ts`). Not feature code.

Also: `src/entrypoints/` (process bootstraps), `src/test/` (harness + global setup), `src/utils/`, `src/sql/`.

## Module composition

- `AppModule.forRoot(modules)` (`src/app.module.ts`) — root dynamic module; always imports `DatabaseModule` plus the feature modules you pass.
- `ApiModule` (`src/modules/api/api.module.ts`) — production composition. **Register a new feature here only.**
- `TestModule.forRoot(modules)` (`src/test/test.module.ts`) — parallel composition root for tests. Never nests inside `AppModule`.

`AppModule` and `TestModule` are parallel roots — infrastructure belongs in both directly, not passed in by callers.

## Feature module boundaries (when to split)

One feature module per **domain aggregate root** — not per business capability, per REST resource, or per team.

- **A feature owns exactly one aggregate root**: its entity (or tightly-bound cluster), that entity's `entities/` / `errors/` / `enums/` / `events/`, and every use-case whose primary read/write target is that aggregate. `release/` owns `Release`; `app-management/` owns `App`.
- **A use-case lives with the aggregate it primarily reads or writes**, not the URL noun it is addressed by. `view-release-index` sits under `/apps/:slug/releases` but targets `Release`, so it lives in `release/`. Conversely `view-app-health` and `view-app-logs` are app-keyed live reads of Kubernetes state touching no `Release`, so they live in `app-management/`. Ask "whose lifecycle is this about?", never "which word is in the route?" — following the route noun is the trap this rule exists to avoid.
- **Split out when a cluster of use-cases centres on a different aggregate.** One module holding two aggregates is the smell.
- **Shared building blocks are the only cross-feature seam.** Never reach into another feature's repository, use-case, command, or response. Importing another feature's `entities/` / `errors/` / `enums/` / `events/` is sanctioned — that's how `release/` depends on `App`. The dependency must stay **one-directional**; preserving acyclicity is the property the split protects.

Driver + options: `docs/agdr/AgDR-0040-feature-module-boundary-aggregate-ownership.md` (marsa#131).

## Use-case naming (CRUD verbs + action exceptions)

The folder name sets the `<Action>` class prefix, the `operationId`, and the route:

| Operation              | Use-case folder        | Route shape                           |
| ---------------------- | ---------------------- | ------------------------------------- |
| List / collection read | `view-<entity>-index`  | `GET /<entities>` (filters via query) |
| Single read by id      | `view-<entity>-detail` | `GET /<entities>/:id`                 |
| Create                 | `create-<entity>`      | `POST /<entities>`                    |
| Update                 | `update-<entity>`      | `PATCH`/`PUT /<entities>/:id`         |
| Delete                 | `delete-<entity>`      | `DELETE /<entities>/:id`              |

Two deliberate exceptions:

- **Singleton / self reads drop the suffix** — `view-me`, settings-style singletons.
- **Domain-verb actions keep their ubiquitous-language verb** — `deploy-app` writes a `Release`, but the domain says "deploy", not "create release". A write scoped to one facet takes a qualifier: `update-<entity>-<facet>`.

## Feature shape (vertical slice)

Each feature under `src/app/<feature>/` is self-contained: HTTP endpoints, domain logic, persistence, and feature-local types together, exposing a single module.

```text
src/app/<feature>/
  <feature>.module.ts            # feature root; imported by ApiModule
  use-cases/<use-case>/
    <use-case>.module.ts         # use-case wiring
    <use-case>.controller.ts     # one controller per use-case
    <use-case>.use-case.ts       # application logic — <Action>UseCase
    <use-case>.command.ts        # input DTO — <Action>Command
    <use-case>.command.builder.ts
    <use-case>.repository.ts     # use-case-scoped DB access
    <use-case>.response.ts       # output DTO — <Action>Response
    tests/                       # *.unit.test.ts · *.e2e.test.ts
  entities/                      # feature-owned tables + builders
  errors/ · enums/ · events/ · utils/
```

Placement rules: feature-internal code stays inside the feature folder; promote anything genuinely shared to `src/modules/` or a workspace package rather than reaching across. A helper used by one feature lives in that feature's `utils/`; a cross-cutting one goes in `src/utils/`. Shared exported types go in a co-located `.types.ts`; domain-significant literals in a co-located `.constant(s).ts`.

## Test harness

Tests use the **Node.js built-in test runner** (`node:test` + `expect`), running against compiled output in `dist/`, not ts-node. `TestBench` boots apps, `TestSetup` wraps a booted app (exposing `db` / `httpServer`, minting a cookie via `authenticate()`, truncating in `teardown()`), and `global-setup.ts` drops the `public` + `drizzle` schemas then applies migrations once per run. Details: `.claude/rules/api/tests.md`.

## Scripts

```bash
pnpm dev                # nest start --watch with .env loaded
pnpm build              # nest build (SWC, output to dist/)
pnpm lint               # eslint over src + test
pnpm test               # clean → build → test:setup → test:run
pnpm db:generate        # drizzle-kit generate, after any table change
pnpm generate:openapi   # rewrite the committed openapi.json
```

There is no ts-node / watch test mode — change code, rebuild, rerun.

## Env files

`.env` (dev) and `.env.test` (tests) are loaded via Node's `--env-file` flag, not `dotenv`. Both are required at the api root.

## Deployment

Target is K3s. If/when adding `trustProxy` to the Fastify adapter, the loopback default (`127.0.0.1/8`) is wrong for in-cluster traffic — use the cluster CIDRs (`10.42.0.0/16` pods, `10.43.0.0/16` services) or broader RFC1918 ranges.
