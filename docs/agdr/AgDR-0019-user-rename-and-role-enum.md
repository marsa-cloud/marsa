---
id: AgDR-0019
timestamp: 2026-06-18T10:56:00Z
agent: claude
model: claude-sonnet-4-6
trigger: pr-review
status: executed
ticket: marsa-cloud/marsa#62
---

# Rename `operator` → `user` + add a `role` enum column

> In the context of PR #80's review (#62), facing the fact that "operator" reads
> as an unnecessarily narrow/operational term for what is simply the dashboard's
> authenticated account, and that nothing yet distinguishes one authenticated
> account from another, we decided to rename the entity/table from `Operator`/
> `operator` to `User`/`users` and add a `role` enum column (default
> `'operator'`), to align naming with how the rest of the product will talk
> about accounts and to give the authorization layer (#63's allowlist) a column
> to key off, accepting a mechanical rename across the entity, migration,
> session field, and module path, plus the introduction of the repo's first
> `@Enum` column.

## Context

- `Operator` (entity), `operator` (table), `operatorUuid` (session field) were
  named for #62's narrow scope: "the account that logs in." #63 (allowlist +
  first-admin bootstrap) will need to distinguish privilege levels on that same
  row — an `Operator`-named entity reads oddly once it also represents
  non-operator roles.
- AgDR-0004's v0.1 scoping explicitly treats this whole auth slice as throwaway,
  replaced wholesale at the v0.2 Zitadel cutover — there are no existing
  consumers of the `operator` name outside this feature (no other table has an
  FK to it; `apps/web` only sees the HTTP/session contract, not the table name),
  so the rename has zero blast radius outside `apps/api/src/app/auth`.
- `grep -rn "@Enum" apps/api/src` returns nothing — no enum-column precedent
  exists yet in the MikroORM schema. This is a new pattern, evaluated here
  alongside the rename since both land in the same migration.
- Postgres reserves `user` as a keyword; the table must be `users`, not `user`,
  to avoid having to quote every reference.

## Options Considered

| Decision            | Options                                                                                                  | Chosen  | Why                                                                                                                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entity/table name   | (a) keep `Operator`/`operator`; (b) rename to `User`/`users`                                             | **(b)** | "Operator" was a v0.1 naming accident, not a deliberate domain term; "User" is what every consumer of this row will actually call it from #63 onward                                                                         |
| Role representation | (a) no role column yet, defer to #63; (b) add `role` as a Postgres enum column now, default `'operator'` | **(b)** | The migration is already touching this table in this PR; adding the column now means #63 doesn't need its own migration just to add one column, and a sensible default keeps existing/new rows valid without a backfill step |
| Enum mechanism      | (a) MikroORM `@Enum()` decorator (native Postgres enum type); (b) plain `varchar` + app-level validation | **(a)** | `@Enum()` gets DB-level constraint enforcement for free and is the MikroORM-idiomatic way to model a closed set of string values; a `varchar` would silently accept any string                                               |

## Decision

Chosen: rename to **`User`/`users`** + add **`role`** as a MikroORM `@Enum()` column.

- `operator.entity.ts` → `user.entity.ts`: `class User`, `@Entity({ tableName: 'users' })`, new `role: UserRole = UserRole.Operator` field via `@Enum(() => UserRole)`. `UserRole` enum starts with a single member, `Operator`, sized to what #62 actually needs — `#63` adds further roles when the allowlist work defines them.
- `operator.builder.ts` → `user.builder.ts`.
- The migration (`Migration20260616192413.ts`, already gated under #62 per AgDR-0017) is edited in place — not a new migration — since it has not shipped to any deployed environment yet (dev-only per AgDR-0017's target-environment note): `CREATE TABLE "operator"` → `CREATE TABLE "users"`, plus the new `role` enum type + column with a `DEFAULT 'operator'`.
- A new `src/app/user/` module houses `User`, `UserBuilder`, the renamed get-current-user use-case/controller/repository/response, and the `@CurrentUser()` decorator (AgDR scope: see workstream WS4 in the PR plan; decorator itself doesn't need its own AgDR — it's additive sugar over the existing session read, not a new architectural pattern).
- The session field `operatorUuid` → `userUuid` (typed `Uuid` per AgDR-0018) across `auth-session.types.ts`, the complete-login controller's `session.set`, the session-auth guard, and the new `@CurrentUser()` decorator.
- The forward-compat comment block in the old `operator.entity.ts` (referencing AgDR-0004's "no real users yet, safe to blow up the table" framing) is dropped — it described the entity's own throwaway status, which the rename + role addition now supersede with a clearer story.

## Consequences

- One mechanical rename touches the migration, the entity, the builder, the session type, the guard, the complete-login controller, and the new user module — all within `apps/api/src/app/auth` + the new `apps/api/src/app/user`, with zero external consumers affected.
- `users` (not `user`) avoids Postgres's reserved-keyword quoting tax going forward.
- `UserRole` is intentionally minimal (one member) — this AgDR does not attempt to design #63's full role model, only the column shape it will extend.
- Editing the already-merged `Migration20260616192413.ts` in place (rather than a new migration) is safe only because it has not run against any shared/deployed environment (per AgDR-0017's "dev-only for now" target). Future migrations to this table after this PR ships must be additive `ALTER TABLE` migrations, not further in-place edits.

## Artifacts

- Ticket: marsa-cloud/marsa#62 (PR #80 review response)
- Related: [AgDR-0004](AgDR-0004-authentication-and-idp-strategy.md) (v0.1 throwaway scoping that licenses the in-place migration edit), [AgDR-0017](AgDR-0017-migration-operator-and-oauth-state-tables.md) (the migration this edits — corrected alongside this AgDR), [AgDR-0018](AgDR-0018-branded-uuid-type.md) (the `Uuid` type applied to `users.uuid` and `userUuid`)
- Forward reference: marsa-cloud/marsa#63 (allowlist/first-admin — the next consumer of `role`)
