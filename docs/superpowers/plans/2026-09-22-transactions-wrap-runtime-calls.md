# Transactions Wrap Runtime Calls Implementation Plan (#214)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every writing use-case runs its deciding reads, DB writes and runtime call inside one transaction, runtime call last, so a runtime failure rolls the DB back and an identical retry converges.

**Architecture:** The use-case opens `db.transaction` (it may inject `Database` for that alone) and passes `tx` into repository methods that take an `Executor`. Reads that decide a write lock the row with `FOR UPDATE OF <table>`. The only write that must survive a rollback — `deploy-release` marking a release `Failed` — happens after the transaction, on its own. The mock runtime adapter gains a `failNext(operation, error)` switch so each rollback is proven end to end.

**Tech Stack:** NestJS 11, Drizzle (`.for('update', { of })`), Node test runner + `expect` + `sinon`, `supertest` e2e.

Spec: `docs/superpowers/specs/2026-09-22-runtime-port-and-transactions-design.md` (PR 2 section). Stacked on `refactor/226-runtime-port` (PR #231).

## Global Constraints

- Worktree `.claude/worktrees/refactor+214-transactions`, branch `refactor/214-transactions`, based on `refactor/226-runtime-port`. PR base is `refactor/226-runtime-port` until #231 merges, then rebase onto `main`.
- **The rule:** one `db.transaction` per writing use-case; deciding reads → DB writes → runtime call **last**; a runtime failure throws and rolls back; runtime calls are idempotent.
- A use-case may inject `Database` (`@InjectDatabase() private readonly db: Database`) **only** to call `db.transaction`. All other data access goes through its repository.
- Repository methods that join a unit of work take `tx: Executor` as the **first** parameter. Reads that decide a write lock with `.for('update', { of: <table> })`. One job per method.
- **Deviation from the spec, deliberate:** `create-environment` keeps its compensating `destroy` on a non-conflict provision failure. A partial provision (namespace created, RoleBinding failed) leaves a namespace labelled with a uuid no row will ever have; without the cleanup every retry 409s. The spec's accepted gap (commit fails after a successful runtime call) is unchanged.
- Comments: minimum, single-line, _why_ only (`.claude/rules/comments.md`). Every `await` on its own line in use-cases.
- Format only touched files: `pnpm exec prettier --write <files>`. Never repo-wide `pnpm format`.
- Commits: `type: subject`, bullets, `Refs #214`, trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. Stage files by name. In zsh, pass file lists as arrays (`"${F[@]}"`).

### How to run things (worktree root)

```bash
pnpm --filter api typecheck && pnpm --filter api lint
pnpm --filter api test                      # full suite with coverage floors
pnpm --filter api build && cd apps/api || exit 1
node --env-file=.env.test --enable-source-maps --test src/path/x.test.ts   # one file, no floors
```

Unit tests inject `stubDatabase()` (`#src/test/setup/stub-database.js`), which runs the callback with `{}` as the `tx`. Match that argument with `sinon.match.any`.

---

### Task 1: Mock adapter fail-next switch

**Files:**

- Modify: `apps/api/src/modules/runtime/adapters/mock/mock-app-runtime.ts`
- Modify: `apps/api/src/modules/runtime/adapters/mock/mock-environment-runtime.ts`
- Modify: `apps/api/src/modules/runtime/adapters/mock/tests/mock-app-runtime.unit.test.ts`
- Modify: `apps/api/src/modules/runtime/adapters/mock/tests/mock-environment-runtime.unit.test.ts`
- Modify: `apps/api/src/app/environment/use-cases/create-environment/tests/create-environment.e2e.test.ts` (caller of the old `failNextProvision`)

**Interfaces:**

- Produces: `MockAppRuntime.failNext(operation: 'deploy' | 'destroy', error: Error): void`; `MockEnvironmentRuntime.failNext(operation: 'provision' | 'destroy', error: Error): void`. `failNextProvision` is removed. Each armed failure fires once, then clears (booted apps are shared across e2e suites).

- [ ] **Step 1: Failing tests**

Append to `mock-app-runtime.unit.test.ts`:

```ts
describe('MockAppRuntime.failNext', () => {
  it('fails the armed operation exactly once and leaves state untouched', async () => {
    const runtime = new MockAppRuntime()
    const release = generateUuid<Uuid<'Release'>>()
    runtime.failNext('deploy', new Error('cluster down'))

    await expect(runtime.deploy(APP, spec(release))).rejects.toThrow('cluster down')
    expect(await runtime.readLiveReleaseUuid(APP)).toBeNull()

    await runtime.deploy(APP, spec(release))
    expect(await runtime.readLiveReleaseUuid(APP)).toBe(release)
  })

  it('arms destroy independently of deploy', async () => {
    const runtime = new MockAppRuntime()
    runtime.failNext('destroy', new Error('cluster down'))

    await runtime.deploy(APP, spec(generateUuid<Uuid<'Release'>>()))
    await expect(runtime.destroy(APP)).rejects.toThrow('cluster down')
  })
})
```

Replace the body of `mock-environment-runtime.unit.test.ts`'s single test with:

```ts
it('fails exactly once when armed, so one test cannot leak into the next suite', async () => {
  const runtime = new MockEnvironmentRuntime()
  runtime.failNext('provision', new Error('cluster down'))

  await expect(runtime.provision(ENVIRONMENT)).rejects.toThrow('cluster down')
  await expect(runtime.provision(ENVIRONMENT)).resolves.toBeUndefined()
})

it('arms destroy independently of provision', async () => {
  const runtime = new MockEnvironmentRuntime()
  runtime.failNext('destroy', new Error('cluster down'))

  await expect(runtime.provision(ENVIRONMENT)).resolves.toBeUndefined()
  await expect(runtime.destroy(ENVIRONMENT)).rejects.toThrow('cluster down')
})
```

- [ ] **Step 2: Verify failure** — `pnpm --filter api typecheck` → `Property 'failNext' does not exist`.

- [ ] **Step 3: Implement**

`mock-app-runtime.ts` — add the field, the two methods, and consult them in `deploy` / `destroy`:

```ts
  private readonly armedFailures = new Map<'deploy' | 'destroy', Error>()

  failNext(operation: 'deploy' | 'destroy', error: Error): void {
    this.armedFailures.set(operation, error)
  }

  deploy(app: AppRef, spec: AppDeploySpec): Promise<void> {
    const failure = this.takeFailure('deploy')
    if (failure) {
      return Promise.reject(failure)
    }
    this.liveReleases.set(app.slug, spec.releaseUuid)
    return Promise.resolve()
  }

  destroy(app: AppRef): Promise<void> {
    const failure = this.takeFailure('destroy')
    if (failure) {
      return Promise.reject(failure)
    }
    this.liveReleases.delete(app.slug)
    return Promise.resolve()
  }

  private takeFailure(operation: 'deploy' | 'destroy'): Error | undefined {
    const failure = this.armedFailures.get(operation)
    this.armedFailures.delete(operation)
    return failure
  }
```

`mock-environment-runtime.ts` — replace `nextProvisionError` / `failNextProvision` with the same shape keyed `'provision' | 'destroy'`; `provision` and `destroy` each reject with their armed failure once. Keep the class comment.

`create-environment.e2e.test.ts` — `.failNextProvision(new Error('cluster down'))` → `.failNext('provision', new Error('cluster down'))`.

- [ ] **Step 4: Verify** — build, run the two mock test files → all pass; `pnpm --filter api test` green.

- [ ] **Step 5: Commit** — `test: let the mock runtime fail the next deploy, destroy or provision`.

---

### Task 2: `delete-app` — delete the rows, then destroy, in one transaction

**Files:**

- Modify: `apps/api/src/app/app-management/use-cases/delete-app/delete-app.use-case.ts`
- Modify: `apps/api/src/app/app-management/use-cases/delete-app/delete-app.repository.ts`
- Modify: `apps/api/src/app/app-management/use-cases/delete-app/tests/delete-app.use-case.unit.test.ts`
- Modify: `apps/api/src/app/app-management/use-cases/delete-app/tests/delete-app.e2e.test.ts`

**Interfaces:**

- Consumes: `MockAppRuntime.failNext` (Task 1).
- Produces: `DeleteAppUseCase(db: Database, repository, appRuntime)`; `DeleteAppRepository.findBySlug(tx: Executor, slug)` (locks the app row), `deleteWithReleases(tx: Executor, appUuid)`.

- [ ] **Step 1: Failing e2e test** — append to `delete-app.e2e.test.ts`:

```ts
it('keeps the app and its releases when the runtime cannot remove it', async () => {
  const slug = 'delete-e2e-stuck'
  const app = new AppBuilder().withEnvironmentUuid(environment.uuid).withSlug(slug).build()
  await setup.db.insert(appTable).values(app)
  await setup.db.insert(releaseTable).values(new ReleaseBuilder().withApp(app).build())
  setup.testModule
    .get<AppRuntime, MockAppRuntime>(AppRuntime)
    .failNext('destroy', new Error('cluster down'))

  await request(setup.httpServer)
    .delete(`/api/v1/apps/${slug}`)
    .set('Cookie', sessionCookie)
    .expect(502)

  const apps = await setup.db.select().from(appTable).where(eq(appTable.slug, slug))
  expect(apps).toHaveLength(1)
  const releases = await setup.db
    .select()
    .from(releaseTable)
    .where(eq(releaseTable.appUuid, app.uuid))
  expect(releases).toHaveLength(1)
})
```

(imports: `AppRuntime` from `#src/modules/runtime/app-runtime.js`, `type MockAppRuntime` from `#src/modules/runtime/adapters/mock/mock-app-runtime.js`). Today this passes by accident (destroy runs first); it becomes the guard that keeps passing once the order flips. Also rewrite the unit test so it fails against today's order — Step 2.

- [ ] **Step 2: Rewrite the unit test**

```ts
import { match } from 'sinon'
import { stubDatabase } from '#src/test/setup/stub-database.js'

function build() {
  const repository = createStubInstance(DeleteAppRepository)
  repository.findBySlug.resolves(placement)
  repository.deleteWithReleases.resolves()
  const appRuntime = createStubInstance(MockAppRuntime)
  appRuntime.destroy.resolves()
  const usecase = new DeleteAppUseCase(stubDatabase(), repository, appRuntime)
  return { repository, appRuntime, usecase }
}
```

Keep the existing `placement` fixture if the file has one; otherwise `const placement = new AppPlacementBuilder().withApp(new AppBuilder().withSlug('my-app').build()).build()`. Tests:

- `'deletes the rows, then removes the app from the runtime'`: `repository.findBySlug.calledOnceWithExactly(match.any, 'my-app')`; `repository.deleteWithReleases.calledOnceWithExactly(match.any, placement.app.uuid)`; `appRuntime.destroy.firstCall.args[0]` `toMatchObject({ slug: 'my-app' })`; `repository.deleteWithReleases.getCall(0).calledBefore(appRuntime.destroy.getCall(0))` is `true`.
- `'throws NotFound and touches nothing for an unknown app'`: `findBySlug.resolves(undefined)` → `NotFoundException`; neither `deleteWithReleases` nor `destroy` called.
- `'maps a runtime failure to 502 so the transaction rolls the rows back'`: `destroy.rejects(new Error('connection refused'))` → `BadGatewayException`.

- [ ] **Step 3: Verify failure** — typecheck fails on the constructor arity and repository signatures.

- [ ] **Step 4: Implement**

Repository:

```ts
import type { Database, Executor } from '#src/modules/database/drizzle.factory.js'

  async findBySlug(tx: Executor, slug: string): Promise<AppPlacement | undefined> {
    const [placement] = await selectAppPlacement(tx)
      .where(eq(appTable.slug, slug))
      .limit(1)
      .for('update', { of: appTable })
    return placement
  }

  // Releases first — their FK has no cascade, so deleting the app alone would fail.
  async deleteWithReleases(tx: Executor, appUuid: AppUuid): Promise<void> {
    await tx.delete(releaseTable).where(eq(releaseTable.appUuid, appUuid))
    await tx.delete(appTable).where(eq(appTable.uuid, appUuid))
  }
```

Drop the `@InjectDatabase()` constructor if nothing else uses `this.db` (keep the class `@Injectable()` with no constructor).

Use-case:

```ts
import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common'
import type { AppPlacement } from '#src/app/app-management/queries/app-placement.js'
import { DeleteAppRepository } from '#src/app/app-management/use-cases/delete-app/delete-app.repository.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'

@Injectable()
export class DeleteAppUseCase {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: DeleteAppRepository,
    private readonly appRuntime: AppRuntime,
  ) {}

  async execute(slug: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const placement = await this.repository.findBySlug(tx, slug)
      if (!placement) {
        throw new NotFoundException(`App '${slug}' was not found.`)
      }
      await this.repository.deleteWithReleases(tx, placement.app.uuid)
      await this.destroy(placement)
    })
  }

  private async destroy(placement: AppPlacement): Promise<void> {
    try {
      await this.appRuntime.destroy(placement)
    } catch (error) {
      // The rows roll back, so the app stays listed and the delete can be retried.
      throw new BadGatewayException(
        `Could not remove '${placement.app.slug}' from the cluster. Please try again.`,
        { cause: error },
      )
    }
  }
}
```

- [ ] **Step 5: Verify** — `pnpm --filter api typecheck && pnpm --filter api lint && pnpm --filter api test` green.

- [ ] **Step 6: Commit** — `refactor: delete an app's rows and runtime resources in one transaction`.

---

### Task 3: `update-app` — write, then re-apply, in one transaction

**Files:**

- Modify: `apps/api/src/app/app-management/use-cases/update-app/update-app.use-case.ts`
- Modify: `apps/api/src/app/app-management/use-cases/update-app/update-app.repository.ts`
- Modify: `apps/api/src/app/app-management/use-cases/update-app/tests/update-app.use-case.unit.test.ts`
- Modify: `apps/api/src/app/app-management/use-cases/update-app/tests/update-app.e2e.test.ts`

**Interfaces:**

- Produces: `UpdateAppUseCase(db: Database, repository, credentialsCipher, appRuntime, config)`; `UpdateAppRepository.findPlacementBySlug(tx, slug)` (locks the app row), `updateBySlug(tx, slug, patch)`, `findRelease(tx, uuid, appUuid)`.

- [ ] **Step 1: Failing e2e test** — append to `update-app.e2e.test.ts` (imports `eq` is already there; add `ReleaseBuilder`, `releaseTable`, `AppRuntime`, `type MockAppRuntime`):

```ts
it('keeps the old pin when re-applying it to the runtime fails', async () => {
  const slug = 'update-app-e2e-pin-fail'
  const app = new AppBuilder().withEnvironmentUuid(environment.uuid).withSlug(slug).build()
  const live = new ReleaseBuilder().withApp(app).build()
  await setup.db.insert(appTable).values(app)
  await setup.db.insert(releaseTable).values(live)
  const runtime = setup.testModule.get<AppRuntime, MockAppRuntime>(AppRuntime)
  runtime.setLiveRelease(slug, live.uuid)
  runtime.failNext('deploy', new Error('cluster down'))

  await request(setup.httpServer)
    .patch(`/api/v1/apps/${slug}`)
    .set('Cookie', cookie)
    .send({
      nodePin: { key: 'kubernetes.io/hostname', values: ['node-a'], strategy: 'required' },
    })
    .expect(500)

  const [stored] = await setup.db.select().from(appTable).where(eq(appTable.slug, slug))
  expect(stored?.nodePin).toBeNull()
})
```

- [ ] **Step 2: Rewrite the unit test wiring**

`build()` injects `stubDatabase()` first and stubs the placement read by default:

```ts
  const repository = createStubInstance(UpdateAppRepository)
  repository.findPlacementBySlug.resolves(placement)
  repository.updateBySlug.resolves(saved)
  …
    usecase: new UpdateAppUseCase(stubDatabase(), repository, cipher, appRuntime, config),
```

Repository-call assertions gain a leading `match.any` (the `tx`): `repository.updateBySlug.firstCall.args` becomes `[, slug, patch]`. Test changes:

- `'throws NotFound when no app has the slug'`: `repository.findPlacementBySlug.resolves(undefined)`; also assert `updateBySlug.called` is `false`.
- `'fails, and writes nothing, when the live release…'` → rename `'fails when the live release is not a release of this app'`; keep the `InternalServerErrorException` expectation and `appRuntime.deploy.called === false`; drop the `updateBySlug.called === false` line (the rollback now guarantees it; the e2e test proves rollbacks).
- `'stores nothing when the apply fails…'` → `'propagates a failed deploy so the transaction rolls the write back'`: `appRuntime.deploy.rejects(new Error('cluster unreachable'))` → rejects `'cluster unreachable'`.
- `'applies before it writes'` → `'writes before it deploys'` with the expected order `['write', 'deploy']` (rename the recorded labels accordingly).
- The two "unchanged pin" tests stub `findPlacementBySlug` **and** `updateBySlug` (already the case); keep their assertions.

- [ ] **Step 3: Verify failure** — typecheck fails on the constructor and repository signatures.

- [ ] **Step 4: Implement**

Repository — every method takes `tx: Executor` first; the placement read locks:

```ts
  async updateBySlug(tx: Executor, slug: string, patch: AppConfigPatch): Promise<App | undefined> {
    // (body unchanged, but `tx.update(appTable)` instead of `this.db.update(appTable)`)
  }

  async findPlacementBySlug(tx: Executor, slug: string): Promise<AppPlacement | undefined> {
    const [placement] = await selectAppPlacement(tx)
      .where(eq(appTable.slug, slug))
      .limit(1)
      .for('update', { of: appTable })
    return placement
  }

  // Scoped by app too: a release uuid read off the cluster can't address another app's release.
  async findRelease(tx: Executor, uuid: ReleaseUuid, appUuid: AppUuid): Promise<Release | undefined> {
    // (body unchanged, `tx.select()`)
  }
```

Remove the constructor / `@InjectDatabase()` if unused.

Use-case — inject `@InjectDatabase() private readonly db: Database` first; `execute` becomes:

```ts
  async execute(slug: string, command: UpdateAppCommand): Promise<UpdateAppResponse> {
    return this.db.transaction(async (tx) => {
      const placement = await this.repository.findPlacementBySlug(tx, slug)
      if (!placement) {
        throw new NotFoundException(`App '${slug}' was not found.`)
      }

      const updated = await this.repository.updateBySlug(tx, slug, {
        image: command.image,
        containerPort: command.containerPort,
        minReplicas: command.minReplicas,
        maxReplicas: command.maxReplicas,
        env: command.env,
        nodePin: command.nodePin,
        imagePullCredentialsEnc: this.credentialsEnc(command),
      })
      if (!updated) {
        throw new NotFoundException(`App '${slug}' was not found.`)
      }

      const pinChanged =
        command.nodePin !== undefined && !nodePinEquals(placement.app.nodePin, updated.nodePin)
      if (pinChanged) {
        await this.reapply(tx, { ...placement, app: updated })
      }
      return new UpdateAppResponse(updated)
    })
  }
```

Delete `applyPin` and the "Cluster first, database second" comment block. `reapply(tx: Executor, placement: AppPlacement)` keeps its body but reads the release with `this.repository.findRelease(tx, liveUuid, placement.app.uuid)`. Keep the class-level comment. Import `type Executor` from `#src/modules/database/drizzle.factory.js`.

- [ ] **Step 5: Verify** — typecheck, lint, full suite green.

- [ ] **Step 6: Commit** — `refactor: write an app edit, then re-apply its pin, in one transaction`.

---

### Task 4: `deploy-release` — lock, mark pending, deploy; record `Failed` after the rollback

> **Superseded in review (PR #232):** `Failed` is now written inside the transaction after rolling back a savepoint, not by `markFailed` after it — see AgDR-0047.

**Files:**

- Modify: `apps/api/src/app/release/use-cases/deploy-release/deploy-release.use-case.ts`
- Modify: `apps/api/src/app/release/use-cases/deploy-release/deploy-release.repository.ts`
- Modify: `apps/api/src/app/release/use-cases/deploy-release/tests/deploy-release.use-case.unit.test.ts`
- Modify: `apps/api/src/app/release/use-cases/deploy-release/tests/deploy-release.e2e.test.ts`

**Interfaces:**

- Produces: `DeployReleaseUseCase(db: Database, repository, appRuntime, cipher, config)`; `DeployReleaseRepository.findPlacement(tx, slug)` (locks the app row), `findNewestRelease(tx, appUuid)`, `setDeployStatus(tx, uuid, status)`, `markFailed(uuid)` (outside any transaction). `findAppWithNewestRelease` is removed.

- [ ] **Step 1: Failing e2e test** — append (imports `AppRuntime`, `type MockAppRuntime`):

```ts
it('records the failure when the runtime rejects the rollout', async () => {
  const slug = 'deploy-release-e2e-fail'
  const app = new AppBuilder().withEnvironmentUuid(environment.uuid).withSlug(slug).build()
  const release = new ReleaseBuilder().withApp(app).build()
  await setup.db.insert(appTable).values(app)
  await setup.db.insert(releaseTable).values(release)
  setup.testModule
    .get<AppRuntime, MockAppRuntime>(AppRuntime)
    .failNext('deploy', new Error('cluster down'))

  await request(setup.httpServer)
    .post(`/api/v1/apps/${slug}/deploy`)
    .set('Cookie', cookie)
    .expect(500)

  const [stored] = await setup.db
    .select()
    .from(releaseTable)
    .where(eq(releaseTable.uuid, release.uuid))
  expect(stored?.deployStatus).toBe(DeployStatus.Failed)
})
```

- [ ] **Step 2: Rewrite the unit test wiring**

```ts
import { createStubInstance, match } from 'sinon'
import { stubDatabase } from '#src/test/setup/stub-database.js'

  const repository = createStubInstance(DeployReleaseRepository)
  repository.findPlacement.resolves(placement)
  repository.findNewestRelease.resolves(release)
  repository.setDeployStatus.resolves()
  repository.markFailed.resolves()
  …
    usecase: new DeployReleaseUseCase(stubDatabase(), repository, appRuntime, cipher, config),
```

Assertion rewrites:

- `findAppWithNewestRelease.calledOnceWithExactly('my-app')` → `findPlacement.calledOnceWithExactly(match.any, 'my-app')` and `findNewestRelease.calledOnceWithExactly(match.any, app.uuid)`.
- `setDeployStatus.calledOnceWithExactly(release.uuid, DeployStatus.Pending)` → `(match.any, release.uuid, DeployStatus.Pending)`.
- Every `setDeployStatus.lastCall.args` equal to `[release.uuid, DeployStatus.Failed]` / `calledWith(release.uuid, DeployStatus.Failed)` → `repository.markFailed.calledOnceWithExactly(release.uuid)` is `true`.
- `'keeps a running release succeeded when re-applying it fails'` → also assert `markFailed.called` is `false`.
- No-release / unknown-app tests: `findNewestRelease.resolves(null)` / `findPlacement.resolves(undefined)`.

- [ ] **Step 3: Verify failure** — typecheck.

- [ ] **Step 4: Implement**

Repository (replace `findAppWithNewestRelease`, keep imports that remain used):

```ts
@Injectable()
export class DeployReleaseRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findPlacement(tx: Executor, slug: string): Promise<AppPlacement | undefined> {
    const [placement] = await selectAppPlacement(tx)
      .where(eq(appTable.slug, slug))
      .limit(1)
      .for('update', { of: appTable })
    return placement
  }

  // uuidv7 sorts by creation time, which is the order the release list uses too.
  async findNewestRelease(tx: Executor, appUuid: AppUuid): Promise<Release | null> {
    const [release] = await tx
      .select()
      .from(releaseTable)
      .where(eq(releaseTable.appUuid, appUuid))
      .orderBy(desc(releaseTable.uuid))
      .limit(1)
    return release ?? null
  }

  async setDeployStatus(
    tx: Executor,
    uuid: ReleaseUuid,
    deployStatus: DeployStatus,
  ): Promise<void> {
    await tx.update(releaseTable).set({ deployStatus }).where(eq(releaseTable.uuid, uuid))
  }

  // Outside any transaction: it records a rollout the rollback just undid.
  async markFailed(uuid: ReleaseUuid): Promise<void> {
    await this.db
      .update(releaseTable)
      .set({ deployStatus: DeployStatus.Failed })
      .where(eq(releaseTable.uuid, uuid))
  }
}
```

(`DeployStatus` becomes a value import; `desc` from `drizzle-orm`; `selectAppPlacement` replaces `appPlacementFields`; drop the `environmentTable` / `projectTable` / `sql` / `and` imports.) The app row lock also serialises two deploys of one app, which is why reading the newest release after it is enough.

Use-case `execute` (the private `deploy` helper is unchanged; `reapplyRunning` / `rollOut` are folded in):

```ts
  async execute(slug: string): Promise<DeployReleaseResponse> {
    const attempt: { rollingOut?: Release } = {}
    try {
      return await this.db.transaction(async (tx) => {
        const placement = await this.repository.findPlacement(tx, slug)
        if (!placement) {
          throw new NotFoundException(`App '${slug}' was not found.`)
        }
        const release = await this.repository.findNewestRelease(tx, placement.app.uuid)
        if (!release) {
          throw new ConflictException(`App '${slug}' has no release to deploy. Create one first.`)
        }

        // Already live, so the deploy is a runtime no-op; a failed retry must not mark it failed.
        if (release.deployStatus !== DeployStatus.Succeeded) {
          attempt.rollingOut = release
          await this.repository.setDeployStatus(tx, release.uuid, DeployStatus.Pending)
        }
        await this.deploy(placement, release)

        const deployStatus = attempt.rollingOut ? DeployStatus.Pending : release.deployStatus
        return new DeployReleaseResponse(
          placement.app.slug,
          { ...release, deployStatus },
          this.baseDomain,
        )
      })
    } catch (error) {
      // The rollback undid Pending; Failed is written on its own so the failure stays visible.
      if (attempt.rollingOut) {
        await this.repository.markFailed(attempt.rollingOut.uuid)
      }
      throw error
    }
  }
```

Inject `@InjectDatabase() private readonly db: Database` as the first constructor parameter. Keep the class comment.

- [ ] **Step 5: Verify** — typecheck, lint, full suite.

- [ ] **Step 6: Commit** — `refactor: deploy a release inside one transaction and record failures after it`.

---

### Task 5: `create-release` — lock the app while snapshotting it

**Files:**

- Modify: `apps/api/src/app/release/use-cases/create-release/create-release.use-case.ts`
- Modify: `apps/api/src/app/release/use-cases/create-release/create-release.repository.ts`
- Modify: `apps/api/src/app/release/use-cases/create-release/tests/create-release.use-case.unit.test.ts`
- Create: `apps/api/src/app/release/use-cases/create-release/tests/create-release.repository.db.test.ts`

**Interfaces:**

- Produces: `CreateReleaseUseCase(db: Database, repository)`; `CreateReleaseRepository.findAppBySlug(tx, slug)` (locks), `findRelease(tx, uuid)`, `insertRelease(tx, release)`, `restoreAppConfig(tx, appUuid, config)`. `createRelease` is removed.

- [ ] **Step 1: Failing db test** — the lock is an invariant no request can observe, so it gets a `.db.test.ts` (`repository.md`):

```ts
import { after, before, beforeEach, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { CreateReleaseModule } from '#src/app/release/use-cases/create-release/create-release.module.js'
import { CreateReleaseRepository } from '#src/app/release/use-cases/create-release/create-release.repository.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const LOCK_NOT_AVAILABLE = '55P03'

function pgCode(error: unknown): string | undefined {
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    const code = (current as Error & { code?: string }).code
    if (code) {
      return code
    }
  }
  return undefined
}

// Unreachable over HTTP: a concurrent edit landing mid-snapshot needs two requests racing.
describe('CreateReleaseRepository (db)', () => {
  let setup: TestSetup
  let repository: CreateReleaseRepository

  before(async () => {
    setup = await TestBench.setupModuleTest(CreateReleaseModule)
    repository = setup.testModule.get(CreateReleaseRepository)
  })

  beforeEach(() => setup.teardown())

  after(() => setup.teardown())

  it('holds the app row until the snapshot commits, so a concurrent edit cannot interleave', async () => {
    const { environment } = await setup.seedEnvironment()
    const app = new AppBuilder().withEnvironmentUuid(environment.uuid).withSlug('lock-me').build()
    await setup.db.insert(appTable).values(app)

    let concurrent: unknown
    await setup.db.transaction(async (tx) => {
      await repository.findAppBySlug(tx, 'lock-me')
      concurrent = await setup.db
        .select()
        .from(appTable)
        .where(eq(appTable.slug, 'lock-me'))
        .for('update', { noWait: true })
        .catch((error: unknown) => error)
    })

    expect(pgCode(concurrent)).toBe(LOCK_NOT_AVAILABLE)
  })
})
```

- [ ] **Step 2: Verify failure** — typecheck: `findAppBySlug` expects 1 argument.

- [ ] **Step 3: Implement**

Repository:

```ts
@Injectable()
export class CreateReleaseRepository {
  async findAppBySlug(tx: Executor, slug: string): Promise<App | undefined> {
    const [app] = await tx
      .select()
      .from(appTable)
      .where(eq(appTable.slug, slug))
      .limit(1)
      .for('update')
    return app
  }

  async findRelease(tx: Executor, uuid: ReleaseUuid): Promise<Release | undefined> {
    const [release] = await tx
      .select()
      .from(releaseTable)
      .where(eq(releaseTable.uuid, uuid))
      .limit(1)
    return release
  }

  async insertRelease(tx: Executor, release: Release): Promise<void> {
    await tx.insert(releaseTable).values(release)
  }

  async restoreAppConfig(tx: Executor, appUuid: AppUuid, config: AppConfig): Promise<void> {
    await tx.update(appTable).set(config).where(eq(appTable.uuid, appUuid))
  }
}
```

Use-case — inject `@InjectDatabase() private readonly db: Database` first:

```ts
  async execute(slug: string, command: CreateReleaseCommand): Promise<CreateReleaseResponse> {
    return this.db.transaction(async (tx) => {
      const app = await this.repository.findAppBySlug(tx, slug)
      if (!app) {
        throw new NotFoundException(`App '${slug}' was not found.`)
      }

      const source = command.fromReleaseUuid
        ? await this.findSource(tx, app, command.fromReleaseUuid as ReleaseUuid)
        : null

      const release = new ReleaseBuilder()
        .withApp(app)
        .withSnapshot(source ?? snapshotOf(app))
        .withTriggeredBy(source ? ReleaseTrigger.Rollback : ReleaseTrigger.Manual)
        .withSourceReleaseUuid(source?.uuid ?? null)
        .withDeployStatus(DeployStatus.Pending)
        .build()

      await this.repository.insertRelease(tx, release)
      // A rollback restores the app's config too, so the next deploy doesn't undo it.
      if (source) {
        await this.repository.restoreAppConfig(tx, app.uuid, appConfigOf(source))
      }

      return new CreateReleaseResponse(app, release)
    })
  }

  private async findSource(tx: Executor, app: App, uuid: ReleaseUuid): Promise<Release> {
    const source = await this.repository.findRelease(tx, uuid)
    if (!source || source.appUuid !== app.uuid) {
      throw new NotFoundException(`Release '${uuid}' was not found for app '${app.slug}'.`)
    }
    return source
  }
```

- [ ] **Step 4: Rewrite the unit test** — `build()`: stub `findAppBySlug`, `findRelease`, `insertRelease`, `restoreAppConfig`; `new CreateReleaseUseCase(stubDatabase(), repository)`. Assertions that read `createRelease.firstCall.args` become: the release is `insertRelease.firstCall.args[1]`; the restored config is `restoreAppConfig.firstCall.args` `[match.any, app.uuid, <config>]`; a manual release asserts `restoreAppConfig.called === false`.

- [ ] **Step 5: Verify** — build, run the db test and unit test files, then the full suite.

- [ ] **Step 6: Commit** — `refactor: snapshot a release under a lock on its app`.

---

### Task 6: Environments — lock the deciding read, keep runtime calls last

**Files:**

- Modify: `apps/api/src/app/environment/use-cases/delete-environment/delete-environment.use-case.ts`
- Modify: `apps/api/src/app/environment/use-cases/delete-environment/delete-environment.repository.ts`
- Modify: `apps/api/src/app/environment/use-cases/delete-environment/tests/delete-environment.use-case.unit.test.ts`
- Modify: `apps/api/src/app/environment/use-cases/delete-environment/tests/delete-environment.e2e.test.ts`
- Modify: `apps/api/src/app/environment/use-cases/create-environment/create-environment.use-case.ts` (comment only)

**Interfaces:**

- Produces: `DeleteEnvironmentRepository.findBySlugs(tx: Executor, projectSlug, environmentSlug)` (locks the environment row).

`create-environment` already inserts, then provisions last, inside one transaction; it keeps the compensating `destroy` (see Global Constraints). Only its transaction comment changes.

- [ ] **Step 1: Failing e2e test** — append to `delete-environment.e2e.test.ts` (imports `EnvironmentRuntime`, `type MockEnvironmentRuntime`):

```ts
it('keeps the environment when the runtime cannot remove it', async () => {
  const { project, environment } = await setup.seedEnvironment()
  setup.testModule
    .get<EnvironmentRuntime, MockEnvironmentRuntime>(EnvironmentRuntime)
    .failNext('destroy', new Error('cluster down'))

  await request(setup.httpServer)
    .delete(`/api/v1/projects/${project.slug}/environments/${environment.slug}`)
    .set('Cookie', cookie)
    .expect(502)

  const rows = await setup.db
    .select()
    .from(environmentTable)
    .where(eq(environmentTable.uuid, environment.uuid))
  expect(rows).toHaveLength(1)
})
```

- [ ] **Step 2: Unit test** — `repository.findBySlugs` assertions gain a leading `match.any`; add `expect(repository.findBySlugs.calledOnceWithExactly(match.any, 'demo', 'dev')).toBe(true)` to the happy-path test.

- [ ] **Step 3: Verify failure** — typecheck on `findBySlugs` arity.

- [ ] **Step 4: Implement**

Repository:

```ts
  async findBySlugs(
    tx: Executor,
    projectSlug: string,
    environmentSlug: string,
  ): Promise<{ project: Project; environment: Environment } | undefined> {
    const [row] = await tx
      .select({ project: projectTable, environment: environmentTable })
      .from(environmentTable)
      .innerJoin(projectTable, eq(environmentTable.projectUuid, projectTable.uuid))
      .where(and(eq(projectTable.slug, projectSlug), eq(environmentTable.slug, environmentSlug)))
      .limit(1)
      .for('update', { of: environmentTable })
    return row
  }
```

Use-case — move the lookup inside the existing transaction:

```ts
  async execute(projectSlug: string, environmentSlug: string): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        const found = await this.repository.findBySlugs(tx, projectSlug, environmentSlug)
        if (!found) {
          throw new NotFoundException(
            `Environment '${environmentSlug}' was not found in project '${projectSlug}'.`,
          )
        }
        await this.repository.delete(tx, found.environment.uuid)
        await this.destroy(found)
      })
    } catch (error) {
      // The app FK is RESTRICT, so the DELETE itself fails while apps remain — no check-then-act race.
      if (isForeignKeyViolation(error)) {
        throw new ConflictException(
          `Environment '${environmentSlug}' still has apps. Delete them first.`,
        )
      }
      throw error
    }
  }
```

Drop the old "removed inside the transaction" comment (the rule now lives in `use-case.md`). In `create-environment.use-case.ts` replace `// Provisioning runs inside the transaction so a runtime failure rolls the row back with it.` with `// Provisioning is the last step inside the transaction, so a runtime failure rolls the row back.`

- [ ] **Step 5: Verify** — typecheck, lint, full suite.

- [ ] **Step 6: Commit** — `refactor: lock the environment while deleting it`.

---

### Task 7: Rules, AgDR-0047

**Files:**

- Modify: `.claude/rules/api/use-case.md`
- Modify: `.claude/rules/api/repository.md`
- Create: `docs/agdr/AgDR-0047-transactions-wrap-runtime-calls.md`
- Modify: `docs/local-dev.md` (troubleshooting note)

- [ ] **Step 1: `use-case.md`** — replace the "Depend on the repository, never on the database" section with:

````markdown
## Depend on the repository; inject the database only to open a transaction

```ts
// WRONG — the use-case queries the database itself
const [app] = await this.db.select().from(appTable).where(eq(appTable.slug, slug))

// RIGHT — the database is only the transaction boundary; the repository does the work
constructor(
  @InjectDatabase() private readonly db: Database,
  private readonly repository: DeleteAppRepository,
  private readonly appRuntime: AppRuntime,
) {}
```

Why: a use-case whose only database call is `db.transaction` is still unit-testable —
`stubDatabase()` runs the callback — while any query it ran itself would need Postgres.

## A writing use-case is one transaction, runtime call last

```ts
await this.db.transaction(async (tx) => {
  const placement = await this.repository.findBySlug(tx, slug) // deciding read, locked
  await this.repository.deleteWithReleases(tx, placement.app.uuid) // DB writes
  await this.appRuntime.destroy(placement) // runtime call, last
})
```

Why: DB-first means constraint failures (a taken slug, a RESTRICT FK) surface before any side
effect, and a runtime failure throws and rolls every write back, so an identical retry sees the
same starting state. Runtime calls must be idempotent for that retry to converge. A write that
must survive the rollback — recording a failed rollout — goes after the transaction, on its own.
The one unhandled case, a commit failing after the runtime call succeeded, is accepted
(AgDR-0047).
````

- [ ] **Step 2: `repository.md`** — extend "Take an explicit `Executor`…" with:

````markdown
A read that decides a write takes the `tx` too and locks what it decides on:

```ts
async findBySlug(tx: Executor, slug: string): Promise<AppPlacement | undefined> {
  const [placement] = await selectAppPlacement(tx)
    .where(eq(appTable.slug, slug))
    .limit(1)
    .for('update', { of: appTable })
  return placement
}
```

Why: at READ COMMITTED a plain read inside a transaction locks nothing, so a concurrent edit
can land between the read and the write. `of` keeps the lock on the row being decided on, not
on every joined table.

Each method does one job. Two reads that must agree are two methods called inside one
transaction, not one method returning both.
````

- [ ] **Step 3: AgDR-0047** — frontmatter like AgDR-0046 (`id: AgDR-0047`, `ticket: marsa-cloud/marsa#214`), sections:
  - Summary line: _In the context of use-cases that write rows and call the runtime, facing two opposite orderings in the codebase and #214's "no cluster call inside a transaction", I decided **one transaction per writing use-case with the runtime call last, rolling back on failure**, to achieve one simple rule every new use-case copies, accepting that a commit failing after a successful runtime call leaves the two out of step._
  - Context: the two orderings (`create-environment` in-tx, `update-app` cluster-first), #214's reads outside transactions, READ COMMITTED.
  - Options: runtime-first outside a transaction (retryable but needs per-use-case reasoning; rejected as the default); **transaction with the runtime call last (chosen)**; #214's original "no cluster call inside a transaction" (rejected); a `transaction(fn)` method on every repository (rejected — use-cases may inject `Database` for the transaction only); ambient ALS transactions (#171, deferred).
  - Decision: the rule verbatim from `use-case.md`, the `FOR UPDATE OF` locking, one job per repository method, `Failed` written after the rollback.
  - Consequences: a DB connection is held for the duration of a runtime call; `create-environment` keeps its compensating `destroy` for a partial provision; the accepted gap and its manual fix (`kubectl delete ns <name>` when a create-environment retry keeps returning 409); #171 remains a mechanical swap of how `tx` is passed.
  - Artifacts: spec, this plan, #214, #171.

- [ ] **Step 4: `docs/local-dev.md`** — append a short "Troubleshooting" section: _Creating an environment keeps failing with 409 "already taken"_ → a previous attempt provisioned the namespace but its database commit failed; `kubectl delete ns <project>-<environment>` (only if no environment row has that uuid) and retry. Link AgDR-0047.

- [ ] **Step 5: Verify** — `pnpm format:check`.

- [ ] **Step 6: Commit** — `docs: record the transaction rule for runtime-calling use-cases`.

---

## After the tasks (orchestrator)

1. Full local CI: `pnpm format:check && pnpm lint && pnpm --filter api typecheck && pnpm --filter web typecheck && pnpm build:web && pnpm --filter api test && pnpm --filter web test`.
2. Push, open `refactor(#214): wrap writing use-cases in one transaction, runtime call last` with **base `refactor/226-runtime-port`**, `Closes #214`, narrative summary, Glossary.
3. Ask before commenting on #171 (external write): the interim `tx`-threading is now the sanctioned shape.
4. After #231 merges: rebase onto `main`, retarget the PR base, re-run CI.
