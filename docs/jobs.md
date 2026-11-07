# Job queue

Background work runs on [pg-boss](https://github.com/timgit/pg-boss) over the existing Postgres, wrapped by the `JobQueueModule` in `apps/api/src/modules/jobs/`. Design rationale: [AgDR-0051](agdr/AgDR-0051-domain-events-and-pg-boss-job-queue.md).

## Dead-letter rules

A job class may declare a `deadLetter` queue in its options; jobs that exhaust their retries are routed there instead of being dropped. The registry (`job-registry.ts`) enforces two rules at bootstrap:

- **Every `deadLetter` target must have a registered `@JobHandler`.** A dangling target fails startup with a clear error.
- **Dead-letter graphs must be one level deep.** `JobQueueLifecycle` creates queues in registry order, and the registry only sorts single-hop targets before their senders — it deliberately does not topologically sort chains.

### Unsupported: chains

A chain like `a -> b -> c` (where `b` is both a target and itself dead-letters on) is **not ordered correctly**: `b` and `c` both land in the "target" bucket in discovery order, so `b` can be created before `c` and bootstrap fails inside pg-boss with an unfriendly error. This is a deliberate simplification — if you need multi-level dead-lettering, either flatten it into one hop or extend the registry sort to a topological one.

### Unsupported: cycle detection

The registry does not detect cycles (`a -> b -> a`, or `a -> a`). Cycles surface at `createQueue` time from pg-boss rather than as a registry error.

Both behaviors are pinned by the `does NOT ...` tests in `apps/api/src/modules/jobs/tests/job-registry.unit.test.ts`; if you change them, update those tests and this page together.

## Ownership

`JobScheduler.send` only accepts job instances whose exact class is the registered owner of the queue (`JobRegistry.owns`). A different class reusing a registered queue name is rejected — its payload would otherwise reach the handler unvalidated.

## Scheduled jobs

Cron jobs (`static schedule`) are dispatched with an empty payload (`{}`). A scheduled job class must therefore have an all-optional payload type.

## Queue options

Class options (`retryLimit`, `deadLetter`, …) ride on **every send**, overriding whatever is stored on the queue. Removing an option from a class does not clear the stored value in Postgres (`updateQueue` only touches keys it receives), but the stale value is inert: every `send()`/`schedule()` from this module overrides it. Only jobs injected into the queue outside this module would inherit it.
