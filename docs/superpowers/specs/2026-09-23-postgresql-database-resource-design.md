# PostgreSQL as a first-class resource

Design for #206, which absorbs #205 (persistent app runtime primitive). Phase B of the v0.2
milestone: deployment of stateful workloads.

## Problem

Marsa deploys one workload shape: `Deployment` + `Service` + Traefik `IngressRoute` + KEDA
`HTTPScaledObject`, with KEDA owning the replica count (AgDR-0043). A database breaks that shape
in two places. It speaks TCP rather than HTTP, so the KEDA HTTP interceptor can never see or wake
it (#203), and it needs a disk. `local-path`, the storage class K3s bundles, is ReadWriteOnce per
node, so a `Deployment` rolling update can let a new pod mount the volume while the old one is
still writing to it. For a database that is corruption.

Users should add a _PostgreSQL_, not a "stateful app" (#25). The persistent workload shape is an
internal primitive; the product surface is a database.

## Decisions

Each row was settled during brainstorming; the reasoning is inline below.

|                 | Decision                                                                           |
| --------------- | ---------------------------------------------------------------------------------- |
| Aggregate       | Its own `database` table and `DatabaseRuntime` port, not an `App` row with volumes |
| Generality      | A `database` aggregate with an `engine` enum, Postgres-only catalogue              |
| Node pin        | Set at creation, immutable afterwards                                              |
| Lifecycle       | No releases, no persisted status; status is read live                              |
| Naming          | Slug unique globally, and per environment across apps _and_ databases              |
| Password reveal | Not shipped — deferred whole to #233                                               |
| Image           | Catalogue pins an exact tag per major; the row stores the resolved image           |
| Role            | Superuser `postgres`; the app database is the slug                                 |
| UI              | `/databases` mirrors `/apps`                                                       |
| Delivery        | One PR; #205 closes as absorbed                                                    |

### Aggregate: its own table and port

The `app` row is shaped for HTTP apps — a required `domain`, KEDA-owned `minReplicas`/
`maxReplicas`, a `host` in `AppDeploySpec`, an IngressRoute and an `HTTPScaledObject`. Storing a
database there means a branch at every one of those points plus columns that are permanently null.
A separate aggregate keeps the app deploy path unchanged.

The consequence is that #205's `App.volumes[]` is not built. Nothing would create such a row: the
primitive's only consumer is the database. A later "Application → Advanced → persistent storage"
ticket reuses the same renderer from `AppRuntime`, which is also how SQLite-style apps (a file
inside the app's own process, not a service) will eventually work.

### Generality: `database` with an `engine` enum

MySQL, Redis and MongoDB fit the aggregate unchanged. MinIO does not — it is an object store with
credentials and published variables, so it fits the _catalogue_, but not the name `database`. That
is accepted: when MinIO arrives it either lives under `/databases` or becomes its own aggregate and
#207's attachment model is generalised at that point.

Adding a second engine costs one catalogue entry, its tests and a UI option. The per-engine cost
that grows is elsewhere: backups (#208) need `pg_dump` vs `mysqldump` vs an RDB copy.

### Node pin: set at creation, immutable

A `local-path` PV takes a node affinity for whichever node its pod first lands on. After that bind
the volume pins the pod, so a later pin change is either a no-op (the new set still contains the
bound node) or a permanent `Pending` (it does not). Moving a database means dump, recreate, restore
— the #209 runbook. Only the first placement is a real choice, so that is the only one offered.

The #143 spec already extracted `buildNodeAffinity` out of the Deployment literal for this.

### Lifecycle: no releases, status read live

The `database` row _is_ its config. Create inserts the row and provisions; delete removes both.
There is no snapshot to roll back to, and rolling a database's image backwards while keeping its
data is dangerous rather than useful.

Status is therefore read live from the cluster on each request — `Provisioning`, `Ready`, `Failed`
or `NotFound` — and never persisted. This avoids the reconcile-on-read machinery apps need
(#198/#213), where a `GET` writes.

`provision()` is a server-side apply, so it only fails synchronously when the API server rejects
the manifests; that rolls the transaction back and leaves no orphan row. A pod that crash-loops
afterwards leaves a row whose live status reads `Failed`, and the operator deletes and retries.

### Naming: unique per environment, across both kinds

A database's Service shares a namespace with the environment's apps, so an app and a database
cannot both be called `api`. The invariant belongs to the environment, not to either feature
folder, so it lives as a shared query that checks both tables. `app.slug` keeps its global unique
constraint, because it still forms the public host. `database.slug` is unique globally too,
because `GET` / `DELETE /databases/:slug` look a row up by slug alone; moving routes to UUIDs is
#241.

A slug is a DNS-1035 label — it must start with a letter, because it names a Service. A database
slug is at most 52 characters, so the StatefulSet's `controller-revision-hash` label value
(`<name>-<hash>`) stays within 63.

In-cluster hostname is the bare slug (`orders.acme-staging.svc.cluster.local`), which is what
`PGHOST` will contain. No `pg-` prefix: that would leak an implementation detail into a value users
type, and changing it later would mean migrating data.

### Password reveal: deferred whole to #233

Apps get credentials by attachment (#207), never by copy. Humans still need the password for
`psql`, a GUI client or a laptop-run migration — but doing that today means `kubectl port-forward`,
since external TCP access is out of scope for v0.2 (#25). Shipping a reveal button plus a
`kubectl` snippet here would be built and then removed by the ticket that makes external access
real, so the whole concern moves to #233: external access, reveal endpoint and copyable connection
string together.

The detail view therefore shows no connection details at all: host, port, user and database are
all derivable from the slug, and #233 brings the complete view, password included.

### Image: exact tag per major, resolved at creation

The catalogue maps `17 → postgres:17.11`; the row stores `postgres:17.11`. A Marsa release that
bumps the catalogue does not move existing databases — that is #234's "bump minor" action. Nothing
changes under a running database without an explicit action, and a reschedule is deterministic.

The data path is per **major**, not per engine: the official image moved `PGDATA` to
`/var/lib/postgresql/18/docker` in 18 (with the VOLUME at `/var/lib/postgresql`), while 16 and 17
use `/var/lib/postgresql/data`.

### Role: superuser `postgres`

`CREATE EXTENSION` (pgvector, postgis, pg_trgm) and ORM tooling that creates databases (Prisma's
shadow database, per-worker test databases) both need it, and it is the only role the official
image creates, so there is no init script and one password to store. A per-attachment least-
privilege role remains possible later, on top of #207.

`PGDATABASE` is the slug with hyphens replaced by underscores.

### Delivery: one PR

#205 has no caller until #206 exists, and its acceptance criteria (data survives a restart,
deleting removes the PVC) can only be exercised through a consumer. Two PRs would mean designing
the port twice. #205 closes as absorbed; the commit sequence below keeps review tractable.

## Architecture

Three layers, each independently testable.

### 1. Persistent-workload renderer (adapter-internal)

`modules/runtime/adapters/kubernetes/persistent/render-persistent-workload.ts` takes a spec — name,
image, port, env, env-from-secret, volume size and mount path, storage class, node affinity — and
returns a `StatefulSet` and a `ClusterIP` `Service`. No IngressRoute, no `HTTPScaledObject`,
`replicas: 1`. It knows nothing about Postgres or about databases.

### 2. `DatabaseRuntime` port

`modules/runtime/database-runtime.ts`, wired like `AppRuntime` (AgDR-0046) with Kubernetes and mock
adapters, so the test harness stays network-free.

```ts
abstract provision(ref: DatabaseRef, spec: DatabaseDeploySpec): Promise<void>
abstract destroy(ref: DatabaseRef): Promise<void>
abstract readStatus(ref: DatabaseRef): Promise<DatabaseStatus>
```

`DatabaseRef extends EnvironmentRef` with `{ database: { slug } }`, mirroring `AppRef`.
`provision()` calls `EnvironmentRuntime.provision()` first, so a hand-deleted namespace heals, then
applies the credentials Secret before the StatefulSet — the pod must not schedule ahead of the
Secret it mounts (#99).

### 3. `database` aggregate

`app/database-management/` in the #227 feature-folder taxonomy: `entities/` (table, branded uuid,
builder), `catalogue/` (engine catalogue; making it data-driven is #243), `use-cases/` (`create-database`, `delete-database`, `view-database-index`,
`view-database-detail`).

The catalogue is a typed record keyed by engine and major, holding image, data path, port, the
credential env mapping and the published-variable template. Postgres-only: 16, 17, 18.

## Data model

New `database` table:

| Column             | Type                                     | Note                                                   |
| ------------------ | ---------------------------------------- | ------------------------------------------------------ |
| `uuid`             | `uuid` pk, `uuidv7()`                    | `Uuid<'Database'>` branded                             |
| `environment_uuid` | fk → `environment`, `onDelete: restrict` | as `app`                                               |
| `slug`             | `varchar(52)`                            | unique                                                 |
| `engine`           | enum `database_engine`                   | `postgres` only                                        |
| `version`          | `varchar`                                | major: `16` / `17` / `18`                              |
| `image`            | `varchar(255)`                           | resolved at creation, e.g. `postgres:17.11`            |
| `credentials_enc`  | `text`                                   | sealed `{ user, password, database }`, AgDR-0036 shape |
| `storage_gib`      | `integer`                                | recorded, not enforced (#209)                          |
| `node_pin`         | `jsonb`                                  | immutable after creation                               |
| timestamps         |                                          |                                                        |

No status column and no release table. Published variables are derived from the catalogue and the
row, never stored.

The migration is additive — one table, one enum, no changes to existing columns — and reverses with
a `DROP TABLE`. It ships in this PR without a separate migration ticket or migration AgDR.

### Cross-kind name uniqueness

No unique index can span `app` and `database`, so the check is explicit:
`app/environment/queries/name-taken-in-environment.ts` reads both tables. `create-database` and
`create-app` each call it inside their transaction, after `SELECT … FOR UPDATE` on the environment
row, so concurrent creates cannot both win. Neither feature folder reaches into the other's table
(AgDR-0040 aggregate ownership).

`create-app` keeps its existing constraint-based `slug-taken` path and gains this check on top;
its tests grow a case.

## Use-case flows

**`create-database`** (`POST /databases`) — one transaction, runtime call last (AgDR-0047):

1. Validate: slug shape, `engine` + `version` in the catalogue, `storageGib` within bounds,
   optional `nodePin`.
2. Lock the environment row; reject a name already taken by an app or database there.
3. Generate credentials — user `postgres`, database = slug with underscores, password = 32 random
   bytes in hex (URL-safe, so `DATABASE_URL` needs no escaping) — seal them, insert the row with
   the catalogue-resolved image.
4. `DatabaseRuntime.provision()` last. A failure rolls the transaction back and surfaces as
   `BadGatewayException`, matching `delete-app`'s wording.

**`delete-database`** (`DELETE /databases/:slug`) mirrors `delete-app`: find in the transaction,
delete the row, then `destroy()` last. Typed confirmation is enforced in the UI. #207 later adds
the "blocked while attachments exist" check here.

**`view-database-index`** (`GET /databases`) — rows plus a live status each, paginated like apps.

**`view-database-detail`** (`GET /databases/:slug`) — row and live status. No connection details
and no password (#233), so the read never decrypts the credentials.

**`readStatus`** reads the StatefulSet and maps `readyReplicas` plus the newest pod's waiting
reason to `Provisioning` / `Ready` / `Failed` / `NotFound`, reusing `extract-deploy-failure` for
`ImagePullBackOff` and `CrashLoopBackOff`. `NotFound` is absence of observation, never a state, so
the #98 false-negative trap does not apply.

## Kubernetes rendering

For a Postgres 17 database `orders` in namespace `acme-staging`:

- **Secret `orders-credentials`** — keys `DATABASE_URL`, `PGHOST`, `PGPORT`, `PGUSER`,
  `PGPASSWORD`, `PGDATABASE`, fully composed. #207 then needs only a `secretKeyRef` per key, and an
  alias renames the env var rather than composing a value, so the `$(VAR)` expansion trick in
  #207's body is unnecessary.
- **StatefulSet `orders`** — `replicas: 1`, `serviceName: orders`, image `postgres:17.11`.
  - `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` come from the Secret (`secretKeyRef`),
    so no credential appears in the pod spec. `PGDATA` is a plain `env` value.
  - `volumeClaimTemplates: [{ name: data, storage: <n>Gi, storageClassName: <configured> }]`
    mounted at the catalogue's data path.
  - `PGDATA` points at a subdirectory of the mount, because a `local-path` directory can hold
    entries Postgres refuses to initialise into.
  - `persistentVolumeClaimRetentionPolicy: { whenDeleted: Delete, whenScaled: Delete }` — GA in
    Kubernetes 1.32; K3s targets 1.33+ (`docs/hardening.md`).
  - Readiness `exec: pg_isready -h 127.0.0.1 -U postgres`, over TCP because `initdb`'s temporary
    server listens on the Unix socket only; a plain TCP readiness probe would call Postgres ready
    while it is still recovering. Liveness is TCP, held off by a TCP startup probe (5 s × 60) so
    `initdb` and crash recovery are not killed.
  - `affinity` from the shared `buildNodeAffinity`.
- **Service `orders`** — `ClusterIP`, port 5432, no IngressRoute and no `HTTPScaledObject`.

**Teardown order** in `destroy()`: StatefulSet, Service, Secret, then any PVC the retention policy
leaves behind — deleted explicitly and idempotently so a partial teardown can be retried.

**Config:** `MARSA_DATABASE_STORAGE_CLASS`, Joi-validated in `env.config.ts`, defaulting to
`local-path` and surfaced as a chart value. Never hardcoded: a volume cannot change storage class
in place (#210).

## Web UI

Mirrors `/apps`, reusing `ProjectEnvironmentPicker` and `NodePinPicker`:

- `/databases` — index with status per row
- `/databases/new` — engine → major → storage size → environment → optional node pin
- `/databases/[slug]` — status, details, delete behind typed confirmation

A sidebar entry sits next to Apps. #217 can later regroup both under an environment without either
page changing much. The create form states that the requested size is recorded but not enforced by
`local-path`.

## Testing

| Layer         | Covers                                                                                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renderer unit | StatefulSet/Service/PVC shape, retention policy, storage class, `PGDATA` subdirectory, per-major data path (16/17 vs 18), node affinity, absence of IngressRoute and `HTTPScaledObject` |
| Adapter unit  | Secret applied before StatefulSet; `destroy` idempotent and 404-tolerant; `readStatus` mapping                                                                                          |
| Use-case unit | Create rolls back on runtime failure; collision with an existing app rejected; unknown engine-major rejected; delete calls `destroy` last                                               |
| API e2e       | Least-mocks harness with the mock runtime: create → list → detail → delete; no password in any response; a slug another environment uses is rejected                                    |
| Web           | Component tests for the create form and detail view; types and Zod regenerated from `openapi.json`                                                                                      |
| k3d e2e       | Provision Postgres, `psql` an insert, delete the pod, confirm the row survives, delete the database, confirm StatefulSet, Service, Secret and PVC are gone                              |

Coverage gates hold on both suites.

## Delivery

Commit sequence inside the single PR:

1. Renderer and its unit tests (no callers yet)
2. `DatabaseRuntime` port, Kubernetes and mock adapters, config env var
3. Migration, table, catalogue, builder
4. Use-cases, controllers, responses, regenerated `openapi.json`
5. Web pages and components
6. k3d e2e assertions and docs

## Out of scope

| Deferred                                            | Ticket                                |
| --------------------------------------------------- | ------------------------------------- |
| Attaching a database to an app                      | #207                                  |
| Backups                                             | #208                                  |
| Credential rotation, minor-version bump             | #234                                  |
| External access, password reveal, connection string | #233                                  |
| Major-version upgrade runbook, storage docs         | #209                                  |
| Arbitrary stateful _apps_ (MinIO, SQLite)           | Later "Advanced → persistent storage" |
| Scale-to-zero for databases                         | #203                                  |

## Risks

- **The PR is large.** Accepted; the commit sequence is the mitigation.
- **`local-path` ignores the requested size** and cannot resize. The UI says so; #209 documents it.
- **A `Required` node pin on an unschedulable node** leaves the database `Pending`, reported as
  `Provisioning` until the operator deletes it.
- **#228** (e2e cannot test harness and contract PRs) bites here, since this PR changes
  `openapi.json` and the e2e script together. Known friction, not fixed here.
