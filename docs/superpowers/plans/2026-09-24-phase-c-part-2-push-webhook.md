# Phase C Part 2 — Push webhook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `git push` to a connected branch starts a build of the pushed commit for every app that
builds that repo + branch, with no manual step (#61).

**Architecture:** GitHub delivers to `POST /api/v1/github-app/webhooks`, the URL the GitHub App
manifest already registers. A `receive-push` use-case in the `build` feature verifies
`X-Hub-Signature-256` over the raw request body (Nest's `rawBody: true`), reads only branch
pushes, finds apps by `source` repo + branch + installation, and starts one build per app through
the existing `BuildStarter`, one transaction per app. A redelivered push whose commit is already
the app's newest running or succeeded build is skipped.

**Tech Stack:** NestJS 11 on Fastify, Drizzle, `@octokit/webhooks-methods` (`verify` / `sign`),
`node:test` + `expect` + sinon + supertest.

**Spec:** `docs/superpowers/specs/2026-09-23-git-build-deploy-registry-design.md` §3, with two
deviations agreed on 2026-09-24:

- Route is `POST /api/v1/github-app/webhooks` (the manifest's `WEBHOOK_PATH`), not
  `/v1/github/webhooks`, so every existing GitHub App keeps delivering without a manual URL edit.
- Raw body comes from Nest's documented `rawBody: true` app option (Fastify keeps `req.rawBody`
  next to the parsed JSON) instead of a hand-registered per-route content parser.

## Global Constraints

- Worktree `/home/gomaa-zorin/Github/marsa-workspace/apexyard/workspace/marsa-worktrees/phase-c-2`,
  branch `feature/21-git-push-deploy` (stacked on #237's `feature/78-self-hosted-registry`). One
  PR for Parts 2–4. No new tickets. Never touch the main `workspace/marsa` worktree (Phase B).
- Api tests: always `cd apps/api && DB_NAME=marsa_test_phase_c2 pnpm test` (the database exists;
  the setup drops its schema, and `marsa_test` / `marsa_test_phase_c` belong to other worktrees).
  A single file: `pnpm build && DB_NAME=marsa_test_phase_c2 pnpm test:setup && DB_NAME=marsa_test_phase_c2 node --experimental-default-config-file --env-file=.env.test --test dist/src/<path>.test.js`.
- Format only touched files: `pnpm exec prettier --write <files>`. Never run repo-wide
  `pnpm format`.
- The shell is zsh: never rely on unquoted `$VAR` word-splitting for file lists.
- Api boundary: a feature imports other features' `entities/`, `queries/`, `enums/`, `errors/`,
  `events/` only; `src/app/**` imports runtime ports, never adapters (tests may import mocks).
- Comments: one line, only a non-obvious why. No JSDoc.
- Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Coverage floors (api lines 80 / branches 75 / functions 75) must hold.
- New dependency versions must be ≥ 7 days old (`minimumReleaseAge: 10080`).
  `@octokit/webhooks-methods@6.0.0` was published 2025-05-20.

## File map

```text
pnpm-workspace.yaml                                              MOD  catalog: @octokit/webhooks-methods
apps/api/package.json                                            MOD  + @octokit/webhooks-methods
pnpm-lock.yaml                                                   MOD
apps/api/src/entrypoints/api.ts                                  MOD  rawBody: true
apps/api/src/test/setup/test-bench.ts                            MOD  rawBody: true (kept in sync)
apps/api/src/app/build/services/build-starter.module.ts          NEW  one BuildStarter instance, exported
apps/api/src/app/build/use-cases/start-build/start-build.module.ts   MOD  import BuildStarterModule
apps/api/src/app/build/use-cases/receive-push/
  github-push.ts                                                 NEW  readBranchPush / installationIdOf
  receive-push.repository.ts                                     NEW
  receive-push.use-case.ts                                       NEW
  receive-push.response.ts                                       NEW
  receive-push.controller.ts                                     NEW  POST /v1/github-app/webhooks
  receive-push.module.ts                                         NEW
  tests/github-push.unit.test.ts                                 NEW
  tests/receive-push.use-case.unit.test.ts                       NEW
  tests/receive-push.e2e.test.ts                                 NEW
apps/api/src/app/build/build.module.ts                           MOD  + ReceivePushModule
```

`openapi.json` does not change: the controller is excluded from the document (GitHub calls it,
the web never does).

---

### Task 1: One shared `BuildStarter` instance

`BuildStarter` is listed in `StartBuildModule.providers` today. A second consumer (receive-push)
would get its own instance, which `.claude/rules/api/service.md` forbids. Give it an exporting
module first.

**Files:**

- Create: `apps/api/src/app/build/services/build-starter.module.ts`
- Modify: `apps/api/src/app/build/use-cases/start-build/start-build.module.ts`

**Interfaces:**

- Produces: `BuildStarterModule` exporting `BuildStarter` (unchanged API:
  `mintToken(tx, source): Promise<string>`, `start(tx, app, { trigger, commitSha }): Promise<Build>`).

- [ ] **Step 1: Create the module**

```ts
// apps/api/src/app/build/services/build-starter.module.ts
import { Module } from '@nestjs/common'
import { BuildStarterRepository } from '#src/app/build/services/build-starter.repository.js'
import { BuildStarter } from '#src/app/build/services/build-starter.service.js'
import { GitHubClientModule } from '#src/modules/github-client/github-client.module.js'

@Module({
  imports: [GitHubClientModule],
  providers: [BuildStarter, BuildStarterRepository],
  exports: [BuildStarter],
})
export class BuildStarterModule {}
```

- [ ] **Step 2: Use it from `StartBuildModule`**

```ts
// apps/api/src/app/build/use-cases/start-build/start-build.module.ts
import { Module } from '@nestjs/common'
import { BuildStarterModule } from '#src/app/build/services/build-starter.module.js'
import { StartBuildController } from '#src/app/build/use-cases/start-build/start-build.controller.js'
import { StartBuildRepository } from '#src/app/build/use-cases/start-build/start-build.repository.js'
import { StartBuildUseCase } from '#src/app/build/use-cases/start-build/start-build.use-case.js'
import { GitHubClientModule } from '#src/modules/github-client/github-client.module.js'

@Module({
  imports: [GitHubClientModule, BuildStarterModule],
  controllers: [StartBuildController],
  providers: [StartBuildUseCase, StartBuildRepository],
})
export class StartBuildModule {}
```

- [ ] **Step 3: Run the build feature's tests**

Run: `cd apps/api && pnpm build && DB_NAME=marsa_test_phase_c2 pnpm test:setup && DB_NAME=marsa_test_phase_c2 node --experimental-default-config-file --env-file=.env.test --test "dist/src/app/build/**/*.test.js"`
Expected: all pass (pure refactor).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/app/build/services/build-starter.module.ts apps/api/src/app/build/use-cases/start-build/start-build.module.ts
git commit -m "refactor: share one BuildStarter through its own module"
```

---

### Task 2: Read a branch push out of a webhook payload

**Files:**

- Create: `apps/api/src/app/build/use-cases/receive-push/github-push.ts`
- Test: `apps/api/src/app/build/use-cases/receive-push/tests/github-push.unit.test.ts`

**Interfaces:**

- Produces:
  - `interface GitHubPush { installationId: string; repo: string; branch: string; commitSha: string }`
  - `readBranchPush(payload: unknown): GitHubPush | null`: `null` for tag pushes, branch deletions
    and anything missing a field.
  - `installationIdOf(payload: unknown): string | null`: the payload's `installation.id` as a
    string (GitHub sends a number).
  - `PUSH_EVENT = 'push'`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/app/build/use-cases/receive-push/tests/github-push.unit.test.ts
import { before, describe, it } from 'node:test'
import { expect } from 'expect'
import {
  installationIdOf,
  readBranchPush,
} from '#src/app/build/use-cases/receive-push/github-push.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const SHA = 'b'.repeat(40)

const push = (overrides: Record<string, unknown> = {}) => ({
  ref: 'refs/heads/main',
  after: SHA,
  deleted: false,
  repository: { full_name: 'acme/shop' },
  installation: { id: 4242 },
  ...overrides,
})

describe('readBranchPush', () => {
  before(() => TestBench.setupUnitTest())

  it('reads a branch push', () => {
    expect(readBranchPush(push())).toEqual({
      installationId: '4242',
      repo: 'acme/shop',
      branch: 'main',
      commitSha: SHA,
    })
  })

  it('keeps slashes in the branch name', () => {
    expect(readBranchPush(push({ ref: 'refs/heads/feature/x' }))?.branch).toBe('feature/x')
  })

  it('ignores a tag push', () => {
    expect(readBranchPush(push({ ref: 'refs/tags/v1.0.0' }))).toBeNull()
  })

  it('ignores a branch deletion', () => {
    expect(readBranchPush(push({ deleted: true, after: '0'.repeat(40) }))).toBeNull()
  })

  it('ignores a payload without an installation', () => {
    expect(readBranchPush(push({ installation: undefined }))).toBeNull()
  })

  it('ignores a payload that is not an object', () => {
    expect(readBranchPush(null)).toBeNull()
  })
})

describe('installationIdOf', () => {
  before(() => TestBench.setupUnitTest())

  it('stringifies the numeric installation id', () => {
    expect(installationIdOf(push())).toBe('4242')
  })

  it('is null when the payload has none, like a ping from a fresh App', () => {
    expect(installationIdOf({ zen: 'hi' })).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pnpm build`
Expected: FAIL: the build cannot resolve `receive-push/github-push.js`.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/app/build/use-cases/receive-push/github-push.ts
export const PUSH_EVENT = 'push'

const BRANCH_REF_PREFIX = 'refs/heads/'

export interface GitHubPush {
  installationId: string
  repo: string
  branch: string
  commitSha: string
}

interface PushPayload {
  ref?: unknown
  after?: unknown
  deleted?: unknown
  repository?: { full_name?: unknown } | null
  installation?: { id?: unknown } | null
}

const asPayload = (payload: unknown): PushPayload =>
  typeof payload === 'object' && payload !== null ? (payload as PushPayload) : {}

export function installationIdOf(payload: unknown): string | null {
  const id = asPayload(payload).installation?.id
  return typeof id === 'number' || typeof id === 'string' ? String(id) : null
}

export function readBranchPush(payload: unknown): GitHubPush | null {
  const push = asPayload(payload)
  const installationId = installationIdOf(payload)
  const repo = push.repository?.full_name
  if (
    push.deleted === true ||
    typeof push.ref !== 'string' ||
    !push.ref.startsWith(BRANCH_REF_PREFIX) ||
    typeof push.after !== 'string' ||
    typeof repo !== 'string' ||
    !installationId
  ) {
    return null
  }
  return {
    installationId,
    repo,
    branch: push.ref.slice(BRANCH_REF_PREFIX.length),
    commitSha: push.after,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && pnpm build && node --experimental-default-config-file --env-file=.env.test --test dist/src/app/build/use-cases/receive-push/tests/github-push.unit.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app/build/use-cases/receive-push/github-push.ts apps/api/src/app/build/use-cases/receive-push/tests/github-push.unit.test.ts
git commit -m "feat: read branch pushes from GitHub webhook payloads"
```

---

### Task 3: `ReceivePushUseCase`: verify, match apps, start builds

**Files:**

- Modify: `pnpm-workspace.yaml` (catalog), `apps/api/package.json`, `pnpm-lock.yaml`
- Create: `apps/api/src/app/build/use-cases/receive-push/receive-push.repository.ts`
- Create: `apps/api/src/app/build/use-cases/receive-push/receive-push.response.ts`
- Create: `apps/api/src/app/build/use-cases/receive-push/receive-push.use-case.ts`
- Test: `apps/api/src/app/build/use-cases/receive-push/tests/receive-push.use-case.unit.test.ts`

**Interfaces:**

- Consumes: `readBranchPush`, `installationIdOf`, `PUSH_EVENT`, `GitHubPush` (Task 2);
  `BuildStarter.start(tx, app, { trigger, commitSha }): Promise<Build>` (Task 1);
  `SecretCipherService.decrypt(token): string`.
- Produces:
  - `interface WebhookDelivery { event?: string; signature?: string; rawBody?: Buffer }`
  - `ReceivePushUseCase.execute(delivery: WebhookDelivery): Promise<ReceivePushResponse>`:
    throws `UnauthorizedException` on a missing or invalid signature, `BadRequestException` on a
    non-JSON body.
  - `ReceivePushRepository` with `findSecretByInstallation(installationId)`, `findNewestSecret()`,
    `findAppsToBuild(push)`, `lockApp(tx, uuid)`, `findNewestBuild(tx, appUuid)`.
  - `ReceivePushResponse { builds: ReceivedBuild[] }`, `ReceivedBuild { appSlug; buildUuid }`.

- [ ] **Step 1: Add the dependency**

In `pnpm-workspace.yaml`, under `# GitHub integration (api)`, add:

```yaml
'@octokit/webhooks-methods': ^6.0.0
```

In `apps/api/package.json` `dependencies` (alphabetical, after `@octokit/request`):

```json
"@octokit/webhooks-methods": "catalog:",
```

Run: `pnpm install`
Expected: lockfile updated, no `minimumReleaseAge` error.

- [ ] **Step 2: Write the failing unit test**

```ts
// apps/api/src/app/build/use-cases/receive-push/tests/receive-push.use-case.unit.test.ts
import { before, describe, it } from 'node:test'
import { BadRequestException, UnauthorizedException } from '@nestjs/common'
import { sign } from '@octokit/webhooks-methods'
import { expect } from 'expect'
import { createStubInstance, match } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { BuildBuilder } from '#src/app/build/entities/build.builder.js'
import { BuildStatus } from '#src/app/build/enums/build-status.enum.js'
import { BuildTrigger } from '#src/app/build/enums/build-trigger.enum.js'
import { BuildStarter } from '#src/app/build/services/build-starter.service.js'
import { ReceivePushRepository } from '#src/app/build/use-cases/receive-push/receive-push.repository.js'
import { ReceivePushUseCase } from '#src/app/build/use-cases/receive-push/receive-push.use-case.js'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { stubDatabase } from '#src/test/setup/stub-database.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { generateUuid } from '#src/utils/uuid.js'

const SECRET = 'whsec'
const SHA = 'b'.repeat(40)

const source = {
  type: 'github' as const,
  installationUuid: generateUuid<GitHubInstallationUuid>(),
  repo: 'acme/shop',
  branch: 'main',
  rootDir: '.',
  dockerfilePath: 'Dockerfile',
}
const shop = new AppBuilder().withSlug('shop').withSource(source).build()
const shopApi = new AppBuilder().withSlug('shop-api').withSource(source).build()

const pushBody = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    ref: 'refs/heads/main',
    after: SHA,
    deleted: false,
    repository: { full_name: 'acme/shop' },
    installation: { id: 4242 },
    ...overrides,
  })

async function delivery(body = pushBody(), event = 'push') {
  return { event, signature: await sign(SECRET, body), rawBody: Buffer.from(body) }
}

function build(apps = [shop]) {
  const repository = createStubInstance(ReceivePushRepository)
  repository.findSecretByInstallation.resolves('enc-secret')
  repository.findNewestSecret.resolves(undefined)
  repository.findAppsToBuild.resolves(apps)
  for (const app of apps) {
    repository.lockApp.withArgs(match.any, app.uuid).resolves(app)
  }
  repository.findNewestBuild.resolves(undefined)
  const starter = createStubInstance(BuildStarter)
  starter.start.callsFake((_tx, app, { commitSha, trigger }) =>
    Promise.resolve(
      new BuildBuilder().withApp(app).withCommitSha(commitSha).withTrigger(trigger).build(),
    ),
  )
  const cipher = createStubInstance(SecretCipherService)
  cipher.decrypt.returns(SECRET)
  const usecase = new ReceivePushUseCase(stubDatabase(), repository, starter, cipher)
  return { usecase, repository, starter }
}

describe('ReceivePushUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('starts a push build of the pushed commit for every matching app', async () => {
    const { usecase, starter, repository } = build([shop, shopApi])

    const response = await usecase.execute(await delivery())

    expect(
      repository.findAppsToBuild.calledOnceWith({
        installationId: '4242',
        repo: 'acme/shop',
        branch: 'main',
        commitSha: SHA,
      }),
    ).toBe(true)
    expect(
      starter.start.calledWith(match.any, shop, { trigger: BuildTrigger.Push, commitSha: SHA }),
    ).toBe(true)
    expect(response.builds.map((b) => b.appSlug)).toEqual(['shop', 'shop-api'])
  })

  it('401s a delivery without a signature', async () => {
    const { usecase } = build()

    await expect(
      usecase.execute({ event: 'push', rawBody: Buffer.from(pushBody()) }),
    ).rejects.toThrow(UnauthorizedException)
  })

  it('401s a signature made with another secret', async () => {
    const { usecase, starter } = build()
    const body = pushBody()

    await expect(
      usecase.execute({
        event: 'push',
        signature: await sign('not-the-secret', body),
        rawBody: Buffer.from(body),
      }),
    ).rejects.toThrow(UnauthorizedException)
    expect(starter.start.called).toBe(false)
  })

  it('401s when Marsa holds no webhook secret at all', async () => {
    const { usecase, repository } = build()
    repository.findSecretByInstallation.resolves(undefined)

    await expect(usecase.execute(await delivery())).rejects.toThrow(UnauthorizedException)
  })

  it('verifies a delivery without an installation against the newest App', async () => {
    const { usecase, repository } = build()
    repository.findNewestSecret.resolves('enc-secret')

    const response = await usecase.execute(await delivery(JSON.stringify({ zen: 'hi' }), 'ping'))

    expect(repository.findSecretByInstallation.called).toBe(false)
    expect(response.builds).toEqual([])
  })

  it('400s a body that is not JSON', async () => {
    const { usecase } = build()

    await expect(usecase.execute(await delivery('not json'))).rejects.toThrow(BadRequestException)
  })

  it('ignores events other than push', async () => {
    const { usecase, starter } = build()

    const response = await usecase.execute(await delivery(pushBody(), 'installation'))

    expect(response.builds).toEqual([])
    expect(starter.start.called).toBe(false)
  })

  it('ignores a tag push', async () => {
    const { usecase, starter } = build()

    await usecase.execute(await delivery(pushBody({ ref: 'refs/tags/v1' })))

    expect(starter.start.called).toBe(false)
  })

  for (const status of [BuildStatus.Running, BuildStatus.Succeeded]) {
    it(`skips a redelivered push whose commit is the newest build and ${status}`, async () => {
      const { usecase, repository, starter } = build()
      repository.findNewestBuild.resolves(
        new BuildBuilder().withApp(shop).withCommitSha(SHA).withStatus(status).build(),
      )

      const response = await usecase.execute(await delivery())

      expect(starter.start.called).toBe(false)
      expect(response.builds).toEqual([])
    })
  }

  it('builds the commit again when its newest build failed', async () => {
    const { usecase, repository, starter } = build()
    repository.findNewestBuild.resolves(
      new BuildBuilder().withApp(shop).withCommitSha(SHA).withStatus(BuildStatus.Failed).build(),
    )

    await usecase.execute(await delivery())

    expect(starter.start.calledOnce).toBe(true)
  })

  it('builds a commit the app built before if a newer one came in between', async () => {
    const { usecase, repository, starter } = build()
    repository.findNewestBuild.resolves(
      new BuildBuilder().withApp(shop).withCommitSha('c'.repeat(40)).build(),
    )

    await usecase.execute(await delivery())

    expect(starter.start.calledOnce).toBe(true)
  })

  it('keeps going when one app fails to start', async () => {
    const { usecase, starter } = build([shop, shopApi])
    starter.start.onFirstCall().rejects(new Error('boom'))

    const response = await usecase.execute(await delivery())

    expect(response.builds.map((b) => b.appSlug)).toEqual(['shop-api'])
  })

  it('skips an app deleted between matching and locking', async () => {
    const { usecase, repository, starter } = build()
    repository.lockApp.withArgs(match.any, shop.uuid).resolves(undefined)

    const response = await usecase.execute(await delivery())

    expect(starter.start.called).toBe(false)
    expect(response.builds).toEqual([])
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/api && pnpm build`
Expected: FAIL: `receive-push.repository.js` / `receive-push.use-case.js` do not exist.

- [ ] **Step 4: Implement the repository**

```ts
// apps/api/src/app/build/use-cases/receive-push/receive-push.repository.ts
import { Injectable } from '@nestjs/common'
import { and, desc, eq, sql } from 'drizzle-orm'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import { type Build, buildTable } from '#src/app/build/entities/build.table.js'
import type { GitHubPush } from '#src/app/build/use-cases/receive-push/github-push.js'
import { githubAppTable } from '#src/app/github-app/entities/github-app.table.js'
import { githubInstallationTable } from '#src/app/github-app/entities/github-installation.table.js'
import type { Database, Executor } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ReceivePushRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findSecretByInstallation(installationId: string): Promise<string | undefined> {
    const [row] = await this.db
      .select({ webhookSecretEnc: githubAppTable.webhookSecretEnc })
      .from(githubInstallationTable)
      .innerJoin(githubAppTable, eq(githubInstallationTable.appUuid, githubAppTable.uuid))
      .where(eq(githubInstallationTable.installationId, installationId))
      .limit(1)
    return row?.webhookSecretEnc
  }

  async findNewestSecret(): Promise<string | undefined> {
    const [row] = await this.db
      .select({ webhookSecretEnc: githubAppTable.webhookSecretEnc })
      .from(githubAppTable)
      .orderBy(desc(githubAppTable.createdAt))
      .limit(1)
    return row?.webhookSecretEnc
  }

  // Matching the installation too stops one installation's pushes building another's apps.
  async findAppsToBuild(push: GitHubPush): Promise<App[]> {
    const rows = await this.db
      .select({ app: appTable })
      .from(appTable)
      .innerJoin(
        githubInstallationTable,
        sql`${githubInstallationTable.uuid} = (${appTable.source}->>'installationUuid')::uuid`,
      )
      .where(
        and(
          sql`${appTable.source}->>'repo' = ${push.repo}`,
          sql`${appTable.source}->>'branch' = ${push.branch}`,
          eq(githubInstallationTable.installationId, push.installationId),
        ),
      )
      .orderBy(appTable.slug)
    return rows.map((row) => row.app)
  }

  async lockApp(tx: Executor, uuid: AppUuid): Promise<App | undefined> {
    const [app] = await tx
      .select()
      .from(appTable)
      .where(eq(appTable.uuid, uuid))
      .limit(1)
      .for('update')
    return app
  }

  async findNewestBuild(tx: Executor, appUuid: AppUuid): Promise<Build | undefined> {
    const [build] = await tx
      .select()
      .from(buildTable)
      .where(eq(buildTable.appUuid, appUuid))
      .orderBy(desc(buildTable.uuid))
      .limit(1)
    return build
  }
}
```

- [ ] **Step 5: Implement the response**

```ts
// apps/api/src/app/build/use-cases/receive-push/receive-push.response.ts
import { ApiProperty } from '@nestjs/swagger'
import type { Build } from '#src/app/build/entities/build.table.js'

export interface StartedBuild {
  appSlug: string
  build: Build
}

export class ReceivedBuild {
  @ApiProperty({ type: String, example: 'my-app' })
  readonly appSlug: string

  @ApiProperty({ type: String, format: 'uuid' })
  readonly buildUuid: string

  constructor({ appSlug, build }: StartedBuild) {
    this.appSlug = appSlug
    this.buildUuid = build.uuid
  }
}

export class ReceivePushResponse {
  @ApiProperty({ type: [ReceivedBuild] })
  readonly builds: ReceivedBuild[]

  constructor(started: StartedBuild[]) {
    this.builds = started.map((entry) => new ReceivedBuild(entry))
  }
}
```

- [ ] **Step 6: Implement the use-case**

```ts
// apps/api/src/app/build/use-cases/receive-push/receive-push.use-case.ts
import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { verify } from '@octokit/webhooks-methods'
import type { App } from '#src/app/app-management/entities/app.table.js'
import type { Build } from '#src/app/build/entities/build.table.js'
import { BuildStatus } from '#src/app/build/enums/build-status.enum.js'
import { BuildTrigger } from '#src/app/build/enums/build-trigger.enum.js'
import { BuildStarter } from '#src/app/build/services/build-starter.service.js'
import {
  installationIdOf,
  PUSH_EVENT,
  readBranchPush,
} from '#src/app/build/use-cases/receive-push/github-push.js'
import { ReceivePushRepository } from '#src/app/build/use-cases/receive-push/receive-push.repository.js'
import {
  ReceivePushResponse,
  type StartedBuild,
} from '#src/app/build/use-cases/receive-push/receive-push.response.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

export interface WebhookDelivery {
  event?: string
  signature?: string
  rawBody?: Buffer
}

const INVALID_SIGNATURE = 'The webhook signature is missing or invalid.'

// A redelivery of the commit already building or built must not build it twice.
const isRedelivery = (newest: Build | undefined, commitSha: string): boolean =>
  newest?.commitSha === commitSha &&
  (newest.status === BuildStatus.Running || newest.status === BuildStatus.Succeeded)

@Injectable()
export class ReceivePushUseCase {
  private readonly logger = new Logger(ReceivePushUseCase.name)

  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: ReceivePushRepository,
    private readonly starter: BuildStarter,
    private readonly cipher: SecretCipherService,
  ) {}

  async execute(delivery: WebhookDelivery): Promise<ReceivePushResponse> {
    const payload = await this.verifiedPayload(delivery)
    const push = delivery.event === PUSH_EVENT ? readBranchPush(payload) : null
    if (!push) {
      return new ReceivePushResponse([])
    }

    const apps = await this.repository.findAppsToBuild(push)
    const started: StartedBuild[] = []
    for (const app of apps) {
      try {
        const build = await this.startBuild(app, push.commitSha)
        if (build) {
          started.push({ appSlug: app.slug, build })
        }
      } catch (error) {
        this.logger.error(
          `starting a push build of ${app.slug} failed: ${(error as Error).message}`,
        )
      }
    }
    return new ReceivePushResponse(started)
  }

  private async verifiedPayload({ signature, rawBody }: WebhookDelivery): Promise<unknown> {
    if (!signature || !rawBody) {
      throw new UnauthorizedException(INVALID_SIGNATURE)
    }
    const body = rawBody.toString('utf8')
    let payload: unknown
    try {
      payload = JSON.parse(body)
    } catch {
      throw new BadRequestException('The webhook body is not JSON.')
    }

    const installationId = installationIdOf(payload)
    const secretEnc = installationId
      ? await this.repository.findSecretByInstallation(installationId)
      : await this.repository.findNewestSecret()
    if (!secretEnc) {
      throw new UnauthorizedException(INVALID_SIGNATURE)
    }
    const valid = await verify(this.cipher.decrypt(secretEnc), body, signature).catch(() => false)
    if (!valid) {
      throw new UnauthorizedException(INVALID_SIGNATURE)
    }
    return payload
  }

  private async startBuild(matched: App, commitSha: string): Promise<Build | null> {
    return this.db.transaction(async (tx) => {
      const app = await this.repository.lockApp(tx, matched.uuid)
      if (!app?.source) {
        return null
      }
      const newest = await this.repository.findNewestBuild(tx, app.uuid)
      if (isRedelivery(newest, commitSha)) {
        return null
      }
      return this.starter.start(tx, app, { trigger: BuildTrigger.Push, commitSha })
    })
  }
}
```

- [ ] **Step 7: Run the unit tests**

Run: `cd apps/api && pnpm build && node --experimental-default-config-file --env-file=.env.test --test dist/src/app/build/use-cases/receive-push/tests/receive-push.use-case.unit.test.js`
Expected: PASS, 14 tests.

- [ ] **Step 8: Commit**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml apps/api/package.json apps/api/src/app/build/use-cases/receive-push/receive-push.repository.ts apps/api/src/app/build/use-cases/receive-push/receive-push.response.ts apps/api/src/app/build/use-cases/receive-push/receive-push.use-case.ts apps/api/src/app/build/use-cases/receive-push/tests/receive-push.use-case.unit.test.ts
git commit -m "feat: verify push webhooks and start a build per matching app"
```

---

### Task 4: The webhook route, raw body, and e2e

**Files:**

- Modify: `apps/api/src/entrypoints/api.ts`
- Modify: `apps/api/src/test/setup/test-bench.ts`
- Create: `apps/api/src/app/build/use-cases/receive-push/receive-push.controller.ts`
- Create: `apps/api/src/app/build/use-cases/receive-push/receive-push.module.ts`
- Modify: `apps/api/src/app/build/build.module.ts`
- Test: `apps/api/src/app/build/use-cases/receive-push/tests/receive-push.e2e.test.ts`

**Interfaces:**

- Consumes: `ReceivePushUseCase.execute(delivery)` (Task 3), `BuildStarterModule` (Task 1).
- Produces: `POST /api/v1/github-app/webhooks` → 202 `{ builds: [{ appSlug, buildUuid }] }`,
  401 on a bad signature. Not in `openapi.json`.

- [ ] **Step 1: Write the failing e2e test**

```ts
// apps/api/src/app/build/use-cases/receive-push/tests/receive-push.e2e.test.ts
import { after, before, describe, it } from 'node:test'
import { sign } from '@octokit/webhooks-methods'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import request from 'supertest'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import { buildTable } from '#src/app/build/entities/build.table.js'
import { GitHubAppBuilder } from '#src/app/github-app/entities/github-app.builder.js'
import { githubAppTable } from '#src/app/github-app/entities/github-app.table.js'
import { GitHubInstallationBuilder } from '#src/app/github-app/entities/github-installation.builder.js'
import { githubInstallationTable } from '#src/app/github-app/entities/github-installation.table.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import type { MockBuildRuntime } from '#src/modules/runtime/adapters/mock/mock-build-runtime.js'
import { BuildRuntime } from '#src/modules/runtime/build-runtime.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const ROUTE = '/api/v1/github-app/webhooks'
const SECRET = 'whsec-e2e'
const SHA = 'd'.repeat(40)

const pushBody = JSON.stringify({
  ref: 'refs/heads/main',
  after: SHA,
  deleted: false,
  repository: { full_name: 'acme/shop' },
  installation: { id: 5151 },
})

describe('POST /api/v1/github-app/webhooks (e2e)', () => {
  let setup: TestSetup
  let app: App

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    const { environment } = await setup.seedEnvironment()
    const cipher = setup.testModule.get(SecretCipherService)
    const githubApp = {
      ...new GitHubAppBuilder().withGithubAppId('5151').build(),
      slug: 'marsa-webhook-e2e',
      webhookSecretEnc: cipher.encrypt(SECRET),
      privateKeyPemEnc: cipher.encrypt('pem'),
    }
    const installation = new GitHubInstallationBuilder()
      .withInstallationId('5151')
      .withAppUuid(githubApp.uuid)
      .build()
    await setup.db.insert(githubAppTable).values(githubApp)
    await setup.db.insert(githubInstallationTable).values(installation)
    app = new AppBuilder()
      .withEnvironmentUuid(environment.uuid)
      .withSlug('webhook-e2e-app')
      .withSource({
        type: 'github',
        installationUuid: installation.uuid,
        repo: 'acme/shop',
        branch: 'main',
        rootDir: '.',
        dockerfilePath: 'Dockerfile',
      })
      .build()
    await setup.db.insert(appTable).values(app)
  })

  after(async () => {
    await setup.teardown()
  })

  const deliver = async (body: string, signature?: string) =>
    request(setup.httpServer)
      .post(ROUTE)
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'push')
      .set('X-Hub-Signature-256', signature ?? (await sign(SECRET, body)))
      .send(body)

  it('starts a push build of the pushed commit', async () => {
    const response = await deliver(pushBody)

    expect(response.status).toBe(202)
    expect(response.body.builds).toEqual([
      { appSlug: 'webhook-e2e-app', buildUuid: expect.any(String) },
    ])
    const [build] = await setup.db
      .select()
      .from(buildTable)
      .where(eq(buildTable.uuid, response.body.builds[0].buildUuid))
    expect(build).toMatchObject({ commitSha: SHA, trigger: 'push', status: 'running' })
    const runtime = setup.testModule.get<BuildRuntime, MockBuildRuntime>(BuildRuntime)
    expect(runtime.started.get(build.uuid)?.commitSha).toBe(SHA)
  })

  it('does not build the same commit twice when GitHub redelivers', async () => {
    const response = await deliver(pushBody)

    expect(response.status).toBe(202)
    expect(response.body.builds).toEqual([])
    const builds = await setup.db.select().from(buildTable).where(eq(buildTable.appUuid, app.uuid))
    expect(builds).toHaveLength(1)
  })

  it('401s a delivery signed with the wrong secret', async () => {
    const response = await deliver(pushBody, await sign('wrong', pushBody))

    expect(response.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && pnpm build && DB_NAME=marsa_test_phase_c2 pnpm test:setup && DB_NAME=marsa_test_phase_c2 node --experimental-default-config-file --env-file=.env.test --test dist/src/app/build/use-cases/receive-push/tests/receive-push.e2e.test.js`
Expected: FAIL: 404 from the route (no controller yet).

- [ ] **Step 3: Enable the raw body in both bootstraps**

In `apps/api/src/entrypoints/api.ts`, pass the app option as the third argument of
`NestFactory.create`:

```ts
const app = await NestFactory.create<NestFastifyApplication>(
  ApiModule,
  new FastifyAdapter({
    routerOptions: {
      querystringParser: (str) => QueryString.parse(str),
      ignoreDuplicateSlashes: false,
      caseSensitive: true,
      ignoreTrailingSlash: false,
      allowUnsafeRegex: false,
    },
  }),
  // GitHub signs the exact bytes it sent; the push webhook verifies against them.
  { rawBody: true },
)
```

In `apps/api/src/test/setup/test-bench.ts` `createApp`:

```ts
const app = testModule.createNestApplication<NestFastifyApplication>(adapter, {
  rawBody: true,
})
```

- [ ] **Step 4: Add the controller**

```ts
// apps/api/src/app/build/use-cases/receive-push/receive-push.controller.ts
import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  type RawBodyRequest,
  Req,
} from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import type { FastifyRequest } from 'fastify'
import { Public } from '#src/app/auth/decorators/roles.decorator.js'
import { ReceivePushResponse } from '#src/app/build/use-cases/receive-push/receive-push.response.js'
import { ReceivePushUseCase } from '#src/app/build/use-cases/receive-push/receive-push.use-case.js'

// GitHub calls this, never the web, so it stays out of the generated client.
@ApiExcludeController()
@Controller({ path: 'github-app/webhooks', version: '1' })
export class ReceivePushController {
  constructor(private readonly usecase: ReceivePushUseCase) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  handle(
    @Req() request: RawBodyRequest<FastifyRequest>,
    @Headers('x-github-event') event?: string,
    @Headers('x-hub-signature-256') signature?: string,
  ): Promise<ReceivePushResponse> {
    return this.usecase.execute({ event, signature, rawBody: request.rawBody })
  }
}
```

- [ ] **Step 5: Add the module and register it**

```ts
// apps/api/src/app/build/use-cases/receive-push/receive-push.module.ts
import { Module } from '@nestjs/common'
import { BuildStarterModule } from '#src/app/build/services/build-starter.module.js'
import { ReceivePushController } from '#src/app/build/use-cases/receive-push/receive-push.controller.js'
import { ReceivePushRepository } from '#src/app/build/use-cases/receive-push/receive-push.repository.js'
import { ReceivePushUseCase } from '#src/app/build/use-cases/receive-push/receive-push.use-case.js'

@Module({
  imports: [BuildStarterModule],
  controllers: [ReceivePushController],
  providers: [ReceivePushUseCase, ReceivePushRepository],
})
export class ReceivePushModule {}
```

In `apps/api/src/app/build/build.module.ts`, import `ReceivePushModule` and add it to
`imports` after `StartBuildModule`:

```ts
import { ReceivePushModule } from '#src/app/build/use-cases/receive-push/receive-push.module.js'
// …
    StartBuildModule,
    ReceivePushModule,
    SweepBuildsModule,
```

- [ ] **Step 6: Run the e2e test**

Run: `cd apps/api && pnpm build && DB_NAME=marsa_test_phase_c2 pnpm test:setup && DB_NAME=marsa_test_phase_c2 node --experimental-default-config-file --env-file=.env.test --test dist/src/app/build/use-cases/receive-push/tests/receive-push.e2e.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 7: Confirm the contract is unchanged, then run the whole api suite**

Run: `cd apps/api && cp -n .env.test .env; pnpm generate:openapi && git diff --exit-code openapi.json`
Expected: exit 0 (the webhook is excluded).

Run: `cd apps/api && DB_NAME=marsa_test_phase_c2 pnpm test && pnpm lint && pnpm typecheck`
Expected: all green, coverage floors hold.

- [ ] **Step 8: Format and commit**

```bash
pnpm exec prettier --write apps/api/src/entrypoints/api.ts apps/api/src/test/setup/test-bench.ts apps/api/src/app/build/build.module.ts apps/api/src/app/build/use-cases/receive-push
git add apps/api/src/entrypoints/api.ts apps/api/src/test/setup/test-bench.ts apps/api/src/app/build/build.module.ts apps/api/src/app/build/use-cases/receive-push/receive-push.controller.ts apps/api/src/app/build/use-cases/receive-push/receive-push.module.ts apps/api/src/app/build/use-cases/receive-push/tests/receive-push.e2e.test.ts
git commit -m "feat: receive GitHub push webhooks and build the pushed commit"
```

---

## Known limits (documented, not fixed here)

- Fastify's default 1 MiB body limit applies. A push carrying about a thousand commits at once
  can exceed it and gets a 413 from Fastify, so it deploys nothing; the next normal push
  recovers. Raising the limit is a one-line `useBodyParser('application/json', { bodyLimit })`
  if it ever matters.
- An out-of-order manual redelivery of an older push rebuilds that older commit and cancels the
  newer build. GitHub redelivers App webhooks only on manual request, so this is accepted.
