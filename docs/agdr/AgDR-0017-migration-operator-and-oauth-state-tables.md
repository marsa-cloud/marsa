---
id: AgDR-0017
timestamp: 2026-06-16T16:30:00Z
agent: claude
model: claude-sonnet-4-6
trigger: user-prompt
status: draft
ticket: marsa-cloud/marsa#62
---

# Migration: create `operator` and `auth_oauth_state` tables

> In the context of implementing GitHub user-OAuth login with an HttpOnly session (#62, [AgDR-0016](AgDR-0016-oauth-seam-and-session-mechanism.md)), facing the need to durably record authenticated operators and to validate single-use OAuth state tokens, I decided to execute a **schema** migration adding `operator` and `auth_oauth_state` tables, to achieve persistent operator identity (keyed on GitHub's stable numeric user id per [AgDR-0004](AgDR-0004-authentication-and-idp-strategy.md)) and CSRF-safe OAuth callbacks, accepting two new additive tables with no relation to existing data.

**Migration type**: schema
**Affected tables / entities**: `users` (renamed from `operator` in-place, see [AgDR-0019](AgDR-0019-user-rename-and-role-enum.md)) (new), `auth_oauth_state` (new) — no FKs to existing tables
**Estimated downtime**: none — both are additive new tables; no locks on existing data
**Data volume**: `users` — 1 row per authenticated user (a self-hosted instance typically has a handful); `auth_oauth_state` — 1 short-lived row per login attempt (10-minute TTL, consumed on use). **Correction**: "self-pruning" here described only the happy path (consumption deletes the row) — an issued-but-never-consumed state is **not** reaped on a timer. This is the same gap already named honestly in this AgDR's own Consequences section below; that section is the accurate statement, this line is amended to match it.
**Target environment(s)**: dev-only for now → prod when v0.1 ships (no staging env yet)

## Context

#62 adds "Sign in with GitHub" for the dashboard. Per AgDR-0016 (amended by [AgDR-0022](AgDR-0022-oauth-state-session-binding.md)), the OAuth code exchange goes through the `GithubClient` seam and the session is a stateless `@fastify/secure-session` cookie holding only the user `uuid` (field `userUuid`) — so the only durable state this feature needs is:

1. **Who is this operator** (`operator`) — upserted by GitHub's numeric user id on every successful login, mirroring the `github_installation` pattern (AgDR-0013) of a dedicated table rather than overloading an existing one.
2. **Was this OAuth callback CSRF-legitimate** (`auth_oauth_state`) — a single-use, expiring token issued at `GET /api/v1/auth/github` and consumed at `POST /api/v1/auth/github/session`. Mirrors the existing `manifest_state` pattern (AgDR-0010) closely enough that a thin parallel table was preferred over forcing a generic/shared name onto manifest-specific code (per the feature-internal-code convention in `apps/api/.claude/CLAUDE.md`).

## Options Considered

| Option                                                            | Pros                                                                                                                                                                                                      | Cons                                                                                                                                                                                                                    |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Two dedicated tables: `operator`, `auth_oauth_state`** (chosen) | Each table has one clear purpose; mirrors existing `github_app`/`github_installation` and `manifest_state` conventions; `operator` is the stable forward-compat row Zitadel migration (v0.2) will key off | Two new tables instead of one                                                                                                                                                                                           |
| Reuse `manifest_state` for OAuth state too                        | No new state table                                                                                                                                                                                        | `manifest_state` is feature-internal to `github-app`; reusing it across features breaks the "feature-internal code stays inside the feature folder" convention and couples two unrelated flows to one table's lifecycle |
| Store operator identity in the session cookie only, no DB row     | Zero new tables                                                                                                                                                                                           | No way to revoke/list operators, no stable anchor for the v0.2 Zitadel migration's "map by GitHub numeric id" requirement (AgDR-0004) — directly violates the forward-compat rule that motivated this whole feature     |

## Decision

Chosen: **two dedicated tables**.

- `operator`: `uuid` (PK, app-generated), `github_user_id` (varchar, **unique** — GitHub's stable numeric id stored as a string identifier, never used arithmetically — this is the v0.2 Zitadel forward-compat key per AgDR-0004), `github_login` (varchar), `created_at` / `updated_at`.
- `auth_oauth_state`: `uuid` (PK, app-generated — doubles as the state token value), `expires_at` (datetime), `created_at`. No FK — it's a pure CSRF nonce, deleted on consumption via `nativeDelete`.

Neither table has a foreign key to existing tables — both are root entities for the `auth` feature.

**Amended by [AgDR-0019](AgDR-0019-user-rename-and-role-enum.md)**: `operator` is renamed to `users` in-place (same migration file, not a new one — licensed by this migration never having shipped to a deployed environment, per the dev-only target above) and gains a `role` enum column. The table/entity name below is historical; `users` is the name from this point forward.

## Rollback Plan

1. Run `pnpm --filter api migration:down` — executes the generated `down()`, which runs `DROP TABLE "operator";` and `DROP TABLE "auth_oauth_state";`. Both tables are self-contained (no inbound FKs from other tables), so the drop is safe in either order.
2. Revert the feature commit if rolling back the whole #62 feature.

**Rollback tested against**: the api test harness (`global-setup.ts`) applies migrations against the test DB on every `pnpm --filter api test`; `migration:down` is exercised locally before merge.
**Rollback window**: unbounded — both tables are new and isolated. Dropping `operator` loses operator records (operators simply re-authenticate and get a fresh row); dropping `auth_oauth_state` only loses in-flight (≤10-minute) login attempts.

## Cross-Service Consumers

- **marsa-api** — sole reader/writer (`begin-github-login` issues `auth_oauth_state` rows and reads `users`; `complete-github-login` consumes `auth_oauth_state` and upserts `users`; `get-current-user`, renamed from `get-current-operator` per [AgDR-0019](AgDR-0019-user-rename-and-role-enum.md), reads `users`).
- **none** else — `apps/web` never queries these tables directly; it only sees the HTTP responses and the session cookie.

Deploy-order constraint: none — both tables are net-new with no dependency on prior migrations beyond the baseline schema.

## Testing Plan

- **Dev smoke**: `pnpm --filter api migration:up` against a local Postgres; confirm both tables exist with the expected columns and the `github_user_id` unique constraint.
- **Staging verify**: n/a (no staging env in v0.1).
- **Canary / phased rollout**: n/a (new tables, no existing traffic depends on them).

## Observability

- **During apply**: migration command exits 0; no lock contention (no existing data, no FKs to existing tables).
- **Post-apply**: `operator` and `auth_oauth_state` tables present; api boots; #62 e2e tests green (login flow + `/auth/me` guard).
- **Alerts armed**: none specific — covered by the api boot/health check.

## Consequences

- Establishes the durable operator record that the v0.2 Zitadel migration will map onto by `github_user_id`, per AgDR-0004's forward-compat rule.
- Introduces a second single-use-state-token table alongside `manifest_state`, accepting the duplication in exchange for feature isolation.
- `auth_oauth_state` rows are never reaped on a timer in v0.1 — expired-but-unconsumed rows accumulate until garbage-collected by a future cleanup job. Negligible at expected v0.1 volume; flagged here so it isn't silently forgotten.

## Artifacts

- Ticket: marsa-cloud/marsa#62 (migration tracked on the feature ticket via the `migration` label, per the AgDR-0013 precedent)
- Builds on: [AgDR-0004](AgDR-0004-authentication-and-idp-strategy.md) (forward-compat key), [AgDR-0010](AgDR-0010-migration-manifest-state-db-backed.md) (single-use state token precedent), [AgDR-0013](AgDR-0013-migration-github-installation-table.md) (dedicated-table precedent)
- Pairs with: [AgDR-0016](AgDR-0016-oauth-seam-and-session-mechanism.md) (seam + session mechanism decisions for #62)
- Amended by: [AgDR-0019](AgDR-0019-user-rename-and-role-enum.md) (`operator`→`users` rename + `role` column, same migration file), [AgDR-0022](AgDR-0022-oauth-state-session-binding.md) (session-binding check added on top of this table's DB-only single-use check)
- Commits / PRs: filled in as the migration ships
