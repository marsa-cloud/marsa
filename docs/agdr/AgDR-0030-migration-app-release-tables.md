---
id: AgDR-0030
timestamp: 2026-06-28T16:00:00Z
agent: claude
model: claude-opus-4-8
trigger: user-prompt
status: draft
ticket: marsa-cloud/marsa#97
---

# Migration: create `app` + `release` tables for pre-built image deploy

> In the context of building the first deployment-pipeline increment (#77 → #97), facing the need to persist the operator-app desired state and a per-deploy event log before any Kubernetes work, I decided to execute a schema migration adding two additive tables — `app` and `release` (FK `release.app_uuid → app.uuid`) — to achieve a durable deploy data model, accepting that the two extensibility shapes (`release.triggered_by` enum, `app.domain` discriminated JSON) must be modelled correctly now because flattening them later forces a retrofit.

**Migration type**: schema
**Affected tables / entities**: `app` (new), `release` (new)
**Estimated downtime**: none — `CREATE TABLE` only; no lock or rewrite on existing tables
**Data volume**: 0 rows at apply (new tables); grows ~1 row per registered app + 1 row per deploy event thereafter
**Target environment(s)**: staging → prod (via `demo.marsa.cc`); applied automatically by the app on boot in dev/CI

## Context

#77 ("Deploy pre-built images") is the first increment of the Marsa V0.1 deployment pipeline (AgDR-0015). Sub-issue #97 carves out just the data layer: the `App` (desired state — slug, domain, container port, image, replicas, env, optional encrypted pull credentials) and `Release` (one row per deploy event) entities, plus their migration. Kubernetes integration, manifest rendering, and the deploy use-case land in later sub-issues (#98–#100).

Two shapes are deliberately non-flat and are the reason this migration needs thought even though it's additive:

- `release.triggered_by` is an **enum** with only `'manual'` populated now; `'webhook'` is reserved for #21's build step so that increment is a new enum *value*, not a new column or code path (AgDR-0015).
- `app.domain` is a **discriminated shape** `{ type: 'subdomain' }` now, with `{ type: 'custom', host }` reserved on the same field so custom-domain support never forces a schema redo (AgDR-0015).

Desired state lives on `app` (`image` / `replicas` / `env` / `port` / `domain`), not low-level handles like `deployment_id` — keeps the rendering/applying seam swappable (AgDR-0029).

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| **Two additive tables now (`app`, `release`) with the extensible enum + discriminated-domain shapes (chosen)** | Matches AgDR-0015's load-bearing shapes; zero blast radius (new tables); #21/#78 build additively on top | Slightly more upfront modelling than a flat string column |
| Single `deployment` table (flatten App + Release into one row) | Fewer tables | Loses the "one row per deploy event" history; re-couples "how we got an image" with "deploying it" — exactly what AgDR-0015 separates |
| Flat `triggered_by` / `domain` as plain `varchar` | Marginally simpler migration | Reopens the retrofit risk AgDR-0015 exists to avoid; #21 would need a follow-up migration |

## Decision

Chosen: **two additive tables with the extensible shapes**, because it is the minimal schema that satisfies AgDR-0015's constraints, carries zero blast radius (nothing reads these tables until the deploy feature ships), and lets #21/#78 extend by adding enum values rather than altering columns.

`release.status` is a column whose value is *derived from an injectable status source* in the use-case layer (AgDR-0029), not hardcoded — the migration just provides the column + enum.

## Rollback Plan

**Explicit rollback steps** — additive and safe to fully reverse pre-launch:

1. Run the migration `down()`: `DROP TABLE release;` (child first — holds the FK), then `DROP TABLE app;`.
2. Equivalent via tooling: `pnpm --filter api migration:down` (rolls back the single migration).
3. No data salvage needed — no live consumer reads these tables before the deploy feature ships.

**Rollback tested against**: unit fixture / CI — MikroORM runs migrations in the test `global-setup` against the ephemeral Postgres service; `up()`/`down()` are exercised there before any staging/prod apply.
**Rollback window**: unbounded pre-launch. Once the deploy feature is live and real apps/releases exist on `demo.marsa.cc`, a `DROP` would lose deploy history — at that point rollback means restore-from-backup, not `down()`.

## Cross-Service Consumers

- **none** — `app` and `release` are read/written only by `apps/api`, and only by code that ships in #98–#100. No other service, job, or ETL touches them.

Deploy-order constraint (if any):

- **none** — additive tables; the migration can apply before or after any other deploy without coordination.

## Testing Plan

- **Dev smoke**: `pnpm --filter api migration:up` then `pnpm --filter api migration:down` against a local Postgres — confirm both directions run clean.
- **Staging verify**: on `demo.marsa.cc`, confirm `app` and `release` tables exist with the expected columns/enum after the rolled image boots and applies migrations; entity round-trip is covered by builder + unit tests in #97's build.
- **Canary / phased rollout**: n/a — additive schema, single apply.

## Observability

- **During apply**: MikroORM migrator logs the migration name + success; `CREATE TABLE` is instantaneous (no lock contention to watch).
- **Post-apply**: `app` and `release` present in `information_schema.tables`; `release.triggered_by` / `app.domain` columns have the expected types. No business metric should change (feature not yet wired to any endpoint).
- **Alerts armed**: none specific — early MVP, no dashboards yet. Migration failure surfaces as a failed boot / failed CI `global-setup`.

## Consequences

- Enables the deploy use-case (#98) and the private-image (#99) / re-deploy (#100) slices to build on a stable schema.
- The `app.image_pull_credentials` column is added **nullable** now and populated (encrypted) by #99 — no second migration needed for private images.
- Keeps #21 (git-build) and #78 (self-hosted registry) additive: they add a `triggered_by` enum value / config, not new columns.
- Commits Marsa to the discriminated `app.domain` shape — custom domains later are a value addition, not a schema change.
- **Project & Environment deferred to v0.2 (decision recorded on #24).** The target isolation model is **one K8s namespace per (project × environment)** — soft isolation (namespace + default-deny `NetworkPolicy` + per-namespace `ResourceQuota`), appropriate because Marsa is self-hosted (operator's own workloads, not hostile tenants). V0.1 ships this schema **flat** (App + Release) and deploys into a single derived namespace (default project, `production` env). `Project` and `Environment` become first-class entities later as **additive nullable FKs + default backfill** — no retrofit. Per AgDR-0029, the namespace name is *derived* from project+env, never stored on the entity.

## Artifacts

- Ticket: marsa-cloud/marsa#97 — https://github.com/marsa-cloud/marsa/issues/97
- Parent feature: #77; sequencing: AgDR-0015; deploy seam: AgDR-0029; encryption (for #99): AgDR-0006
- Commits / PRs: filled in as #97 ships
- Staging-run log: filled in after first `demo.marsa.cc` apply
