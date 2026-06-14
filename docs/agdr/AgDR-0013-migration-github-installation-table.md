---
id: AgDR-0013
timestamp: 2026-06-11T11:12:00Z
agent: claude
model: claude-opus-4-8
trigger: user-prompt
status: executed
ticket: marsa-cloud/marsa#59
---

# Migration: create `github_installation` table

> In the context of capturing a GitHub App installation so it can be turned into repo-access tokens (#59, [AgDR-0005](AgDR-0005-github-app-integration-model.md)), facing the need to durably record which installation(s) belong to this install's App, I decided to execute a **schema** migration adding a `github_installation` table with a foreign key to `github_app`, to achieve a durable installation record that supports one App → many installations, accepting one additional table and an FK relation (the codebase's first).

**Migration type**: schema
**Affected tables / entities**: `github_installation` (new); FK → `github_app`
**Estimated downtime**: none — additive new table; no locks on existing data
**Data volume**: 1 row per installation (a self-hosted operator typically installs on their personal account + a few orgs); negligible
**Target environment(s)**: dev-only for now → prod when v0.1 ships (no staging env yet)

## Context

#58 stores the provisioned App in `github_app`. When the operator installs that App on their repos, GitHub creates an **installation** with a numeric `installation_id`. #59 captures it (via the post-install redirect) and needs a durable home for it. A single self-hosted App can be installed in more than one place (personal account + N orgs), so the relationship is **one App → many installations** — a separate table with an FK, not a column on `github_app`.

## Options Considered

| Option                                                               | Pros                                                                                             | Cons                                                                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Separate `github_installation` table, FK → `github_app`** (chosen) | Models 1→N correctly; typed columns; room for `account_login` and future per-installation fields | One more table; introduces the first ORM relation                                                                    |
| `installation_id` column on `github_app`                             | No new table                                                                                     | Assumes one installation per App — breaks the day the operator installs on a second org; forces a re-migration later |
| Generic key/value/config row                                         | No schema change                                                                                 | Untyped; can't express the FK or the 1→N cardinality; awkward to query                                               |

## Decision

Chosen: **a dedicated `github_installation` table**. Columns: `id` (uuid PK), `installation_id` (varchar, **unique** — GitHub's numeric id stored as a string identifier), `account_login` (varchar, **nullable** — enriched later from webhook payloads in #61), `app_id` (FK → `github_app`, not null), plus the standard `created_at` / `updated_at`. The `@ManyToOne(() => GitHubApp)` relation is the codebase's first ORM relation; MikroORM's `UnderscoreNamingStrategy` maps it to an `app_id` FK column.

## Rollback Plan

1. Run `pnpm --filter api migration:down` — executes the generated `down()` which runs `DROP TABLE "github_installation";` (the FK lives on this table, so the drop is self-contained; `github_app` is untouched).
2. Revert the feature commit if rolling back the whole feature.

**Rollback tested against**: the api test harness (`global-setup.ts`) applies migrations against the test DB on every `pnpm --filter api test`; `migration:down` is exercised locally. No staging environment exists in v0.1.
**Rollback window**: unbounded — the table is new and isolated; dropping it only loses captured installation rows, which are re-capturable by re-running the install flow.

## Cross-Service Consumers

- **marsa-api** — sole reader/writer (the capture use-case writes; #60 reads to mint tokens for cloning).
- **none** else.

Deploy-order constraint: `github_app` must exist first (FK target) — it does, from #58.

## Testing Plan

- **Dev smoke**: `pnpm --filter api migration:up` against a local Postgres; confirm `github_installation` exists with the FK + unique constraint.
- **Staging verify**: n/a (no staging env in v0.1).
- **Canary / phased rollout**: n/a (new table).

## Observability

- **During apply**: migration command exits 0; no lock contention (no existing data).
- **Post-apply**: `github_installation` table present with FK to `github_app`; api boots; #59 e2e tests green.
- **Alerts armed**: none specific — covered by the api boot/health check.

## Consequences

- Durable installation records supporting 1 App → N installations; unblocks #60 (clone with installation tokens).
- Introduces the first `@ManyToOne` relation in the codebase.
- `account_login` is nullable now and enriched by #61's webhook handling later.

## Artifacts

- Ticket: marsa-cloud/marsa#59 (migration tracked on the feature ticket via the `migration` label — additive new table, zero blast radius)
- Builds on: [AgDR-0007](AgDR-0007-migration-github-app-table.md) (the `github_app` table this FKs to)
- Pairs with: [AgDR-0012](AgDR-0012-installation-token-strategy.md) (token minting)
- Commits / PRs: filled in as the migration ships
