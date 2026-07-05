---
id: AgDR-0035
timestamp: 2026-07-05T08:10:00Z
agent: claude
model: claude-opus-4-8
trigger: user-prompt
status: accepted
ticket: marsa-cloud/marsa#100
---

# Rename `release.status` → `deploy_status` (column + PG enum type)

> In the context of [#100](https://github.com/marsa-cloud/marsa/issues/100) renaming the domain concept `ReleaseStatus → DeployStatus` (the meaningless name is being removed; `buildStatus` will be a separate concept per #21), facing the need to bring the DB in line with the entity, I decided to execute a **schema** migration affecting the `release` table to achieve a truthful, self-describing column name, accepting a brief **rolling-deploy incompatibility window** on a pre-production MVP.

**Migration type**: schema
**Affected tables / entities**: `release` (column `status` → `deploy_status`); PG enum type `release_status_enum` → `deploy_status_enum`
**Estimated downtime**: seconds — a metadata-only `ALTER TABLE … RENAME COLUMN` + `ALTER TYPE … RENAME`; both are catalog updates, no table rewrite, no data copy.
**Data volume**: negligible — the `release` table landed in #97 (2026-06-29) and holds only dev/demo rows; no production data of consequence.
**Target environment(s)**: staging → prod (demo.marsa.cc)

## Context

`#100` removes the name `ReleaseStatus` (deemed meaningless) in favour of `DeployStatus`, and renames the entity field `status → deployStatus`. Under `UnderscoreNamingStrategy` the column must become `deploy_status`, and the native PG enum type is renamed for consistency. This is the DB half of that rename.

## Options Considered

| Option                                                                           | Pros                                                                                                            | Cons                                                                                                                          |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Hard rename (chosen)**                                                         | One metadata-only migration; no dual-write, no backfill, no follow-up drop; matches the entity in a single step | Not rolling-deploy-safe — during a rollout old pods query `status`/`release_status_enum` while new schema has renamed them    |
| Expand-contract (add `deploy_status`, backfill, dual-write, later drop `status`) | Zero-downtime, rolling-deploy-safe                                                                              | Two migrations + dual-write app code for a pre-prod MVP with ~no data and no zero-downtime SLO — cost far exceeds benefit now |

## Decision

Chosen: **hard rename**, because the `release` table is days old with only demo data, Marsa V0.1 has no zero-downtime SLO, and the CD pipeline rolls the cluster on merge. The rolling-deploy window is brief and inconsequential at this stage; expand-contract's machinery is not justified. Re-evaluate the expand-contract pattern once Marsa carries real tenant data.

## Rollback Plan

Symmetric and metadata-only — the migration's own `down()`:

1. `alter table "release" rename column "deploy_status" to "status";`
2. `alter type "deploy_status_enum" rename to "release_status_enum";`

**Rollback tested against**: unit fixture — `global-setup` runs the migration before the api test suite; the suite passing exercises the renamed schema. `down()` is the exact inverse of `up()`.
**Rollback window**: unbounded — a pure rename carries no data-shape drift, so reversing is always safe (subject to redeploying the matching app version).

## Cross-Service Consumers

- **apps/api** — sole reader/writer of `release`. The entity, builder, repositories, and the deploy/list use-cases are updated in the same PR. Deploy order: apply the migration and the new api image together (CD rolls the cluster); brief overlap tolerated per the decision above.
- **apps/web** — consumes only the regenerated OpenAPI contract (`deployStatus`); no direct DB access.
- No ETL / warehouse / other service touches this table.

## Testing Plan

- **Dev smoke**: `pnpm --filter api test` — `global-setup` applies the migration; deploy-app + list-app-releases e2e assert `deployStatus`.
- **Staging verify**: apply on demo.marsa.cc; `\d release` shows `deploy_status`; `\dT+ deploy_status_enum` exists; a deploy → list cycle reports the reconciled status.

## Observability

- **During apply**: negligible — metadata-only DDL; no lock contention beyond a momentary catalog lock.
- **Post-apply**: the list-releases endpoint returns `deployStatus`; api error rate unchanged after the rollout window.
- **Alerts armed**: existing api error-rate / 5xx alerting suffices; no migration-specific alert needed for a rename.

## Consequences

- The DB is self-describing: `deploy_status` names the deploy lifecycle; `build_status` (#21) can be added later without colliding with a generic name.
- The old name `release_status_enum` is gone; any external tooling referencing it by name must update (none known).
- A brief rolling-deploy incompatibility window is accepted for this migration; future data-bearing renames should use expand-contract.

## Artifacts

- Ticket: marsa-cloud/marsa#100
- Design AgDR: [AgDR-0034](AgDR-0034-deploy-status-reconciliation-mechanism.md) (the reconciliation work this rename supports)
- Migration: `apps/api/src/sql/migrations/Migration20260705080651.ts`
- Commits / PRs: filled in as #100 ships
