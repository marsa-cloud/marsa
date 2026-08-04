# Delete App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator permanently delete an app — tearing down its Kubernetes resources, then removing its database rows — from a danger zone on the app detail page.

**Architecture:** A new `destroy` method on the `DeployBackend` port (the single seam for cluster mutation) deletes IngressRoute → Deployment → Service → pull Secret, treating 404 as success. A new `delete-app` vertical slice in `app-management` looks the app up by slug, calls `destroy`, and only then deletes release rows and the app row in one transaction — so a failed teardown leaves a retryable record instead of an orphaned Deployment. The web adds an imperative `useDeleteApp` composable and a type-the-slug confirmation modal.

**Tech Stack:** NestJS 11 on Fastify, Drizzle ORM (Postgres), `@kubernetes/client-node` 1.4.0, `node:test` + `expect` + `sinon` for api tests; Nuxt 4, Nuxt UI, Vitest + `@nuxt/test-utils` for web tests.

Design spec: `docs/superpowers/specs/2026-08-04-delete-app-design.md`

## Global Constraints

- Run every command from the worktree root: `/home/gomaa-zorin/Github/marsa-workspace/apexyard/workspace/marsa/.claude/worktrees/feat+delete-app`
- Imports use subpath specifiers (`#src/*`, `#test/*`) with an explicit `.js` extension — relative imports are an ESLint error
- Comments only where they record a non-obvious **why**; never restate the code
- Run `pnpm format` before staging, and stage specific files — never `git add -A` or `git add .`
- The api test pipeline compiles to `dist/` first: `pnpm --filter api test` runs clean → build → setup → run. There is no watch mode.
- Postgres must be running (`docker compose up -d`) and `apps/api/.env` must exist (`cp apps/api/.env.test apps/api/.env`) for api tests
- Response DTOs, commands, and entities follow the builder / constructor conventions in `apps/api/CLAUDE.md` — this feature needs no command or response DTO
- Coverage floors are ratchets: api lines 80 / branches 75 / functions 75; web lines+statements 88 / branches 85 / functions 60. Never lower them.

---

### Task 1: 404-tolerant delete helper

Kubernetes teardown must be idempotent — after a partial failure the user retries, and resources already gone must not fail the retry. This extracts the existing private `isNotFound` check into a shared, unit-testable helper (the `DirectApplyDeployBackend` constructor loads a real kubeconfig, so its methods can't be unit-tested directly; a pure helper can).

**Files:**

- Create: `apps/api/src/modules/kubernetes/not-found.ts`
- Create: `apps/api/src/modules/kubernetes/tests/not-found.unit.test.ts`
- Modify: `apps/api/src/modules/kubernetes/direct-apply-deploy-backend.ts` (remove the local `isNotFound`, import it instead)

**Interfaces:**

- Consumes: nothing
- Produces: `isNotFound(error: unknown): boolean` and `ignoreNotFound(remove: () => Promise<unknown>): Promise<void>` from `#src/modules/kubernetes/not-found.js`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/kubernetes/tests/not-found.unit.test.ts`:

```ts
import { describe, it } from 'node:test'
import { ApiException } from '@kubernetes/client-node'
import { expect } from 'expect'
import { ignoreNotFound, isNotFound } from '#src/modules/kubernetes/not-found.js'

describe('isNotFound', () => {
  it('is true for a 404 ApiException', () => {
    expect(isNotFound(new ApiException(404, 'Not Found', {}, {}))).toBe(true)
  })

  it('is false for any other status', () => {
    expect(isNotFound(new ApiException(403, 'Forbidden', {}, {}))).toBe(false)
  })

  it('is false for a plain error', () => {
    expect(isNotFound(new Error('socket hang up'))).toBe(false)
  })
})

describe('ignoreNotFound', () => {
  it('resolves when the delete succeeds', async () => {
    let called = false
    await ignoreNotFound(async () => {
      called = true
    })
    expect(called).toBe(true)
  })

  it('swallows a 404 so a retried teardown still completes', async () => {
    await ignoreNotFound(() => Promise.reject(new ApiException(404, 'Not Found', {}, {})))
  })

  it('rethrows anything that is not a 404', async () => {
    await expect(
      ignoreNotFound(() => Promise.reject(new ApiException(500, 'Server Error', {}, {}))),
    ).rejects.toThrow('Server Error')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter api test 2>&1 | tail -30`
Expected: FAIL — the build errors with `Cannot find module '#src/modules/kubernetes/not-found.js'`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/modules/kubernetes/not-found.ts`:

```ts
import { ApiException } from '@kubernetes/client-node'

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiException && error.code === 404
}

/**
 * Teardown must stay idempotent: a partial failure is retried, and the
 * resources the first attempt already removed must not fail the second.
 */
export async function ignoreNotFound(remove: () => Promise<unknown>): Promise<void> {
  try {
    await remove()
  } catch (error) {
    if (isNotFound(error)) {
      return
    }
    throw error
  }
}
```

- [ ] **Step 4: Point the existing backend at the shared helper**

In `apps/api/src/modules/kubernetes/direct-apply-deploy-backend.ts`, delete this local function:

```ts
function isNotFound(error: unknown): boolean {
  return error instanceof ApiException && error.code === 404
}
```

Add to the import block (sorted: packages first, then `#src/*`):

```ts
import { isNotFound } from '#src/modules/kubernetes/not-found.js'
```

Then remove `ApiException` from the `@kubernetes/client-node` import list if nothing else in the file uses it — unused imports are an ESLint error. Verify with:

```bash
grep -n "ApiException" apps/api/src/modules/kubernetes/direct-apply-deploy-backend.ts
```

- [ ] **Step 5: Run tests and lint**

Run: `pnpm --filter api test 2>&1 | grep -E "^ℹ (tests|pass|fail)" && pnpm --filter api lint`
Expected: `fail 0`, test count 170+ (167 baseline + 6 new), lint clean.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add apps/api/src/modules/kubernetes/not-found.ts apps/api/src/modules/kubernetes/tests/not-found.unit.test.ts apps/api/src/modules/kubernetes/direct-apply-deploy-backend.ts
git commit -m "refactor: extract 404-tolerant delete helper for kubernetes teardown"
```

---

### Task 2: `DeployBackend.destroy` — port, mock, and real implementation

**Files:**

- Modify: `apps/api/src/modules/kubernetes/deploy-backend.ts` (add the abstract method)
- Modify: `apps/api/src/modules/kubernetes/mock-deploy-backend.ts` (no-op)
- Modify: `apps/api/src/modules/kubernetes/direct-apply-deploy-backend.ts` (real deletes)

**Interfaces:**

- Consumes: `ignoreNotFound` from Task 1
- Produces: `DeployBackend.destroy(namespace: string, appName: string): Promise<void>` — used by Task 4's use-case. `REGISTRY_SECRET_SUFFIX` (existing, `'-registry'`) forms the pull-secret name `` `${appName}${REGISTRY_SECRET_SUFFIX}` ``.

- [ ] **Step 1: Add the abstract method to the port**

In `apps/api/src/modules/kubernetes/deploy-backend.ts`, add inside the `DeployBackend` class, after `apply`:

```ts
  /**
   * Remove every resource `apply` created for an app. Deletes in traffic-safety
   * order (IngressRoute first) and treats a missing resource as success, so a
   * teardown retried after a partial failure still completes.
   */
  abstract destroy(namespace: string, appName: string): Promise<void>
```

- [ ] **Step 2: Add the mock implementation**

In `apps/api/src/modules/kubernetes/mock-deploy-backend.ts`, add after `apply`:

```ts
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  destroy(_namespace: string, _appName: string): Promise<void> {
    return Promise.resolve()
  }
```

- [ ] **Step 3: Add the real implementation**

In `apps/api/src/modules/kubernetes/direct-apply-deploy-backend.ts`, add `REGISTRY_SECRET_SUFFIX` to the existing import from `#src/modules/kubernetes/deploy-backend.constants.js`, add `ignoreNotFound` to the import from `#src/modules/kubernetes/not-found.js`, then add this method after `apply`:

```ts
  async destroy(namespace: string, appName: string): Promise<void> {
    // IngressRoute first so routing stops before the pods it points at go away.
    await ignoreNotFound(() =>
      this.custom.deleteNamespacedCustomObject({
        group: TRAEFIK_GROUP,
        version: TRAEFIK_VERSION,
        namespace,
        plural: INGRESS_ROUTE_PLURAL,
        name: appName,
      }),
    )

    await ignoreNotFound(() =>
      this.apps.deleteNamespacedDeployment({ name: appName, namespace }),
    )

    await ignoreNotFound(() => this.core.deleteNamespacedService({ name: appName, namespace }))

    // Attempted unconditionally — the app row does not record whether a pull
    // secret was rendered, so a 404 here is the normal case.
    await ignoreNotFound(() =>
      this.core.deleteNamespacedSecret({
        name: `${appName}${REGISTRY_SECRET_SUFFIX}`,
        namespace,
      }),
    )
  }
```

- [ ] **Step 4: Verify it compiles and nothing regressed**

Run: `pnpm --filter api typecheck && pnpm --filter api test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: typecheck clean, `fail 0`. If typecheck reports `MockDeployBackend` is not assignable to `DeployBackend`, the mock is missing `destroy` — go back to Step 2.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add apps/api/src/modules/kubernetes/deploy-backend.ts apps/api/src/modules/kubernetes/mock-deploy-backend.ts apps/api/src/modules/kubernetes/direct-apply-deploy-backend.ts
git commit -m "feat: add destroy to the deploy backend port"
```

---

### Task 3: `delete-app` repository and use-case

**Files:**

- Create: `apps/api/src/app/app-management/use-cases/delete-app/delete-app.repository.ts`
- Create: `apps/api/src/app/app-management/use-cases/delete-app/delete-app.use-case.ts`
- Create: `apps/api/src/app/app-management/use-cases/delete-app/tests/delete-app.use-case.unit.test.ts`

**Interfaces:**

- Consumes: `DeployBackend.destroy` (Task 2); `OPERATOR_APPS_NAMESPACE` from `#src/modules/kubernetes/deploy-backend.constants.js`
- Produces:
  - `DeleteAppRepository.findBySlug(slug: string): Promise<App | undefined>`
  - `DeleteAppRepository.deleteWithReleases(appUuid: AppUuid): Promise<void>`
  - `DeleteAppUseCase.execute(slug: string): Promise<void>` — throws `NotFoundException` (404) or `BadGatewayException` (502)

- [ ] **Step 1: Write the failing unit test**

Create `apps/api/src/app/app-management/use-cases/delete-app/tests/delete-app.use-case.unit.test.ts`:

```ts
import { before, describe, it } from 'node:test'
import { BadGatewayException, NotFoundException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { DeleteAppRepository } from '#src/app/app-management/use-cases/delete-app/delete-app.repository.js'
import { DeleteAppUseCase } from '#src/app/app-management/use-cases/delete-app/delete-app.use-case.js'
import { MockDeployBackend } from '#src/modules/kubernetes/mock-deploy-backend.js'
import { TestBench } from '#src/test/setup/test-bench.js'

function build() {
  const repository = createStubInstance(DeleteAppRepository)
  const deployBackend = createStubInstance(MockDeployBackend)
  const usecase = new DeleteAppUseCase(repository, deployBackend)
  return { repository, deployBackend, usecase }
}

describe('DeleteAppUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('tears down the cluster resources before deleting the rows', async () => {
    const app = new AppBuilder().withSlug('my-app').build()
    const { repository, deployBackend, usecase } = build()
    repository.findBySlug.resolves(app)

    await usecase.execute('my-app')

    expect(deployBackend.destroy.calledOnceWith('marsa-apps', 'my-app')).toBe(true)
    expect(repository.deleteWithReleases.calledOnceWith(app.uuid)).toBe(true)
    expect(deployBackend.destroy.calledBefore(repository.deleteWithReleases)).toBe(true)
  })

  it('throws 404 for an unknown slug and touches neither the cluster nor the rows', async () => {
    const { repository, deployBackend, usecase } = build()
    repository.findBySlug.resolves(undefined)

    await expect(usecase.execute('ghost')).rejects.toThrow(NotFoundException)

    expect(deployBackend.destroy.called).toBe(false)
    expect(repository.deleteWithReleases.called).toBe(false)
  })

  it('throws 502 and keeps the rows when teardown fails, so the delete can be retried', async () => {
    const { repository, deployBackend, usecase } = build()
    repository.findBySlug.resolves(new AppBuilder().withSlug('my-app').build())
    deployBackend.destroy.rejects(new Error('connection refused'))

    await expect(usecase.execute('my-app')).rejects.toThrow(BadGatewayException)

    expect(repository.deleteWithReleases.called).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter api test 2>&1 | tail -20`
Expected: FAIL — build error, `Cannot find module '.../delete-app.use-case.js'`.

- [ ] **Step 3: Write the repository**

Create `apps/api/src/app/app-management/use-cases/delete-app/delete-app.repository.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import { releaseTable } from '#src/app/release/entities/release.table.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class DeleteAppRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findBySlug(slug: string): Promise<App | undefined> {
    const [app] = await this.db.select().from(appTable).where(eq(appTable.slug, slug)).limit(1)
    return app
  }

  /** Releases first — their FK has no cascade, so deleting the app alone would fail. */
  async deleteWithReleases(appUuid: AppUuid): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(releaseTable).where(eq(releaseTable.appUuid, appUuid))
      await tx.delete(appTable).where(eq(appTable.uuid, appUuid))
    })
  }
}
```

Note: `findBySlug` uses `db.select()` rather than the relational-query object filter, which rejects branded uuid key types.

- [ ] **Step 4: Write the use-case**

Create `apps/api/src/app/app-management/use-cases/delete-app/delete-app.use-case.ts`:

```ts
import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common'
import { DeleteAppRepository } from '#src/app/app-management/use-cases/delete-app/delete-app.repository.js'
import { OPERATOR_APPS_NAMESPACE } from '#src/modules/kubernetes/deploy-backend.constants.js'
import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'

@Injectable()
export class DeleteAppUseCase {
  constructor(
    private readonly repository: DeleteAppRepository,
    private readonly deployBackend: DeployBackend,
  ) {}

  async execute(slug: string): Promise<void> {
    const app = await this.repository.findBySlug(slug)
    if (!app) {
      throw new NotFoundException(`App '${slug}' was not found.`)
    }

    try {
      await this.deployBackend.destroy(OPERATOR_APPS_NAMESPACE, slug)
    } catch (error) {
      // Rows stay put so the app remains listed and the delete can be retried.
      throw new BadGatewayException(
        `Could not remove '${slug}' from the cluster. Please try again.`,
        { cause: error },
      )
    }

    await this.repository.deleteWithReleases(app.uuid)
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter api test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `fail 0`, three more tests than after Task 2.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add apps/api/src/app/app-management/use-cases/delete-app/
git commit -m "feat: add delete-app use-case and repository"
```

---

### Task 4: HTTP endpoint, module wiring, e2e tests, and contract regeneration

**Files:**

- Create: `apps/api/src/app/app-management/use-cases/delete-app/delete-app.controller.ts`
- Create: `apps/api/src/app/app-management/use-cases/delete-app/delete-app.module.ts`
- Create: `apps/api/src/app/app-management/use-cases/delete-app/tests/delete-app.e2e.test.ts`
- Modify: `apps/api/src/app/app-management/app-management.module.ts`
- Modify: `apps/api/openapi.json` (regenerated)
- Modify: `apps/web/app/api/types.gen.ts`, `apps/web/app/api/zod.gen.ts` (regenerated)

**Interfaces:**

- Consumes: `DeleteAppUseCase` (Task 3), `SessionAuthGuard` from `#src/app/auth/guards/session-auth.guard.js`, `KubernetesModule` from `#src/modules/kubernetes/kubernetes.module.js`
- Produces: `DELETE /api/v1/apps/:slug` → 204 | 401 | 404 | 502. `operationId` auto-derives to `deleteAppV1` from the controller class name — never hand-write it.

- [ ] **Step 1: Write the failing e2e test**

Create `apps/api/src/app/app-management/use-cases/delete-app/tests/delete-app.e2e.test.ts`:

```ts
import { after, before, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import request from 'supertest'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { releaseTable } from '#src/app/release/entities/release.table.js'
import { DeployAppCommandBuilder } from '#src/app/release/use-cases/deploy-app/deploy-app.command.builder.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const SLUG = 'delete-e2e-app'

describe('DELETE /api/v1/apps/:slug (e2e)', () => {
  let setup: TestSetup
  let sessionCookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    sessionCookie = await setup.authenticate()
  })

  after(async () => {
    await setup.teardown()
  })

  it('removes the app and its releases', async () => {
    await request(setup.httpServer)
      .post('/api/v1/deploy')
      .set('Cookie', sessionCookie)
      .send(new DeployAppCommandBuilder().withSlug(SLUG).build())
      .expect(200)

    await request(setup.httpServer)
      .delete(`/api/v1/apps/${SLUG}`)
      .set('Cookie', sessionCookie)
      .expect(204)

    const apps = await setup.db.select().from(appTable).where(eq(appTable.slug, SLUG))
    expect(apps).toHaveLength(0)
    const releases = await setup.db.select().from(releaseTable)
    expect(releases).toHaveLength(0)
  })

  it('returns 404 for a slug that does not exist', async () => {
    await request(setup.httpServer)
      .delete('/api/v1/apps/no-such-app')
      .set('Cookie', sessionCookie)
      .expect(404)
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).delete(`/api/v1/apps/${SLUG}`).expect(401)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter api test 2>&1 | tail -20`
Expected: FAIL — the DELETE returns 404 from the router (no route registered) where 204 was expected.

- [ ] **Step 3: Write the controller**

Create `apps/api/src/app/app-management/use-cases/delete-app/delete-app.controller.ts`:

```ts
import { Controller, Delete, HttpCode, Param, UseGuards } from '@nestjs/common'
import {
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { DeleteAppUseCase } from '#src/app/app-management/use-cases/delete-app/delete-app.use-case.js'
import { SessionAuthGuard } from '#src/app/auth/guards/session-auth.guard.js'

@ApiTags('apps')
@Controller({ path: 'apps/:slug', version: '1' })
export class DeleteAppController {
  constructor(private readonly usecase: DeleteAppUseCase) {}

  @Delete()
  @HttpCode(204)
  @UseGuards(SessionAuthGuard)
  @ApiNoContentResponse({ description: 'The app and its Kubernetes resources were removed.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  @ApiNotFoundResponse({ description: 'No app with that slug.' })
  @ApiResponse({ status: 502, description: 'Kubernetes teardown failed; the app was kept.' })
  handle(@Param('slug') slug: string): Promise<void> {
    return this.usecase.execute(slug)
  }
}
```

- [ ] **Step 4: Write the use-case module**

Create `apps/api/src/app/app-management/use-cases/delete-app/delete-app.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { DeleteAppController } from '#src/app/app-management/use-cases/delete-app/delete-app.controller.js'
import { DeleteAppRepository } from '#src/app/app-management/use-cases/delete-app/delete-app.repository.js'
import { DeleteAppUseCase } from '#src/app/app-management/use-cases/delete-app/delete-app.use-case.js'
import { KubernetesModule } from '#src/modules/kubernetes/kubernetes.module.js'

@Module({
  imports: [KubernetesModule],
  controllers: [DeleteAppController],
  providers: [DeleteAppUseCase, DeleteAppRepository],
})
export class DeleteAppModule {}
```

This mirrors `view-app-health.module.ts`, the other slice that depends on `DeployBackend`: it imports `KubernetesModule` the same way.

- [ ] **Step 5: Register the slice on the feature module**

Rewrite `apps/api/src/app/app-management/app-management.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { DeleteAppModule } from '#src/app/app-management/use-cases/delete-app/delete-app.module.js'
import { ViewAppHealthModule } from '#src/app/app-management/use-cases/view-app-health/view-app-health.module.js'
import { ViewAppIndexModule } from '#src/app/app-management/use-cases/view-app-index/view-app-index.module.js'
import { ViewAppLogsModule } from '#src/app/app-management/use-cases/view-app-logs/view-app-logs.module.js'

@Module({
  imports: [ViewAppIndexModule, ViewAppHealthModule, ViewAppLogsModule, DeleteAppModule],
})
export class AppManagementModule {}
```

- [ ] **Step 6: Run the e2e tests to verify they pass**

Run: `pnpm --filter api test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `fail 0`, three more tests than after Task 3.

If the 204 case fails on a foreign-key violation, `deleteWithReleases` is deleting in the wrong order — releases must go first.

- [ ] **Step 7: Regenerate the contract**

```bash
pnpm --filter api generate:openapi
pnpm --filter web generate:api
git diff --stat apps/api/openapi.json apps/web/app/api/
```

Expected: `openapi.json` gains a `delete` operation under `/api/v1/apps/{slug}` with `operationId: deleteAppV1`. Confirm it:

```bash
grep -n "deleteAppV1" apps/api/openapi.json
```

If the operationId is missing or differs, the controller class name is wrong — the factory derives it from `DeleteAppController` + version.

- [ ] **Step 8: Commit**

```bash
pnpm format
git add apps/api/src/app/app-management/use-cases/delete-app/ apps/api/src/app/app-management/app-management.module.ts apps/api/openapi.json apps/web/app/api/
git commit -m "feat: add DELETE /api/v1/apps/:slug endpoint"
```

---

### Task 5: `useDeleteApp` composable

**Files:**

- Create: `apps/web/app/composables/useDeleteApp.ts`
- Create: `apps/web/app/composables/__tests__/useDeleteApp.nuxt.spec.ts`

**Interfaces:**

- Consumes: `DELETE /v1/apps/:slug` (Task 4)
- Produces: `useDeleteApp(): { remove: (slug: string) => Promise<void> }` — used by Task 6. It does not translate errors; it lets the `$fetch` rejection through so the caller can run it past `extractApiError`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/composables/__tests__/useDeleteApp.nuxt.spec.ts`. It needs the Nuxt runtime environment (hence `.nuxt.spec.ts`) because the composable calls `useNuxtApp`:

```ts
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'

import { useDeleteApp } from '../useDeleteApp'

const api = vi.hoisted(() => vi.fn())

mockNuxtImport('useNuxtApp', () => () => ({ $api: api }))

describe('useDeleteApp', () => {
  it('sends a DELETE to the app endpoint', async () => {
    api.mockResolvedValueOnce(undefined)

    await useDeleteApp().remove('my-app')

    expect(api).toHaveBeenCalledWith('/v1/apps/my-app', { method: 'DELETE' })
  })

  it('encodes the slug', async () => {
    api.mockResolvedValueOnce(undefined)

    await useDeleteApp().remove('a b')

    expect(api).toHaveBeenCalledWith('/v1/apps/a%20b', { method: 'DELETE' })
  })

  it('propagates the failure so the caller can show it', async () => {
    api.mockRejectedValueOnce({ data: { message: 'Could not remove it.' } })

    await expect(useDeleteApp().remove('my-app')).rejects.toBeDefined()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test 2>&1 | tail -20`
Expected: FAIL — cannot resolve `../useDeleteApp`.

- [ ] **Step 3: Write the composable**

Create `apps/web/app/composables/useDeleteApp.ts`:

```ts
/**
 * Client for the delete endpoint. Imperative mutation like `useDeployApp` — a
 * user-triggered write, so it calls `$api` directly. No Zod parse: the endpoint
 * answers 204 with no body.
 */
export function useDeleteApp() {
  const { $api } = useNuxtApp()

  async function remove(slug: string): Promise<void> {
    await $api(`/v1/apps/${encodeURIComponent(slug)}`, { method: 'DELETE' })
  }

  return { remove }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test 2>&1 | grep -E "Test Files|Tests "`
Expected: all pass, 3 more tests than the 86 baseline.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add apps/web/app/composables/useDeleteApp.ts apps/web/app/composables/__tests__/useDeleteApp.nuxt.spec.ts
git commit -m "feat: add useDeleteApp composable"
```

---

### Task 6: Danger zone on the app detail page

**Files:**

- Modify: `apps/web/app/pages/apps/[slug].vue`
- Modify: `apps/web/app/pages/apps/__tests__/[slug].nuxt.spec.ts`

**Interfaces:**

- Consumes: `useDeleteApp().remove` (Task 5); `extractApiError` from `~/composables/useDeployApp`
- Produces: nothing downstream

- [ ] **Step 1: Write the failing tests**

In `apps/web/app/pages/apps/__tests__/[slug].nuxt.spec.ts`, add the delete mock alongside the existing `mockNuxtImport` calls. The `remove` stub and the `navigateTo` spy both need `vi.hoisted`:

```ts
const del = vi.hoisted(() => ({ remove: vi.fn() }))
const nav = vi.hoisted(() => vi.fn())

mockNuxtImport('useDeleteApp', () => () => ({ remove: del.remove }))
mockNuxtImport('navigateTo', () => nav)
```

Extend the existing `beforeEach` with:

```ts
del.remove.mockReset()
del.remove.mockResolvedValue(undefined)
nav.mockReset()
```

Then add these tests inside the existing `describe('apps/[slug] detail page', ...)`:

```ts
it('shows a danger zone with a delete button', async () => {
  const wrapper = await mountSuspended(Detail)
  expect(wrapper.text()).toContain('Danger zone')
  expect(wrapper.text()).toContain('Delete app')
})

it('keeps confirmation disabled until the typed slug matches, then deletes and navigates away', async () => {
  const wrapper = await mountSuspended(Detail)

  await wrapper.find('[data-testid="delete-app"]').trigger('click')
  const confirm = wrapper.find('[data-testid="confirm-delete"]')
  expect(confirm.attributes('disabled')).toBeDefined()

  await wrapper.find('[data-testid="confirm-slug"]').setValue('my-app')
  await wrapper.find('[data-testid="confirm-delete"]').trigger('click')

  expect(del.remove).toHaveBeenCalledWith('my-app')
  expect(nav).toHaveBeenCalledWith('/apps')
})

it('does not delete when the typed slug does not match', async () => {
  const wrapper = await mountSuspended(Detail)

  await wrapper.find('[data-testid="delete-app"]').trigger('click')
  await wrapper.find('[data-testid="confirm-slug"]').setValue('wrong-name')
  await wrapper.find('[data-testid="confirm-delete"]').trigger('click')

  expect(del.remove).not.toHaveBeenCalled()
})

it('surfaces the API error and stays on the page when deletion fails', async () => {
  del.remove.mockRejectedValueOnce({ data: { message: 'Could not remove it.' } })
  const wrapper = await mountSuspended(Detail)

  await wrapper.find('[data-testid="delete-app"]').trigger('click')
  await wrapper.find('[data-testid="confirm-slug"]').setValue('my-app')
  await wrapper.find('[data-testid="confirm-delete"]').trigger('click')
  await new Promise((resolve) => setTimeout(resolve, 0))

  expect(wrapper.text()).toContain('Could not remove it.')
  expect(nav).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web test 2>&1 | tail -25`
Expected: FAIL — `wrapper.find('[data-testid="delete-app"]')` finds nothing, so `trigger` throws.

- [ ] **Step 3: Add the script logic**

In `apps/web/app/pages/apps/[slug].vue`, add to the bottom of `<script setup lang="ts">`:

`useDeleteApp` and `extractApiError` are Nuxt auto-imports (`app/composables/*`) — do **not** add an import statement for them; `[slug].vue` and `new.vue` both rely on auto-import, and mocking via `mockNuxtImport` in Task 6's tests depends on it.

```ts
const { remove } = useDeleteApp()

const confirmOpen = ref(false)
const confirmSlug = ref('')
const deleting = ref(false)
const deleteError = ref('')

const canDelete = computed(() => confirmSlug.value === slug.value)

function openConfirm() {
  confirmSlug.value = ''
  deleteError.value = ''
  confirmOpen.value = true
}

async function confirmDelete() {
  if (!canDelete.value) return
  deleting.value = true
  deleteError.value = ''
  try {
    await remove(slug.value)
    await navigateTo('/apps')
  } catch (err) {
    deleteError.value = extractApiError(err, 'Could not delete this app. Please try again.')
  } finally {
    deleting.value = false
  }
}
```

- [ ] **Step 4: Add the danger-zone markup**

In the same file, add this as the last child of the `<div class="flex flex-col gap-6 max-w-4xl">` wrapper, after the Logs card:

```vue
<!-- Danger zone -->
<UCard class="ring-error">
          <template #header>
            <h2 class="font-medium text-error">
              Danger zone
            </h2>
          </template>

          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-sm text-muted">
              Deleting removes this app and its Kubernetes resources permanently. This cannot be undone.
            </p>
            <UButton
              data-testid="delete-app"
              color="error"
              icon="i-lucide-trash-2"
              @click="openConfirm"
            >
              Delete app
            </UButton>
          </div>
        </UCard>

<UModal v-model:open="confirmOpen" title="Delete this app?">
          <template #body>
            <div class="flex flex-col gap-3">
              <p class="text-sm">
                This permanently removes <span class="font-mono">{{ slug }}</span> and everything
                running in the cluster for it. Type the app's name to confirm.
              </p>
              <UInput
                data-testid="confirm-slug"
                v-model="confirmSlug"
                :placeholder="slug"
                autocomplete="off"
              />
              <UAlert
                v-if="deleteError"
                color="error"
                icon="i-lucide-triangle-alert"
                :title="deleteError"
              />
            </div>
          </template>

          <template #footer>
            <div class="flex justify-end gap-2 w-full">
              <UButton
                color="neutral"
                variant="ghost"
                @click="confirmOpen = false"
              >
                Cancel
              </UButton>
              <UButton
                data-testid="confirm-delete"
                color="error"
                :disabled="!canDelete"
                :loading="deleting"
                @click="confirmDelete"
              >
                Delete
              </UButton>
            </div>
          </template>
        </UModal>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter web test 2>&1 | grep -E "Test Files|Tests "`
Expected: all pass, 4 more tests than after Task 5.

If `[data-testid="confirm-slug"]` is not found, `UInput` renders the attribute on its wrapper rather than the `<input>` — change the selector to `wrapper.find('[data-testid="confirm-slug"] input')` in all three places that use it, and keep them consistent.

If `[data-testid="confirm-delete"]` is not found after opening the modal, the modal teleports its content outside the wrapper — mount with `mountSuspended(Detail, { attachTo: document.body })` and query via `document.querySelector`, or render the modal inline. Prefer whichever keeps the assertions readable.

- [ ] **Step 6: Verify the full suite and coverage floors**

Run: `pnpm --filter web test 2>&1 | tail -12`
Expected: all files pass and the coverage summary stays at or above lines 88 / branches 85 / functions 60.

- [ ] **Step 7: Commit**

```bash
pnpm format
git add apps/web/app/pages/apps/[slug].vue apps/web/app/pages/apps/__tests__/[slug].nuxt.spec.ts
git commit -m "feat: add delete-app danger zone to the app detail page"
```

---

### Task 7: Full verification

**Files:** none — this task only runs checks and fixes whatever they surface.

- [ ] **Step 1: Run the complete CI sequence locally**

```bash
pnpm format:check
pnpm lint
pnpm --filter api typecheck
pnpm --filter web typecheck
pnpm build:web
pnpm --filter api test 2>&1 | grep -E "^ℹ (tests|pass|fail)"
pnpm --filter web test 2>&1 | grep -E "Test Files|Tests "
```

Expected: every step exits 0, `fail 0` on api, all web test files passing.

- [ ] **Step 2: Confirm the contract has no drift**

```bash
pnpm --filter api generate:openapi
pnpm --filter web generate:api
git status --short apps/api/openapi.json apps/web/app/api/
```

Expected: no output — both were already committed in Task 4. Any diff here means CI's drift check would fail; commit the regenerated files.

- [ ] **Step 3: Verify against the real cluster (optional but recommended)**

A `k3d-marsa-e2e` cluster is running locally. With the api pointed at it, deploy a throwaway app, delete it, and confirm every resource is gone:

```bash
kubectl get deployment,service,ingressroute,secret -n marsa-apps -l app=<slug>
```

Expected: `No resources found`. Then call DELETE a second time and confirm it answers 404 (the app row is gone) rather than 500 — proving the teardown is idempotent.

- [ ] **Step 4: Commit any fixes**

```bash
pnpm format
git add <specific files>
git commit -m "fix: <what the verification surfaced>"
```
