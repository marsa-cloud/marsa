---
id: AgDR-0024
timestamp: 2026-06-27T00:00:00Z
agent: claude
model: claude-opus-4-8
trigger: user-prompt
status: draft
ticket: marsa-cloud/marsa#89
---

# Migration: add `member` value to `user_role_enum` + flip default; first-user-admin assignment

> In the context of bootstrapping platform ownership for a self-hosted Marsa instance (#89, the "first operator becomes admin" slice of #63), facing a single-value `user_role_enum` (`operator`) that is the default for every user and is never assigned conditionally, I decided to **add a `member` enum value, flip the column default to `member`, and assign `operator` only to the first user row at login**, to achieve a two-tier model where the bootstrapping user owns the platform and everyone after is a lower-privilege member, accepting a non-transactional enum migration and a count-then-insert race that is acceptable at bootstrap volume.

**Migration type**: schema (enum value addition + column default change)
**Affected tables / entities**: `user` (column `role`), type `user_role_enum` — no FKs, no data backfill
**Estimated downtime**: none — `ALTER TYPE ... ADD VALUE` and `ALTER COLUMN ... SET DEFAULT` are metadata-only, no table rewrite, no row locks
**Data volume**: `user` — a handful of rows on a self-hosted instance; no existing rows are modified by the migration (default change affects future inserts only)
**Target environment(s)**: dev now → prod when it ships (no staging env yet)

## Context

The `user` table and `user_role_enum` already exist (AgDR-0019 added the `role` column with a single `operator` value, defaulting all users to `operator`). Nothing distinguishes the platform owner from a regular user: `complete-github-login` upserts users without touching `role`, so every account is `operator`.

#63 wants an operator allowlist with first-admin bootstrap and invite-by-login. This change delivers only the **first-admin bootstrap** plus the role storage/exposure it needs; allowlist gating and invites stay in #63. The product decision (locked in the design spec): first user → `operator` (admin), everyone after → a new `member` role; role is **stored + exposed** only, with no RBAC enforcement yet (YAGNI — there are no admin-only endpoints to gate).

## Options Considered

| Option                                                                                 | Pros                                                                                                                                                                                       | Cons                                                                                                                                                                            |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Add `member` value, default `member`, assign `operator` to first user row** (chosen) | Reuses the existing `operator` value as the admin tier; one additive enum value; safe-by-default column; "first row" is a simple, dependency-free proxy for "whoever bootstrapped the App" | Non-transactional migration; theoretical count-then-insert race for two simultaneous first logins                                                                               |
| Recreate `user_role_enum` with both values                                             | Single clean type definition                                                                                                                                                               | Heavy: requires dropping/recreating the type with column rewrite + cast; needless when `ADD VALUE` is metadata-only                                                             |
| Tie admin to the GitHub account that provisioned the App                               | "Owner" is explicit, not positional                                                                                                                                                        | Must thread the provisioning actor's identity from `convert-manifest` through to login; more moving parts for no practical gain — the provisioner is the first to log in anyway |
| Add `admin` as a new top role, keep `operator` as regular                              | "admin" reads as obviously privileged                                                                                                                                                      | Flips the meaning of the already-shipped-in-dev `operator` value and the existing default; more churn for a naming preference                                                   |

## Decision

Chosen: **add `member`, default to `member`, assign `operator` to the first user**.

- Enum: `user_role_enum` gains `'member'`. `operator` remains the admin/platform-owner tier.
- Column default flips from `'operator'` to `'member'` — defaulting to admin is a privilege-escalation footgun; the safe default is the lower tier.
- Assignment: at login, inside the existing `em.transactional` block in `complete-github-login`, role = `operator` when `count(user) === 0`, else `member`. Role is set **on insert only** — `role` (and `createdAt`) are excluded from the upsert's conflict-update set, so a returning user keeps their tier on re-login.

### Non-transactional migration

`ALTER TYPE ... ADD VALUE` adds `'member'`, then `ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'member'` uses it. Postgres forbids using a freshly-added enum value within the same transaction that added it, and MikroORM's migrator wraps migrations in an all-or-nothing transaction by default. The migration therefore overrides `isTransactional()` to return `false`, so each statement runs autocommit and the `ADD VALUE` commits before the `SET DEFAULT` references it.

### Race note

`count`-then-insert inside the login transaction is not a hard uniqueness guarantee: two truly simultaneous first logins could both observe `count === 0` and both become `operator`. At bootstrap (a single operator setting up a fresh instance) this is not a realistic concern, and the worst case is two admins rather than data loss. A hard guarantee (a partial unique index allowing one `operator`) is deferred to #63 if the allowlist work needs it.

## Rollback Plan

1. `pnpm --filter api migration:down` — runs `down()`, which resets the column default to `'operator'`.
2. The `'member'` enum value is **not** dropped: Postgres cannot remove an enum value without recreating the type. Leaving an unused enum value is non-destructive and harmless, so `down()` deliberately does not attempt it. Any rows already written as `member` would need manual handling only if the value were forcibly removed — which `down()` does not do.

**Rollback tested against**: the api test harness (`global-setup.ts`) applies migrations against the test DB on every `pnpm --filter api test`; `migration:up` (and `:down`) exercised locally before merge.
**Rollback window**: unbounded — the change is additive (new enum value) plus a default flip; no existing rows are rewritten.

## Cross-Service Consumers

- **marsa-api** — sole reader/writer: `complete-github-login` assigns the role; `get-current-user` now returns it.
- **marsa-web** — consumes `role` only via the typed `/auth/me` response (generated types + Zod); never queries the table.

Deploy-order constraint: the migration must apply before the new `complete-github-login` / `get-current-user` code runs (the code reads/writes the `member` value). Standard migrate-then-deploy ordering covers this.

## Testing Plan

- **Dev smoke**: `pnpm --filter api migration:up` against local Postgres; confirm `'member'` is a valid `user_role_enum` value and the `user.role` default is `member`.
- **Unit**: first login → `operator`; second distinct user → `member`; returning user keeps prior role.
- **E2E**: `/api/v1/auth/me` body includes `role`.
- **Staging / canary**: n/a (no staging env in v0.1; no existing traffic depends on the new value).

## Observability

- **During apply**: migration command exits 0; no lock contention (metadata-only changes).
- **Post-apply**: enum has `operator` + `member`; column default is `member`; api boots; #89 tests green.
- **Alerts armed**: none specific — covered by the api boot/health check.

## Consequences

- Establishes a two-tier role model (`operator` admin / `member` default) that #63's allowlist + invite work builds on.
- Role is stored and exposed but not enforced — the first consumer of `role` (an admin-only endpoint or guard) is future work; until then the value is advisory.
- Adds an irreversible-by-design enum value; the column default flip is the only reversible part. Flagged so a future "remove member" is understood to require a type recreation, not a simple `down()`.

## Artifacts

- Ticket: marsa-cloud/marsa#89 (migration tracked via the `migration` label, per the AgDR-0013/0017 precedent). Parent: #63.
- Builds on: [AgDR-0019](AgDR-0019-user-rename-and-role-enum.md) (`role` column + enum), [AgDR-0017](AgDR-0017-migration-operator-and-oauth-state-tables.md) (the `user` table), [AgDR-0004](AgDR-0004-authentication-and-idp-strategy.md) (GitHub-numeric-id identity / forward-compat)
- Commits / PRs: filled in as the migration ships
