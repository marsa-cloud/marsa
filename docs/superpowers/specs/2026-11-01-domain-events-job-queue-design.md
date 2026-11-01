# Domain events and a job queue

Design for #245. Decision record: `docs/agdr/AgDR-0051-domain-events-and-pg-boss-job-queue.md`.

## Why

Every use-case that touches the cluster today follows AgDR-0047: one transaction, runtime call
last, roll back on failure. That rule caused most of the open fix/refactor work:

- **Row locks held across slow external calls.** `complete-build` holds the build and app rows
  `FOR UPDATE` across `appRuntime.deploy`.
- **Features reaching into each other's runtime ports.** `delete-app` destroys cluster objects,
  cancels builds and deletes registry images itself.
- **Hand-written cleanup per use-case** after a partial failure (#240).
- **Logic duplicated across paths.** #264 bug 1: five redeploy paths, one missed the pull-secret
  fallback.
- **Races between steps.** #264 bug 2 / #267: BuildKit pushes after the repository is deleted.

## Decisions

| #   | Decision                                                                                                                                                                                                               | Rejected                                                                                                                                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **pg-boss** (12.x) is the job queue. Jobs are inserted in the caller's Drizzle transaction via `fromDrizzle(tx, sql)`, so the job table is the outbox.                                                                 | BullMQ: needs Redis, and since Redis can't join a Postgres transaction it would also need an outbox table and relay. A future caching Redis would want eviction, which BullMQ forbids (`noeviction`). graphile-worker: works, but has no Nest integration and is more opinionated. |
| D2  | **Cluster-changing endpoints are async.** Validate synchronously (404/409/422), commit state and jobs, return `202`. The outcome is reported on the resource's state.                                                  | Synchronous endpoints with async cleanup only: keeps the long locks and #198/#213.                                                                                                                                                                                                 |
| D3  | **Domain events → subscribers → jobs.** A use-case emits events in its transaction. Subscribers owned by other features run in that same transaction and may only write rows or send jobs.                             | Use-cases sending jobs directly: the coupling only moves into the job handler.                                                                                                                                                                                                     |
| D4  | **This PR series builds the foundation and moves `delete-app` over.** Other use-cases move when they're touched (#240, #198/#213, `complete-build`, #249).                                                             | A throwaway spike; moving everything at once.                                                                                                                                                                                                                                      |
| D5  | **A deleting app keeps its row** until cleanup finishes, so the slug stays reserved.                                                                                                                                   | Hard-delete immediately: a new app reusing the slug would have its resources destroyed by the old app's cleanup.                                                                                                                                                                   |
| D6  | **Recurring cluster-wide work uses `boss.schedule`** (once per cluster, retried, recorded). `@nestjs/schedule` stays only for `BuildSweeper` (5 s, below pg-boss's one-minute cron resolution) until #198 replaces it. | `@Cron` for new recurring work: fires on every replica.                                                                                                                                                                                                                            |

## Components

### `src/modules/jobs`: the queue

- **`JobQueueModule`**
  - Builds one `PgBoss` from the existing `DATABASE_URL` + `DB_NAME`, using the `pgboss` schema.
    pg-boss migrates its own schema on `start()`; Drizzle never touches it.
  - Calls `start()` on application bootstrap and `stop({ graceful: true })` on shutdown.
- **`Job<TPayload>` base class.** Each job type is a subclass with `static queue` (one queue per
  type, so payloads are typed) and `static options` (`retryLimit`, `retryDelay`, `retryBackoff`,
  `expireInSeconds`, `deadLetter`, `policy`).
- **`JobScheduler.send(tx, job, overrides?)`**
  - Calls `boss.send(queue, payload, { ...options, db: fromDrizzle(tx, sql) })`.
  - `tx` is a required parameter of type `Transaction`, so a job can't be sent outside a
    transaction.
- **`@JobHandler(JobClass)`** marks an injectable class with `handle(payload, job)`. On bootstrap,
  `DiscoveryService` finds every handler, calls `createQueue` with the class options, and, when
  workers are enabled, calls `work`.
- **`JOBS_WORKER_ENABLED`** (default `true`; `false` in `.env.test`).
  - Workers run in the api process, because the demo node has 2 vCPU.
  - A separate worker Deployment later is the same image with an `entrypoints/worker.ts` that
    starts only the handlers. Nothing in this series depends on that split.

### `src/modules/domain-events`: the emitter

- **`DomainEvent<TContent>`** base class, one subclass per event (`AppDeletionRequested`, …).
- **`DomainEventEmitter.emit(tx, events)`** runs every `@Subscribe(EventClass)` handler
  sequentially with the same `tx`, awaiting each. A throw propagates and rolls back the caller.
- **The subscriber rule:** a subscriber reads/writes rows through its own feature's repositories
  and/or calls `JobScheduler.send(tx, …)`. It never calls a runtime port, GitHub, or the
  registry.
- Events are not persisted. An activity log can be added later as one more subscriber.

## `delete-app` flow

### Schema

Three new nullable columns on `app`:

- `deletion_requested_at timestamptz`
- `deletion_failed_at timestamptz`
- `deletion_error text`

The API derives `state: 'active' | 'deleting' | 'deletion_failed'` from them and returns it on the
app detail and list responses.

### Request: `DELETE /apps/:slug` → `202`

All in one transaction:

1. Lock the app row `FOR UPDATE`. If it's missing → 404.
2. Branch on the deletion state:
   - **Already `deleting`** → return 202 without emitting again.
   - **`deletion_failed`** → clear `deletion_failed_at` / `deletion_error` and continue
     (this is the retry path).
   - **Otherwise** → set `deletion_requested_at = now()`.
3. `emit(tx, [new AppDeletionRequested({ appUuid, slug, placement })])`. Then commit.

### Guard

Every write on an app checks the deletion state under the app row lock and returns
`409 App '<slug>' is being deleted.` The write paths are deploy, redeploy, update, attach,
detach, manual rebuild and start-build. A push webhook for a deleting app is ignored. This guard,
plus the build-cancel step, is what prevents a build from starting or pushing after cleanup
began.

### Cleanup chain

Each step is one job, owned by the feature that owns the resource:

| Step | Job (owner)                                                                  | Runs                                                                            | Emits in its tx       |
| ---- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------- |
| 1    | `DestroyAppRuntimeJob` (app-management)                                      | `appRuntime.destroy(placement)`                                                 | `AppRuntimeDestroyed` |
| 2    | `CancelAppBuildsJob` (build-management)                                      | Cancels each running build, waits until its pods are gone, marks it `cancelled` | `AppBuildsCancelled`  |
| 3    | `DeleteAppRepositoryJob` (build-management, which owns the images it builds) | `imageRegistry.deleteRepository(slug)`                                          | `AppImagesDeleted`    |
| 4    | `FinalizeAppDeletionJob` (app-management)                                    | Hard-deletes the app row and its history                                        | —                     |

- **How steps hand off:** the subscribers are the only links between steps. For example,
  build-management subscribes to `AppRuntimeDestroyed` and sends `CancelAppBuildsJob`.
- **No cross-feature imports:** after this change, app-management no longer imports `BuildRuntime`
  or `ImageRegistry`.
- **Why the steps run in sequence:** step 3 must follow step 2. Running steps 1 and 2 in parallel
  would need a join before step 4; a sequence needs no shared state.
- **Step 1 goes first** so the app stops serving as soon as possible.
- **Payloads:** every job carries `{ appUuid, slug, placement }`, so no step re-derives the
  placement.
- **#267 is fixed in step 2.** The build pod is rendered with `terminationGracePeriodSeconds: 1`,
  and cancel is: Foreground-delete the Job, then wait for the Job and its pods to be gone. The
  wait is capped below the job's `expireInSeconds`, and a timeout throws, which triggers a retry.

## Error handling

**Every step is idempotent**, so a retry is always safe:

- Step 1 treats not-found as success.
- Step 2 does nothing if no build is running.
- Step 3 treats a 404 as success.
- Step 4 does nothing if the row is already gone.

**Transient failures** are retried by each deletion queue's options:

- `retryLimit: 5`, `retryDelay: 5`, `retryBackoff: true`, `retryDelayMax: 120`.
- `expireInSeconds: 120` for step 2; 60 for the others.
- If the process crashes mid-job, the job expires and is retried.
- `stop({ graceful: true })` lets active jobs finish during a rolling api deploy.

**Permanent failure:**

- Every deletion queue sets `deadLetter: 'app-deletion-failed'`.
- That queue's handler (app-management) writes `deletion_failed_at` and
  `deletion_error = '<step>: <message>'` on the app row.
- The app stays guarded (409 on writes), and the slug stays reserved.
- `DELETE` again is the retry: it restarts the chain from step 1.

**A subscriber throwing is a bug,** not a runtime failure. The use-case rolls back and responds
with 500.

**Visibility:** failed jobs remain in `pgboss.job` until pg-boss retention removes them. Handler
errors are logged with the queue and job id. The `@pg-boss/dashboard` is out of scope.

## Web

- **List:** a deleting app shows a "Deleting" badge; a failed one shows "Deletion failed".
- **Detail page:**
  - Deleting → "Deleting…". The existing polling continues until the GET returns 404, then the
    page redirects to `/apps`.
  - Deletion failed → the reason plus a **Retry delete** button, which calls `DELETE` again.
  - Write actions are disabled while the app is deleting.
- The delete dialog expects `202`.

## Testing

**Unit:**

- The emitter: subscribers receive the same `tx` and run in registration order, and a throw
  propagates.
- `JobScheduler`: `send` passes the `fromDrizzle` adapter and the class options.
- Discovery: a `createQueue` per `@JobHandler`, and `work` only when workers are enabled.

**Integration (existing Postgres harness):**

- Workers are off. `drainJobs()` (in `src/test`) fetches and runs pending jobs synchronously,
  including jobs those jobs send, until every queue is empty. No sleeps.
- TRUNCATE teardown includes `pgboss.job`.
- Atomicity: a use-case that sends a job and then throws leaves no job row behind.
- `delete-app`:
  - `DELETE` → 202 with `state: deleting`, and a second `DELETE` → 202 with no second job.
  - Deploy / update / attach / detach / rebuild / start-build → 409 while deleting.
  - A push webhook for a deleting app starts no build.
  - `drainJobs()` → the mock runtime's destroy was called, running builds are `cancelled`,
    `deleteRepository` ran after the cancel (order asserted), and `GET` → 404.
  - The mock registry throws on every attempt → `deletion_failed` with
    `registry: <message>`. After the registry recovers, `DELETE` + `drainJobs()` → gone.
- `KubernetesBuildRuntime.cancel` with the rendered grace period (unit test on the rendered Job,
  plus the existing adapter tests).

**Web:** component tests for the badges, the polling-to-404 redirect, and the failed state with
Retry.

**Coverage floors:** unchanged; the new code is covered by the tests above.

## Delivery

Five PRs. Each is green and mergeable on its own and gets its own implementation plan.

| PR                        | Contents                                                                                                                                                                                                                | Depends on |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1. Decision               | This spec + AgDR-0051 (supersedes AgDR-0047's "runtime call last" rule; amends AgDR-0050). Docs only.                                                                                                                   | —          |
| 2. Job queue              | `src/modules/jobs` (D1, D6 plumbing), `JOBS_WORKER_ENABLED`, `drainJobs()`, `pgboss.job` in teardown. Proven with a test-only job; no feature uses it yet.                                                              | 1          |
| 3. Domain events          | `src/modules/domain-events`, plus tests where a subscriber sends a job and a rollback leaves none.                                                                                                                      | 2          |
| 4. Async delete-app (api) | Migration, `state`, the 409 guards, the four-step chain with subscribers and jobs, dead letter, retry by `DELETE`, `202`, the #267 build-pod grace period. Regenerated `openapi.json` and web `app/api/*` (types only). | 3          |
| 5. Async delete-app (web) | Badges, deleting/polling/redirect, failed state + Retry, component tests.                                                                                                                                               | 4          |

Between PRs 4 and 5 the UI still works: a delete returns 202 and the app disappears once the jobs
finish, without the badge or failure display. Don't cut a release between them.

## Out of scope

- Moving other use-cases (`complete-build`, deploy, attach/detach, create-environment,
  create-database). Each moves when it's next touched; #249 is the first new consumer.
- #198 reconcile and moving `BuildSweeper` to the queue.
- A separate worker Deployment and chart changes.
- The pg-boss dashboard, and persisting domain events.
