# MikroORM Setup — Design Spec

**Date:** 2026-05-19  
**Status:** Approved  
**Scope:** `apps/api`

## Context

TypeORM was added as the initial ORM but its ecosystem is stagnant — the `typeorm-naming-strategies` package (required for snake_case column names) has not been maintained for 6 years. MikroORM is a direct replacement: same code-first decorator entities, same NestJS DI injection pattern, actively maintained, and `UnderscoreNamingStrategy` is built-in with no third-party plugin.

The project has no entities and no migrations written yet, making this the lowest-cost moment to switch.

## Packages

**Remove:**
- `@nestjs/typeorm`
- `typeorm`

**Add (all versioned together in the pnpm catalog):**
- `@mikro-orm/core` — runtime core
- `@mikro-orm/postgresql` — PostgreSQL driver; exports `defineConfig` for type-safe config
- `@mikro-orm/nestjs` — NestJS integration (`MikroOrmModule`, `@InjectRepository`)
- `@mikro-orm/migrations` — migration runner and CLI

## Config file

`src/sql/sources/main.ts` is replaced by `src/sql/mikro-orm.config.ts`. It exports a `defineConfig()` object used by both the NestJS module and the MikroORM CLI.

Key settings:
- `namingStrategy: UnderscoreNamingStrategy` — built-in, no external package
- DB credentials read from env vars (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`)
- `migrations.path` → `dist/src/sql/migrations` (compiled output, used at runtime)
- `migrations.pathTs` → `src/sql/migrations` (TypeScript source, used by CLI)
- `entities` → `dist/src/**/*.entity.js`
- `entitiesTs` → `src/**/*.entity.ts`

The CLI is pointed at this file via a `mikro-orm` key in `package.json`:
```json
"mikro-orm": {
  "useTsNode": false,
  "configPaths": ["./dist/src/sql/mikro-orm.config.js"]
}
```

Migration scripts are added to `package.json`:
- `migration:create` — `mikro-orm migration:create`
- `migration:up` — `mikro-orm migration:up`
- `migration:down` — `mikro-orm migration:down`

## DatabaseModule

`src/modules/database/database.module.ts` wraps `MikroOrmModule.forRootAsync()`, reading config from the shared `mikro-orm.config.ts`. It is a global module imported once by `ApiModule`.

Feature modules register their entities locally:
```ts
MikroOrmModule.forFeature([MyEntity])
```

Repositories are injected via `@InjectRepository(MyEntity)`.

## Test wiring

### global-setup.ts

The existing TODO is filled in: boot MikroORM directly (not via NestJS), run `migrator.up()` against the test DB, then close. This ensures the test schema is always current before any test runs.

### TestBench

`TestApp` gains an `orm: MikroORM` field. After booting the NestJS app, `TestBench` retrieves the `MikroORM` instance from the module and stores it alongside the app.

### TestSetup

Transaction-per-suite isolation using MikroORM's forked EntityManager:

```
TestSetup
  .app            — NestFastifyApplication
  .testModule     — TestingModule
  .entityManager  — forked EM with an open transaction
  .httpServer     — convenience getter
  .teardown()     — rolls back the transaction
```

Lifecycle:
- `initialize()` — calls `orm.em.fork()` then `em.begin()`
- `teardown()` — calls `em.rollback()`

The existing e2e test pattern (`before` → `TestBench.setupEndToEndTest()`, `after` → `setup.teardown()`) requires no changes — the rollback now does real work instead of resolving a no-op.

## Error handling

No special error handling beyond what MikroORM provides. If `migrator.up()` fails in `global-setup.ts`, the process exits with a non-zero code and the test run aborts — correct behavior.

## What is NOT in scope

- Writing any entities or migrations (those come with feature work)
- Seeding test data
- Auth context wiring in `TestSetup` (existing TODO, separate concern)
