---
id: AgDR-0043
timestamp: 2026-08-30T00:00:00Z
agent: claude
model: claude-opus-5
trigger: user-prompt
status: draft
ticket: marsa-cloud/marsa#63
---

# Replace drizzle's batched migrator with one transaction per migration

> In the context of adding a `guest` value to `user_role_enum` and defaulting the column to it (#63), facing `drizzle-orm`'s migrator running every pending migration inside a single transaction — which makes `ALTER TYPE ... ADD VALUE` followed by any use of that value fail on an existing install, I decided to **reimplement the migration loop with one transaction per migration, on drizzle's public helpers**, to achieve an upgrade path that works on both fresh and existing databases, accepting a dependency on rc-stage API surface and the loss of all-or-nothing rollback across a batch.

## Context

Postgres raises `55P04 unsafe use of new value` when a freshly-added enum value is referenced before the transaction that added it commits. `drizzle-orm@1.0.0-rc.4` wraps **all pending migrations** in one `db.transaction` (`pg-core/async/session.js:166`), so:

- On a **fresh** database it passes — the type is _created_ in the same transaction, which Postgres permits.
- On an **existing** install it fails and rolls the whole batch back.
- The test harness drops and rebuilds the schema every run, so **no test could ever catch it**.

Splitting the change across two migration files does not help: both are pending at once on any install upgrading past this release, so they land in the same transaction. Verified against Postgres 18.4 with the baseline applied and committed first — batched migrator fails, per-migration transactions succeed.

`MigrationConfig` exposes only `migrationsFolder`, `migrationsTable`, and `migrationsSchema`. There is no transaction-scope option, confirmed against both the shipped types and the published docs.

## Options Considered

| Option                                                                          | Pros                                                                                                                   | Cons                                                                                                                                                                                      |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **One transaction per migration, rebuilt on drizzle's public helpers** (chosen) | Works on fresh and existing databases; matches Rails / Django / Flyway semantics; keeps generated migrations untouched | Depends on `readMigrationFiles`, `getMigrationsToRun`, `upgradeIfNeeded` — public export entries, but undocumented and rc-stage; a failure mid-sequence leaves earlier migrations applied |
| Drop the column default instead of repointing it (`DROP DEFAULT`)               | No migrator change at all                                                                                              | Loses the DB-level `guest` default; a row inserted without a role fails on NOT NULL rather than defaulting safely; treats the symptom                                                     |
| Ship the two migrations in two separate releases                                | No new code                                                                                                            | Couples a schema change to a release-ordering constraint nothing enforces — one squashed deploy breaks every existing install                                                             |
| Text-cast default: `SET DEFAULT ('guest'::text)::user_role_enum`                | Commits in the same transaction; verified working                                                                      | Hand-written SQL that `drizzle-kit generate` wants to "fix" on the next schema change; obscure enough to need its own comment                                                             |
| Store `role` as `varchar` with an app-level enum                                | The problem disappears permanently                                                                                     | Loses database-level integrity; much larger change than the one being made                                                                                                                |

## Decision

Chosen: **`apps/api/src/modules/database/migrate.ts`**, which mirrors drizzle's own sequence — create schema, `upgradeIfNeeded`, create journal table, compute pending — and then applies each migration in its own transaction, taking `AdvisoryLock.Migration` and re-checking the journal by name inside it.

All three call sites use it: `DatabaseModule.onModuleInit`, `entrypoints/seed-dev.ts`, and `test/setup/global-setup.ts`. The last means the whole test suite exercises it on every run.

## Consequences

- The `guest` default is a normal generated migration again; `user.table.ts` carries no workaround.
- **No all-or-nothing across a batch.** A failure at migration 3 of 5 leaves 1 and 2 applied. The journal records each one, so a re-run resumes rather than repeating — the same behaviour Rails, Django, and Flyway have.
- **`migrate.db.test.ts` is the guard on the rc dependency.** It replays baseline→upgrade against a real database, so a `1.0.0-rc.4 → 1.0.0` bump that moves one of the three helpers fails CI instead of a production boot.

### Known limitation: the preamble is not locked

The advisory lock covers each migration, **not** the `CREATE SCHEMA IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` preamble. Both forms check the catalog before taking a lock on an object that does not yet exist, so two processes migrating a **fresh** database at the same moment can both pass the check and one fails on a `pg_namespace` / `pg_type` unique violation.

This is accepted rather than fixed because **Marsa runs a single api instance and a single Postgres** — no server replicas, no database replicas. The window needs two processes bootstrapping the same empty database simultaneously, which the current topology cannot produce. The failure mode is also self-correcting: the losing process exits non-zero and its next start succeeds, since the schema now exists.

**Revisit this before scaling the api past one replica.** The fix is to wrap the preamble in its own transaction holding `AdvisoryLock.Migration`; it was left out deliberately rather than missed. Raised in review of #193.

## Artifacts

- `apps/api/src/modules/database/migrate.ts`
- `apps/api/src/modules/database/advisory-locks.ts`
- `apps/api/src/modules/database/tests/migrate.db.test.ts`
- PR marsa-cloud/marsa#193
