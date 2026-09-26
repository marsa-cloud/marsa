---
id: AgDR-0050
timestamp: 2026-09-23T00:00:00Z
agent: claude
model: claude-opus-5-5
trigger: user-prompt
status: accepted
ticket: marsa-cloud/marsa#21
---

# Detect finished builds with a five-second sweep on `@nestjs/schedule`

> In the context of turning a finished build into a deployed release with no manual step (#21), facing a Marsa that had no background work at all, I decided on **a `@Cron('*/5 * * * * *', { waitForCompletion: true })` sweep that reads each running build's status and completes it in a transaction claimed with `FOR UPDATE SKIP LOCKED`**, to achieve the simplest correct trigger that is safe across api replicas, accepting up to five seconds of extra latency and one new dependency.

## Context

Deploy status was reconciled on read (AgDR-0034), which cannot work here: nobody is reading when
a build finishes. Something must notice completion and create + deploy the release.

## Options Considered

| Option                                    | Pros                                                                                      | Cons                                                                                             |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Sweep via `@nestjs/schedule` (chosen)** | Smallest step into background work; trivially testable (`sweep()`); reuses one claim path | Up to 5 s latency; one Kubernetes read per running build per tick                                |
| Kubernetes watch (informer) in the api    | Immediate                                                                                 | Needs manual restart-on-error, and still a sweep for Jobs deleted before the api saw them finish |
| Build Job calls back into the api         | Simple to picture                                                                         | A crashed/evicted Job never calls; new internal endpoint; the build pod holds an api credential  |
| `setInterval` / `@Interval`               | No dependency                                                                             | Overlapping runs when a tick outlasts the interval                                               |

## Decision

Chosen: **the sweep**. `BuildSweeper` lists running builds, asks `BuildRuntime.readStatus`, and
hands terminal observations to `CompleteBuildUseCase`, which claims the row with
`SELECT … FOR UPDATE SKIP LOCKED`, so a second replica (or a racing tick) skips a build another
is completing. A build still running 5 minutes past the Job deadline is failed as a backstop.
`ScheduleModule.forRoot()` loads through `ConditionalModule.registerWhen` only when
`MARSA_RUNTIME !== 'mock'`, so tests and `pnpm dev:api` never tick; tests call `sweep()`.

## Consequences

- Push-to-deploy latency is build time + ≤ 5 s.
- The same sweeper is the natural home for reconciling deploy status (#198) later.
- A watch can be added later as a second trigger of the same use-case if latency ever matters.
- Verified: under `MARSA_RUNTIME=kubernetes` the `build-sweep` cron job is registered; under the
  mock runtime `SchedulerRegistry` is absent (integration test).

## Artifacts

- Spec: `docs/superpowers/specs/2026-09-23-git-build-deploy-registry-design.md` D6
- Plan: `docs/superpowers/plans/2026-09-23-phase-c-part-1-build-engine.md` Task 7
- PR: marsa-cloud/marsa#237
