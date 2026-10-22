# Phase C Part 3 — Repo-first create flow (api) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `POST /v1/apps` can create an app from a GitHub repo instead of an image. It checks
GitHub before writing anything, starts the first build right away, and the rest of the api copes
with an app that has no image yet (#21, api half).

**Architecture:** `app.image` becomes nullable, guarded by a `CHECK (image IS NOT NULL OR source
IS NOT NULL)`. `create-app` (in `app-management`) resolves the branch head through `GithubClient`
before any insert (422 on failure), then in one transaction inserts the app and a `create` build
and calls `BuildRuntime.start` last. The only code it shares with the `build` feature's
`BuildStarter` is two pure building blocks: a `selectInstallationCredentials` query in
`github-app/queries/` and `buildSpecOf` in `build/entities/`. The AgDR-0046 import rule holds, so
no service crosses features. The deploy spec injects `PORT` for source apps. A new
`GET /v1/github-app/repositories` lists every repo across the captured installations for the
web's picker, and the app detail response gains `source` and `latestBuild`.

**Tech Stack:** NestJS 11, Drizzle + drizzle-kit, class-validator, Octokit `request`,
`node:test` + `expect` + sinon + supertest, `@hey-api/openapi-ts` (web types).

**Spec:** `docs/superpowers/specs/2026-09-23-git-build-deploy-registry-design.md` §4 "Api", the
`create-release` 409 from §2, and "Feature boundary". Deviations agreed on 2026-09-24:

- One repo list, `GET /v1/github-app/repositories` → `{ items: [{ installationUuid, fullName,
defaultBranch, private }] }`, instead of `GET /v1/github/installations/:uuid/repos`. Marsa has
  no installations endpoint, and `capture-installation` never stores an account login, so an
  installation picker would show bare numeric IDs.
- An installation-token failure at create is a **502** (GitHub refused Marsa), matching
  `POST /apps/:slug/builds`. A missing installation, a repo the installation can't read, or an
  unknown branch is a **422**.
- If the duplicated insert-build-then-start lines in `create-app` read badly in review, the
  agreed fallback is to promote `BuildStarter` into a shared service and waive AgDR-0046 for it.
  This plan does not do that.

## Global Constraints

- Worktree `/home/gomaa-zorin/Github/marsa-workspace/apexyard/workspace/marsa-worktrees/phase-c-2`,
  branch `feature/21-git-push-deploy`. Part 2 (`2026-09-24-phase-c-part-2-push-webhook.md`) is
  already committed here, including `BuildStarterModule`.
- Api tests: always `cd apps/api && DB_NAME=marsa_test_phase_c2 pnpm test`. A single file:
  `pnpm build && DB_NAME=marsa_test_phase_c2 pnpm test:setup && DB_NAME=marsa_test_phase_c2 node --experimental-default-config-file --env-file=.env.test --test dist/src/<path>.test.js`.
- `generate:openapi` needs `apps/api/.env`: `cp -n apps/api/.env.test apps/api/.env`. After any
  endpoint/DTO change: `pnpm --filter api generate:openapi && pnpm --filter web generate:api`,
  and commit both `apps/api/openapi.json` and `apps/web/app/api/*` (CI drift-checks them).
- Migrations: `pnpm --filter api db:generate --name <name>`; never hand-edit generated SQL. If
  Phase B's migrations land on `main` first, rebase and **regenerate**, never hand-merge the
  snapshot/journal.
- Format only touched files: `pnpm exec prettier --write <files>`. Never repo-wide `pnpm format`.
- zsh: never rely on unquoted `$VAR` word-splitting for file lists.
- Api boundary: features import other features' `entities/`, `queries/`, `enums/`, `errors/`,
  `events/` only. `src/app/**` imports runtime ports, never adapters (tests may import mocks).
- Keep this phase's edits to `release-deploy-spec.ts` to the `PORT` injection. Phase B's #205 also
  edits it.
- Comments: one line, only a non-obvious why. No JSDoc.
- Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Coverage floors (api 80/75/75, web 88/85/60) must hold.

## File map

```text
apps/api/src
  app/app-management/entities/app.table.ts                   MOD  image nullable + CHECK
  app/app-management/entities/app.builder.ts                 MOD  withImage(string | null)
  app/app-management/entities/app-source.ts                  MOD  defaults + REPO/SOURCE_PATH patterns
  app/app-management/entities/app-config.constants.ts        MOD  DEFAULT_SOURCE_CONTAINER_PORT
  app/app-management/entities/is-exactly-one-of.validator.ts NEW
  app/app-management/responses/app-source.response.ts        NEW
  app/app-management/responses/app-latest-build.response.ts  NEW
  app/app-management/use-cases/create-app/*                  MOD  source path, tx, first build
  app/app-management/use-cases/create-app/create-app-source.command.ts  NEW
  app/app-management/use-cases/view-app-detail/*             MOD  image nullable, source, latestBuild
  app/app-management/use-cases/view-app-index/view-app-index.response.ts  MOD  image nullable
  app/app-management/use-cases/update-app/update-app.response.ts          MOD  image nullable
  app/release/entities/release-snapshot.ts                   MOD  refuse an image-less app
  app/release/entities/release-deploy-spec.ts                MOD  PORT for source apps
  app/release/use-cases/create-release/*                     MOD  409 while no image
  app/github-app/queries/installation-credentials.ts         NEW  shared credentials query
  app/github-app/use-cases/view-repository-index/*           NEW  GET /v1/github-app/repositories
  app/github-app/github-app.module.ts                        MOD
  app/build/entities/build-spec.ts                           NEW  buildSpecOf
  app/build/services/build-starter.{service,repository}.ts   MOD  use the shared pieces
  modules/github-client/*                                    MOD  listInstallationRepos
  sql/drizzle/<ts>_app_image_or_source/*                     NEW  generated
apps/api/openapi.json                                        MOD  regenerated
apps/web/app/api/*                                           MOD  regenerated
apps/web/app/components/AppConfigForm.vue                    MOD  compile against nullable image
```

---

### Task 1: An app may have no image yet

**Files:**

- Modify: `apps/api/src/app/app-management/entities/app.table.ts`
- Modify: `apps/api/src/app/app-management/entities/app.builder.ts`
- Create (generated): `apps/api/src/sql/drizzle/<timestamp>_app_image_or_source/`
- Modify: `apps/api/src/app/release/entities/release-snapshot.ts`
- Modify: `apps/api/src/app/release/use-cases/create-release/create-release.use-case.ts`
- Modify: `apps/api/src/app/release/use-cases/create-release/create-release.controller.ts`
- Modify: `apps/api/src/app/app-management/use-cases/view-app-detail/view-app-detail.use-case.ts`
- Modify: `apps/api/src/app/app-management/use-cases/view-app-detail/view-app-detail.response.ts`
- Modify: `apps/api/src/app/app-management/use-cases/view-app-index/view-app-index.response.ts`
- Modify: `apps/api/src/app/app-management/use-cases/update-app/update-app.response.ts`
- Test: `apps/api/src/app/release/entities/tests/release-snapshot.unit.test.ts`
- Test: `apps/api/src/app/release/use-cases/create-release/tests/create-release.e2e.test.ts`
- Test: `apps/api/src/app/app-management/use-cases/view-app-detail/tests/view-app-detail.use-case.unit.test.ts`

**Interfaces:**

- Produces: `App.image: string | null`; `AppBuilder.withImage(image: string | null)`;
  `snapshotOf(app)` throws `Error` when `app.image === null`; `POST /apps/:slug/releases` → 409
  `"App '<slug>' has no image yet; wait for its first build."`; `image` is `nullable` in
  `ViewAppDetailResponse`, `AppSummary`, `UpdateAppResponse`.

- [ ] **Step 1: Write the failing tests**

Append to `release-snapshot.unit.test.ts` (inside the file's top-level `describe`, or as its own
`describe` if the file has several):

```ts
describe('snapshotOf an app with no image', () => {
  it('refuses, because a release must name an image', () => {
    const app = new AppBuilder().withImage(null).build()

    expect(() => snapshotOf(app)).toThrow('no image')
  })
})
```

Append to `create-release.e2e.test.ts`, inside its `describe`:

```ts
it('409s an app whose first build has not finished', async () => {
  const pending = new AppBuilder()
    .withEnvironmentUuid(environment.uuid)
    .withSlug('create-release-e2e-pending')
    .withImage(null)
    .withSource({
      type: 'github',
      installationUuid: generateUuid<GitHubInstallationUuid>(),
      repo: 'acme/shop',
      branch: 'main',
      rootDir: '.',
      dockerfilePath: 'Dockerfile',
    })
    .build()
  await setup.db.insert(appTable).values(pending)

  const response = await request(setup.httpServer)
    .post('/api/v1/apps/create-release-e2e-pending/releases')
    .set('Cookie', cookie)
    .send({})
    .expect(409)

  expect(response.body.message).toContain('has no image yet')
})
```

with these imports added to that file:

```ts
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import { generateUuid } from '#src/utils/uuid.js'
```

The `github_installation` FK isn't enforced here: `installationUuid` sits inside jsonb.

Append to `view-app-detail.use-case.unit.test.ts`, inside its `describe`:

```ts
it('reports no undeployed changes before the first build, since nothing can be deployed', async () => {
  const { repository, usecase } = build()
  repository.findBySlug.resolves(
    new AppPlacementBuilder().withApp(new AppBuilder().withImage(null).build()).build(),
  )

  expect((await usecase.execute('my-app')).hasUndeployedChanges).toBe(false)
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/api && pnpm build`
Expected: FAIL: `withImage(null)` is a type error (`string | null` not assignable to `string`).

- [ ] **Step 3: Make the column nullable with its check**

In `app.table.ts`, add `check` to the `drizzle-orm/pg-core` import, drop `.notNull()` from
`image`, and add the check next to the index:

```ts
    image: varchar({ length: 255 }),
```

```ts
  (table) => [
    // The push webhook finds apps by the repo and branch they build from.
    index('app_source_repo_branch_idx').on(
      sql`(${table.source}->>'repo')`,
      sql`(${table.source}->>'branch')`,
    ),
    // A source app has no image until its first build succeeds; any other app needs one.
    check('app_image_or_source_check', sql`${table.image} IS NOT NULL OR ${table.source} IS NOT NULL`),
  ],
```

In `app.builder.ts`:

```ts
  withImage(image: string | null): this {
    this.app.image = image
    return this
  }
```

- [ ] **Step 4: Generate the migration**

Run: `cd apps/api && pnpm db:generate --name app_image_or_source`
Expected: a new `src/sql/drizzle/<timestamp>_app_image_or_source/migration.sql` containing
`ALTER TABLE "app" ALTER COLUMN "image" DROP NOT NULL;` and
`ALTER TABLE "app" ADD CONSTRAINT "app_image_or_source_check" CHECK (...)`. Check with
`cat` that both statements are there and nothing else changed.

If the `require-migration-ticket.sh` hook blocks the write, stop and report it to the operator.
Do not work around it.

- [ ] **Step 5: Refuse to snapshot an image-less app**

In `release-snapshot.ts`:

```ts
export function snapshotOf(app: AppConfig): ReleaseSnapshot {
  if (app.image === null) {
    throw new Error('An app with no image yet cannot be snapshotted into a release.')
  }
  return {
    imageRef: app.image,
    env: app.env,
    containerPort: app.containerPort,
    minReplicas: app.minReplicas,
    maxReplicas: app.maxReplicas,
    imagePullCredentialsEnc: app.imagePullCredentialsEnc,
  }
}
```

`appConfigOf` and `isSnapshotOf` compile unchanged (`AppConfig.image` is now `string | null`).

- [ ] **Step 6: 409 from create-release**

In `create-release.use-case.ts`, add `ConflictException` to the `@nestjs/common` import and check
right after the 404:

```ts
if (!app) {
  throw new NotFoundException(`App '${slug}' was not found.`)
}
if (app.image === null) {
  throw new ConflictException(`App '${slug}' has no image yet; wait for its first build.`)
}
```

In `create-release.controller.ts`, add `ApiConflictResponse` to the swagger import and the
decorator after `@ApiNotFoundResponse(...)`:

```ts
  @ApiConflictResponse({ description: 'The app has no image yet; its first build is pending.' })
```

- [ ] **Step 7: Nothing to deploy before the first build**

In `view-app-detail.use-case.ts`, first line of `hasUndeployedChanges`:

```ts
  private async hasUndeployedChanges(placement: AppPlacement): Promise<boolean> {
    // Before the first build there is nothing to deploy; the builds list shows progress instead.
    if (placement.app.image === null) {
      return false
    }
```

- [ ] **Step 8: Mark `image` nullable in the three responses**

In `view-app-detail.response.ts`, `view-app-index.response.ts` (`AppSummary`) and
`update-app.response.ts`:

```ts
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'nginx:1.27',
    description: 'Image the next release uses. Null until a source app finishes its first build.',
  })
  readonly image: string | null
```

- [ ] **Step 9: Fix the remaining type errors, then run the tests**

Run: `cd apps/api && pnpm typecheck`
Expected: no errors. `complete-build.use-case.ts` passes `{ ...placement.app, image: imageRef }`
(a string), and `update-app` only ever writes a string image. If anything else fails, it is a
real `image: string` assumption: narrow it with an explicit `null` check rather than a `!`
assertion.

Run: `cd apps/api && DB_NAME=marsa_test_phase_c2 pnpm test`
Expected: all green, including the three new tests.

- [ ] **Step 10: Commit**

```bash
pnpm exec prettier --write apps/api/src/app/app-management apps/api/src/app/release
git add apps/api/src/app/app-management/entities/app.table.ts apps/api/src/app/app-management/entities/app.builder.ts apps/api/src/sql/drizzle apps/api/src/app/release/entities/release-snapshot.ts apps/api/src/app/release/entities/tests/release-snapshot.unit.test.ts apps/api/src/app/release/use-cases/create-release apps/api/src/app/app-management/use-cases/view-app-detail apps/api/src/app/app-management/use-cases/view-app-index/view-app-index.response.ts apps/api/src/app/app-management/use-cases/update-app/update-app.response.ts
git commit -m "feat: let a source app exist before its first image"
```

---

### Task 2: Inject `PORT` for source apps

**Files:**

- Modify: `apps/api/src/app/release/entities/release-deploy-spec.ts`
- Test: `apps/api/src/app/release/entities/tests/release-deploy-spec.unit.test.ts`

**Interfaces:**

- Produces: `deploySpecOf(placement, release, options).env` includes
  `PORT = String(release.containerPort)` when `placement.app.source` is set and the release's env
  has no `PORT`. Image apps: unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `release-deploy-spec.unit.test.ts`:

```ts
describe('deploySpecOf and $PORT', () => {
  const source = {
    type: 'github' as const,
    installationUuid: generateUuid<GitHubInstallationUuid>(),
    repo: 'acme/shop',
    branch: 'main',
    rootDir: '.',
    dockerfilePath: 'Dockerfile',
  }
  const specOf = (app: App) =>
    deploySpecOf(
      new AppPlacementBuilder().withApp(app).build(),
      new ReleaseBuilder().withApp(app).build(),
      { baseDomain: 'demo.marsa.cc' },
    )

  it('tells a source app which port to listen on', () => {
    const app = new AppBuilder()
      .withSource(source)
      .withContainerPort(8080)
      .withEnv({ A: '1' })
      .build()

    expect(specOf(app).env).toEqual({ A: '1', PORT: '8080' })
  })

  it("keeps the user's own PORT", () => {
    const app = new AppBuilder()
      .withSource(source)
      .withContainerPort(8080)
      .withEnv({ PORT: '3000' })
      .build()

    expect(specOf(app).env).toEqual({ PORT: '3000' })
  })

  it('leaves an image app alone', () => {
    const app = new AppBuilder().withContainerPort(80).withEnv({ A: '1' }).build()

    expect(specOf(app).env).toEqual({ A: '1' })
  })
})
```

with these imports added:

```ts
import type { App } from '#src/app/app-management/entities/app.table.js'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import { generateUuid } from '#src/utils/uuid.js'
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && pnpm build && node --experimental-default-config-file --env-file=.env.test --test dist/src/app/release/entities/tests/release-deploy-spec.unit.test.js`
Expected: FAIL: "tells a source app which port to listen on" gets `{ A: '1' }`.

- [ ] **Step 3: Implement**

In `release-deploy-spec.ts`, add `App` to the imports
(`import type { App } from '#src/app/app-management/entities/app.table.js'`), use `envOf` in the
returned object, and add the helper below `deploySpecOf`:

```ts
    env: envOf(app, release),
```

```ts
const PORT_ENV = 'PORT'

// A built app can't know the port Marsa routes to unless told; a user-set PORT still wins.
function envOf(app: App, release: Release): Record<string, string> {
  if (!app.source || PORT_ENV in release.env) {
    return release.env
  }
  return { ...release.env, [PORT_ENV]: String(release.containerPort) }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm exec prettier --write apps/api/src/app/release/entities/release-deploy-spec.ts apps/api/src/app/release/entities/tests/release-deploy-spec.unit.test.ts
git add apps/api/src/app/release/entities/release-deploy-spec.ts apps/api/src/app/release/entities/tests/release-deploy-spec.unit.test.ts
git commit -m "feat: tell source apps their port through \$PORT"
```

---

### Task 3: Share the credentials query and the build spec

**Files:**

- Create: `apps/api/src/app/github-app/queries/installation-credentials.ts`
- Create: `apps/api/src/app/build/entities/build-spec.ts`
- Test: `apps/api/src/app/build/entities/tests/build-spec.unit.test.ts`
- Modify: `apps/api/src/app/build/services/build-starter.repository.ts`
- Modify: `apps/api/src/app/build/services/build-starter.service.ts`

**Interfaces:**

- Produces:
  - `interface InstallationCredentials { installationUuid: GitHubInstallationUuid; installationId: string; githubAppId: string; privateKeyPemEnc: string }`
  - `selectInstallationCredentials(db: Executor)`: an un-filtered select over
    `github_installation ⋈ github_app`; callers add `.where(...)`.
  - `buildSpecOf(source: AppSource, commitSha: string, gitToken: string, pushRef: string): BuildSpec`
- `BuildStarterRepository.findCredentials` keeps its signature and now returns
  `InstallationCredentials` from the shared file. Its own `InstallationCredentials` interface is
  deleted.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/app/build/entities/tests/build-spec.unit.test.ts
import { describe, it } from 'node:test'
import { expect } from 'expect'
import { buildSpecOf } from '#src/app/build/entities/build-spec.js'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import { generateUuid } from '#src/utils/uuid.js'

describe('buildSpecOf', () => {
  it('builds the pinned commit of the GitHub repo from the source directory', () => {
    const source = {
      type: 'github' as const,
      installationUuid: generateUuid<GitHubInstallationUuid>(),
      repo: 'acme/shop',
      branch: 'main',
      rootDir: 'apps/web',
      dockerfilePath: 'Dockerfile.prod',
    }

    expect(buildSpecOf(source, 'a'.repeat(40), 'ghs_t', 'registry:5000/shop:aaa')).toEqual({
      repoUrl: 'https://github.com/acme/shop.git',
      commitSha: 'a'.repeat(40),
      rootDir: 'apps/web',
      dockerfilePath: 'Dockerfile.prod',
      gitToken: 'ghs_t',
      pushRef: 'registry:5000/shop:aaa',
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && pnpm build`
Expected: FAIL: cannot resolve `build/entities/build-spec.js`.

- [ ] **Step 3: Implement `buildSpecOf`**

```ts
// apps/api/src/app/build/entities/build-spec.ts
import type { AppSource } from '#src/app/app-management/entities/app-source.js'
import type { BuildSpec } from '#src/modules/runtime/runtime.types.js'

export function buildSpecOf(
  source: AppSource,
  commitSha: string,
  gitToken: string,
  pushRef: string,
): BuildSpec {
  return {
    repoUrl: `https://github.com/${source.repo}.git`,
    commitSha,
    rootDir: source.rootDir,
    dockerfilePath: source.dockerfilePath,
    gitToken,
    pushRef,
  }
}
```

- [ ] **Step 4: Implement the shared query**

```ts
// apps/api/src/app/github-app/queries/installation-credentials.ts
import { eq } from 'drizzle-orm'
import { githubAppTable } from '#src/app/github-app/entities/github-app.table.js'
import { githubInstallationTable } from '#src/app/github-app/entities/github-installation.table.js'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

export interface InstallationCredentials {
  installationUuid: GitHubInstallationUuid
  installationId: string
  githubAppId: string
  privateKeyPemEnc: string
}

export function selectInstallationCredentials(db: Executor) {
  return db
    .select({
      installationUuid: githubInstallationTable.uuid,
      installationId: githubInstallationTable.installationId,
      githubAppId: githubAppTable.githubAppId,
      privateKeyPemEnc: githubAppTable.privateKeyPemEnc,
    })
    .from(githubInstallationTable)
    .innerJoin(githubAppTable, eq(githubInstallationTable.appUuid, githubAppTable.uuid))
}
```

- [ ] **Step 5: Use both from `BuildStarter`**

In `build-starter.repository.ts`, delete the local `InstallationCredentials` interface and the
`githubAppTable` import, and replace `findCredentials`:

```ts
import {
  type InstallationCredentials,
  selectInstallationCredentials,
} from '#src/app/github-app/queries/installation-credentials.js'
// …
  async findCredentials(
    tx: Executor,
    installationUuid: GitHubInstallationUuid,
  ): Promise<InstallationCredentials | undefined> {
    const [row] = await selectInstallationCredentials(tx)
      .where(eq(githubInstallationTable.uuid, installationUuid))
      .limit(1)
    return row
  }
```

In `build-starter.service.ts`, import `buildSpecOf` and replace the inline spec object:

```ts
import { buildSpecOf } from '#src/app/build/entities/build-spec.js'
// …
await this.buildRuntime.start(
  refOf(app, build),
  buildSpecOf(source, commitSha, gitToken, this.imageRegistry.pushRefFor(app.slug, commitSha)),
)
```

Then `grep -rn "InstallationCredentials" apps/api/src` and point any other import at the new
file.

- [ ] **Step 6: Run the build feature's tests**

Run: `cd apps/api && pnpm build && DB_NAME=marsa_test_phase_c2 pnpm test:setup && DB_NAME=marsa_test_phase_c2 node --experimental-default-config-file --env-file=.env.test --test "dist/src/app/build/**/*.test.js"`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
pnpm exec prettier --write apps/api/src/app/github-app/queries apps/api/src/app/build/entities apps/api/src/app/build/services
git add apps/api/src/app/github-app/queries/installation-credentials.ts apps/api/src/app/build/entities/build-spec.ts apps/api/src/app/build/entities/tests/build-spec.unit.test.ts apps/api/src/app/build/services/build-starter.repository.ts apps/api/src/app/build/services/build-starter.service.ts
git commit -m "refactor: share the installation credentials query and the build spec"
```

---

### Task 4: `GithubClient.listInstallationRepos`

**Files:**

- Modify: `apps/api/src/modules/github-client/github-client.types.ts`
- Modify: `apps/api/src/modules/github-client/github-client.ts`
- Modify: `apps/api/src/modules/github-client/mock-github-client.ts`
- Modify: `apps/api/src/modules/github-client/octokit-github-client.ts`
- Modify: `apps/api/src/modules/github-client/github-client.constants.ts`

**Interfaces:**

- Produces:
  - `interface GitHubRepository { fullName: string; defaultBranch: string; private: boolean }`
  - `GithubClient.listInstallationRepos(token: string): Promise<GitHubRepository[]>`: every repo
    the installation token can read, all pages.
  - `MOCK_REPOSITORIES: GitHubRepository[]` (exported from `mock-github-client.ts`).

No new test here: the Octokit adapter has no unit tests (network), and the mock gets exercised by
Task 5's tests.

- [ ] **Step 1: Types, port, constant**

In `github-client.types.ts`:

```ts
/** A repository an installation can read, normalised to the fields the create form needs. */
export interface GitHubRepository {
  fullName: string
  defaultBranch: string
  private: boolean
}
```

(`github-client.types.ts` already uses one-line `/** */` type comments; match it.)

In `github-client.ts`, add `GitHubRepository` to the type import and the method after
`getBranchHead`:

```ts
  /** Every repository the installation token can read (#21's repo picker). */
  abstract listInstallationRepos(token: string): Promise<GitHubRepository[]>
```

In `github-client.constants.ts`:

```ts
/** GitHub's maximum page size for list endpoints. */
export const GITHUB_MAX_PAGE_SIZE = 100
```

- [ ] **Step 2: Mock**

In `mock-github-client.ts`, add `GitHubRepository` to the type import, then:

```ts
export const MOCK_REPOSITORIES: GitHubRepository[] = [
  { fullName: 'marsa-mock/hello', defaultBranch: 'main', private: false },
  { fullName: 'marsa-mock/internal', defaultBranch: 'trunk', private: true },
]
```

```ts
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  listInstallationRepos(_token: string): Promise<GitHubRepository[]> {
    return Promise.resolve(MOCK_REPOSITORIES.map((repo) => ({ ...repo })))
  }
```

- [ ] **Step 3: Octokit**

In `octokit-github-client.ts`, import `GITHUB_MAX_PAGE_SIZE` and `GitHubRepository`, then add:

```ts
  async listInstallationRepos(token: string): Promise<GitHubRepository[]> {
    const repos: GitHubRepository[] = []
    try {
      for (let page = 1; ; page++) {
        const response = await request('GET /installation/repositories', {
          per_page: GITHUB_MAX_PAGE_SIZE,
          page,
          headers: { authorization: `token ${token}`, accept: 'application/vnd.github+json' },
          request: { signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS) },
        })
        const { repositories } = response.data
        repos.push(
          ...repositories.map((repo) => ({
            fullName: repo.full_name,
            defaultBranch: repo.default_branch,
            private: repo.private,
          })),
        )
        if (repositories.length < GITHUB_MAX_PAGE_SIZE) {
          return repos
        }
      }
    } catch (error) {
      this.logger.error(`installation repository listing failed: ${(error as Error).message}`)
      throw new Error("Could not list the installation's repositories from GitHub.")
    }
  }
```

- [ ] **Step 4: Typecheck and commit**

Run: `cd apps/api && pnpm typecheck && pnpm lint`
Expected: clean.

```bash
pnpm exec prettier --write apps/api/src/modules/github-client
git add apps/api/src/modules/github-client
git commit -m "feat: list an installation's repositories through the GitHub client"
```

---

### Task 5: `GET /v1/github-app/repositories`

**Files:**

- Create: `apps/api/src/app/github-app/use-cases/view-repository-index/view-repository-index.repository.ts`
- Create: `apps/api/src/app/github-app/use-cases/view-repository-index/view-repository-index.response.ts`
- Create: `apps/api/src/app/github-app/use-cases/view-repository-index/view-repository-index.use-case.ts`
- Create: `apps/api/src/app/github-app/use-cases/view-repository-index/view-repository-index.controller.ts`
- Create: `apps/api/src/app/github-app/use-cases/view-repository-index/view-repository-index.module.ts`
- Modify: `apps/api/src/app/github-app/github-app.module.ts`
- Test: `apps/api/src/app/github-app/use-cases/view-repository-index/tests/view-repository-index.use-case.unit.test.ts`
- Test: `apps/api/src/app/github-app/use-cases/view-repository-index/tests/view-repository-index.e2e.test.ts`

**Interfaces:**

- Consumes: `selectInstallationCredentials`, `InstallationCredentials` (Task 3);
  `GithubClient.listInstallationRepos`, `MOCK_REPOSITORIES` (Task 4).
- Produces: `GET /api/v1/github-app/repositories` (Operator, Member) →
  `ViewRepositoryIndexResponse { items: GitHubRepositorySummary[] }`, sorted by `fullName`;
  `GitHubRepositorySummary { installationUuid, fullName, defaultBranch, private }`. An
  installation whose listing fails is skipped. 502 only when every installation fails. The
  operationId becomes `viewRepositoryIndexV1`.

This list comes from GitHub, not from a table, so it is not keyset-paginated. GitHub pages it
already, and the web filters the full list client-side in a searchable select.

- [ ] **Step 1: Write the failing unit test**

```ts
// apps/api/src/app/github-app/use-cases/view-repository-index/tests/view-repository-index.use-case.unit.test.ts
import { before, describe, it } from 'node:test'
import { BadGatewayException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance, match } from 'sinon'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import type { InstallationCredentials } from '#src/app/github-app/queries/installation-credentials.js'
import { ViewRepositoryIndexRepository } from '#src/app/github-app/use-cases/view-repository-index/view-repository-index.repository.js'
import { ViewRepositoryIndexUseCase } from '#src/app/github-app/use-cases/view-repository-index/view-repository-index.use-case.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { MockGithubClient } from '#src/modules/github-client/mock-github-client.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { generateUuid } from '#src/utils/uuid.js'

const installation = (installationId: string): InstallationCredentials => ({
  installationUuid: generateUuid<GitHubInstallationUuid>(),
  installationId,
  githubAppId: '42',
  privateKeyPemEnc: 'enc-pem',
})
const personal = installation('1')
const org = installation('2')

function build(installations = [personal, org]) {
  const repository = createStubInstance(ViewRepositoryIndexRepository)
  repository.findInstallations.resolves(installations)
  const github = createStubInstance(MockGithubClient)
  github.getInstallationToken.callsFake(({ installationId }) =>
    Promise.resolve(`token-${installationId}`),
  )
  github.listInstallationRepos
    .withArgs('token-1')
    .resolves([{ fullName: 'me/zeta', defaultBranch: 'main', private: false }])
  github.listInstallationRepos
    .withArgs('token-2')
    .resolves([{ fullName: 'acme/alpha', defaultBranch: 'trunk', private: true }])
  const cipher = createStubInstance(SecretCipherService)
  cipher.decrypt.returns('pem')
  const usecase = new ViewRepositoryIndexUseCase(repository, github, cipher)
  return { usecase, github }
}

describe('ViewRepositoryIndexUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('lists every installation’s repos, tagged with their installation, by name', async () => {
    const { usecase } = build()

    const response = await usecase.execute()

    expect(response.items).toEqual([
      {
        installationUuid: org.installationUuid,
        fullName: 'acme/alpha',
        defaultBranch: 'trunk',
        private: true,
      },
      {
        installationUuid: personal.installationUuid,
        fullName: 'me/zeta',
        defaultBranch: 'main',
        private: false,
      },
    ])
  })

  it('skips an installation GitHub refuses and keeps the rest', async () => {
    const { usecase, github } = build()
    github.getInstallationToken.withArgs(match({ installationId: '1' })).rejects(new Error('gone'))

    const response = await usecase.execute()

    expect(response.items.map((repo) => repo.fullName)).toEqual(['acme/alpha'])
  })

  it('502s when no installation could be listed', async () => {
    const { usecase, github } = build()
    // Replaces the callsFake default; a listInstallationRepos withArgs would outrank a default.
    github.getInstallationToken.rejects(new Error('down'))

    await expect(usecase.execute()).rejects.toThrow(BadGatewayException)
  })

  it('is empty, not an error, before any installation exists', async () => {
    const { usecase } = build([])

    expect((await usecase.execute()).items).toEqual([])
  })
})
```

Note on the second test: `withArgs` beats `callsFake` for matching args, so installation `'1'`
rejects and `'2'` still resolves through `callsFake`.

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && pnpm build`
Expected: FAIL: the `view-repository-index` modules don't exist.

- [ ] **Step 3: Repository**

```ts
// view-repository-index.repository.ts
import { Injectable } from '@nestjs/common'
import { githubInstallationTable } from '#src/app/github-app/entities/github-installation.table.js'
import {
  type InstallationCredentials,
  selectInstallationCredentials,
} from '#src/app/github-app/queries/installation-credentials.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewRepositoryIndexRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  // One row per GitHub account or org the App is installed on; there are only ever a handful.
  async findInstallations(): Promise<InstallationCredentials[]> {
    return selectInstallationCredentials(this.db).orderBy(githubInstallationTable.uuid)
  }
}
```

- [ ] **Step 4: Response**

```ts
// view-repository-index.response.ts
import { ApiProperty } from '@nestjs/swagger'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import type { GitHubRepository } from '#src/modules/github-client/github-client.types.js'

export interface InstallationRepository extends GitHubRepository {
  installationUuid: GitHubInstallationUuid
}

export class GitHubRepositorySummary {
  @ApiProperty({ type: String, format: 'uuid', description: 'Installation that can read it.' })
  readonly installationUuid: string

  @ApiProperty({ type: String, example: 'acme/shop' })
  readonly fullName: string

  @ApiProperty({ type: String, example: 'main' })
  readonly defaultBranch: string

  @ApiProperty({ type: Boolean })
  readonly private: boolean

  constructor(repo: InstallationRepository) {
    this.installationUuid = repo.installationUuid
    this.fullName = repo.fullName
    this.defaultBranch = repo.defaultBranch
    this.private = repo.private
  }
}

export class ViewRepositoryIndexResponse {
  @ApiProperty({ type: [GitHubRepositorySummary] })
  readonly items: GitHubRepositorySummary[]

  constructor(repos: InstallationRepository[]) {
    this.items = [...repos]
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map((repo) => new GitHubRepositorySummary(repo))
  }
}
```

- [ ] **Step 5: Use-case**

```ts
// view-repository-index.use-case.ts
import { BadGatewayException, Injectable, Logger } from '@nestjs/common'
import type { InstallationCredentials } from '#src/app/github-app/queries/installation-credentials.js'
import { ViewRepositoryIndexRepository } from '#src/app/github-app/use-cases/view-repository-index/view-repository-index.repository.js'
import {
  type InstallationRepository,
  ViewRepositoryIndexResponse,
} from '#src/app/github-app/use-cases/view-repository-index/view-repository-index.response.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { GithubClient } from '#src/modules/github-client/github-client.js'

@Injectable()
export class ViewRepositoryIndexUseCase {
  private readonly logger = new Logger(ViewRepositoryIndexUseCase.name)

  constructor(
    private readonly repository: ViewRepositoryIndexRepository,
    private readonly github: GithubClient,
    private readonly cipher: SecretCipherService,
  ) {}

  async execute(): Promise<ViewRepositoryIndexResponse> {
    const installations = await this.repository.findInstallations()
    const listed = await Promise.all(installations.map((installation) => this.list(installation)))
    if (installations.length > 0 && listed.every((repos) => repos === null)) {
      throw new BadGatewayException('Could not list repositories from GitHub.')
    }
    return new ViewRepositoryIndexResponse(listed.flatMap((repos) => repos ?? []))
  }

  private async list(
    installation: InstallationCredentials,
  ): Promise<InstallationRepository[] | null> {
    try {
      const token = await this.github.getInstallationToken({
        githubAppId: installation.githubAppId,
        privateKeyPem: this.cipher.decrypt(installation.privateKeyPemEnc),
        installationId: installation.installationId,
      })
      const repos = await this.github.listInstallationRepos(token)
      return repos.map((repo) => ({ ...repo, installationUuid: installation.installationUuid }))
    } catch (error) {
      // One uninstalled org must not hide every other account's repos.
      this.logger.warn(
        `listing installation ${installation.installationId} failed: ${(error as Error).message}`,
      )
      return null
    }
  }
}
```

- [ ] **Step 6: Controller and module**

```ts
// view-repository-index.controller.ts
import { Controller, Get } from '@nestjs/common'
import {
  ApiBadGatewayResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { ViewRepositoryIndexResponse } from '#src/app/github-app/use-cases/view-repository-index/view-repository-index.response.js'
import { ViewRepositoryIndexUseCase } from '#src/app/github-app/use-cases/view-repository-index/view-repository-index.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('github-app')
@Controller({ path: 'github-app/repositories', version: '1' })
export class ViewRepositoryIndexController {
  constructor(private readonly usecase: ViewRepositoryIndexUseCase) {}

  @Get()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiOkResponse({ type: ViewRepositoryIndexResponse })
  @ApiBadGatewayResponse({ description: 'GitHub refused every installation.' })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(): Promise<ViewRepositoryIndexResponse> {
    return this.usecase.execute()
  }
}
```

```ts
// view-repository-index.module.ts
import { Module } from '@nestjs/common'
import { ViewRepositoryIndexController } from '#src/app/github-app/use-cases/view-repository-index/view-repository-index.controller.js'
import { ViewRepositoryIndexRepository } from '#src/app/github-app/use-cases/view-repository-index/view-repository-index.repository.js'
import { ViewRepositoryIndexUseCase } from '#src/app/github-app/use-cases/view-repository-index/view-repository-index.use-case.js'
import { GitHubClientModule } from '#src/modules/github-client/github-client.module.js'

@Module({
  imports: [GitHubClientModule],
  controllers: [ViewRepositoryIndexController],
  providers: [ViewRepositoryIndexUseCase, ViewRepositoryIndexRepository],
})
export class ViewRepositoryIndexModule {}
```

Add `ViewRepositoryIndexModule` to `GitHubAppModule.imports`.

- [ ] **Step 7: Write the e2e test**

```ts
// tests/view-repository-index.e2e.test.ts
import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { GitHubAppBuilder } from '#src/app/github-app/entities/github-app.builder.js'
import { githubAppTable } from '#src/app/github-app/entities/github-app.table.js'
import { GitHubInstallationBuilder } from '#src/app/github-app/entities/github-installation.builder.js'
import { githubInstallationTable } from '#src/app/github-app/entities/github-installation.table.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { MOCK_REPOSITORIES } from '#src/modules/github-client/mock-github-client.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('GET /api/v1/github-app/repositories (e2e)', () => {
  let setup: TestSetup
  let cookie: string
  let installationUuid: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
    const cipher = setup.testModule.get(SecretCipherService)
    const githubApp = {
      ...new GitHubAppBuilder().withGithubAppId('6161').build(),
      slug: 'marsa-repos-e2e',
      privateKeyPemEnc: cipher.encrypt('pem'),
    }
    const installation = new GitHubInstallationBuilder()
      .withInstallationId('6161')
      .withAppUuid(githubApp.uuid)
      .build()
    installationUuid = installation.uuid
    await setup.db.insert(githubAppTable).values(githubApp)
    await setup.db.insert(githubInstallationTable).values(installation)
  })

  after(async () => {
    await setup.teardown()
  })

  it("lists the installation's repositories", async () => {
    const response = await request(setup.httpServer)
      .get('/api/v1/github-app/repositories')
      .set('Cookie', cookie)
      .expect(200)

    expect(response.body.items).toEqual(
      MOCK_REPOSITORIES.map((repo) => ({ ...repo, installationUuid })),
    )
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).get('/api/v1/github-app/repositories').expect(401)
  })
})
```

`MOCK_REPOSITORIES` is already in `fullName` order (`marsa-mock/hello` < `marsa-mock/internal`).

- [ ] **Step 8: Run both tests**

Run: `cd apps/api && pnpm build && DB_NAME=marsa_test_phase_c2 pnpm test:setup && DB_NAME=marsa_test_phase_c2 node --experimental-default-config-file --env-file=.env.test --test "dist/src/app/github-app/use-cases/view-repository-index/tests/*.test.js"`
Expected: PASS, 6 tests.

- [ ] **Step 9: Commit**

```bash
pnpm exec prettier --write apps/api/src/app/github-app
git add apps/api/src/app/github-app/use-cases/view-repository-index apps/api/src/app/github-app/github-app.module.ts
git commit -m "feat: list the repositories every GitHub installation can read"
```

---

### Task 6: Create an app from a GitHub repo

**Files:**

- Modify: `apps/api/src/app/app-management/entities/app-source.ts`
- Modify: `apps/api/src/app/app-management/entities/app-config.constants.ts`
- Create: `apps/api/src/app/app-management/entities/is-exactly-one-of.validator.ts`
- Create: `apps/api/src/app/app-management/use-cases/create-app/create-app-source.command.ts`
- Modify: `apps/api/src/app/app-management/use-cases/create-app/create-app.command.ts`
- Modify: `apps/api/src/app/app-management/use-cases/create-app/create-app.command.builder.ts`
- Modify: `apps/api/src/app/app-management/use-cases/create-app/create-app.repository.ts`
- Modify: `apps/api/src/app/app-management/use-cases/create-app/create-app.use-case.ts`
- Modify: `apps/api/src/app/app-management/use-cases/create-app/create-app.controller.ts`
- Modify: `apps/api/src/app/app-management/use-cases/create-app/create-app.module.ts`
- Test: `apps/api/src/app/app-management/use-cases/create-app/tests/create-app.command.unit.test.ts` (new)
- Test: `apps/api/src/app/app-management/use-cases/create-app/tests/create-app.use-case.unit.test.ts` (rewrite)
- Test: `apps/api/src/app/app-management/use-cases/create-app/tests/create-app-from-source.e2e.test.ts` (new)

**Interfaces:**

- Consumes: `selectInstallationCredentials` (Task 3), `buildSpecOf` (Task 3), `buildTable`,
  `BuildStatus`, `BuildTrigger` (build entities/enums), `GithubClient.getInstallationToken` /
  `getBranchHead`, `BuildRuntime.start`, `ImageRegistry.pushRefFor(appSlug, tag)`.
- Produces:
  - `CreateAppCommand`: `image?` and `source?` (exactly one, else 400); `containerPort?`
    (required with `image`, defaults to `DEFAULT_SOURCE_CONTAINER_PORT = 8080` with `source`).
  - `CreateAppSourceCommand { installationUuid; repo; branch; rootDir?; dockerfilePath? }`.
  - `CreateAppCommandBuilder.fromSource(source: CreateAppSourceCommand): this` (clears `image`
    and `containerPort`).
  - `POST /v1/apps` with `source` → 201, app `image: null`, one `running` build with
    `trigger: create`. 422 on a missing installation, an unreadable repo or an unknown branch. 502
    when no installation token can be minted. No app is created in either case.
  - `DEFAULT_ROOT_DIR = '.'`, `DEFAULT_DOCKERFILE_PATH = 'Dockerfile'`, `REPO_PATTERN`,
    `SOURCE_PATH_PATTERN` exported from `app-source.ts`.

- [ ] **Step 1: Constants**

Append to `app-source.ts`:

```ts
export const DEFAULT_ROOT_DIR = '.'
export const DEFAULT_DOCKERFILE_PATH = 'Dockerfile'
export const BRANCH_MAX_LENGTH = 255

export const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/

// Relative, and never climbing out of the repo with a `..` segment.
export const SOURCE_PATH_PATTERN = /^(?!\/)(?!(?:.*\/)?\.\.(?:\/|$))[\w.\-/]+$/
```

Append to `app-config.constants.ts`:

```ts
/** Port a source app is routed to unless told otherwise; the app reads it from $PORT. */
export const DEFAULT_SOURCE_CONTAINER_PORT = 8080
```

- [ ] **Step 2: Write the failing command-validation test**

```ts
// tests/create-app.command.unit.test.ts
import { before, describe, it } from 'node:test'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { expect } from 'expect'
import { CreateAppCommand } from '#src/app/app-management/use-cases/create-app/create-app.command.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const base = { environmentUuid: '0199a1b2-0000-7000-8000-000000000000', slug: 'shop' }
const source = {
  installationUuid: '0199a1b2-0000-7000-8000-000000000001',
  repo: 'acme/shop',
  branch: 'main',
}

async function errorsOf(body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(CreateAppCommand, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  })
  return errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...(error.children ?? []).flatMap((child) => Object.values(child.constraints ?? {})),
  ])
}

describe('CreateAppCommand', () => {
  before(() => TestBench.setupUnitTest())

  it('accepts an image app with a port', async () => {
    expect(await errorsOf({ ...base, image: 'nginx:1.27', containerPort: 80 })).toEqual([])
  })

  it('accepts a source app without an image or a port', async () => {
    expect(await errorsOf({ ...base, source })).toEqual([])
  })

  it('rejects both an image and a source', async () => {
    expect(await errorsOf({ ...base, image: 'nginx:1.27', containerPort: 80, source })).toContain(
      'Send exactly one of image or source.',
    )
  })

  it('rejects neither an image nor a source', async () => {
    expect(await errorsOf(base)).toContain('Send exactly one of image or source.')
  })

  it('still requires a port for an image app', async () => {
    expect((await errorsOf({ ...base, image: 'nginx:1.27' })).length).toBeGreaterThan(0)
  })

  for (const rootDir of ['/etc', '../up', 'a/../b']) {
    it(`rejects the root directory ${rootDir}`, async () => {
      expect((await errorsOf({ ...base, source: { ...source, rootDir } })).length).toBeGreaterThan(
        0,
      )
    })
  }

  it('rejects a repo that is not owner/name', async () => {
    expect(
      (await errorsOf({ ...base, source: { ...source, repo: 'acme' } })).length,
    ).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd apps/api && pnpm build && node --experimental-default-config-file --env-file=.env.test --test dist/src/app/app-management/use-cases/create-app/tests/create-app.command.unit.test.js`
Expected: FAIL: "accepts a source app" reports `image`/`containerPort` errors and a forbidden
`source` property.

- [ ] **Step 4: The validator**

```ts
// apps/api/src/app/app-management/entities/is-exactly-one-of.validator.ts
import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator'

// class-validator has no class-level rules, so the check lives on one of the two fields.
export function IsExactlyOneOf(other: string, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isExactlyOneOf',
      target: object.constructor,
      propertyName,
      constraints: [other],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [related] = args.constraints as [string]
          const otherValue = (args.object as Record<string, unknown>)[related]
          return (value !== undefined) !== (otherValue !== undefined)
        },
        defaultMessage(args: ValidationArguments) {
          return `Send exactly one of ${args.property} or ${args.constraints[0] as string}.`
        },
      },
    })
  }
}
```

- [ ] **Step 5: The source command**

```ts
// create-app-source.command.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator'
import {
  BRANCH_MAX_LENGTH,
  DEFAULT_DOCKERFILE_PATH,
  DEFAULT_ROOT_DIR,
  REPO_PATTERN,
  SOURCE_PATH_PATTERN,
} from '#src/app/app-management/entities/app-source.js'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'

const RELATIVE_PATH_MESSAGE = '$property must be a path inside the repo, without ".." segments.'

export class CreateAppSourceCommand {
  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'Installation that can read the repo.',
  })
  @IsUUID()
  installationUuid!: GitHubInstallationUuid

  @ApiProperty({ type: String, example: 'acme/shop', pattern: REPO_PATTERN.source })
  @Matches(REPO_PATTERN, { message: 'repo must be owner/name.' })
  repo!: string

  @ApiProperty({ type: String, example: 'main', maxLength: BRANCH_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(BRANCH_MAX_LENGTH)
  branch!: string

  @ApiPropertyOptional({
    type: String,
    example: DEFAULT_ROOT_DIR,
    default: DEFAULT_ROOT_DIR,
    description: 'Build context, relative to the repo root.',
  })
  @IsOptional()
  @Matches(SOURCE_PATH_PATTERN, { message: RELATIVE_PATH_MESSAGE })
  rootDir?: string

  @ApiPropertyOptional({
    type: String,
    example: DEFAULT_DOCKERFILE_PATH,
    default: DEFAULT_DOCKERFILE_PATH,
    description: 'Relative to rootDir.',
  })
  @IsOptional()
  @Matches(SOURCE_PATH_PATTERN, { message: RELATIVE_PATH_MESSAGE })
  dockerfilePath?: string
}
```

- [ ] **Step 6: Rework `CreateAppCommand`'s image, port and source**

In `create-app.command.ts`, add `ValidateIf` to the class-validator import, import
`IsExactlyOneOf` and `CreateAppSourceCommand`, and replace the `image` and `containerPort`
properties:

```ts
  @ApiPropertyOptional({
    type: String,
    example: 'nginx:1.27',
    description: 'Fully-qualified image ref. Send this or source, not both.',
  })
  @ValidateIf((command: CreateAppCommand) => command.image !== undefined || command.source === undefined)
  @IsExactlyOneOf('source')
  @IsString()
  @IsNotEmpty()
  image?: string

  @ApiPropertyOptional({
    type: CreateAppSourceCommand,
    description: 'GitHub repo to build and deploy. Send this or image, not both.',
  })
  @ValidateIf((command: CreateAppCommand) => command.source !== undefined)
  @ValidateNested()
  @Type(() => CreateAppSourceCommand)
  source?: CreateAppSourceCommand

  @ApiPropertyOptional({
    type: 'integer',
    example: 80,
    description: `Port the container listens on. Required with image; defaults to ${DEFAULT_SOURCE_CONTAINER_PORT} with source.`,
    minimum: MIN_CONTAINER_PORT,
    maximum: MAX_CONTAINER_PORT,
  })
  @ValidateIf(
    (command: CreateAppCommand) => command.image !== undefined || command.containerPort !== undefined,
  )
  @IsInt()
  @Min(MIN_CONTAINER_PORT)
  @Max(MAX_CONTAINER_PORT)
  containerPort?: number
```

(`DEFAULT_SOURCE_CONTAINER_PORT` joins the existing `app-config.constants.js` import.)

In `create-app.command.builder.ts`:

```ts
  fromSource(source: CreateAppSourceCommand): this {
    this.command.source = source
    delete this.command.image
    delete this.command.containerPort
    return this
  }
```

Run the Step 3 command. Expected: PASS, 10 tests.

- [ ] **Step 7: Rewrite the use-case unit test (failing first)**

Replace `tests/create-app.use-case.unit.test.ts` with:

```ts
import { before, describe, it } from 'node:test'
import {
  BadGatewayException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import { createStubInstance, match } from 'sinon'
import { CreateAppCommandBuilder } from '#src/app/app-management/use-cases/create-app/create-app.command.builder.js'
import { CreateAppRepository } from '#src/app/app-management/use-cases/create-app/create-app.repository.js'
import { CreateAppUseCase } from '#src/app/app-management/use-cases/create-app/create-app.use-case.js'
import { BuildBuilder } from '#src/app/build/entities/build.builder.js'
import { BuildTrigger } from '#src/app/build/enums/build-trigger.enum.js'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { MOCK_COMMIT_SHA, MockGithubClient } from '#src/modules/github-client/mock-github-client.js'
import { MockBuildRuntime } from '#src/modules/runtime/adapters/mock/mock-build-runtime.js'
import { MockImageRegistry } from '#src/modules/runtime/adapters/mock/mock-image-registry.js'
import { stubDatabase } from '#src/test/setup/stub-database.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { generateUuid } from '#src/utils/uuid.js'

const installationUuid = generateUuid<GitHubInstallationUuid>()
const source = { installationUuid, repo: 'acme/shop', branch: 'main' }

function build() {
  const repository = createStubInstance(CreateAppRepository)
  repository.insert.resolves('inserted')
  repository.findInstallationCredentials.resolves({
    installationUuid,
    installationId: '7',
    githubAppId: '42',
    privateKeyPemEnc: 'enc-pem',
  })
  repository.insertBuild.callsFake((_tx, build) =>
    Promise.resolve(
      new BuildBuilder().withCommitSha(build.commitSha).withTrigger(build.trigger).build(),
    ),
  )
  const config = createStubInstance(ConfigService)
  config.getOrThrow.returns('demo.marsa.cc')
  const credentialsCipher = createStubInstance(ImagePullCredentialsCipher)
  credentialsCipher.seal.returns('sealed')
  const secretCipher = createStubInstance(SecretCipherService)
  secretCipher.decrypt.returns('pem')
  const github = createStubInstance(MockGithubClient)
  github.getInstallationToken.resolves('ghs_t')
  github.getBranchHead.resolves(MOCK_COMMIT_SHA)
  const buildRuntime = createStubInstance(MockBuildRuntime)
  buildRuntime.start.resolves()
  const usecase = new CreateAppUseCase(
    stubDatabase(),
    repository,
    credentialsCipher,
    secretCipher,
    github,
    buildRuntime,
    new MockImageRegistry(),
    config,
  )
  return { usecase, repository, credentialsCipher, github, buildRuntime }
}

describe('CreateAppUseCase', () => {
  before(() => TestBench.setupUnitTest())

  describe('from an image', () => {
    it('stores the app without touching the cluster and returns its URL', async () => {
      const { usecase, repository, buildRuntime } = build()

      const command = new CreateAppCommandBuilder().withEnv({ A: '1' }).build()
      const result = await usecase.execute(command)

      expect(result).toEqual({ slug: 'my-app', url: 'https://my-app.demo.marsa.cc' })
      expect(repository.insert.firstCall.args[1]).toMatchObject({
        environmentUuid: command.environmentUuid,
        slug: 'my-app',
        image: 'nginx:1.27',
        containerPort: 80,
        minReplicas: 1,
        maxReplicas: 1,
        env: { A: '1' },
        source: null,
        imagePullCredentialsEnc: null,
      })
      expect(buildRuntime.start.called).toBe(false)
    })

    it('lifts a default ceiling to a floor above it', async () => {
      const { usecase, repository } = build()

      await usecase.execute(new CreateAppCommandBuilder().withMinReplicas(3).build())

      expect(repository.insert.firstCall.args[1]).toMatchObject({ minReplicas: 3, maxReplicas: 3 })
    })

    it('seals pull credentials', async () => {
      const { usecase, repository, credentialsCipher } = build()
      const credentials = { registry: 'ghcr.io', username: 'org', password: 'pw' }

      await usecase.execute(
        new CreateAppCommandBuilder().withImagePullCredentials(credentials).build(),
      )

      expect(credentialsCipher.seal.calledOnceWithExactly(credentials)).toBe(true)
      expect(repository.insert.firstCall.args[1].imagePullCredentialsEnc).toBe('sealed')
    })

    it('rejects a taken slug with 409', async () => {
      const { usecase, repository } = build()
      repository.insert.resolves('slug-taken')

      await expect(usecase.execute(new CreateAppCommandBuilder().build())).rejects.toThrow(
        ConflictException,
      )
    })

    it('rejects an unknown environment with 404', async () => {
      const { usecase, repository } = build()
      repository.insert.resolves('environment-missing')

      await expect(usecase.execute(new CreateAppCommandBuilder().build())).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  describe('from a GitHub repo', () => {
    it('stores the app without an image and builds the branch head', async () => {
      const { usecase, repository, github, buildRuntime } = build()

      await usecase.execute(new CreateAppCommandBuilder().fromSource(source).build())

      expect(
        github.getBranchHead.calledOnceWith({ token: 'ghs_t', repo: 'acme/shop', branch: 'main' }),
      ).toBe(true)
      expect(repository.insert.firstCall.args[1]).toMatchObject({
        image: null,
        containerPort: 8080,
        source: {
          type: 'github',
          installationUuid,
          repo: 'acme/shop',
          branch: 'main',
          rootDir: '.',
          dockerfilePath: 'Dockerfile',
        },
      })
      expect(
        repository.insertBuild.calledOnceWith(
          match.any,
          match({ commitSha: MOCK_COMMIT_SHA, branch: 'main', trigger: BuildTrigger.Create }),
        ),
      ).toBe(true)
      expect(buildRuntime.start.firstCall.args[1]).toMatchObject({
        repoUrl: 'https://github.com/acme/shop.git',
        commitSha: MOCK_COMMIT_SHA,
        gitToken: 'ghs_t',
        pushRef: `registry.mock.test/my-app:${MOCK_COMMIT_SHA}`,
      })
    })

    it('422s before writing anything when the branch cannot be read', async () => {
      const { usecase, repository, github } = build()
      github.getBranchHead.rejects(new Error("Branch 'main' of 'acme/shop' was not found"))

      await expect(
        usecase.execute(new CreateAppCommandBuilder().fromSource(source).build()),
      ).rejects.toThrow(UnprocessableEntityException)
      expect(repository.insert.called).toBe(false)
    })

    it('422s an installation Marsa does not know', async () => {
      const { usecase, repository } = build()
      repository.findInstallationCredentials.resolves(undefined)

      await expect(
        usecase.execute(new CreateAppCommandBuilder().fromSource(source).build()),
      ).rejects.toThrow(UnprocessableEntityException)
    })

    it('502s when GitHub will not mint a token', async () => {
      const { usecase, github } = build()
      github.getInstallationToken.rejects(
        new Error('Could not mint a GitHub installation access token.'),
      )

      await expect(
        usecase.execute(new CreateAppCommandBuilder().fromSource(source).build()),
      ).rejects.toThrow(BadGatewayException)
    })

    it('keeps the app and records a failed build when the runtime refuses the build', async () => {
      const { usecase, repository, buildRuntime } = build()
      buildRuntime.start.rejects(new Error('jobs is forbidden'))

      const result = await usecase.execute(new CreateAppCommandBuilder().fromSource(source).build())

      expect(result.slug).toBe('my-app')
      expect(repository.failBuild.calledOnceWith(match.any, match.any, 'jobs is forbidden')).toBe(
        true,
      )
    })
  })
})
```

Run: `cd apps/api && pnpm build`
Expected: FAIL: `CreateAppUseCase` takes 3 args; `findInstallationCredentials` /
`insertBuild` / `failBuild` don't exist.

- [ ] **Step 8: Repository**

```ts
// create-app.repository.ts
import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import { type Build, buildTable, type NewBuild } from '#src/app/build/entities/build.table.js'
import type { BuildUuid } from '#src/app/build/entities/build.uuid.js'
import { BuildStatus } from '#src/app/build/enums/build-status.enum.js'
import { githubInstallationTable } from '#src/app/github-app/entities/github-installation.table.js'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import {
  type InstallationCredentials,
  selectInstallationCredentials,
} from '#src/app/github-app/queries/installation-credentials.js'
import type { Database, Executor } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { isForeignKeyViolation } from '#src/modules/database/postgres-errors.js'

@Injectable()
export class CreateAppRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findInstallationCredentials(
    installationUuid: GitHubInstallationUuid,
  ): Promise<InstallationCredentials | undefined> {
    const [row] = await selectInstallationCredentials(this.db)
      .where(eq(githubInstallationTable.uuid, installationUuid))
      .limit(1)
    return row
  }

  // The environment FK is the existence check, so an environment deleted mid-request can't slip past.
  async insert(tx: Executor, app: App): Promise<'inserted' | 'slug-taken' | 'environment-missing'> {
    try {
      const rows = await tx
        .insert(appTable)
        .values(app)
        .onConflictDoNothing({ target: appTable.slug })
        .returning({ uuid: appTable.uuid })
      return rows.length > 0 ? 'inserted' : 'slug-taken'
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        return 'environment-missing'
      }
      throw error
    }
  }

  async insertBuild(tx: Executor, build: NewBuild): Promise<Build> {
    const [inserted] = await tx.insert(buildTable).values(build).returning()
    if (!inserted) {
      throw new Error('Inserting a build returned no row')
    }
    return inserted
  }

  async failBuild(tx: Executor, uuid: BuildUuid, failureReason: string): Promise<void> {
    await tx
      .update(buildTable)
      .set({ status: BuildStatus.Failed, failureReason })
      .where(eq(buildTable.uuid, uuid))
  }
}
```

- [ ] **Step 9: Use-case**

```ts
// create-app.use-case.ts
import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import type { App } from '#src/app/app-management/entities/app.table.js'
import { DEFAULT_SOURCE_CONTAINER_PORT } from '#src/app/app-management/entities/app-config.constants.js'
import {
  type AppSource,
  DEFAULT_DOCKERFILE_PATH,
  DEFAULT_ROOT_DIR,
} from '#src/app/app-management/entities/app-source.js'
import { CreateAppCommand } from '#src/app/app-management/use-cases/create-app/create-app.command.js'
import { CreateAppRepository } from '#src/app/app-management/use-cases/create-app/create-app.repository.js'
import { CreateAppResponse } from '#src/app/app-management/use-cases/create-app/create-app.response.js'
import type { CreateAppSourceCommand } from '#src/app/app-management/use-cases/create-app/create-app-source.command.js'
import { buildSpecOf } from '#src/app/build/entities/build-spec.js'
import { BuildStatus } from '#src/app/build/enums/build-status.enum.js'
import { BuildTrigger } from '#src/app/build/enums/build-trigger.enum.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import type { Database, Executor } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { GithubClient } from '#src/modules/github-client/github-client.js'
import { BuildRuntime } from '#src/modules/runtime/build-runtime.js'
import { ImageRegistry } from '#src/modules/runtime/image-registry.js'

interface BranchHead {
  commitSha: string
  token: string
}

const sourceOf = (command: CreateAppSourceCommand): AppSource => ({
  type: 'github',
  installationUuid: command.installationUuid,
  repo: command.repo,
  branch: command.branch,
  rootDir: command.rootDir ?? DEFAULT_ROOT_DIR,
  dockerfilePath: command.dockerfilePath ?? DEFAULT_DOCKERFILE_PATH,
})

@Injectable()
export class CreateAppUseCase {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: CreateAppRepository,
    private readonly credentialsCipher: ImagePullCredentialsCipher,
    private readonly secretCipher: SecretCipherService,
    private readonly github: GithubClient,
    private readonly buildRuntime: BuildRuntime,
    private readonly imageRegistry: ImageRegistry,
    private readonly config: ConfigService,
  ) {}

  async execute(command: CreateAppCommand): Promise<CreateAppResponse> {
    const source = command.source ? sourceOf(command.source) : null
    // GitHub is asked before anything is written, so an unreadable repo leaves no app behind.
    const head = source ? await this.resolveHead(source) : null
    const app = this.appOf(command, source)

    await this.db.transaction(async (tx) => {
      const outcome = await this.repository.insert(tx, app)
      if (outcome === 'environment-missing') {
        throw new NotFoundException(`Environment '${command.environmentUuid}' was not found.`)
      }
      if (outcome === 'slug-taken') {
        throw new ConflictException(`An app with slug '${command.slug}' already exists.`)
      }
      if (source && head) {
        await this.startFirstBuild(tx, app, source, head)
      }
    })

    return new CreateAppResponse(app, this.config.getOrThrow<string>('MARSA_BASE_DOMAIN'))
  }

  private appOf(command: CreateAppCommand, source: AppSource | null): App {
    const minReplicas = command.minReplicas ?? 1
    const credentials = command.imagePullCredentials
    return new AppBuilder()
      .withEnvironmentUuid(command.environmentUuid)
      .withSlug(command.slug)
      .withDomain({ type: 'subdomain' })
      .withImage(command.image ?? null)
      .withSource(source)
      .withContainerPort(command.containerPort ?? DEFAULT_SOURCE_CONTAINER_PORT)
      .withMinReplicas(minReplicas)
      .withMaxReplicas(Math.max(command.maxReplicas ?? 1, minReplicas))
      .withEnv(command.env ?? {})
      .withNodePin(command.nodePin ?? null)
      .withImagePullCredentialsEnc(credentials ? this.credentialsCipher.seal(credentials) : null)
      .build()
  }

  private async resolveHead(source: AppSource): Promise<BranchHead> {
    const credentials = await this.repository.findInstallationCredentials(source.installationUuid)
    if (!credentials) {
      throw new UnprocessableEntityException(
        `GitHub installation '${source.installationUuid}' was not found.`,
      )
    }
    const token = await this.github
      .getInstallationToken({
        githubAppId: credentials.githubAppId,
        privateKeyPem: this.secretCipher.decrypt(credentials.privateKeyPemEnc),
        installationId: credentials.installationId,
      })
      .catch((error: Error) => {
        throw new BadGatewayException(error.message, { cause: error })
      })
    const commitSha = await this.github
      .getBranchHead({ token, repo: source.repo, branch: source.branch })
      .catch((error: Error) => {
        throw new UnprocessableEntityException(error.message, { cause: error })
      })
    return { commitSha, token }
  }

  // Runtime last; a refused build is recorded on the build, and the app still exists to rebuild.
  private async startFirstBuild(
    tx: Executor,
    app: App,
    source: AppSource,
    { commitSha, token }: BranchHead,
  ): Promise<void> {
    const build = await this.repository.insertBuild(tx, {
      appUuid: app.uuid,
      commitSha,
      branch: source.branch,
      status: BuildStatus.Running,
      trigger: BuildTrigger.Create,
    })
    try {
      await this.buildRuntime.start(
        { build: { uuid: build.uuid }, app: { slug: app.slug } },
        buildSpecOf(source, commitSha, token, this.imageRegistry.pushRefFor(app.slug, commitSha)),
      )
    } catch (error) {
      await this.repository.failBuild(tx, build.uuid, (error as Error).message)
    }
  }
}
```

- [ ] **Step 10: Module and controller docs**

`create-app.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { CreateAppController } from '#src/app/app-management/use-cases/create-app/create-app.controller.js'
import { CreateAppRepository } from '#src/app/app-management/use-cases/create-app/create-app.repository.js'
import { CreateAppUseCase } from '#src/app/app-management/use-cases/create-app/create-app.use-case.js'
import { GitHubClientModule } from '#src/modules/github-client/github-client.module.js'

@Module({
  imports: [GitHubClientModule],
  controllers: [CreateAppController],
  providers: [CreateAppUseCase, CreateAppRepository],
})
export class CreateAppModule {}
```

In `create-app.controller.ts`, add `ApiBadGatewayResponse` and `ApiUnprocessableEntityResponse`
to the swagger import, update the 400 text, and add:

```ts
  @ApiBadRequestResponse({
    description: 'Malformed body, an invalid slug / image / port, or both or neither of image and source.',
  })
  @ApiUnprocessableEntityResponse({
    description: 'The installation is unknown, or it cannot read the repo or branch.',
  })
  @ApiBadGatewayResponse({ description: 'GitHub refused the installation token.' })
```

Run the Step 7 command, then the unit test file.
Expected: PASS, 10 tests.

- [ ] **Step 11: Write and run the e2e test**

```ts
// tests/create-app-from-source.e2e.test.ts
import { after, before, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import { restore, stub } from 'sinon'
import request from 'supertest'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { buildTable } from '#src/app/build/entities/build.table.js'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import { GitHubAppBuilder } from '#src/app/github-app/entities/github-app.builder.js'
import { githubAppTable } from '#src/app/github-app/entities/github-app.table.js'
import { GitHubInstallationBuilder } from '#src/app/github-app/entities/github-installation.builder.js'
import { githubInstallationTable } from '#src/app/github-app/entities/github-installation.table.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { GithubClient } from '#src/modules/github-client/github-client.js'
import { MOCK_COMMIT_SHA } from '#src/modules/github-client/mock-github-client.js'
import type { MockBuildRuntime } from '#src/modules/runtime/adapters/mock/mock-build-runtime.js'
import { BuildRuntime } from '#src/modules/runtime/build-runtime.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('POST /api/v1/apps from a GitHub repo (e2e)', () => {
  let setup: TestSetup
  let cookie: string
  let environment: Environment
  let installationUuid: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
    environment = (await setup.seedEnvironment()).environment
    const cipher = setup.testModule.get(SecretCipherService)
    const githubApp = {
      ...new GitHubAppBuilder().withGithubAppId('7171').build(),
      slug: 'marsa-create-e2e',
      privateKeyPemEnc: cipher.encrypt('pem'),
    }
    const installation = new GitHubInstallationBuilder()
      .withInstallationId('7171')
      .withAppUuid(githubApp.uuid)
      .build()
    installationUuid = installation.uuid
    await setup.db.insert(githubAppTable).values(githubApp)
    await setup.db.insert(githubInstallationTable).values(installation)
  })

  after(async () => {
    restore()
    await setup.teardown()
  })

  const create = (body: object) =>
    request(setup.httpServer).post('/api/v1/apps').set('Cookie', cookie).send(body)

  it('creates the app without an image and starts its first build', async () => {
    const response = await create({
      environmentUuid: environment.uuid,
      slug: 'from-source-e2e',
      source: { installationUuid, repo: 'acme/shop', branch: 'main' },
    }).expect(201)

    expect(response.body.slug).toBe('from-source-e2e')
    const [app] = await setup.db.select().from(appTable).where(eq(appTable.slug, 'from-source-e2e'))
    expect(app).toMatchObject({ image: null, containerPort: 8080 })
    const [build] = await setup.db.select().from(buildTable).where(eq(buildTable.appUuid, app.uuid))
    expect(build).toMatchObject({
      commitSha: MOCK_COMMIT_SHA,
      trigger: 'create',
      status: 'running',
    })
    const runtime = setup.testModule.get<BuildRuntime, MockBuildRuntime>(BuildRuntime)
    expect(runtime.started.has(build.uuid)).toBe(true)
  })

  it('422s, creating nothing, when the branch is not readable', async () => {
    const github = setup.testModule.get(GithubClient)
    stub(github, 'getBranchHead').rejects(
      new Error("Branch 'nope' of 'acme/shop' was not found, or the GitHub App cannot access it."),
    )

    const response = await create({
      environmentUuid: environment.uuid,
      slug: 'from-source-e2e-missing',
      source: { installationUuid, repo: 'acme/shop', branch: 'nope' },
    }).expect(422)

    expect(response.body.message).toContain("Branch 'nope'")
    const apps = await setup.db
      .select()
      .from(appTable)
      .where(eq(appTable.slug, 'from-source-e2e-missing'))
    expect(apps).toHaveLength(0)
    restore()
  })

  it('400s a body with both an image and a source', async () => {
    await create({
      environmentUuid: environment.uuid,
      slug: 'from-source-e2e-both',
      image: 'nginx:1.27',
      containerPort: 80,
      source: { installationUuid, repo: 'acme/shop', branch: 'main' },
    }).expect(400)
  })
})
```

Run: `cd apps/api && pnpm build && DB_NAME=marsa_test_phase_c2 pnpm test:setup && DB_NAME=marsa_test_phase_c2 node --experimental-default-config-file --env-file=.env.test --test "dist/src/app/app-management/use-cases/create-app/tests/*.test.js"`
Expected: all PASS (the existing `create-app.e2e.test.ts` included; its image bodies are
unchanged).

- [ ] **Step 12: Commit**

```bash
pnpm exec prettier --write apps/api/src/app/app-management/entities apps/api/src/app/app-management/use-cases/create-app
git add apps/api/src/app/app-management/entities/app-source.ts apps/api/src/app/app-management/entities/app-config.constants.ts apps/api/src/app/app-management/entities/is-exactly-one-of.validator.ts apps/api/src/app/app-management/use-cases/create-app
git commit -m "feat: create an app from a GitHub repo and start its first build"
```

---

### Task 7: The app detail shows its source and latest build

**Files:**

- Create: `apps/api/src/app/app-management/responses/app-source.response.ts`
- Create: `apps/api/src/app/app-management/responses/app-latest-build.response.ts`
- Modify: `apps/api/src/app/app-management/use-cases/view-app-detail/view-app-detail.repository.ts`
- Modify: `apps/api/src/app/app-management/use-cases/view-app-detail/view-app-detail.use-case.ts`
- Modify: `apps/api/src/app/app-management/use-cases/view-app-detail/view-app-detail.response.ts`
- Test: `apps/api/src/app/app-management/use-cases/view-app-detail/tests/view-app-detail.use-case.unit.test.ts`

**Interfaces:**

- Produces: `ViewAppDetailResponse.source: AppSourceResponse | null` (`{ installationUuid, repo,
branch, rootDir, dockerfilePath }`) and `latestBuild: AppLatestBuild | null` (`{ uuid, status:
BuildStatus, commitSha, failureReason, createdAt }`). Constructor:
  `new ViewAppDetailResponse(placement, baseDomain, hasUndeployedChanges, latestBuild: Build | undefined)`.
  Repository gains `findLatestBuild(appUuid): Promise<Build | undefined>`.

- [ ] **Step 1: Write the failing tests**

In the unit test's `build()` helper add `repository.findLatestBuild.resolves(undefined)` after
`repository.findRelease.resolves(undefined)`, then append inside the `describe`:

```ts
it('names the source and the newest build of a source app', async () => {
  const { repository, usecase } = build()
  const source = {
    type: 'github' as const,
    installationUuid: generateUuid<GitHubInstallationUuid>(),
    repo: 'acme/shop',
    branch: 'main',
    rootDir: '.',
    dockerfilePath: 'Dockerfile',
  }
  const sourced = new AppBuilder().withSource(source).withImage(null).build()
  const latest = new BuildBuilder()
    .withApp(sourced)
    .withStatus(BuildStatus.Failed)
    .withFailureReason('no Dockerfile')
    .build()
  repository.findBySlug.resolves(new AppPlacementBuilder().withApp(sourced).build())
  repository.findLatestBuild.resolves(latest)

  const response = await usecase.execute('my-app')

  expect(response.source).toEqual({
    installationUuid: source.installationUuid,
    repo: 'acme/shop',
    branch: 'main',
    rootDir: '.',
    dockerfilePath: 'Dockerfile',
  })
  expect(response.latestBuild).toEqual({
    uuid: latest.uuid,
    status: BuildStatus.Failed,
    commitSha: latest.commitSha,
    failureReason: 'no Dockerfile',
    createdAt: latest.createdAt.toISOString(),
  })
})

it('has no source or build for an image app', async () => {
  const { usecase } = build()

  const response = await usecase.execute('my-app')

  expect(response.source).toBeNull()
  expect(response.latestBuild).toBeNull()
})
```

with imports:

```ts
import { BuildBuilder } from '#src/app/build/entities/build.builder.js'
import { BuildStatus } from '#src/app/build/enums/build-status.enum.js'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import { generateUuid } from '#src/utils/uuid.js'
```

Run: `cd apps/api && pnpm build`
Expected: FAIL: `findLatestBuild` does not exist.

- [ ] **Step 2: Response classes**

```ts
// apps/api/src/app/app-management/responses/app-source.response.ts
import { ApiProperty } from '@nestjs/swagger'
import type { AppSource } from '#src/app/app-management/entities/app-source.js'

export class AppSourceResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly installationUuid: string

  @ApiProperty({ type: String, example: 'acme/shop' })
  readonly repo: string

  @ApiProperty({ type: String, example: 'main' })
  readonly branch: string

  @ApiProperty({ type: String, example: '.' })
  readonly rootDir: string

  @ApiProperty({ type: String, example: 'Dockerfile' })
  readonly dockerfilePath: string

  constructor(source: AppSource) {
    this.installationUuid = source.installationUuid
    this.repo = source.repo
    this.branch = source.branch
    this.rootDir = source.rootDir
    this.dockerfilePath = source.dockerfilePath
  }
}
```

```ts
// apps/api/src/app/app-management/responses/app-latest-build.response.ts
import { ApiProperty } from '@nestjs/swagger'
import type { Build } from '#src/app/build/entities/build.table.js'
import { BuildStatus, BuildStatusApiProperty } from '#src/app/build/enums/build-status.enum.js'

export class AppLatestBuild {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly uuid: string

  @BuildStatusApiProperty({ example: BuildStatus.Running })
  readonly status: BuildStatus

  @ApiProperty({ type: String, example: 'c0ffee0000000000000000000000000000000000' })
  readonly commitSha: string

  @ApiProperty({ type: String, nullable: true })
  readonly failureReason: string | null

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: string

  constructor(build: Build) {
    this.uuid = build.uuid
    this.status = build.status
    this.commitSha = build.commitSha
    this.failureReason = build.failureReason
    this.createdAt = build.createdAt.toISOString()
  }
}
```

- [ ] **Step 3: Repository, use-case, response**

In `view-app-detail.repository.ts` add (imports: `desc` from drizzle-orm, `type Build, buildTable`
from `#src/app/build/entities/build.table.js`):

```ts
  async findLatestBuild(appUuid: AppUuid): Promise<Build | undefined> {
    const [build] = await this.db
      .select()
      .from(buildTable)
      .where(eq(buildTable.appUuid, appUuid))
      .orderBy(desc(buildTable.uuid))
      .limit(1)
    return build
  }
```

In `view-app-detail.use-case.ts` `execute`:

```ts
const hasUndeployedChanges = await this.hasUndeployedChanges(placement)
const latestBuild = await this.repository.findLatestBuild(placement.app.uuid)
return new ViewAppDetailResponse(
  placement,
  this.config.getOrThrow<string>('MARSA_BASE_DOMAIN'),
  hasUndeployedChanges,
  latestBuild,
)
```

In `view-app-detail.response.ts` add the two fields (after `nodePin`) and the constructor
parameter:

```ts
  @ApiProperty({
    type: AppSourceResponse,
    nullable: true,
    description: 'GitHub repo the app builds from; null for an image app.',
  })
  readonly source: AppSourceResponse | null

  @ApiProperty({ type: AppLatestBuild, nullable: true, description: 'Newest build, if any.' })
  readonly latestBuild: AppLatestBuild | null
```

```ts
  constructor(
    { app, project, environment }: AppPlacement,
    baseDomain: string,
    hasUndeployedChanges: boolean,
    latestBuild: Build | undefined,
  ) {
    // …existing assignments…
    this.source = app.source ? new AppSourceResponse(app.source) : null
    this.latestBuild = latestBuild ? new AppLatestBuild(latestBuild) : null
```

- [ ] **Step 4: Run the detail tests**

Run: `cd apps/api && pnpm build && DB_NAME=marsa_test_phase_c2 pnpm test:setup && DB_NAME=marsa_test_phase_c2 node --experimental-default-config-file --env-file=.env.test --test "dist/src/app/app-management/use-cases/view-app-detail/tests/*.test.js"`
Expected: PASS (the e2e is unaffected: image apps get `source: null, latestBuild: null`).

- [ ] **Step 5: Commit**

```bash
pnpm exec prettier --write apps/api/src/app/app-management/responses apps/api/src/app/app-management/use-cases/view-app-detail
git add apps/api/src/app/app-management/responses/app-source.response.ts apps/api/src/app/app-management/responses/app-latest-build.response.ts apps/api/src/app/app-management/use-cases/view-app-detail
git commit -m "feat: show an app's source and latest build on its detail"
```

---

### Task 8: Regenerate the contract and keep the web compiling

**Files:**

- Modify: `apps/api/openapi.json`, `apps/web/app/api/types.gen.ts`, `apps/web/app/api/zod.gen.ts`
- Modify: `apps/web/app/components/AppConfigForm.vue`

- [ ] **Step 1: Regenerate**

Run: `cp -n apps/api/.env.test apps/api/.env; pnpm --filter api generate:openapi && pnpm --filter web generate:api`
Expected: `openapi.json` gains `viewRepositoryIndexV1`, `CreateAppSourceCommand`,
`AppSourceResponse`, `AppLatestBuild`, and a nullable `image`; the webhook route is absent.

- [ ] **Step 2: Compile the web against the nullable image**

Run: `pnpm --filter web typecheck`
Expected: one error, in `AppConfigForm.vue`'s `seed`. Fix it:

```ts
state.image = config.image ?? ''
```

Part 4 reworks this form for source apps. This is only the compile fix. Re-run typecheck and
`pnpm --filter web test`. Expected: green.

- [ ] **Step 3: Full api suite, lint, typecheck**

Run: `cd apps/api && DB_NAME=marsa_test_phase_c2 pnpm test && pnpm lint && pnpm typecheck`
Expected: green, coverage floors hold.

- [ ] **Step 4: Commit**

```bash
pnpm exec prettier --write apps/web/app/components/AppConfigForm.vue
git add apps/api/openapi.json apps/web/app/api apps/web/app/components/AppConfigForm.vue
git commit -m "chore: regenerate the API contract for repo-first create"
```

---

## Not in this part

- The web create form, builds list, rebuild and log view: Part 4.
- A branch picker: the form defaults the branch to the repo's default branch in a text field.
  Listing branches is a later nicety.
