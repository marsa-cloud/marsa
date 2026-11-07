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
