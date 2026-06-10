---
id: AgDR-0010
timestamp: 2026-06-10T00:00:00Z
agent: claude
model: claude-opus-4-8
trigger: user-prompt
status: draft
ticket: marsa-cloud/marsa#58
supersedes: AgDR-0006 (the `state` option row only)
---

# Manifest CSRF `state` — DB-backed single-use token (supersedes AgDR-0006's stateless HMAC)

> In the context of the GitHub App Manifest round-trip (#58), facing a second-review ruling that the stateless HMAC signer must not be maintained, I decided to execute a **schema** migration creating a `github_app_manifest_state` table (and adding UNIQUE constraints to `github_app`) to replace the stateless `state` with a server-stored, single-use, expiring token, accepting one extra table + a DB round-trip per manifest request in exchange for true single-use semantics and a clean path to session-binding.

**Migration type**: schema
**Affected tables / entities**: `github_app_manifest_state` (CREATE), `github_app` (ALTER — add UNIQUE on `github_app_id`, `slug`)
**Estimated downtime**: none — additive; #58 is unmerged so neither table holds production rows yet
**Data volume**: low — state rows are transient (10-min TTL, deleted on consume); `github_app` is ~1 row per install
**Target environment(s)**: dev-only today (pre-release); staging → prod when #58 ships

## Context

AgDR-0006 chose a **stateless HMAC-signed `state`** (`nonce + exp`, constant-time verify) as the
Manifest-flow CSRF guard, explicitly deferring a DB-backed / session-bound token to #22. On the
second review of PR #64 the CEO reversed that for the `state` mechanism specifically:

> *"replace with stateful storage of this somewhere"* … *"we will nuke StateSigner and replace
> with a table"* … *"do not defer."*

The stateless token cannot be invalidated once issued — it is replayable within its TTL, and the
HMAC subkey is one more thing to manage. Operator-session binding still can't happen (auth is #22),
but the **DB-backed, single-use** half is actionable now and is the part the CEO ruled in.

Separately, CodeRabbit flagged (Major) that `github_app` has no UNIQUE constraint on
`github_app_id`/`slug` and the convert use-case persists without a lookup — duplicate App rows are
possible. Folded into this migration since it is the same persist path and the same schema file class.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| Keep stateless HMAC (AgDR-0006) | No table, no DB round-trip | CEO ruled it out; replayable within TTL; un-revocable; extra key to manage |
| **DB row, delete-on-consume** | True single-use (atomic conditional `DELETE`); self-cleaning happy path; trivial path to session-binding in #22 | One table; expired-unused rows need an eventual sweep |
| DB row, mark `consumed_at` | Audit trail of replay attempts | Extra column + a cleanup job sooner; more than v0.1 needs |

For uniqueness: (a) DB UNIQUE constraint + idempotent upsert vs (b) app-level check only — chose
**(a)**: the constraint is the durable guard, the entity `@Unique()` keeps the schema diffable, and
the idempotent lookup turns a retry into an update instead of a 500.

## Decision

Chosen: **DB row with delete-on-consume**, plus **UNIQUE on `github_app(github_app_id, slug)`** and an
idempotent persist.

- `github_app_manifest_state`: `id uuid PK` (app-generated `randomUUID()` — the uuid *is* the token),
  `expires_at`, `created_at`.
- `issue()` inserts a row (10-min TTL) and returns its id as `state`.
- `consume(state)` does a single atomic `DELETE … WHERE id = $1 AND expires_at > now()` and treats
  `affected === 1` as valid → single-use, race-free, no transaction/lock dance. Malformed (non-uuid)
  input short-circuits to `false` before hitting Postgres.
- `StateSigner` (`state-signer.ts`) and its test are deleted; the new `ManifestStateService` lives in a
  feature-local `ManifestStateModule` imported by both use-case modules.

## Rollback Plan

1. `pnpm --filter api migration:down` — runs the generated `down()`: `drop table "github_app_manifest_state"` and `alter table "github_app" drop constraint` for the two unique indexes.
2. No data backfill exists (pre-release, no deployed rows) → the reverse is lossless.
3. If already merged and a real `github_app` row exists, the unique drop is still safe; the table drop only loses transient state tokens (operators simply re-fetch the manifest).

**Rollback tested against**: unit fixture — api `global-setup` applies `up()` for the whole test run; MikroORM-generated `down()` is the mechanical reverse.
**Rollback window**: unbounded — additive schema, no data transformation to lose fidelity.

## Cross-Service Consumers

- **apps/api** — sole reader/writer of both tables.
- **apps/web** — consumes the JSON contract (`state` is opaque to it); touches neither table.
- **none** otherwise.

Deploy-order constraint: none — additive; api ships the migration with the code that uses it.

## Testing Plan

- **Dev smoke**: `pnpm --filter api test` — `global-setup` runs the migration; new `ManifestStateService` unit/integration tests (issue→consume, unknown, expired, single-use replay, malformed) + a replay e2e (second POST with a used `state` → 400).
- **Staging verify**: n/a (pre-release). When #58 ships: `GET …/manifest` returns a uuid `state` + a row exists; `POST …/conversions` succeeds once then the row is gone; replay → 400.
- **Canary / phased rollout**: n/a.

## Observability

- **During apply**: MikroORM `mikro_orm_migrations` table records the version; apply is a fast DDL on empty/near-empty tables.
- **Post-apply**: no duplicate `github_app` rows (UNIQUE holds); manifest-state rows created on `GET` and deleted on successful `POST`.
- **Alerts armed**: none specific yet (pre-release).

## Consequences

- True single-use state; replay within TTL now fails closed.
- Clean seam for #22 to bind the state row to the operator session (add a nullable `session_id` column later).
- One feature-local table + a per-manifest DB round-trip (negligible at provisioning volume).
- Expired, never-consumed rows accumulate → a small periodic sweep is a noted follow-up.
- Duplicate-App rows are now impossible at the DB layer.

## Artifacts

- Ticket: marsa-cloud/marsa#58
- Supersedes: [AgDR-0006](AgDR-0006-github-app-credential-storage.md) (the `state` option row only — encryption-at-rest and the rest of AgDR-0006 stand)
- Builds on: [AgDR-0007](AgDR-0007-migration-github-app-table.md) (the original `github_app` table migration)
- Enables: marsa-cloud/marsa#22 (session-bound provisioning)
- Commits / PRs: PR #64 (filled in as the migration ships)
