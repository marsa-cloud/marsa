---
id: AgDR-0011
timestamp: 2026-06-10T00:00:00Z
agent: claude
model: claude-opus-4-8
trigger: user-prompt
status: executed
ticket: marsa-cloud/marsa#58
---

# Extract convert-manifest persistence into a use-case `ConvertManifestRepository`

> In the context of the Manifest conversion use-case (#58), facing a use-case that injected `EntityManager` directly and inlined an idempotent-upsert-with-race-recovery (hard to mock, persistence logic leaking into the application layer), I decided to extract a **plain injectable, use-case-scoped `ConvertManifestRepository`** (co-located in the slice) that wraps a forked EM, to give the use-case a collection-like persistence seam that is trivially mockable, accepting that we forgo MikroORM's `@InjectRepository` machinery (deliberately, to keep request-isolated forks).

## Context

`ConvertManifestUseCase` injected `EntityManager` and contained the full
persistence dance: `fork()` → `findOne` → insert-or-update → catch
`UniqueConstraintViolationException` → re-resolve as update. Two problems the
PR #64 review surfaced:

- **Mocking friction** — unit-testing the use-case meant hand-rolling an EM whose
  `.fork()` returns a sub-object with `findOne/persistAndFlush/assign/flush/clear/findOneOrFail`.
- **Layering** — persistence orchestration (idempotency, race recovery) living in
  the application layer, not behind a persistence abstraction.

The reviewer also asked: _"can't repositories be injected like TypeORM's `@InjectRepository`?"_

## Options Considered

| Option                                                                    | Pros                                                                                                                                       | Cons                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(a) Plain injectable `ConvertManifestRepository` wrapping a forked EM** | Trivial to mock (stub one method); keeps request-isolated `em.fork()`; no entity-decorator/`forFeature` coupling; idiomatic DDD repository | One more provider                                                                                                                                                                                                                                        |
| (b) MikroORM custom `EntityRepository` via `@InjectRepository(GitHubApp)` | The literal "`@InjectRepository`" answer; less boilerplate                                                                                 | MikroORM repos bind to the **root** EM (shared identity-map / UoW across requests) unless you fork inside every method anyway — which negates the ergonomic win and re-introduces forking; needs `MikroOrmModule.forFeature` + `@Entity({ repository })` |
| (c) Leave EM in the use-case                                              | No new file                                                                                                                                | The two problems above stand                                                                                                                                                                                                                             |

## Decision

Chosen: **(a)** — a `@Injectable() ConvertManifestRepository` (constructor-injected
`EntityManager`) exposing `upsertByGithubAppId(app: GitHubApp): Promise<void>`,
which forks the EM internally and owns the insert-or-update + unique-violation
race recovery. The repository is **use-case-scoped** — it lives in the slice
(`use-cases/convert-manifest/convert-manifest.repository.ts`), not as a
feature-wide aggregate repository — matching the vertical-slice layout where each
use-case owns its controller / command / response / persistence. The use-case
injects the repository instead of the EM; persistence logic and the
`UniqueConstraintViolationException` handling move out of the application layer.

We deliberately do **not** use MikroORM's `@InjectRepository` (option b): its
root-EM binding conflicts with the request-isolated `fork()` we rely on, so the
plain injectable is both simpler and a better fit. The repository _is_ the
"inject a repository" answer — just a hand-written one, not the framework's.

## Consequences

- `ConvertManifestUseCase` is now mock-trivial (stub `repo.upsertByGithubAppId`);
  its persist/idempotent/race tests move to the repository's own test.
- Persistence concerns (idempotency, race recovery, forking) live in one place,
  behind a narrow use-case-scoped interface.
- Provided in `convert-manifest.module`. Future use-cases that touch `GitHubApp`
  (e.g. #23 deploy) get **their own** use-case repository; if real duplication
  emerges, promote shared persistence to a feature-level module then (per the
  service-sharing-via-module rule) — don't pre-share.
- Codified as a convention: a use-case's DB access goes through its own
  `<use-case>.repository.ts`, not raw `EntityManager` in the use-case — handbook
  `handbooks/domain/marsa-api/use-case-repository.md` + `apps/api/.claude/CLAUDE.md`.

## Artifacts

- Ticket: marsa-cloud/marsa#58
- Builds on: [AgDR-0006](AgDR-0006-github-app-credential-storage.md), [AgDR-0010](AgDR-0010-migration-manifest-state-db-backed.md) (uniqueness/idempotency)
- PR: #64
