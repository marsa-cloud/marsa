# Attach a database to an app

Design for #207. Phase B of the v0.2 milestone, and the last feature in it. Builds directly on
#206 (`docs/superpowers/specs/2026-09-23-postgresql-database-resource-design.md`), which shipped
the database resource and the credentials Secret this reads from.

## Problem

#206 gives an environment a running PostgreSQL reachable at `<slug>`, with its connection
variables sitting in a Kubernetes Secret. Nothing wires that into an app. Today an operator would
copy the password into the app's `env`, which stores a plaintext copy in `app.env` (plain `jsonb`,
not encrypted) and leaves two values to keep in sync.

The product action is **attaching a resource**, Heroku add-on style — not a templating syntax like
Railway's `${{db.DATABASE_URL}}`. Users think in services, not in variable interpolation.

The load-bearing property: **Marsa never copies the password.** An attachment renders as
`valueFrom.secretKeyRef` pointing at the database's own Secret, which works because #142 puts both
workloads in one namespace per project × environment.

## Decisions

|                                  | Decision                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| Nature                           | Placement, not config: resolved live, applied immediately, never snapshotted onto a Release       |
| Naming                           | Alias optional; no alias means unprefixed, and a second attachment requires one                   |
| Collision with the app's own env | The attachment wins; the app's colliding entry is dropped from the manifest and flagged in the UI |
| Ownership                        | The `database` feature owns the table; routes hang off the app                                    |
| UI                               | Attach and detach on the app's page; the database's page lists dependents read-only               |
| Cluster proof                    | Manifest-level e2e now; real connectivity when #31 lands                                          |

### Placement, not config

`update-app` already draws this line: a node pin is location, so it lives on the App, is re-applied
immediately, and never reaches a Release (AgDR-0045); `env` and the image are config, ride on the
immutable Release, and come back on rollback.

An attachment is a **reference**, not a value, so it sits on the placement side. The deciding
argument is rollback: with attachments snapshotted, rolling back to a release created before the
attachment would strip `DATABASE_URL` out of a running app that needs it — breaking the app in a
way the operator never asked for. A snapshot can also name a database that has since been deleted,
so the deploy path would need a dangling-reference branch.

Accepted consequences, both inherited from the node pin: a rollback does not restore a previous
attachment set, and `hasUndeployedChanges` structurally cannot see an attachment change. #207's
acceptance criterion "injects the connection variables into the app on its next release" is
therefore reworded to "immediately, and on every subsequent deploy".

### Naming: alias optional, unprefixed by default

The first attachment injects the published variables unchanged — `DATABASE_URL`, `PGHOST`,
`PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` — which is what ORMs and frameworks look for by
default, and what Heroku and Railway both do.

A second attachment on the same app requires an alias, normalised to `UPPER_SNAKE` and used as a
prefix (`analytics` → `ANALYTICS_DATABASE_URL`). Attaching a second database without one is
rejected with a message that names the fix, since that rejection is an operator's first encounter
with aliases.

### Collision with the app's own env: the attachment wins

An app's `env` may already define `DATABASE_URL`. Kubernetes permits duplicate env entries and
silently resolves them, which is the one outcome to avoid.

The attachment wins, and the collision is resolved **before** rendering: `deploySpecOf` drops the
app's colliding entry, so the pod spec carries exactly one value for that name. The app's env
editor marks the variable as overridden by the attachment, which keeps the override visible rather
than silent.

Rejecting the conflict instead (at attach time and again in `update-app`) was considered and
dropped as more machinery than the problem needs, at the cost of an operator who must read the
badge to understand where a value comes from.

### Ownership: the `database` feature, routes on the app

Per AgDR-0040 a use-case lives with the aggregate it primarily writes, not the noun in its URL —
the same reason `view-release-index` sits under `/apps/:slug/releases` while living in `release/`.
An attachment's lifecycle is bound to the database: it is what blocks a delete, and the published
variables come from the engine catalogue. So the table and the use-cases live in `app/database/`,
while the routes hang off the app.

`app-management` owning it was rejected because it would have to import the engine catalogue and
the credentials cipher — the cross-aggregate reach the rule exists to prevent. A separate
`attachment/` feature was rejected because an attachment is not an aggregate root; it has no life
of its own once either endpoint is gone.

### UI: write from the app, read from the database

The **alias is an app-level fact** — it exists to stop two databases colliding in one app's
variables, and whether `DATABASE_URL` is free depends on that app's other attachments and its own
env. Choosing an alias while looking at a database means choosing it without the information that
makes it necessary. The conflict errors are app-scoped for the same reason, and the convention
(Heroku, Render, Railway) is to wire a database in from the consuming service.

The database's page still lists dependents, read-only — that is what makes the blocked-delete error
actionable.

### Cluster proof: manifest-level now

#207's connectivity AC needs #31, the example repo, which is empty. Marsa apps are image + port
with no command override, so no stock image both stays up with an HTTP port and connects using
`DATABASE_URL`.

The k3d stage therefore asserts the injection path end to end _except_ the final TCP hop: the
Deployment carries the variables as `secretKeyRef`, no plaintext password appears anywhere in it,
the colliding app env entry is gone, and detaching removes them. The connectivity AC moves to #31,
which is where the app that can make that hop gets built.

## Data model

New table `database_attachment`, owned by the `database` feature:

| Column          | Type                                  | Note                                  |
| --------------- | ------------------------------------- | ------------------------------------- |
| `uuid`          | pk, `uuidv7()`                        | `Uuid<'DatabaseAttachment'>` branded  |
| `app_uuid`      | fk → `app`, `onDelete: cascade`       | deleting an app drops its attachments |
| `database_uuid` | fk → `database`, `onDelete: restrict` | this is what blocks a database delete |
| `alias`         | `varchar(63)`, nullable               | null is the unprefixed attachment     |
| timestamps      |                                       |                                       |

Two unique constraints carry the naming rules at the database level rather than in application
code:

- `(app_uuid, alias)` — a second unprefixed attachment is impossible, since both would have a null
  alias. **Note:** Postgres treats nulls as distinct in a plain unique index, so this is a unique
  index on `(app_uuid, coalesce(alias, ''))`, or an equivalent `nulls not distinct` index. The
  migration must use one of those forms; a naive `unique(app_uuid, alias)` silently allows two
  unprefixed attachments.
- `(app_uuid, database_uuid)` — the same database cannot be attached twice to one app.

Two shared queries in the same feature: `selectAttachmentsForApp(tx, appUuid)`, joining through to
the database row, and `dependentAppsOf(tx, databaseUuid)` for the 409 body and the Used-by list.

The migration is additive — one table, two indexes — and reverses with a `DROP TABLE`.

## Endpoints and flows

**`attach-database`** — `POST /v1/apps/:slug/attachments`, body `{ databaseSlug, alias? }`. One
transaction, runtime call last (AgDR-0047):

1. Lock the app row; 404 when there is no such app.
2. Load the database by slug **within the app's environment**. A database in another environment
   reads as not-found rather than forbidden — a prod app should not learn that a staging database
   exists. This is the same-environment rule from #207, and it is consistent with #146's
   default-deny NetworkPolicy, which allows intra-namespace traffic only.
3. Validate the alias against `^[a-z][a-z0-9-]*$` and normalise it to `UPPER_SNAKE` for the prefix.
   Omitted means unprefixed.
4. Insert. The unique constraints surface both conflicts as 409 with messages that name the fix
   ("this app already has an unprefixed database attached — pass an alias, e.g. `analytics`").
5. Re-apply the live release, last. An app that has never deployed has nothing live to patch, and
   the variables land on its first deploy — exactly how a node pin behaves.

**`detach-database`** — `DELETE /v1/apps/:slug/attachments/:databaseSlug`, 204. Keyed by database
slug rather than alias, because the unprefixed attachment's alias is null and cannot address
itself. Deletes the row, then re-applies, which removes the variables and restarts the pod.
Detaching a database an app is using will break that app; the UI confirms, the API does not
second-guess.

**`delete-database` gains a 409.** The `onDelete: restrict` FK is the mechanism: the use-case
catches the violation and answers 409 listing the dependent apps, rather than pre-checking and
racing a concurrent attach.

**Injection lives in `deploySpecOf`**, so every path that reaches the runtime is covered:
`deploy-release`, `update-app`'s re-apply, and the two new use-cases. Each of those repositories
loads the app's attachments alongside the release. That is `release/` and `app-management/`
importing the `database` feature's `queries/`, which the building-block rule allows in either
direction.

Both rules — alias prefixing and the env override — are pure functions over (app env, attachments)
inside `deploySpecOf`, so they are unit-testable without a cluster and cannot drift between call
sites.

## Runtime port and rendering

The port does not learn Kubernetes naming. `AppDeploySpec` carries intent:

```ts
export interface AttachedDatabaseSpec {
  databaseSlug: string
  envPrefix: string | null // 'ANALYTICS_', or null for the unprefixed attachment
  keys: string[] // published variable names, from the engine catalogue
}
```

plus `attachments: AttachedDatabaseSpec[]`. The Kubernetes adapter expands each into
`secretKeyRef` entries against `credentialsSecretName(databaseSlug)` — the helper #206 already owns
— naming each variable `${envPrefix ?? ''}${key}`. The feature decides what is attached and under
which names; the adapter alone decides that this means a Secret called `<slug>-credentials`.

An app with one unprefixed attachment and one aliased `analytics` therefore gets twelve env
entries, all `valueFrom`. The password appears in no Deployment, no app row and no API response.

Two smaller changes fall out:

- **`SecretEnvRef` moves up** from the persistent-workload renderer (#206) to `runtime.types.ts`,
  since both renderers now need the shape. No behaviour change, one fewer duplicate type.
- **`render-manifests` gains one mapping step**: plain `env` entries, then the expanded secret
  refs. The collision rule already removed any duplicate name upstream, so the renderer never
  reasons about precedence.

## Web UI

`/apps/[slug]` gains a **Databases** card: one row per attachment showing the database, its alias
and the variable names it injects, with a detach button behind a confirmation that states plainly
that the app will restart. "Attach database" opens a modal listing the databases in that app's
environment, plus an optional alias field.

That list needs a filtered read, so `GET /v1/databases` gains an optional `environmentUuid` query
filter rather than the page filtering a paginated list client-side.

In the app's env editor, a variable an attachment overrides carries a badge saying so — this is
what keeps the override from being silent.

`/databases/[slug]` gains the read-only **Used by** list, and the blocked-delete 409 renders as
"still attached to `api`, `worker`" with links to those apps.

## Testing

| Layer                 | Covers                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit — `deploySpecOf` | Prefixing, the unprefixed case, collision dropping the app's own entry, two attachments coexisting                                                                              |
| Unit — use-cases      | 404 app; unknown or cross-environment database; duplicate attachment; second unprefixed attachment; no live release means no runtime call; a runtime failure rolls the row back |
| Unit — renderer       | Every injected variable is `valueFrom`; no plaintext in the Deployment                                                                                                          |
| API e2e               | Attach, then the app's attachments list shows it; both 409s; detach; `DELETE` on an attached database is 409 naming the dependents                                              |
| Web                   | The card, the modal's alias flow, the override badge, the dependents list                                                                                                       |
| k3d                   | `secretKeyRef` present, no plaintext, colliding env entry dropped, all gone after detach                                                                                        |

Coverage gates hold on both suites.

## Delivery

Branched off `feature/206-database-resource`, so the PR targets that branch, not `main`; once #235
merges it is retargeted to `main` and rebased.

Commit sequence:

1. Port types + `SecretEnvRef` move + renderer expansion
2. `database_attachment` table, migration, shared queries
3. `deploySpecOf` injection, with the three existing call sites loading attachments
4. `attach-database` and `detach-database`, plus the `delete-database` 409
5. `environmentUuid` filter on the database index, contract regeneration
6. Web UI
7. k3d e2e assertions

## Out of scope

| Deferred                                                               | Ticket                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------ |
| Credential rotation restarting dependents                              | #234                                                   |
| The real app-talks-to-database e2e                                     | #31                                                    |
| External access, password reveal                                       | #233                                                   |
| Reference syntax (`${{db.DATABASE_URL}}`) as a power-user escape hatch | Future; the resolver built here is the same either way |

## Risks

- **Detaching breaks a running app** by design. The confirmation has to say so; there is no dry run.
- **The unique index on a nullable alias** is the one place a naive migration silently does the
  wrong thing (see Data model).
- **Three existing deploy paths change** to load attachments. A path that forgets to would deploy
  an app without its variables — covered by asserting injection through `deploy-release` and
  `update-app`, not only through the attach use-case.
