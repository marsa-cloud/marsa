---
id: AgDR-0007
timestamp: 2026-06-07T12:43:07Z
agent: claude
model: claude-opus-4-8
trigger: user-prompt
status: executed
ticket: marsa-cloud/marsa#58
---

# Migration: create `github_app` table for per-install GitHub App credentials

> In the context of persisting the GitHub App credentials returned by the Manifest conversion flow (#58, [AgDR-0006](AgDR-0006-github-app-credential-storage.md)), facing the need for a durable per-install store for the App id and its (encrypted) secrets, I decided to execute a **schema** migration adding the `github_app` table to achieve durable credential storage, accepting that this is the project's first entity and so also flips MikroORM out of empty-schema mode.

**Migration type**: schema
**Affected tables / entities**: `github_app` (new)
**Estimated downtime**: none — additive new table; no locks on existing data (it is the first table in the schema)
**Data volume**: ~1 row per install (single-install v0.1); negligible
**Target environment(s)**: dev-only for now → prod when v0.1 ships (no staging env yet)

## Context

#58 implements per-install GitHub App provisioning ([AgDR-0005](AgDR-0005-github-app-integration-model.md)). The Manifest conversion returns the App `id`, `slug`, `name`, `html_url`, `owner`, `client_id`, `client_secret`, `webhook_secret`, and the RSA private-key `pem`. These must survive restarts and be readable by later features (#23 mints installation tokens from the PEM), so they need a durable table. This is the **first** ORM entity in the project, so the same change removes `discovery.warnWhenNoEntities` from `mikro-orm.config.ts`.

## Options Considered

| Option                                                | Pros                                                       | Cons                                                                               |
| ----------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Dedicated `github_app` table (chosen)                 | Clear ownership; typed columns; easy to extend for #22/#23 | One more table                                                                     |
| Stash credentials in a generic key/value/config table | No new table                                               | Untyped; secrets mixed with unrelated config; awkward to query/extend              |
| Env-file / Secret only (no DB)                        | No migration                                               | Can't be written at runtime by the conversion callback; defeats the one-click flow |

## Decision

Chosen: **a dedicated `github_app` table**, because the credentials are written at runtime by the conversion callback (not config), are read by multiple future features, and benefit from typed columns. Secret columns (`client_secret_enc`, `webhook_secret_enc`, `private_key_pem_enc`) store AES-256-GCM ciphertext per [AgDR-0006](AgDR-0006-github-app-credential-storage.md); non-secret columns store plaintext.

## Rollback Plan

1. Run `pnpm --filter api migration:down` — executes the generated `down()` which runs `DROP TABLE "github_app";`.
2. Revert the `mikro-orm.config.ts` change (re-add `discovery.warnWhenNoEntities`) if rolling back the whole feature.

**Rollback tested against**: unit fixture — the api test harness (`global-setup.ts`) applies migrations against the test DB on every `pnpm --filter api test`; `migration:down` is exercised locally. No staging environment exists in v0.1.
**Rollback window**: unbounded — the table is new and isolated; dropping it is always safe (only loses the provisioned App row, which can be re-provisioned by re-running the flow).

## Cross-Service Consumers

- **marsa-api** — sole reader/writer (the conversion callback writes; #22/#23 will read).
- **none** else — no other service touches this table.

Deploy-order constraint: none.

## Testing Plan

- **Dev smoke**: `pnpm --filter api migration:up` against a local Postgres; confirm `github_app` exists with the expected columns.
- **Staging verify**: n/a (no staging env in v0.1).
- **Canary / phased rollout**: n/a (new table).

## Observability

- **During apply**: migration command exits 0; no lock contention (no existing data).
- **Post-apply**: `github_app` table present; api boots; #58 e2e tests green.
- **Alerts armed**: none specific — covered by the api boot/health check.

## Consequences

- Enables durable storage of provisioned GitHub App credentials (#58) and unblocks #22 (login) and #23 (deploy).
- Flips the project out of empty-schema mode (`discovery.warnWhenNoEntities` removed) — future entities are discovered normally.
- Establishes the encrypted-column convention (`*_enc`) for the codebase.

## Artifacts

- Ticket: marsa-cloud/marsa#58 (migration tracked on the feature ticket via the `migration` label — additive new table, zero blast radius; no separate ticket)
- Commits / PRs: filled in as the migration ships
