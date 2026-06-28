---
id: AgDR-0026
timestamp: 2026-05-19T00:00:00Z
agent: claude
model: claude-opus-4-8
trigger: user-prompt
status: accepted
ticket: marsa-cloud/marsa#94
---

# Replace TypeORM with MikroORM for `apps/api`

> In the context of choosing the ORM for `apps/api` (NestJS 11 + PostgreSQL), facing that the initially-added TypeORM depends on `typeorm-naming-strategies` for snake_case columns — a package unmaintained for ~6 years — I decided to **switch to MikroORM**, which ships `UnderscoreNamingStrategy` built-in and is actively maintained, while keeping the same code-first decorator-entity + NestJS-DI model, to achieve a maintained, low-friction data layer, accepting a one-time dependency/config swap done before any entities or migrations existed.

## Context

TypeORM was the initial ORM choice. The snake_case column convention requires `typeorm-naming-strategies`, which had not been maintained for ~6 years — a standing supply-chain/maintenance risk on the core data layer. MikroORM is a near-drop-in alternative: same code-first decorator entities, same NestJS DI/`@InjectRepository` pattern, actively maintained, and `UnderscoreNamingStrategy` is built in with no third-party plugin. The project had **no entities and no migrations written yet**, making this the lowest-cost possible moment to switch.

## Options Considered

| Option | Pros | Cons |
| ------ | ---- | ---- |
| **MikroORM** (chosen) | Built-in `UnderscoreNamingStrategy` (no unmaintained plugin); actively maintained; `defineConfig` type-safe config; first-class NestJS integration (`MikroOrmModule`, `@InjectRepository`); forked-EM transaction-per-suite test isolation | A switch (remove `@nestjs/typeorm`/`typeorm`, add four `@mikro-orm/*` packages); team learns MikroORM's EM/migrator semantics |
| Stay on TypeORM + `typeorm-naming-strategies` | No change | Depends on a package unmaintained ~6 years for a core concern (column naming); maintenance risk grows with the schema |
| Stay on TypeORM, hand-roll a naming strategy | Drops the dead dependency | Reinvents a solved problem; ongoing maintenance burden on us |

## Decision

Chosen: **MikroORM**.

- **Packages:** remove `@nestjs/typeorm` + `typeorm`; add `@mikro-orm/core`, `@mikro-orm/postgresql`, `@mikro-orm/nestjs`, `@mikro-orm/migrations` (versioned together in the pnpm catalog).
- **Config:** `src/sql/sources/main.ts` → `src/sql/mikro-orm.config.ts` exporting `defineConfig()`, shared by the NestJS module and the CLI. `namingStrategy: UnderscoreNamingStrategy`; credentials from env (`DB_HOST/PORT/USER/PASSWORD/NAME`); compiled paths for runtime (`dist/...`), TS paths for the CLI. CLI wired via the `mikro-orm` key in `package.json`; `migration:create|up|down` scripts added.
- **DatabaseModule:** global `MikroOrmModule.forRootAsync()` reading the shared config; feature modules use `forFeature([Entity])` + `@InjectRepository`.
- **Test wiring:** `global-setup.ts` boots MikroORM directly and runs `migrator.up()` against the test DB; `TestBench` exposes `orm`; `TestSetup` gives transaction-per-suite isolation via `em.fork()` + `em.begin()` / `em.rollback()` in teardown.

Out of scope: writing entities/migrations (arrive with feature work), seed data, auth-context wiring in `TestSetup`.

## Consequences

- The data layer now sits on an actively-maintained ORM with no dead naming-strategy dependency.
- Every later migration AgDR (e.g. AgDR-0024's non-transactional enum migration, `migrations.allOrNothing: false`) is expressed in MikroORM's migrator semantics — a direct consequence of this choice.
- Test isolation became real (rollback-per-suite does actual work) rather than a no-op.
- A future ORM change would be costly now that entities + migrations exist — this decision was deliberately made at the zero-entity moment.

## Artifacts

- Recording ticket: marsa-cloud/marsa#94 (back-fill consolidation)
- Originating work: the `feat/orm` PR (marsa-cloud/marsa#14).
- Back-filled from the design spec (`docs/superpowers/specs/2026-05-19-mikro-orm-setup-design.md`, removed in #94 once consolidated here).
- Key files: `apps/api/src/sql/mikro-orm.config.ts`, `apps/api/src/modules/database/database.module.ts`, `apps/api/src/test/` (global-setup, TestBench, TestSetup)
- Related: [AgDR-0024](AgDR-0024-migration-user-role-member-value.md) and the other migration AgDRs all build on MikroORM's migrator.
