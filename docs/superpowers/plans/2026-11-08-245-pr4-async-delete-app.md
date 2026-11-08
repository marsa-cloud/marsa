# #245 PR 4 — Async delete-app Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `DELETE /apps/:slug` becomes an async, four-step cleanup chain — the use-case validates, marks the app `deleting`, emits `AppDeletedDomainEvent` and returns `202`; four idempotent pg-boss jobs (wired by subscribers) destroy the runtime, cancel running builds, delete the registry repository, and hard-delete the app row. The #267 build-cancel timeout fix rides along.

**Architecture:** Each chain step is a `Job<AppDeletedPayload>` + `@JobHandler` owned by the feature that owns the resource; the **only** links between steps are `@Subscribe` subscribers, which run in the emitting transaction and do nothing but `JobScheduler.send(tx, …)`. Handlers make the external call first, then commit the row writes + next event in one transaction — a retry re-runs the (idempotent) external call and converges. The app row is kept in a `deleting` state until step 4, so the slug stays reserved (spec D5). Permanent failure lands in the `app-deletion-failed` dead-letter queue, whose handler writes `deletion_failed_at` / `deletion_error`; `DELETE` again is the retry.

**Tech Stack:** NestJS 11, Drizzle (migration on `app`), pg-boss 12 via `src/modules/jobs` (`JobScheduler`, `@JobHandler`, `drainJobs`), `src/modules/domain-events` (`DomainEvent`, `@Subscribe`, `DomainEventEmitter.emit(tx, events)`), `@kubernetes/client-node` (build adapter only), `node:test` + `expect` + sinon.

**Spec:** `docs/superpowers/specs/2026-11-01-domain-events-job-queue-design.md` — Decisions D2–D5, "`delete-app` flow" (schema, request, guard, cleanup chain, error handling), Delivery row 4, plus the #267 subsection ("#267 is fixed in step 2"). Decision record: `docs/agdr/AgDR-0051-domain-events-and-pg-boss-job-queue.md`. Issues: #245 (delete-app row), #267.

## Global Constraints

- Branch `feat/245-async-delete-app`, cut from `main` (#274 is merged). The PR references #245 and closes #267.
- No new dependency. No chart changes. `openapi.json` **and** web `app/api/*` are regenerated and committed (CI drift-checks both) — once after Task 1 (state on responses), once after Task 3 (202).
- Every chain job's options, verbatim from the spec: `retryLimit: 5, retryDelay: 5, retryBackoff: true, retryDelayMax: 120`, `deadLetter: 'app-deletion-failed'`; `expireInSeconds: 120` for `CancelAppBuildsJob`, `60` for the others.
- Every handler is **idempotent** (AgDR-0051): step 1 treats not-found as success, step 2 does nothing if no build is running, step 3 treats a 404 registry as success, step 4 does nothing if the row is gone.
- Subscribers follow `.claude/rules/api/subscriber.md` verbatim: `@Injectable() @Subscribe(Event)` implementing `DomainEventSubscriber<Event>`, registered via their own module imported by the feature module; they only write rows through their own feature's repositories and/or `JobScheduler.send(tx, …)` — never a runtime port, GitHub, or the registry. A throw escapes the transaction (it is a bug).
- Subscribers/jobs never re-derive placement: every job payload and event content is the shared `AppDeletedPayload`.
- After this PR, **app-management no longer imports `BuildRuntime` or `ImageRegistry`** (spec: no cross-feature imports). Cross-feature imports of `entities/`, `queries/`, `enums/`, `errors/`, `events/` are allowed (`.claude/rules/api/service.md`).
- Imports: `#src/...` / `#test/...` with `.js` extensions, never relative. Comments: one line, only a non-obvious why.
- 409 copy, verbatim: `App '<slug>' is being deleted.` State values, verbatim: `'active' | 'deleting' | 'deletion_failed'`.
- Api tests: Postgres via `docker compose up -d` (db `marsa_test`). Iterate only touched files:
  `cd apps/api && pnpm build && pnpm test:setup && node --experimental-default-config-file --no-experimental-test-coverage --env-file=.env.test --test src/<touched path>/tests/*.test.ts`
  One full `pnpm --filter api test` run at the end (Task 7). Coverage floors (lines 80 / branches 75 / functions 75) are ratchets — never lower them.
- Lint: judge by the exit code of `rtk proxy pnpm lint`. Format only touched files: `pnpm exec prettier --write <files>`.
- Migration: `pnpm --filter api db:generate` after table changes; never hand-edit generated SQL.
- Commits end with a `Co-Authored-By` trailer crediting **the model running the session** (root `CLAUDE.md`); never copy trailers from earlier commits.

## Review Focus

1. **A second `DELETE` while the chain is running** must not emit a second chain (double destroy, duplicate jobs). Pinned by Task 3 e2e (`already deleting` branch) — assert `emit` was not called again / no second `destroy`.
2. **A push webhook for a deleting app** must start no build and still answer 200 (it must not 409 — GitHub would retry a webhook forever). Pinned by Task 2 integration test asserting no build row exists after the webhook.
3. **A pod appearing after the Job delete during cancel** must not wedge the chain past the 30 s cap. Pinned by Task 6 unit test (late pod + `terminationGracePeriodSeconds: 1`).
4. **A partial failure must converge on retry** (pg-boss delivers at least once). Pinned by Task 5 integration test: one-shot registry failure (`failNextDelete`) still ends with the app row gone.
5. **A dead-lettered job whose failure output is not a plain string** must still write a useful `deletion_error`. Pinned by Task 4 direct-drive test with a fake `sourceOutput` object, asserting the exact `<sourceName>: <message>` format.

Also exercised inline (not in this list because a task test pins each): writes on a `deletion_failed` app also 409 (Task 2), and a `deletion_failed` retry through `DELETE` restarts the whole chain (Task 5).

## File map

```text
apps/api/src/app/app-management/
  entities/app.table.ts                                        MOD  +3 nullable columns
  entities/app.builder.ts                                     MOD  +deletion setters
  enums/app-deletion-state.enum.ts                             NEW  AppDeletionState + ApiProperty
  queries/app-deletion.ts                                      NEW  AppDeletedPayload, appDeletionState, assertAppNotDeleting
  queries/tests/app-deletion.unit.test.ts                      NEW
  errors/app-deletion-conflict.error.ts                        NEW  → 409
  events/app-deleted.event.ts  NEW  AppDeletedDomainEvent — named after the emitting use-case, past tense
  .claude/rules/api/domain-events.md                            NEW  event-naming rule (Task 3)
  events/app-runtime-destroyed.event.ts                        NEW
  events/app-images-deleted.event.ts                           NEW
  subscribers/schedule-destroy-app-runtime/…                   NEW  @Subscribe(AppDeletedDomainEvent)
  subscribers/schedule-finalize-app-deletion/…                 NEW  @Subscribe(AppImagesDeletedDomainEvent)
  jobs/destroy-app-runtime/…                                   NEW  Job + handler + module
  jobs/finalize-app-deletion/…                                 NEW  Job + handler + repository + module
  jobs/app-deletion-failed/…                                   NEW  dead-letter Job + handler + repository + module
  jobs/tests/app-deletion-jobs.integration.test.ts             NEW  app-management half of the chain
  use-cases/delete-app/{use-case,repository,controller,module}.ts   MOD  202 + emit, drop runtime deps
  use-cases/delete-app/tests/*.test.ts                         MOD  rewritten
  use-cases/view-app-detail/view-app-detail.response.ts        MOD  +state
  use-cases/view-app-index/view-app-index.response.ts          MOD  +state
  app-management.module.ts                                     MOD  import job + subscriber modules
  use-cases/update-app/…                                      MOD  409 guard
apps/api/src/app/build-management/
  events/app-builds-cancelled.event.ts                         NEW
  subscribers/schedule-cancel-app-builds/…                     NEW  @Subscribe(AppRuntimeDestroyedDomainEvent)
  subscribers/schedule-delete-app-repository/…                 NEW  @Subscribe(AppBuildsCancelledDomainEvent)
  jobs/cancel-app-builds/…                                     NEW  Job + handler + repository + module
  jobs/delete-app-repository/…                                 NEW  Job + handler + module
  jobs/tests/app-deletion-chain.integration.test.ts            NEW  full chain (Task 5)
  use-cases/start-build/…, use-cases/receive-push/…            MOD  guard / silent skip
apps/api/src/app/release/use-cases/deploy-release/…            MOD  409 guard
apps/api/src/app/database-management/use-cases/{attach,detach}-database/…  MOD  409 guard
apps/api/src/modules/runtime/runtime-error.filter.ts            MOD  @Catch +AppDeletionConflictError
apps/api/src/modules/runtime/adapters/kubernetes/build/render/render-build-job.ts  MOD  grace period
apps/api/src/modules/runtime/adapters/kubernetes/build/build.constants.ts          MOD  constant swap
apps/api/src/modules/runtime/adapters/kubernetes/kubernetes-build-runtime.ts       MOD  cancel simplification
apps/api/src/modules/runtime/adapters/mock/mock-image-registry.ts                 MOD  +failEveryDelete
apps/api/src/sql/drizzle/*                                      NEW  generated migration
apps/api/openapi.json                                          MOD  regenerate
apps/web/app/api/*                                             MOD  regenerate (types only)
```

Guard test locations: each guarded use-case's existing e2e test gains a `409 while deleting` case (seeded via direct `db.update(appTable).set({ deletionRequestedAt: new Date() })`); the receive-push skip goes in `receive-push`'s tests as an integration case.

---

### Task 1: Deletion state columns, derived `state`, and the shared deletion vocabulary

**Files:**

- Modify: `apps/api/src/app/app-management/entities/app.table.ts`, `apps/api/src/app/app-management/entities/app.builder.ts`
- Create: `apps/api/src/app/app-management/enums/app-deletion-state.enum.ts`, `apps/api/src/app/app-management/queries/app-deletion.ts`, `apps/api/src/app/app-management/queries/tests/app-deletion.unit.test.ts`
- Modify: `apps/api/src/app/app-management/use-cases/view-app-detail/view-app-detail.response.ts`, `apps/api/src/app/app-management/use-cases/view-app-index/view-app-index.response.ts`
- Generated: migration under `apps/api/src/sql/drizzle/`

**Interfaces:**

- Produces (`app-deletion-state.enum.ts`):

```ts
export enum AppDeletionState {
  Active = 'active',
  Deleting = 'deleting',
  DeletionFailed = 'deletion_failed',
}
export const AppDeletionStateApiProperty = (options?: ApiPropertyOptions): PropertyDecorator =>
  ApiProperty({ ...options, enum: AppDeletionState, enumName: 'AppDeletionState' })
```

No pg enum — `state` is derived, never stored.

- Produces (`app.table.ts`, before `...timestamps`):

```ts
deletionRequestedAt: timestamp('deletion_requested_at'),
deletionFailedAt: timestamp('deletion_failed_at'),
deletionError: text('deletion_error'),
```

All nullable, no defaults. Row types `App` / `NewApp` re-derive automatically.

- Produces (`app-deletion.ts`):

```ts
export interface AppDeletedPayload {
  appUuid: AppUuid
  slug: string
  placement: AppPlacement
}
export function appDeletionState(
  app: Pick<App, 'deletionRequestedAt' | 'deletionFailedAt'>,
): AppDeletionState
```

`deletionFailedAt` wins over `deleting`; both null → `Active`.

- Produces (builder): `withDeletionRequested(): this` sets `deletionRequestedAt`, `withDeletionFailed(error: string): this` sets both `deletionRequestedAt` and `deletionFailedAt` + `deletionError`.

- Produces (both response DTOs): a `readonly state: AppDeletionState` field decorated with `AppDeletionStateApiProperty({ example: AppDeletionState.Active })`, assigned in the constructor from `appDeletionState(app)`.

- [ ] **Step 1: Add the three columns and generate the migration**

  Add the columns to `app.table.ts` (above `...timestamps`), then `pnpm --filter api db:generate`. Expected: a new migration file under `src/sql/drizzle/` adding only those three columns.

- [ ] **Step 2: Write the failing tests**

  `queries/tests/app-deletion.unit.test.ts` (`TestBench.setupUnitTest()` in `before`):

```ts
it('derives active from nulls')
it('derives deleting from deletionRequestedAt alone')
it('derives deletion_failed when deletionFailedAt is set, even if deletionRequestedAt is too')
```

All three build the input with `new AppBuilder()…build()` — that is also the failing drive for the builder setters (which don't compile yet, which is the failure).

- [ ] **Step 3: Run the test to verify it fails**

  Iterate command (Global Constraints). Expected: FAIL — `appDeletionState` undefined / builder setters missing.

- [ ] **Step 4: Implement the enum, builder setters, and `appDeletionState`**

  Straight-line mapping per the Interfaces block; no branches beyond the three cases.

- [ ] **Step 5: Run the test to verify it passes. Then update the two response DTOs**

  Add `state` to `ViewAppDetailResponse` and `AppSummary` (`view-app-index.response.ts`) per the Interfaces block, and update the existing `view-app-detail` / `view-app-index` tests to expect `state: 'active'` (and, in the index/detail e2e where a deleting app is seeded, `'deleting'`). Run their test files.

- [ ] **Step 6: Regenerate the contract**

  `pnpm --filter api generate:openapi && pnpm --filter web generate:api`. Confirm `openapi.json` now carries `AppDeletionState` and the new `state` on both responses.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(api): app deletion state columns and derived state on responses"
```

---

### Task 2: The 409 deletion guard on every app write

**Files:**

- Create: `apps/api/src/app/app-management/errors/app-deletion-conflict.error.ts`
- Modify: `apps/api/src/app/app-management/queries/app-deletion.ts` (+`assertAppNotDeleting`
  and its test), `apps/api/src/modules/runtime/runtime-error.filter.ts`,
  `apps/api/src/app/release/use-cases/deploy-release/…`,
  `apps/api/src/app/app-management/use-cases/update-app/…`,
  `apps/api/src/app/database-management/use-cases/attach-database/…`,
  `apps/api/src/app/database-management/use-cases/detach-database/…`,
  `apps/api/src/app/build-management/use-cases/start-build/…`,
  `apps/api/src/app/build-management/use-cases/receive-push/…`

**Interfaces:**

- Consumes: Task 1's `appDeletionState`, `AppDeletionState`, `appTable` columns, `AppBuilder.withDeletionRequested()`.
- Produces:

```ts
// errors/app-deletion-conflict.error.ts
export class AppDeletionConflictError extends Error {}

// queries/app-deletion.ts
export function assertAppNotDeleting(app: App): void
// throws new AppDeletionConflictError(`App '${app.slug}' is being deleted.`) when
// appDeletionState(app) !== AppDeletionState.Active — covers both deleting and deletion_failed.
```

- Produces (filter): `@Catch(EnvironmentConflictError, AppDeletionConflictError)` on the existing `RuntimeErrorFilter` — it already maps any caught error to `ConflictException(error.message, { cause })`, so no other filter code changes. It stays registered where `runtime.module.ts` already registers it.

- Produces (each guarded use-case): `assertAppNotDeleting(placement.app)` (or `app`) immediately after the `FOR UPDATE` placement/app read, before any write or external call. Guarded: **deploy-release, update-app, attach-database, detach-database, start-build**. Each of those controllers gains `@ApiConflictResponse({ description: "App '<slug>' is being deleted." })`.
- Produces (receive-push): **not** `assertAppNotDeleting` — inside its per-app `lockApp` transaction it adds `if (appDeletionState(app) !== AppDeletionState.Active) return null` (the existing "nothing to build" skip), so a webhook answers 200 without 409-ing GitHub.

- [ ] **Step 1: Write the failing tests**
  - `app-deletion.unit.test.ts`: `assertAppNotDeleting` throws `AppDeletionConflictError` with the exact message for `withDeletionRequested()` and for `withDeletionFailed('registry: boom')` apps, and returns for a default `AppBuilder().build()`.
  - Each guarded endpoint's e2e test gains one case: seed `new AppBuilder().withSlug(SLUG)…build()` + `db.update(appTable).set({ deletionRequestedAt: new Date() }).where(eq(appTable.slug, SLUG))` (a state no endpoint can produce — direct seeding per `.claude/rules/api/tests.md`), authenticate, request, expect `409` with body containing `App '<slug>' is being deleted.`
  - receive-push integration: seed a deleting app, drive the use-case with a matched push, expect it resolves without starting a build (no `buildTable` row) and without throwing.

- [ ] **Step 2: Run them to verify they fail** — iterate command. Expected: FAIL — `assertAppNotDeleting` undefined; e2e cases get 200/422/404 instead of 409.

- [ ] **Step 3: Implement**

  Error class, helper, `@Catch` list, and the five guard insertions + webhook skip, per the Interfaces block. Use each use-case's existing locked read — do not add a second query.

- [ ] **Step 4: Run the touched test files to verify they pass** — iterate command over the six test paths.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(api): 409 guard on writes to a deleting app"
```

---

### Task 3: `DELETE /apps/:slug` → `202` + `AppDeletedDomainEvent`

**Files:**

- Create: `apps/api/src/app/app-management/events/app-deleted.event.ts`, `.claude/rules/api/domain-events.md`
- Modify: `apps/api/src/app/app-management/use-cases/delete-app/delete-app.use-case.ts`, `delete-app.repository.ts`, `delete-app.controller.ts`, `delete-app.module.ts`
- Modify: `apps/api/src/app/app-management/use-cases/delete-app/tests/delete-app.use-case.unit.test.ts`, `apps/api/src/app/app-management/use-cases/delete-app/tests/delete-app.e2e.test.ts`
- Modify: `apps/api/src/app/app-management/app-management.module.ts`

**Interfaces:**

- Produces (`app-deleted.event.ts`):

```ts
export class AppDeletedDomainEvent extends DomainEvent<AppDeletedPayload> {}
```

Content **is** the payload — no wrapper field. Named after the use-case, past tense, per `.claude/rules/api/domain-events.md` (added in this task).

- Produces (`.claude/rules/api/domain-events.md`) — path-scoped to `apps/api/src/app/**/*.event.ts`:

```markdown
# Domain events

An event class is named after the **use-case that emits it**, past tense:
`delete-app` → `AppDeletedDomainEvent`, `receive-push` → `PushReceivedDomainEvent`.
The file is `<use-case>.event.ts` in the emitting feature's `events/` folder, the class
ends `DomainEvent`, and its content type is the shared payload named `<UseCase>Payload`
(where one exists). The `DomainEvent` base + `@Subscribe` decorator already carry the
kind — no bare `XEvent`/`X` names.
```

Only the delete-app chain lands this PR; the rule is the pattern for the rest (#249 onward).

- Produces (repository — `findRunningBuilds` and `deleteWithHistory` are **removed**, they move to Tasks 4/5):

```ts
findBySlug(tx: Executor, slug: string): Promise<AppPlacement | undefined>  // unchanged, FOR UPDATE
markDeletionRequested(tx: Executor, appUuid: AppUuid): Promise<void>        // sets deletion_requested_at = now()
clearDeletionFailure(tx: Executor, appUuid: AppUuid): Promise<void>        // nulls deletion_failed_at + deletion_error
```

- Produces (use-case): `DeleteAppUseCase` constructor becomes `(@InjectDatabase() db: Database, repository: DeleteAppRepository, emitter: DomainEventEmitter)` — `AppRuntime`, `ImageRegistry`, `BuildRuntime` are **dropped**. `execute(slug: string): Promise<void>`:

```ts
await this.db.transaction(async (tx) => {
  const placement = await this.repository.findBySlug(tx, slug)
  if (!placement) throw new NotFoundException(`App '${slug}' was not found.`)
  const state = appDeletionState(placement.app)
  if (state === AppDeletionState.Deleting) return // 202, no second chain
  if (state === AppDeletionState.DeletionFailed) {
    await this.repository.clearDeletionFailure(tx, placement.app.uuid) // retry path
  } else {
    await this.repository.markDeletionRequested(tx, placement.app.uuid)
  }
  await this.emitter.emit(tx, [
    new AppDeletedDomainEvent({ appUuid: placement.app.uuid, slug, placement }),
  ])
})
```

No BadGateway wrapping — there is no runtime call left in the use-case.

- Produces (controller): `@HttpCode(202)` + `@ApiAcceptedResponse({ description: 'Deletion scheduled; the app is in the deleting state.' })` replacing the 204/502 decorators. Body stays empty — `handle(@Param('slug') slug: string): Promise<void>`. 404/401/403 decorators unchanged.

- [ ] **Step 1: Rewrite the failing tests**
  - Unit (`setupUnitTest`, `stubDatabase()` for the tx, `createStubInstance` repository + emitter, builder-placed `App`): missing slug → `NotFoundException`; fresh app → `markDeletionRequested` + `emit` called **once** with content `{ appUuid, slug, placement }` (deep-equal the whole payload); already-deleting (`withDeletionRequested`) → `emit` **not** called, no repo write; `deletion_failed` (`withDeletionFailed('registry: boom')`) → `clearDeletionFailure` called **and** `emit` called.
  - e2e: seed app + release via direct inserts. `DELETE` → `202` with empty body; `GET /apps/:slug` → `200` with `state: 'deleting'` (the row is **kept**, slug reserved); a second `DELETE` → `202` (Task 3 only asserts the status — the no-duplicate job assert lands in Task 4's drain test); unknown slug → 404; unauthenticated → 401. The old 502 rollback cases are **deleted** (no synchronous runtime call remains).

- [ ] **Step 2: Run to verify they fail** — iterate command. Expected: FAIL — old use-case still calls `appRuntime.destroy`; controller still 204.

- [ ] **Step 3: Implement** the event, repository, use-case, controller, and module wiring per the Interfaces block.

- [ ] **Step 4: Run to verify they pass** — iterate command.

- [ ] **Step 5: Regenerate the contract and commit**

```bash
pnpm --filter api generate:openapi && pnpm --filter web generate:api
git add -A && git commit -m "feat(api): delete-app returns 202 and emits AppDeletedDomainEvent"
```

---

### Task 4: The app-management half of the chain — steps 1 and 4, and the dead letter

**Files:**

- Create: `apps/api/src/app/app-management/events/app-runtime-destroyed.event.ts`, `apps/api/src/app/app-management/events/app-images-deleted.event.ts`
- Create: `apps/api/src/app/app-management/jobs/destroy-app-runtime/{destroy-app-runtime.job.ts, destroy-app-runtime.job-handler.ts, destroy-app-runtime.job.module.ts}`
- Create: `apps/api/src/app/app-management/jobs/finalize-app-deletion/{finalize-app-deletion.job.ts, finalize-app-deletion.job-handler.ts, finalize-app-deletion.repository.ts, finalize-app-deletion.job.module.ts}`
- Create: `apps/api/src/app/app-management/jobs/app-deletion-failed/{app-deletion-failed.job.ts, app-deletion-failed.job-handler.ts, app-deletion-failed.repository.ts, app-deletion-failed.job.module.ts}`
- Create: `apps/api/src/app/app-management/subscribers/schedule-destroy-app-runtime/{schedule-destroy-app-runtime.subscriber.ts, schedule-destroy-app-runtime.module.ts}`, same shape for `schedule-finalize-app-deletion`
- Create: `apps/api/src/app/app-management/jobs/tests/app-deletion-jobs.integration.test.ts`
- Modify: `apps/api/src/app/app-management/app-management.module.ts`

**Interfaces:**

- Consumes: Task 3's `AppDeletedDomainEvent`, `AppDeletedPayload`; PR 2/3's `Job`, `JobScheduler.send(tx, job)`, `@JobHandler`, `JobHandlerInstance`, `DomainEvent`, `@Subscribe`, `DomainEventSubscriber`, `DomainEventEmitter`, `drainJobs(setup.app)`, `TestBench.setupEndToEndTest()`.
- Produces (events — all four chain events carry `AppDeletedPayload` as content):

```ts
export class AppRuntimeDestroyedDomainEvent extends DomainEvent<AppDeletedPayload> {} // app-management
export class AppImagesDeletedDomainEvent extends DomainEvent<AppDeletedPayload> {} // app-management file for now; emitted by build-management in Task 5
```

`AppImagesDeletedDomainEvent` is created here because `ScheduleFinalizeAppDeletionSubscriber` must compile; its emitter arrives in Task 5. The file lives in **build-management**'s events folder instead if you prefer emitting-feature ownership — but then move the subscriber's import; pick the app-management location only if the import direction stays feature-legal (`events/` imports across features are allowed).

- Produces (jobs — all in app-management, all `extends Job<AppDeletedPayload>`):

```ts
export class DestroyAppRuntimeJob extends Job<AppDeletedPayload> {
  static readonly queue = 'destroy-app-runtime'
  static readonly options = {
    retryLimit: 5,
    retryDelay: 5,
    retryBackoff: true,
    retryDelayMax: 120,
    expireInSeconds: 60,
    deadLetter: AppDeletionFailedJob.queue,
  }
}
export class FinalizeAppDeletionJob extends Job<AppDeletedPayload> {
  /* queue 'finalize-app-deletion', same options */
}
export class AppDeletionFailedJob extends Job<AppDeletedPayload> {
  static readonly queue = 'app-deletion-failed'
  static readonly options = {}
}
```

`AppDeletionFailedJob.options` is empty — a dead-letter queue with its own `deadLetter` would loop. `JobRegistry` already orders dead-letter targets first at boot.

- Produces (handlers):

```ts
@Injectable() @JobHandler(DestroyAppRuntimeJob)
export class DestroyAppRuntimeJobHandler implements JobHandlerInstance<AppDeletedPayload> {
  // injects AppRuntime, Database, DomainEventEmitter
  async handle(payload: AppDeletedPayload): Promise<void> {
    await this.appRuntime.destroy(payload.placement) // idempotent; not-found is success (adapter behaviour)
    await this.db.transaction((tx) => this.emitter.emit(tx, [new AppRuntimeDestroyedDomainEvent(payload)]))
  }
}

@Injectable() @JobHandler(FinalizeAppDeletionJob)
// injects Database, FinalizeAppDeletionRepository
async handle(payload): Promise<void> {
  await this.db.transaction((tx) => this.repository.deleteWithHistory(tx, payload.appUuid)) // 0 rows deleted is a no-op
}

@Injectable() @JobHandler(AppDeletionFailedJob)
// injects Database, AppDeletionFailedRepository
async handle(payload, job): Promise<void> {
  const source = job as { sourceName?: string; sourceOutput?: { message?: string } | string | null }
  const step = source.sourceName ?? 'unknown'
  const message = typeof source.sourceOutput === 'string'
    ? source.sourceOutput
    : (source.sourceOutput?.message ?? JSON.stringify(source.sourceOutput ?? null))
  await this.db.transaction((tx) => this.repository.markDeletionFailed(tx, payload.appUuid, `${step}: ${message}`))
}
```

- Produces (repositories):

```ts
FinalizeAppDeletionRepository.deleteWithHistory(tx: Executor, appUuid: AppUuid): Promise<void>
// moves verbatim from DeleteAppRepository: delete releaseTable rows, then buildTable, then appTable, by appUuid
AppDeletionFailedRepository.markDeletionFailed(tx: Executor, appUuid: AppUuid, error: string): Promise<void>
// sets deletion_failed_at = now(), deletion_error = error (deletion_requested_at stays set — the app stays guarded)
```

- Produces (subscribers — the only links between steps):

```ts
@Injectable()
@Subscribe(AppDeletedDomainEvent)
export class ScheduleDestroyAppRuntimeSubscriber implements DomainEventSubscriber<AppDeletedDomainEvent> {
  constructor(private readonly scheduler: JobScheduler) {}
  async handle(event: AppDeletedDomainEvent, tx: Transaction): Promise<void> {
    await this.scheduler.send(tx, new DestroyAppRuntimeJob(event.content))
  }
}
// ScheduleFinalizeAppDeletionSubscriber: @Subscribe(AppImagesDeletedDomainEvent) → send(tx, new FinalizeAppDeletionJob(event.content))
```

Each subscriber + job handler gets its own `@Module({ providers: [Subscriber] })` / `@Module({ providers: [Handler, Repository] })`, imported by `app-management.module.ts` (subscriber.md + module-wiring rule: one instance, one seam).

- [ ] **Step 1: Write the failing integration test** — `app-management/jobs/tests/app-deletion-jobs.integration.test.ts`, `TestBench.setupEndToEndTest()`:
  - `DELETE then drain destroys the runtime and keeps the row`: seed app (`AppBuilder`), `DELETE` → 202, `await drainJobs(setup.app)`, assert `MockAppRuntime` (fetched from the container) recorded `destroy` for the placement, and `GET /apps/:slug` still `200` with `state: 'deleting'` (no build-management subscriber exists yet, so the chain stops here). Also assert a **second** `DELETE` before the drain would not send a second `destroy-app-runtime` job — read `pgboss.job` count by name via `setup.db`, expect 1.
  - `AppImagesDeletedDomainEvent finalizes the deletion`: seed app + release rows, `setup.app.get(DomainEventEmitter).emit(db transaction, [new AppImagesDeletedDomainEvent({ appUuid, slug, placement })])`, `await drainJobs(setup.app)`, assert `GET /apps/:slug` → 404 and the release row is gone.
  - `the dead-letter handler writes the failure`: seed app, get `AppDeletionFailedJobHandler` from the container, call `handler.handle(payload, { sourceName: 'delete-app-repository', sourceOutput: { message: 'registry unreachable' } } as never)`, assert the app row has `deletion_failed_at` set and `deletion_error === 'delete-app-repository: registry unreachable'`.

- [ ] **Step 2: Run to verify it fails** — iterate command. Expected: FAIL — jobs/subscribers/events don't exist.

- [ ] **Step 3: Implement** all files per the Interfaces block. Run `pnpm build` once before the test to catch `JobRegistry` boot errors (duplicate queue, missing dead-letter target) — those fail at `onApplicationBootstrap`.

- [ ] **Step 4: Run to verify it passes** — iterate command.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(api): destroy-runtime and finalize steps of the app deletion chain"
```

---

### Task 5: The build-management half — steps 2 and 3, the full chain, and permanent failure

**Files:**

- Create: `apps/api/src/app/build-management/events/app-builds-cancelled.event.ts`
- Create: `apps/api/src/app/build-management/jobs/cancel-app-builds/{cancel-app-builds.job.ts, cancel-app-builds.job-handler.ts, cancel-app-builds.repository.ts, cancel-app-builds.job.module.ts}`
- Create: `apps/api/src/app/build-management/jobs/delete-app-repository/{delete-app-repository.job.ts, delete-app-repository.job-handler.ts, delete-app-repository.job.module.ts}`
- Create: `apps/api/src/app/build-management/subscribers/schedule-cancel-app-builds/…`, `apps/api/src/app/build-management/subscribers/schedule-delete-app-repository/…`
- Create: `apps/api/src/app/build-management/jobs/tests/app-deletion-chain.integration.test.ts`
- Modify: `apps/api/src/app/build-management/build-management.module.ts`, `apps/api/src/modules/runtime/adapters/mock/mock-image-registry.ts`

**Interfaces:**

- Consumes: Task 4's `AppRuntimeDestroyedDomainEvent`, `AppImagesDeletedDomainEvent`, `AppDeletedPayload`; `buildRefOf(slug, buildUuid)` from build-management entities; `MockBuildRuntime.cancelled`, `MockImageRegistry.deletedRepositories` / `failNextDelete`.

- Produces:

```ts
export class AppBuildsCancelledDomainEvent extends DomainEvent<AppDeletedPayload> {} // build-management/events
export class CancelAppBuildsJob extends Job<AppDeletedPayload> {
  static readonly queue = 'cancel-app-builds'
  static readonly options = { retryLimit: 5, retryDelay: 5, retryBackoff: true, retryDelayMax: 120, expireInSeconds: 120, deadLetter: AppDeletionFailedJob.queue }
}
export class DeleteAppRepositoryJob extends Job<AppDeletedPayload> { /* queue 'delete-app-repository', expireInSeconds: 60, rest identical */
```

- Produces (repository):

```ts
CancelAppBuildsRepository {
  findRunning(db: Database, appUuid: AppUuid): Promise<Build[]>  // buildTable where status = Running
  markCancelled(tx: Executor, buildUuid: BuildUuid): Promise<void>
}
```

- Produces (handlers):

```ts
// CancelAppBuildsJobHandler — injects BuildRuntime, Database, CancelAppBuildsRepository, DomainEventEmitter
async handle(payload: AppDeletedPayload): Promise<void> {
  const running = await this.repository.findRunning(this.db, payload.appUuid) // no build running → [] → still emit
  for (const build of running) {
    await this.buildRuntime.cancel(buildRefOf(payload.slug, build.uuid)) // #267-fixed cancel: waits out late pods itself
  }
  await this.db.transaction(async (tx) => {
    for (const build of running) await this.repository.markCancelled(tx, build.uuid)
    await this.emitter.emit(tx, [new AppBuildsCancelledDomainEvent(payload)])
  })
}

// DeleteAppRepositoryJobHandler — injects ImageRegistry, Database, DomainEventEmitter
async handle(payload: AppDeletedPayload): Promise<void> {
  await this.imageRegistry.deleteRepository(payload.slug) // zot adapter: 404 → empty tag list → success
  await this.db.transaction((tx) => this.emitter.emit(tx, [new AppImagesDeletedDomainEvent(payload)]))
}
```

- Produces (subscribers): `ScheduleCancelAppBuildsSubscriber` — `@Subscribe(AppRuntimeDestroyedDomainEvent)` → `send(tx, new CancelAppBuildsJob(event.content))`; `ScheduleDeleteAppRepositorySubscriber` — `@Subscribe(AppBuildsCancelledDomainEvent)` → `send(tx, new DeleteAppRepositoryJob(event.content))`. Same module shape as Task 4.
- Produces (mock): `MockImageRegistry.failEveryDelete(error: Error): void` + `clearDeleteFailures(): void` — a persistent arm alongside the existing one-shot `failNextDelete`.

- [ ] **Step 1: Write the failing integration test** — `build-management/jobs/tests/app-deletion-chain.integration.test.ts`, `TestBench.setupEndToEndTest()`. For order assertions, wrap the three mock methods with sinon fakes appending to one `log: string[]` (`sinon.replace(app.get(MockAppRuntime), 'destroy', …)` — same instances `drainJobs` runs).
  - `the full chain deletes everything in order`: seed app + a running build + release; `DELETE` → 202; `await drainJobs(setup.app)`; assert `log` equals `['destroy', 'cancel', 'registry']` (the subscriber wiring **is** the order assertion), the build row is `cancelled`, `GET /apps/:slug` → 404, and the release row is gone.
  - `a transient registry failure converges`: `imageRegistry.failNextDelete(new Error('registry flaky'))`, `DELETE`, `drainJobs` — the retry inside the drain succeeds, app row gone.
  - `a permanent registry failure dead-letters`: `imageRegistry.failEveryDelete(new Error('registry unreachable'))`, `DELETE`, `drainJobs` — app row **kept**, `state: 'deletion_failed'` on GET, `deletion_error` contains `'delete-app-repository'`. Then `clearDeleteFailures()`, `DELETE` again (retry path) → `clearDeletionFailure` runs, `drainJobs` → `GET` → 404.

- [ ] **Step 2: Run to verify it fails** — iterate command. Expected: FAIL — build-management jobs missing.

- [ ] **Step 3: Implement** per the Interfaces block + wire `build-management.module.ts`.

- [ ] **Step 4: Run to verify it passes.** Also re-run Task 4's `app-deletion-jobs.integration.test.ts` — its "chain stops after destroy" case now continues into build-management's subscribers; update it to assert the chain reaches the registry job but **not** finalize until `AppImagesDeletedDomainEvent` — or simplify it to the destroy + dead-letter cases and let this file own the end-to-end assertions.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(api): cancel-builds and delete-repository steps complete the app deletion chain"
```

---

### Task 6: #267 — build pod grace period and the simplified cancel

**Files:**

- Modify: `apps/api/src/modules/runtime/adapters/kubernetes/build/build.constants.ts`, `apps/api/src/modules/runtime/adapters/kubernetes/build/render/render-build-job.ts`, `apps/api/src/modules/runtime/adapters/kubernetes/kubernetes-build-runtime.ts`
- Test: the existing render + kubernetes-build-runtime unit test files (find them under `adapters/kubernetes/**/tests/`).

**Interfaces:**

- Produces: `build.constants.ts` gains `BUILD_POD_TERMINATION_GRACE_SECONDS = 1`, drops `CANCEL_POD_GRACE_SECONDS`. `renderBuildJob` sets `spec.template.spec.terminationGracePeriodSeconds = BUILD_POD_TERMINATION_GRACE_SECONDS` (render constants get asserted where the manifest is). `CANCEL_WAIT_MS` stays 30_000 — below the cancel job's `expireInSeconds: 120`, so a timeout throw triggers a retry rather than an expiry.
- Produces (`cancel`, whole method):

```ts
async cancel(ref: BuildRef): Promise<void> {
  await ignoreNotFound(() =>
    this.batch.deleteNamespacedJob({ name: buildJobName(ref), namespace: BUILD_NAMESPACE, propagationPolicy: 'Foreground' }),
  )
  await this.waitForBuildGone(ref)
}
```

The per-pod delete loop is gone — the pod's own 1 s grace (set at render, honoured by the GC's dependent delete) covers every deletion path.

- [ ] **Step 1: Write the failing tests**
  - Render test: `renderBuildJob(...)` pod spec has `terminationGracePeriodSeconds === 1`.
  - Cancel test (fake batch/core clients, like the existing adapter tests): a pod that appears in `listPods` **after** the Job delete (first listing empty, second listing one pod, third empty) — `cancel` resolves without an explicit per-pod delete call, polling until the late pod is gone (fake the poll clock the existing tests already fake; keep the "throws past `CANCEL_WAIT_MS`" case green).
  - Assert no `deleteNamespacedPod` call happens in `cancel` — the loop is deleted, not skipped.

- [ ] **Step 2: Run to verify it fails** — iterate command. Expected: render test fails (no grace field); late-pod test fails (old loop times out / never re-lists).

- [ ] **Step 3: Implement** per the Interfaces block.

- [ ] **Step 4: Run the kubernetes adapter test files to verify they pass** — iterate command over `src/modules/runtime/adapters/kubernetes/**/tests/*.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "fix(api): build pods terminate in 1s grace; cancel is Foreground-delete + wait

Closes #267"
```

---

### Task 7: Full-suite verification and docs

**Files:**

- Modify: `apps/api/CLAUDE.md` (feature-shape tree rows for `events/`, `jobs/`, `subscribers/` if it enumerates them)
- No other source changes expected — fixes only.

- [ ] **Step 1: Update `apps/api/CLAUDE.md`** — add the events/jobs/subscribers folder conventions to the feature-shape tree, mirroring how PR 3's plan documented the domain-events module row.

- [ ] **Step 2: Run the full api suite once** — `docker compose up -d` then `pnpm --filter api test` from the repo root (it builds first). Coverage floors lines 80 / branches 75 / functions 75 must pass **without** lowering anything. Any failure: fix in the owning task's files and re-run — do not re-run per-file with coverage off to "get green".

- [ ] **Step 3: Lint and format** — `rtk proxy pnpm lint` (judge by exit code) and `pnpm exec prettier --write <every touched file>`.

- [ ] **Step 4: Contract drift check** — `git diff --exit-code apps/api/openapi.json apps/web/app/api` must be empty (Tasks 1/3 regenerated and committed). Run `pnpm --filter web typecheck` + web unit tests only if the generated types changed shape (`state` field) — they should already be green from Task 1's regen.

- [ ] **Step 5: Final commit and PR**

```bash
git add -A && git commit -m "docs: deletion chain conventions in api CLAUDE.md"
```

Open the PR `feat/245-async-delete-app` → `main`, description referencing #245 (PR 4 of the series) and `Closes #267`.

---

## Self-review notes

- **Spec coverage:** schema (Task 1), request/branching (Task 3), guard + webhook ignore (Task 2), chain steps 1–4 + subscribers (Tasks 4/5), idempotence + retries + dead letter + `DELETE` retry (Tasks 4/5 tests), #267 (Task 6), web types-only regen (Tasks 1/3), `202` empty body (Task 3 — user decision), silent webhook skip (Task 2 — user decision). Coverage floors unchanged (Task 7).
- **Spec deltas:** `AppImagesDeletedDomainEvent` and the `receive-push` skip needed a feature-home decision the spec leaves open; both are pinned above. `deleteWithHistory` moved from `DeleteAppRepository` to `FinalizeAppDeletionRepository` so the use-case keeps only its own reads/writes.
- **Type consistency:** `AppDeletedPayload` is the single payload/event content type across every task; queue names are verbatim in `Job.queue` and the dead-letter `deadLetter: AppDeletionFailedJob.queue` (never the raw string twice).
