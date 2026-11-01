---
id: AgDR-0051
timestamp: 2026-11-01T00:00:00Z
agent: claude
model: claude-opus-5-5
trigger: user-prompt
status: accepted
ticket: marsa-cloud/marsa#245
supersedes: AgDR-0047
---

# Cross-feature side effects run as pg-boss jobs, scheduled by in-transaction domain events

> In the context of use-cases that write rows and then call Kubernetes, the registry or GitHub, facing long row locks, cross-feature coupling, hand-written compensation (#240) and the #264 bugs, I decided **that a use-case emits domain events inside its transaction, other features subscribe in that same transaction and only write rows or schedule pg-boss jobs, and the jobs make the external calls after commit**, to achieve side effects that run if and only if the change committed, with retries in one place and no lock held across a cluster call, accepting async `202` endpoints that report outcomes on resource state and a gradual migration away from AgDR-0047.

## Context

AgDR-0047 put the runtime call last inside the use-case transaction. That gave one simple rule,
but:

- `complete-build` holds two row locks across `appRuntime.deploy`.
- `delete-app` calls three features' ports in sequence.
- Each use-case writes its own compensation (#240).
- The sanity check (#264) found a redeploy path that missed shared logic (bug 1), and a race
  where BuildKit pushed into a deleted repository (bug 2).

## Options Considered

| Option                                              | Pros                                                                                                                                                                               | Cons                                                                                                                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **pg-boss + in-transaction domain events (chosen)** | Postgres only; `fromDrizzle(tx, sql)` puts the job insert in the caller's transaction, so no separate outbox; retries, backoff, dead-letter, singleton keys, once-per-cluster cron | No official Nest module (a thin one of our own); polling latency (~2 s); minute-level cron                                                                      |
| BullMQ (`@nestjs/bullmq`)                           | The queue in Nest's docs; best DX; flows, rate limits, Bull Board                                                                                                                  | Requires Redis; can't join a Postgres transaction, so needs an outbox table and relay anyway; requires `noeviction`, which a future caching Redis wouldn't want |
| graphile-worker                                     | Postgres only; `add_job` is SQL and can run in the transaction; `job_key` replace; LISTEN/NOTIFY                                                                                   | No Nest integration; more opinionated runner and schema                                                                                                         |
| `@nestjs/event-emitter` / `@nestjs/cqrs` alone      | No new dependency                                                                                                                                                                  | Not durable: an event is lost on crash, or acts on rolled-back work                                                                                             |
| Keep AgDR-0047, add compensation per use-case       | No new concept                                                                                                                                                                     | The problems above remain and grow with every new feature                                                                                                       |

## Decision

- **pg-boss 12.x** in the `pgboss` schema of Marsa's database. Jobs are sent only through
  `JobScheduler.send(tx, job)`, which requires a transaction.
- **Domain events** are emitted with `DomainEventEmitter.emit(tx, events)`. Subscribers run in
  the caller's transaction, owned by the feature that reacts. A subscriber only writes rows or
  sends jobs, never calls a runtime port.
- **Endpoints that change the cluster return `202`** once validation passes and the state and
  jobs commit. The outcome is reported on the resource's state.
- **Recurring cluster-wide work uses `boss.schedule`.** `@nestjs/schedule` stays only for work
  more frequent than once a minute (`BuildSweeper`, AgDR-0050) until #198 replaces it.
- **Workers run in the api process** behind `JOBS_WORKER_ENABLED`. A separate worker Deployment
  later needs no code change.

## Consequences

- AgDR-0047's "runtime call last, roll back on failure" is superseded for new and migrated
  use-cases. Its other rules still hold: one transaction per writing use-case, `FOR UPDATE` on
  deciding reads, repositories taking the `tx` as an `Executor`. Use-cases not yet migrated keep
  following AgDR-0047 until they're touched.
- `delete-app` is the first use-case moved over. Its app row stays in a `deleting` state until
  a chain of four idempotent jobs finishes, and permanent failure is reported as
  `deletion_failed` with a retry.
- Every job handler must be idempotent: pg-boss delivers at least once.
- The web polls resource state for operations it used to await.
- Tests run jobs deterministically with `drainJobs()`; workers are off in tests.

## Artifacts

- Spec: `docs/superpowers/specs/2026-11-01-domain-events-job-queue-design.md`
- Ticket: marsa-cloud/marsa#245
