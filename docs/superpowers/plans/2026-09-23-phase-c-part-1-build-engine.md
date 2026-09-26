# Phase C Part 1 — Build engine, sweeper and build logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An app with a GitHub `source` can be rebuilt on demand: Marsa resolves the branch HEAD,
runs a rootless BuildKit Job that pushes to the in-cluster Zot, and a 5-second sweep turns a
finished build into a release and deploys it. Build history and build logs are readable over the
api.

**Architecture:** A `build` feature owns the `build` table, a `BuildStarter` service (cancel running
→ insert → mint installation token → runtime last), a `CompleteBuildUseCase` (claim with
`SKIP LOCKED` → release → deploy in a savepoint) and a `BuildSweeper` on `@nestjs/schedule`. A new
`BuildRuntime` port (Kubernetes adapter renders a Job + a per-build token Secret; mock adapter for
tests) and two new `ImageRegistry` methods (`imageRefFor`, `pushRefFor`) keep Kubernetes and Zot
out of the feature.

**Tech Stack:** NestJS 11, Drizzle (drizzle-kit migrations), `@nestjs/schedule`, `@kubernetes/client-node`,
Octokit `request`, `node:test` + `expect` + sinon, Helm + helm-unittest.

**Spec:** `docs/superpowers/specs/2026-09-23-git-build-deploy-registry-design.md` §2 and §5 (and
D4–D8, D10). Parts 2 (webhook), 3 (create flow api) and 4 (web UI) get their own plans once this
lands; everything ships in the one PR, marsa#237 (+ marsa-charts#32).

## Global Constraints

- Branch: `feature/78-self-hosted-registry` in
  `/home/gomaa-zorin/Github/marsa-workspace/apexyard/workspace/marsa-worktrees/phase-c` (marsa)
  and `/home/gomaa-zorin/Github/marsa-workspace/apexyard/workspace/marsa-charts-worktrees/78-registry`
  (charts). No new branches, no new tickets. Commits end with the session's attribution lines.
- Api tests: always `DB_NAME=marsa_test_phase_c` (the default `marsa_test` is shared with another
  agent and the test setup drops its schema). Example: `cd apps/api && DB_NAME=marsa_test_phase_c pnpm test`.
- Format only touched files: `pnpm exec prettier --write <files>`. Markdown with `{{ }}` blocks
  needs `<!-- prettier-ignore -->` before the block.
- The shell is zsh: never rely on unquoted `$VAR` word-splitting for file lists.
- BuildKit image: `moby/buildkit:v0.33.0-rootless`. Build namespace: `marsa-builds`. Build Job
  deadline 1800 s, finished-Job TTL 3600 s.
- Image tags are the full 40-char commit SHA. Pull ref `registry.<domain>/<app-slug>:<sha>`; push
  ref `marsa-registry.<release-ns>.svc.cluster.local:5000/<app-slug>:<sha>`.
- Api boundary: features import other features' `entities/`, `queries/`, `enums/`, `errors/`,
  `events/` only; `src/app/**` imports `#src/modules/runtime/*` ports, never adapters (tests may
  import mock adapters).
- Comments: one line, only a non-obvious why. No JSDoc.
- Coverage floors (api 80/75/75) must hold.

## Verified by spike (2026-09-23, k3d, BuildKit v0.33.0-rootless)

- `buildctl-daemonless.sh build --frontend=dockerfile.v0 --opt=context=https://github.com/<o>/<r>.git#<sha>:<subdir> --opt=filename=Dockerfile --output=type=image,name=<push-ref>,push=true,registry.insecure=true`
  works as uid/gid 1000 with seccomp + AppArmor `Unconfined` and
  `BUILDKITD_FLAGS=--oci-worker-no-process-sandbox`, `DOCKER_CONFIG` pointing at a mounted
  dockerconfigjson.
- A node pulls the pushed image as `registry.<domain>/<repo>:<tag>`.
- Failure text lands in the pod's `terminated.message` with `terminationMessagePolicy: FallbackToLogsOnError`
  (e.g. `failed to read dockerfile: invalid subdir does-not-exist …`); the Job condition reason is
  `BackoffLimitExceeded` (or `DeadlineExceeded` on timeout).
- `--secret=id=GIT_AUTH_TOKEN.github.com,env=GIT_TOKEN` is sent to GitHub (a bad token breaks a
  public clone). A private repo with a real installation token is **not** verified — manual QA.

## File map

```text
marsa-charts
  charts/marsa/templates/builds.yml                 NEW  marsa-builds Namespace + Role + RoleBinding
  charts/marsa/templates/registry-secrets.yml       MOD  + marsa-registry-push dockerconfigjson in marsa-builds
  charts/marsa/templates/configmap.yml              MOD  MARSA_REGISTRY_URL → Service FQDN
  charts/marsa/tests/builds_test.yaml               NEW
  charts/marsa/tests/registry_test.yaml             MOD

apps/api/src
  app/app-management/entities/app-source.ts         NEW  AppSource type
  app/app-management/entities/app.table.ts          MOD  source jsonb + expression index
  app/app-management/entities/app.builder.ts        MOD  source default + withSource
  app/app-management/use-cases/delete-app/*         MOD  delete builds with the app
  app/release/entities/release.table.ts             MOD  buildUuid FK
  app/release/entities/release.builder.ts           MOD  buildUuid default + withBuildUuid
  app/build/entities/build.{uuid,table,builder}.ts  NEW
  app/build/enums/build-{status,trigger}.enum.ts    NEW
  app/build/responses/build-summary.response.ts     NEW
  app/build/services/build-starter.{service,repository}.ts  NEW
  app/build/use-cases/start-build/*                 NEW  POST /v1/apps/:slug/builds
  app/build/use-cases/complete-build/*              NEW  internal, used by the sweeper
  app/build/use-cases/sweep-builds/*                NEW  BuildSweeper (@Cron)
  app/build/use-cases/view-build-index/*            NEW  GET  /v1/apps/:slug/builds
  app/build/use-cases/view-build-logs/*             NEW  GET  /v1/apps/:slug/builds/:buildUuid/logs
  app/build/build.module.ts                         NEW
  modules/api/api.module.ts                         MOD  + BuildModule
  modules/runtime/build-runtime.ts                  NEW  port + BUILD_DEADLINE_SECONDS
  modules/runtime/runtime.types.ts                  MOD  BuildRef, BuildSpec, BuildState, BuildObservation
  modules/runtime/image-registry.ts                 MOD  + imageRefFor, pushRefFor
  modules/runtime/adapters/zot/zot-image-registry.ts MOD
  modules/runtime/adapters/kubernetes/build/*       NEW  constants, render, observe, runtime
  modules/runtime/adapters/mock/mock-build-runtime.ts NEW
  modules/runtime/adapters/{kubernetes,mock}/*-runtime.module.ts MOD  bind BuildRuntime
  modules/github-client/*                           MOD  getBranchHead
  sql/schema.ts, sql/relations.ts                   MOD
  sql/drizzle/<ts>_build/                           NEW  generated migration
```

---

## Task 1: Chart — build namespace, RBAC, push Secret, FQDN registry url

Work in the charts worktree. Tests: `helm unittest charts/marsa`.

**Files:** create `charts/marsa/templates/builds.yml`, `charts/marsa/tests/builds_test.yaml`;
modify `charts/marsa/templates/registry-secrets.yml`, `charts/marsa/templates/configmap.yml`,
`charts/marsa/tests/registry_test.yaml`.

**Interfaces — Produces:** namespace `marsa-builds`; Role/RoleBinding `marsa-builder` for SA
`marsa-api`; Secret `marsa-builds/marsa-registry-push` (`kubernetes.io/dockerconfigjson`, auth for
`marsa-registry.<ns>.svc.cluster.local:5000`); `MARSA_REGISTRY_URL=http://marsa-registry.<ns>.svc.cluster.local:5000`.

- [ ] **Step 1: Failing tests.** `charts/marsa/tests/builds_test.yaml`:

```yaml
suite: builds
templates:
  - builds.yml
release:
  namespace: marsa
set:
  email: a@b.com
  tls.enabled: true
  tls.domain: example.com
tests:
  - it: creates the build namespace
    documentSelector: { path: kind, value: Namespace }
    asserts:
      - equal: { path: metadata.name, value: marsa-builds }

  - it: lets marsa-api run Jobs and read their pods and logs in marsa-builds only
    documentSelector: { path: kind, value: Role }
    asserts:
      - equal: { path: metadata.namespace, value: marsa-builds }
      - contains:
          path: rules
          content:
            {
              apiGroups: ['batch'],
              resources: ['jobs'],
              verbs: ['create', 'get', 'list', 'delete'],
            }
      - contains:
          path: rules
          content: { apiGroups: [''], resources: ['secrets'], verbs: ['create', 'get', 'delete'] }
      - contains:
          path: rules
          content: { apiGroups: [''], resources: ['pods', 'pods/log'], verbs: ['get', 'list'] }

  - it: binds the role to the marsa-api service account of the release namespace
    documentSelector: { path: kind, value: RoleBinding }
    asserts:
      - equal: { path: metadata.namespace, value: marsa-builds }
      - equal: { path: roleRef.name, value: marsa-builder }
      - contains:
          path: subjects
          content: { kind: ServiceAccount, name: marsa-api, namespace: marsa }
```

Append to `charts/marsa/tests/registry_test.yaml` `tests:`:

```yaml
- it: gives build Jobs a push credential for the in-cluster registry service
  template: registry-secrets.yml
  release:
    namespace: marsa
  documentSelector: { path: metadata.name, value: marsa-registry-push }
  asserts:
    - equal: { path: metadata.namespace, value: marsa-builds }
    - equal: { path: type, value: kubernetes.io/dockerconfigjson }
    - matchRegex:
        path: stringData[".dockerconfigjson"]
        pattern: '"marsa-registry\.marsa\.svc\.cluster\.local:5000":\{"username":"marsa-push"'
```

and change the existing `MARSA_REGISTRY_URL` assertion's value to
`http://marsa-registry.NAMESPACE.svc.cluster.local:5000`, with `release: { namespace: NAMESPACE }`
on that test.

Also add `documentSelector: { path: metadata.name, value: marsa-registry-secrets }` to the two
existing `registry-secrets.yml` tests (the template now renders two documents).

- [ ] **Step 2:** `helm unittest charts/marsa` → FAIL (builds.yml missing, push secret missing,
      url mismatch).

- [ ] **Step 3: Implement.** `charts/marsa/templates/builds.yml`:

<!-- prettier-ignore -->
```yaml
# Builds run apart from environment namespaces: rootless BuildKit needs Unconfined seccomp/AppArmor.
apiVersion: v1
kind: Namespace
metadata:
  name: marsa-builds
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: marsa-builder
  namespace: marsa-builds
rules:
  - apiGroups: ["batch"]
    resources: ["jobs"]
    verbs: ["create", "get", "list", "delete"]
  - apiGroups: [""]
    resources: ["secrets"]
    verbs: ["create", "get", "delete"]
  - apiGroups: [""]
    resources: ["pods", "pods/log"]
    verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: marsa-builder
  namespace: marsa-builds
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: marsa-builder
subjects:
  - kind: ServiceAccount
    name: marsa-api
    namespace: {{ .Release.Namespace }}
```

Append to `charts/marsa/templates/registry-secrets.yml` (same file, so it reuses `$push`):

<!-- prettier-ignore -->
```yaml
---
{{- $pushHost := printf "marsa-registry.%s.svc.cluster.local:5000" .Release.Namespace }}
{{- $auth := printf "marsa-push:%s" $push | b64enc }}
apiVersion: v1
kind: Secret
metadata:
  name: marsa-registry-push
  namespace: marsa-builds
type: kubernetes.io/dockerconfigjson
stringData:
  .dockerconfigjson: {{ printf "{\"auths\":{%q:{\"username\":\"marsa-push\",\"password\":%q,\"auth\":%q}}}" $pushHost $push $auth | quote }}
```

In `charts/marsa/templates/configmap.yml` change the url line to:

<!-- prettier-ignore -->
```yaml
  MARSA_REGISTRY_URL: "http://marsa-registry.{{ .Release.Namespace }}.svc.cluster.local:5000"
```

and the comment above it to `# Nodes pull built images by this public name; pods push to the
Service's full name so the build namespace can resolve it.`

- [ ] **Step 4:** `helm unittest charts/marsa` → all PASS; `helm lint charts/marsa --set email=a@b.com`
      clean; `helm template x charts/marsa --set email=a@b.com | docker run --rm -i ghcr.io/yannh/kubeconform:v0.6.7 -strict -ignore-missing-schemas -summary -kubernetes-version 1.32.0 -schema-location default -schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json'`
      → 0 invalid; `helm template x charts/marsa --set email=a@b.com --show-only templates/registry-secrets.yml | grep dockerconfigjson` prints valid JSON (pipe the value through `python3 -m json.tool`).

- [ ] **Step 5: Commit** (`feat: add the build namespace, RBAC and push credential`) and push the
      charts branch.

---

## Task 2: Schema — `app.source`, `build` table, `release.buildUuid`

**Files:** create `app-management/entities/app-source.ts`, `build/entities/build.uuid.ts`,
`build/entities/build.table.ts`, `build/entities/build.builder.ts`, `build/enums/build-status.enum.ts`,
`build/enums/build-trigger.enum.ts`; modify `app.table.ts`, `app.builder.ts`, `release.table.ts`,
`release.builder.ts`, `sql/schema.ts`, `sql/relations.ts`, delete-app repository + its tests.

**Interfaces — Produces:**

```ts
export interface GitHubAppSource {
  type: 'github'
  installationUuid: GitHubInstallationUuid
  repo: string            // owner/name
  branch: string
  rootDir: string         // '.' = repo root
  dockerfilePath: string  // relative to rootDir
}
export type AppSource = GitHubAppSource
export type BuildUuid = Uuid<'Build'>
export enum BuildStatus { Running = 'running', Succeeded = 'succeeded', Failed = 'failed', Cancelled = 'cancelled' }
export enum BuildTrigger { Push = 'push', Create = 'create', Manual = 'manual' }
export const buildTable // columns: uuid, appUuid, commitSha, branch, status, trigger, imageRef|null, failureReason|null, createdAt, updatedAt
export type Build = typeof buildTable.$inferSelect
export class BuildBuilder { withApp(app: App); withCommitSha(sha); withStatus(s); withTrigger(t); withImageRef(r|null); withFailureReason(r|null); withCreatedAt(d); build(): Build }
AppBuilder.withSource(source: AppSource | null)
ReleaseBuilder.withBuildUuid(uuid: BuildUuid | null)
DeleteAppRepository.deleteWithHistory(tx, appUuid)   // renamed from deleteWithReleases
```

- [ ] **Step 1: Write the types, enums and tables.**

`apps/api/src/app/app-management/entities/app-source.ts`:

```ts
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'

export interface GitHubAppSource {
  type: 'github'
  installationUuid: GitHubInstallationUuid
  repo: string
  branch: string
  rootDir: string
  dockerfilePath: string
}

export type AppSource = GitHubAppSource
```

`apps/api/src/app/app-management/entities/app.table.ts`: add imports `index` from
`drizzle-orm/pg-core` and `type AppSource`; add the column after `nodePin`:

```ts
  source: jsonb().$type<AppSource>(),
```

and pass the table extras as the third `pgTable` argument:

```ts
  (table) => [
    // The push webhook finds apps by the repo and branch they build from.
    index('app_source_repo_branch_idx').on(
      sql`(${table.source}->>'repo')`,
      sql`(${table.source}->>'branch')`,
    ),
  ],
```

`apps/api/src/app/build/entities/build.uuid.ts`:

```ts
import type { Uuid } from '#src/utils/uuid.js'

export type BuildUuid = Uuid<'Build'>
```

`apps/api/src/app/build/enums/build-status.enum.ts`:

```ts
import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger'
import { pgEnum } from 'drizzle-orm/pg-core'

export enum BuildStatus {
  Running = 'running',
  Succeeded = 'succeeded',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

export const buildStatusEnum = pgEnum('build_status_enum', BuildStatus)

export const BuildStatusApiProperty = (options?: ApiPropertyOptions): PropertyDecorator =>
  ApiProperty({ ...options, enum: BuildStatus, enumName: 'BuildStatus' })
```

`apps/api/src/app/build/enums/build-trigger.enum.ts`:

```ts
import { pgEnum } from 'drizzle-orm/pg-core'

export enum BuildTrigger {
  Push = 'push',
  Create = 'create',
  Manual = 'manual',
}

export const buildTriggerEnum = pgEnum('build_trigger_enum', BuildTrigger)
```

`apps/api/src/app/build/entities/build.table.ts`:

```ts
import { sql } from 'drizzle-orm'
import { index, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import type { BuildUuid } from '#src/app/build/entities/build.uuid.js'
import { BuildStatus, buildStatusEnum } from '#src/app/build/enums/build-status.enum.js'
import { buildTriggerEnum } from '#src/app/build/enums/build-trigger.enum.js'
import { timestamps } from '#src/sql/timestamps.js'

export const buildTable = pgTable(
  'build',
  {
    uuid: uuid()
      .$type<BuildUuid>()
      .primaryKey()
      .default(sql`uuidv7()`),
    appUuid: uuid('app_uuid')
      .$type<AppUuid>()
      .notNull()
      .references(() => appTable.uuid, { onUpdate: 'cascade' }),
    commitSha: varchar('commit_sha', { length: 40 }).notNull(),
    branch: varchar({ length: 255 }).notNull(),
    status: buildStatusEnum().notNull().default(BuildStatus.Running),
    trigger: buildTriggerEnum().notNull(),
    imageRef: varchar('image_ref', { length: 255 }),
    failureReason: text('failure_reason'),
    ...timestamps,
  },
  (table) => [
    index('build_app_uuid_idx').on(table.appUuid, table.uuid.desc()),
    // The sweeper only ever reads running builds.
    index('build_running_idx')
      .on(table.createdAt)
      .where(sql`${table.status} = 'running'`),
  ],
)

export type Build = typeof buildTable.$inferSelect
export type NewBuild = typeof buildTable.$inferInsert
```

`apps/api/src/app/release/entities/release.table.ts`: import `buildTable` and `BuildUuid`, add
after `sourceReleaseUuid`:

```ts
  buildUuid: uuid('build_uuid')
    .$type<BuildUuid>()
    .references(() => buildTable.uuid, { onDelete: 'set null' }),
```

`apps/api/src/sql/schema.ts`: add

```ts
export * from '#src/app/build/entities/build.table.js'
export { buildStatusEnum } from '#src/app/build/enums/build-status.enum.js'
export { buildTriggerEnum } from '#src/app/build/enums/build-trigger.enum.js'
```

`apps/api/src/sql/relations.ts`: add `builds: r.many.buildTable(),` to `appTable`, and

```ts
  buildTable: {
    app: r.one.appTable({ from: r.buildTable.appUuid, to: r.appTable.uuid, optional: false }),
  },
```

- [ ] **Step 2: Builders.** In `app.builder.ts` add `source: null,` to the defaults and

```ts
  withSource(source: AppSource | null): this {
    this.app.source = source
    return this
  }
```

In `release.builder.ts` add `buildUuid: null,` to the defaults and

```ts
  withBuildUuid(buildUuid: BuildUuid | null): this {
    this.release.buildUuid = buildUuid
    return this
  }
```

`apps/api/src/app/build/entities/build.builder.ts`:

```ts
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import type { App } from '#src/app/app-management/entities/app.table.js'
import type { Build } from '#src/app/build/entities/build.table.js'
import type { BuildUuid } from '#src/app/build/entities/build.uuid.js'
import { BuildStatus } from '#src/app/build/enums/build-status.enum.js'
import { BuildTrigger } from '#src/app/build/enums/build-trigger.enum.js'
import { generateUuid } from '#src/utils/uuid.js'

export class BuildBuilder {
  private readonly build_: Build

  constructor() {
    const now = new Date()
    this.build_ = {
      uuid: generateUuid<BuildUuid>(),
      appUuid: new AppBuilder().build().uuid,
      commitSha: 'a'.repeat(40),
      branch: 'main',
      status: BuildStatus.Running,
      trigger: BuildTrigger.Manual,
      imageRef: null,
      failureReason: null,
      createdAt: now,
      updatedAt: now,
    }
  }

  withApp(app: App): this {
    this.build_.appUuid = app.uuid
    return this
  }

  withCommitSha(commitSha: string): this {
    this.build_.commitSha = commitSha
    return this
  }

  withStatus(status: BuildStatus): this {
    this.build_.status = status
    return this
  }

  withTrigger(trigger: BuildTrigger): this {
    this.build_.trigger = trigger
    return this
  }

  withImageRef(imageRef: string | null): this {
    this.build_.imageRef = imageRef
    return this
  }

  withFailureReason(failureReason: string | null): this {
    this.build_.failureReason = failureReason
    return this
  }

  withCreatedAt(createdAt: Date): this {
    this.build_.createdAt = createdAt
    return this
  }

  build(): Build {
    return this.build_
  }
}
```

- [ ] **Step 3: Delete builds with the app.** In
      `app-management/use-cases/delete-app/delete-app.repository.ts` import `buildTable` and replace
      `deleteWithReleases` with:

```ts
  // Releases reference builds and both reference the app, none with a cascade.
  async deleteWithHistory(tx: Executor, appUuid: AppUuid): Promise<void> {
    await tx.delete(releaseTable).where(eq(releaseTable.appUuid, appUuid))
    await tx.delete(buildTable).where(eq(buildTable.appUuid, appUuid))
    await tx.delete(appTable).where(eq(appTable.uuid, appUuid))
  }
```

Rename every `deleteWithReleases` in `delete-app.use-case.ts` and
`tests/delete-app.use-case.unit.test.ts` to `deleteWithHistory`. In
`tests/delete-app.e2e.test.ts` → `removes the app and its releases`, also insert
`new BuildBuilder().withApp(app).build()` into `buildTable` after the app, and assert
`await setup.db.select().from(buildTable)` has length 0 after the 204.

- [ ] **Step 4: Generate the migration.**

```bash
cd apps/api || exit 1
DATABASE_URL=postgresql://marsa:marsa@localhost:5432 DB_NAME=marsa_test_phase_c pnpm exec drizzle-kit generate --name build
cat src/sql/drizzle/*_build/migration.sql
```

Expected SQL (order may differ): `CREATE TYPE "build_status_enum"`, `CREATE TYPE
"build_trigger_enum"`, `CREATE TABLE "build"`, `ALTER TABLE "app" ADD COLUMN "source" jsonb`,
`ALTER TABLE "release" ADD COLUMN "build_uuid" uuid`, the two FKs, `build_app_uuid_idx`,
`build_running_idx … WHERE "build"."status" = 'running'`, and
`app_source_repo_branch_idx … (("app"."source"->>'repo'), ("app"."source"->>'branch'))`. If the
expression index renders without the extra parentheses Postgres requires, edit `migration.sql`
by hand to `(("source"->>'repo'), ("source"->>'branch'))`.

- [ ] **Step 5: Verify.** From the worktree root: `pnpm --filter api typecheck` (fix any object
      literal typed `App`/`Release` that now misses `source`/`buildUuid` by adding `source: null` /
      `buildUuid: null`), `pnpm --filter api lint`, then
      `cd apps/api && DB_NAME=marsa_test_phase_c pnpm test` → all pass (global setup applies the new
      migration).

- [ ] **Step 6: Commit** `feat: add the build table, app source and release build link`.

---

## Task 3: Runtime ports — `BuildRuntime`, registry refs, mocks

**Files:** create `modules/runtime/build-runtime.ts`, `modules/runtime/adapters/mock/mock-build-runtime.ts`,
`modules/runtime/adapters/mock/tests/mock-build-runtime.unit.test.ts`; modify `runtime.types.ts`,
`image-registry.ts`, `adapters/zot/zot-image-registry.ts` (+ tests), `adapters/mock/mock-image-registry.ts`,
`adapters/mock/mock-runtime.module.ts`.

**Interfaces — Produces:**

```ts
// runtime.types.ts
export interface BuildRef { build: { uuid: Uuid<'Build'> }; app: { slug: string } }
export interface BuildSpec { repoUrl: string; commitSha: string; rootDir: string; dockerfilePath: string; gitToken: string; pushRef: string }
export enum BuildState { Running = 'running', Succeeded = 'succeeded', Failed = 'failed', NotFound = 'not_found' }
export type BuildObservation =
  | { state: BuildState.Running | BuildState.Succeeded | BuildState.NotFound }
  | { state: BuildState.Failed; reason: string }
// build-runtime.ts
export const BUILD_DEADLINE_SECONDS = 1800
export abstract class BuildRuntime {
  start(build: BuildRef, spec: BuildSpec): Promise<void>
  cancel(build: BuildRef): Promise<void>
  readStatus(build: BuildRef): Promise<BuildObservation>
  readLogs(build: BuildRef): Promise<string | null>
}
// image-registry.ts additions
imageRefFor(appSlug: string, tag: string): string
pushRefFor(appSlug: string, tag: string): string
// mock-build-runtime.ts
class MockBuildRuntime { readonly started: Map<string, BuildSpec>; readonly cancelled: string[]; observe(buildUuid: string, observation: BuildObservation): void; failNextStart(error: Error): void }
```

- [ ] **Step 1: Failing tests.** Append to `adapters/zot/tests/zot-image-registry.unit.test.ts`:

```ts
describe('ZotImageRegistry refs', () => {
  const { registry } = registryWith({})

  it('names the image nodes pull by the public registry host', () => {
    expect(registry.imageRefFor('my-app', 'abc')).toBe('registry.demo.marsa.cc/my-app:abc')
  })

  it('names the image builds push by the in-cluster service host', () => {
    expect(registry.pushRefFor('my-app', 'abc')).toBe('marsa-registry:5000/my-app:abc')
  })
})
```

`adapters/mock/tests/mock-build-runtime.unit.test.ts`:

```ts
import { describe, it } from 'node:test'
import { expect } from 'expect'
import { MockBuildRuntime } from '#src/modules/runtime/adapters/mock/mock-build-runtime.js'
import { type BuildRef, type BuildSpec, BuildState } from '#src/modules/runtime/runtime.types.js'
import { generateUuid, type Uuid } from '#src/utils/uuid.js'

const ref = (): BuildRef => ({ build: { uuid: generateUuid<Uuid<'Build'>>() }, app: { slug: 'a' } })
const spec: BuildSpec = {
  repoUrl: 'https://github.com/o/r.git',
  commitSha: 'a'.repeat(40),
  rootDir: '.',
  dockerfilePath: 'Dockerfile',
  gitToken: 't',
  pushRef: 'r:5000/a:x',
}

describe('MockBuildRuntime', () => {
  it('reports a started build as succeeded and an unknown one as not found', async () => {
    const runtime = new MockBuildRuntime()
    const started = ref()
    await runtime.start(started, spec)

    expect(await runtime.readStatus(started)).toEqual({ state: BuildState.Succeeded })
    expect(await runtime.readStatus(ref())).toEqual({ state: BuildState.NotFound })
  })

  it('returns an observation a test queued', async () => {
    const runtime = new MockBuildRuntime()
    const build = ref()
    runtime.observe(build.build.uuid, { state: BuildState.Failed, reason: 'boom' })

    expect(await runtime.readStatus(build)).toEqual({ state: BuildState.Failed, reason: 'boom' })
  })

  it('fails the next start once', async () => {
    const runtime = new MockBuildRuntime()
    runtime.failNextStart(new Error('cluster down'))

    await expect(runtime.start(ref(), spec)).rejects.toThrow('cluster down')
    await expect(runtime.start(ref(), spec)).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2:** `pnpm --filter api typecheck` → errors (missing module / methods).

- [ ] **Step 3: Implement.** Append to `runtime.types.ts`:

```ts
export interface BuildRef {
  build: { uuid: Uuid<'Build'> }
  app: { slug: string }
}

export interface BuildSpec {
  repoUrl: string
  commitSha: string
  rootDir: string
  dockerfilePath: string
  gitToken: string
  pushRef: string
}

export enum BuildState {
  Running = 'running',
  Succeeded = 'succeeded',
  Failed = 'failed',
  NotFound = 'not_found',
}

export type BuildObservation =
  | { state: BuildState.Running | BuildState.Succeeded | BuildState.NotFound }
  | { state: BuildState.Failed; reason: string }
```

`modules/runtime/build-runtime.ts`:

```ts
import type { BuildObservation, BuildRef, BuildSpec } from '#src/modules/runtime/runtime.types.js'

export const BUILD_DEADLINE_SECONDS = 1800

export abstract class BuildRuntime {
  // Idempotent per build uuid.
  abstract start(build: BuildRef, spec: BuildSpec): Promise<void>

  // Idempotent: a build that is already gone counts as cancelled.
  abstract cancel(build: BuildRef): Promise<void>

  abstract readStatus(build: BuildRef): Promise<BuildObservation>

  // Null once the runtime no longer keeps the build's output.
  abstract readLogs(build: BuildRef): Promise<string | null>
}
```

`image-registry.ts` — add:

```ts
  abstract imageRefFor(appSlug: string, tag: string): string

  abstract pushRefFor(appSlug: string, tag: string): string
```

`zot-image-registry.ts` — add a `private readonly pushHost: string` set in the constructor to
`new URL(this.url).host`, and:

```ts
  imageRefFor(appSlug: string, tag: string): string {
    return `${this.config.host}/${appSlug}:${tag}`
  }

  pushRefFor(appSlug: string, tag: string): string {
    return `${this.pushHost}/${appSlug}:${tag}`
  }
```

`mock-image-registry.ts` — add `export const MOCK_REGISTRY_HOST = 'registry.mock.test'` and:

```ts
  imageRefFor(appSlug: string, tag: string): string {
    return `${MOCK_REGISTRY_HOST}/${appSlug}:${tag}`
  }

  pushRefFor(appSlug: string, tag: string): string {
    return `${MOCK_REGISTRY_HOST}/${appSlug}:${tag}`
  }
```

`adapters/mock/mock-build-runtime.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { BuildRuntime } from '#src/modules/runtime/build-runtime.js'
import {
  type BuildObservation,
  type BuildRef,
  type BuildSpec,
  BuildState,
} from '#src/modules/runtime/runtime.types.js'

@Injectable()
export class MockBuildRuntime extends BuildRuntime {
  readonly started = new Map<string, BuildSpec>()
  readonly cancelled: string[] = []
  private readonly observations = new Map<string, BuildObservation>()
  private armedStartFailure: Error | null = null

  observe(buildUuid: string, observation: BuildObservation): void {
    this.observations.set(buildUuid, observation)
  }

  failNextStart(error: Error): void {
    this.armedStartFailure = error
  }

  start(build: BuildRef, spec: BuildSpec): Promise<void> {
    const failure = this.armedStartFailure
    this.armedStartFailure = null
    if (failure) {
      return Promise.reject(failure)
    }
    this.started.set(build.build.uuid, spec)
    return Promise.resolve()
  }

  cancel(build: BuildRef): Promise<void> {
    this.cancelled.push(build.build.uuid)
    return Promise.resolve()
  }

  readStatus(build: BuildRef): Promise<BuildObservation> {
    const queued = this.observations.get(build.build.uuid)
    if (queued) {
      return Promise.resolve(queued)
    }
    const state = this.started.has(build.build.uuid) ? BuildState.Succeeded : BuildState.NotFound
    return Promise.resolve({ state })
  }

  readLogs(build: BuildRef): Promise<string | null> {
    return Promise.resolve(
      this.started.has(build.build.uuid) ? `mock build log for ${build.build.uuid}` : null,
    )
  }
}
```

In `mock-runtime.module.ts` bind `{ provide: BuildRuntime, useClass: MockBuildRuntime }` and export
`BuildRuntime`. (The Kubernetes binding comes in Task 4.)

- [ ] **Step 4:** typecheck, lint, `cd apps/api && DB_NAME=marsa_test_phase_c pnpm test` → PASS.
- [ ] **Step 5: Commit** `feat: add the BuildRuntime port and registry image refs`.

---

## Task 4: Kubernetes build adapter

**Files:** create under `modules/runtime/adapters/kubernetes/build/`: `build.constants.ts`,
`render/render-build-job.ts`, `observe/map-build-observation.ts`, `tests/render-build-job.unit.test.ts`,
`tests/map-build-observation.unit.test.ts`; create `adapters/kubernetes/kubernetes-build-runtime.ts`
and `adapters/kubernetes/tests/kubernetes-build-runtime.unit.test.ts`; modify
`kubernetes-runtime.module.ts`.

**Interfaces — Produces:** `buildJobName(ref): string` (`build-<uuid>`), `gitSecretName(ref)`
(`build-<uuid>-git`), `renderBuildJob(ref, spec): V1Job`, `renderGitSecret(ref, spec, owner:
V1OwnerReference): V1Secret`, `mapBuildObservation(job: V1Job, pods: V1Pod[]): BuildObservation`,
`class KubernetesBuildRuntime extends BuildRuntime`.

- [ ] **Step 1: Constants.** `build/build.constants.ts`:

```ts
export const BUILD_NAMESPACE = 'marsa-builds'
export const BUILDKIT_IMAGE = 'moby/buildkit:v0.33.0-rootless'
export const BUILD_TTL_SECONDS = 3600
export const REGISTRY_PUSH_SECRET = 'marsa-registry-push'
export const BUILD_UUID_LABEL = 'marsa.cloud/build-uuid'
export const BUILD_APP_LABEL = 'marsa.cloud/app'
export const JOB_NAME_LABEL = 'batch.kubernetes.io/job-name'
export const GIT_TOKEN_KEY = 'token'
```

- [ ] **Step 2: Failing render tests.** `build/tests/render-build-job.unit.test.ts`:

```ts
import { describe, it } from 'node:test'
import { expect } from 'expect'
import {
  buildJobName,
  renderBuildJob,
  renderGitSecret,
} from '#src/modules/runtime/adapters/kubernetes/build/render/render-build-job.js'
import { BUILD_DEADLINE_SECONDS } from '#src/modules/runtime/build-runtime.js'
import type { BuildRef, BuildSpec } from '#src/modules/runtime/runtime.types.js'
import type { Uuid } from '#src/utils/uuid.js'

const UUID = '0190f0f0-0000-7000-8000-000000000001' as Uuid<'Build'>
const ref: BuildRef = { build: { uuid: UUID }, app: { slug: 'shop' } }
const spec: BuildSpec = {
  repoUrl: 'https://github.com/acme/shop.git',
  commitSha: 'b'.repeat(40),
  rootDir: 'apps/api',
  dockerfilePath: 'Dockerfile',
  gitToken: 'ghs_x',
  pushRef: 'marsa-registry.marsa.svc.cluster.local:5000/shop:' + 'b'.repeat(40),
}

describe('renderBuildJob', () => {
  const job = renderBuildJob(ref, spec)
  const container = job.spec?.template.spec?.containers[0]

  it('names and labels the job after the build', () => {
    expect(job.metadata?.name).toBe(`build-${UUID}`)
    expect(job.metadata?.namespace).toBe('marsa-builds')
    expect(job.spec?.template.metadata?.labels).toMatchObject({
      'marsa.cloud/build-uuid': UUID,
      'marsa.cloud/app': 'shop',
    })
  })

  it('builds the pinned commit and root directory and pushes over plain http', () => {
    expect(container?.args).toEqual([
      'build',
      '--frontend=dockerfile.v0',
      `--opt=context=https://github.com/acme/shop.git#${'b'.repeat(40)}:apps/api`,
      '--opt=filename=Dockerfile',
      '--secret=id=GIT_AUTH_TOKEN.github.com,env=GIT_TOKEN',
      `--output=type=image,name=${spec.pushRef},push=true,registry.insecure=true`,
    ])
  })

  it('omits the subdirectory for a repo-root build', () => {
    const root = renderBuildJob(ref, { ...spec, rootDir: '.' })
    expect(root.spec?.template.spec?.containers[0]?.args).toContain(
      `--opt=context=https://github.com/acme/shop.git#${'b'.repeat(40)}`,
    )
  })

  it('runs rootless with the relaxed profiles BuildKit needs', () => {
    expect(container?.securityContext).toEqual({
      runAsUser: 1000,
      runAsGroup: 1000,
      seccompProfile: { type: 'Unconfined' },
      appArmorProfile: { type: 'Unconfined' },
    })
    expect(container?.env).toContainEqual({
      name: 'BUILDKITD_FLAGS',
      value: '--oci-worker-no-process-sandbox',
    })
  })

  it('reads the git token from the per-build secret and never inlines it', () => {
    expect(container?.env).toContainEqual({
      name: 'GIT_TOKEN',
      valueFrom: { secretKeyRef: { name: `build-${UUID}-git`, key: 'token' } },
    })
    expect(JSON.stringify(job)).not.toContain('ghs_x')
  })

  it('fails once, within the deadline, keeps logs an hour and reports errors', () => {
    expect(job.spec?.backoffLimit).toBe(0)
    expect(job.spec?.activeDeadlineSeconds).toBe(BUILD_DEADLINE_SECONDS)
    expect(job.spec?.ttlSecondsAfterFinished).toBe(3600)
    expect(container?.terminationMessagePolicy).toBe('FallbackToLogsOnError')
  })
})

describe('renderGitSecret', () => {
  it('is owned by the job so it is deleted with it', () => {
    const owner = { apiVersion: 'batch/v1', kind: 'Job', name: buildJobName(ref), uid: 'u-1' }
    const secret = renderGitSecret(ref, spec, owner)

    expect(secret.metadata?.name).toBe(`build-${UUID}-git`)
    expect(secret.metadata?.ownerReferences).toEqual([owner])
    expect(secret.stringData).toEqual({ token: 'ghs_x' })
  })
})
```

- [ ] **Step 3: Implement** `build/render/render-build-job.ts`:

```ts
import type { V1Job, V1OwnerReference, V1Secret } from '@kubernetes/client-node'
import {
  BUILD_APP_LABEL,
  BUILD_NAMESPACE,
  BUILD_TTL_SECONDS,
  BUILD_UUID_LABEL,
  BUILDKIT_IMAGE,
  GIT_TOKEN_KEY,
  REGISTRY_PUSH_SECRET,
} from '#src/modules/runtime/adapters/kubernetes/build/build.constants.js'
import { BUILD_DEADLINE_SECONDS } from '#src/modules/runtime/build-runtime.js'
import type { BuildRef, BuildSpec } from '#src/modules/runtime/runtime.types.js'

const HOME = '/home/user'

export function buildJobName(ref: BuildRef): string {
  return `build-${ref.build.uuid}`
}

export function gitSecretName(ref: BuildRef): string {
  return `${buildJobName(ref)}-git`
}

function contextOf(spec: BuildSpec): string {
  const subdir = spec.rootDir === '.' || spec.rootDir === '' ? '' : `:${spec.rootDir}`
  return `${spec.repoUrl}#${spec.commitSha}${subdir}`
}

export function renderBuildJob(ref: BuildRef, spec: BuildSpec): V1Job {
  const labels = { [BUILD_UUID_LABEL]: ref.build.uuid, [BUILD_APP_LABEL]: ref.app.slug }
  return {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: { name: buildJobName(ref), namespace: BUILD_NAMESPACE, labels },
    spec: {
      backoffLimit: 0,
      activeDeadlineSeconds: BUILD_DEADLINE_SECONDS,
      ttlSecondsAfterFinished: BUILD_TTL_SECONDS,
      template: {
        metadata: { labels },
        spec: {
          restartPolicy: 'Never',
          automountServiceAccountToken: false,
          containers: [
            {
              name: 'buildkit',
              image: BUILDKIT_IMAGE,
              command: ['buildctl-daemonless.sh'],
              args: [
                'build',
                '--frontend=dockerfile.v0',
                `--opt=context=${contextOf(spec)}`,
                `--opt=filename=${spec.dockerfilePath}`,
                '--secret=id=GIT_AUTH_TOKEN.github.com,env=GIT_TOKEN',
                `--output=type=image,name=${spec.pushRef},push=true,registry.insecure=true`,
              ],
              env: [
                { name: 'BUILDKITD_FLAGS', value: '--oci-worker-no-process-sandbox' },
                { name: 'DOCKER_CONFIG', value: `${HOME}/.docker` },
                {
                  name: 'GIT_TOKEN',
                  valueFrom: { secretKeyRef: { name: gitSecretName(ref), key: GIT_TOKEN_KEY } },
                },
              ],
              terminationMessagePolicy: 'FallbackToLogsOnError',
              securityContext: {
                runAsUser: 1000,
                runAsGroup: 1000,
                seccompProfile: { type: 'Unconfined' },
                appArmorProfile: { type: 'Unconfined' },
              },
              volumeMounts: [
                { name: 'docker-config', mountPath: `${HOME}/.docker` },
                { name: 'buildkitd', mountPath: `${HOME}/.local/share/buildkit` },
              ],
            },
          ],
          volumes: [
            {
              name: 'docker-config',
              secret: {
                secretName: REGISTRY_PUSH_SECRET,
                items: [{ key: '.dockerconfigjson', path: 'config.json' }],
              },
            },
            { name: 'buildkitd', emptyDir: {} },
          ],
        },
      },
    },
  }
}

export function renderGitSecret(ref: BuildRef, spec: BuildSpec, owner: V1OwnerReference): V1Secret {
  return {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: { name: gitSecretName(ref), namespace: BUILD_NAMESPACE, ownerReferences: [owner] },
    type: 'Opaque',
    stringData: { [GIT_TOKEN_KEY]: spec.gitToken },
  }
}
```

- [ ] **Step 4: Failing observation tests.** `build/tests/map-build-observation.unit.test.ts`:

```ts
import { describe, it } from 'node:test'
import type { V1Job, V1Pod } from '@kubernetes/client-node'
import { expect } from 'expect'
import { mapBuildObservation } from '#src/modules/runtime/adapters/kubernetes/build/observe/map-build-observation.js'
import { BuildState } from '#src/modules/runtime/runtime.types.js'

const job = (type: string, reason?: string, message?: string): V1Job => ({
  status: { conditions: [{ type, status: 'True', reason, message }] },
})
const podWith = (message: string): V1Pod => ({
  status: {
    containerStatuses: [
      {
        name: 'buildkit',
        image: 'x',
        imageID: 'x',
        ready: false,
        restartCount: 0,
        state: { terminated: { exitCode: 1, message } },
      },
    ],
  },
})

describe('mapBuildObservation', () => {
  it('reads a job without a terminal condition as running', () => {
    expect(mapBuildObservation({ status: { active: 1 } }, [])).toEqual({
      state: BuildState.Running,
    })
  })

  it('reads Complete as succeeded', () => {
    expect(mapBuildObservation(job('Complete'), [])).toEqual({ state: BuildState.Succeeded })
  })

  it('reports a timeout plainly', () => {
    expect(mapBuildObservation(job('Failed', 'DeadlineExceeded'), [])).toEqual({
      state: BuildState.Failed,
      reason: 'The build timed out after 30 minutes.',
    })
  })

  it('surfaces the build error from the pod termination message', () => {
    const failed = mapBuildObservation(
      job('Failed', 'BackoffLimitExceeded', 'Job has reached the specified backoff limit'),
      [
        podWith(
          '#1 ERROR: x\nerror: failed to solve: failed to read dockerfile: open Dockerfile: no such file',
        ),
      ],
    )
    expect(failed).toEqual({
      state: BuildState.Failed,
      reason: 'error: failed to solve: failed to read dockerfile: open Dockerfile: no such file',
    })
  })

  it('falls back to the job condition message when the pod is gone', () => {
    expect(mapBuildObservation(job('Failed', 'BackoffLimitExceeded', 'backoff limit'), [])).toEqual(
      {
        state: BuildState.Failed,
        reason: 'backoff limit',
      },
    )
  })
})
```

- [ ] **Step 5: Implement** `build/observe/map-build-observation.ts`:

```ts
import type { V1Job, V1Pod } from '@kubernetes/client-node'
import { BUILD_DEADLINE_SECONDS } from '#src/modules/runtime/build-runtime.js'
import { type BuildObservation, BuildState } from '#src/modules/runtime/runtime.types.js'

const MAX_REASON_LENGTH = 2000

function condition(job: V1Job, type: string) {
  return job.status?.conditions?.find((c) => c.type === type && c.status === 'True')
}

// BuildKit ends a failed build with an `error:` line; earlier lines are progress noise.
function lastErrorLine(message: string): string {
  const lines = message.trim().split('\n')
  const error = [...lines].reverse().find((line) => line.startsWith('error:'))
  return (error ?? lines.at(-1) ?? message).slice(0, MAX_REASON_LENGTH)
}

export function mapBuildObservation(job: V1Job, pods: V1Pod[]): BuildObservation {
  if (condition(job, 'Complete')) {
    return { state: BuildState.Succeeded }
  }
  const failed = condition(job, 'Failed')
  if (!failed) {
    return { state: BuildState.Running }
  }
  if (failed.reason === 'DeadlineExceeded') {
    return {
      state: BuildState.Failed,
      reason: `The build timed out after ${BUILD_DEADLINE_SECONDS / 60} minutes.`,
    }
  }
  const message = pods
    .flatMap((pod) => pod.status?.containerStatuses ?? [])
    .map((status) => status.state?.terminated?.message)
    .find((text): text is string => Boolean(text))
  return {
    state: BuildState.Failed,
    reason: message ? lastErrorLine(message) : (failed.message ?? 'The build failed.'),
  }
}
```

- [ ] **Step 6: Failing runtime tests.** `adapters/kubernetes/tests/kubernetes-build-runtime.unit.test.ts`
      (stubs like `kubernetes-app-runtime.unit.test.ts`: `createStubInstance(BatchV1Api)` /
      `createStubInstance(CoreV1Api)`, then `sandbox.stub(KubeConfig.prototype, 'makeApiClient')`
      returning them by class, and `sandbox.stub(KubeConfig.prototype, 'loadFromDefault')`):

```ts
import { afterEach, beforeEach, describe, it } from 'node:test'
import { ApiException, BatchV1Api, CoreV1Api, KubeConfig } from '@kubernetes/client-node'
import { expect } from 'expect'
import {
  createSandbox,
  createStubInstance,
  type SinonSandbox,
  type SinonStubbedInstance,
} from 'sinon'
import { KubernetesBuildRuntime } from '#src/modules/runtime/adapters/kubernetes/kubernetes-build-runtime.js'
import { type BuildRef, type BuildSpec, BuildState } from '#src/modules/runtime/runtime.types.js'
import type { Uuid } from '#src/utils/uuid.js'

const UUID = '0190f0f0-0000-7000-8000-000000000002' as Uuid<'Build'>
const ref: BuildRef = { build: { uuid: UUID }, app: { slug: 'shop' } }
const spec: BuildSpec = {
  repoUrl: 'https://github.com/acme/shop.git',
  commitSha: 'c'.repeat(40),
  rootDir: '.',
  dockerfilePath: 'Dockerfile',
  gitToken: 'ghs_y',
  pushRef: 'r:5000/shop:x',
}
const notFound = () => new ApiException(404, 'not found', {}, {})
const conflict = () => new ApiException(409, 'exists', {}, {})

describe('KubernetesBuildRuntime', () => {
  let sandbox: SinonSandbox
  let batch: SinonStubbedInstance<BatchV1Api>
  let core: SinonStubbedInstance<CoreV1Api>
  let runtime: KubernetesBuildRuntime

  beforeEach(() => {
    sandbox = createSandbox()
    batch = createStubInstance(BatchV1Api)
    core = createStubInstance(CoreV1Api)
    sandbox.stub(KubeConfig.prototype, 'loadFromDefault')
    sandbox
      .stub(KubeConfig.prototype, 'makeApiClient')
      .callsFake(((api: unknown) => (api === BatchV1Api ? batch : core)) as never)
    runtime = new KubernetesBuildRuntime()
  })

  afterEach(() => sandbox.restore())

  it('creates the job, then the token secret owned by it', async () => {
    batch.createNamespacedJob.resolves({ metadata: { name: `build-${UUID}`, uid: 'uid-1' } })
    core.createNamespacedSecret.resolves({})

    await runtime.start(ref, spec)

    expect(batch.createNamespacedJob.firstCall.args[0].namespace).toBe('marsa-builds')
    const secret = core.createNamespacedSecret.firstCall.args[0].body
    expect(secret.metadata?.ownerReferences?.[0]).toMatchObject({ kind: 'Job', uid: 'uid-1' })
  })

  it('treats a job that already exists as started', async () => {
    batch.createNamespacedJob.rejects(conflict())
    batch.readNamespacedJob.resolves({ metadata: { name: `build-${UUID}`, uid: 'uid-1' } })
    core.createNamespacedSecret.rejects(conflict())

    await expect(runtime.start(ref, spec)).resolves.toBeUndefined()
  })

  it('deletes the job in the background on cancel and ignores a missing one', async () => {
    batch.deleteNamespacedJob.rejects(notFound())

    await runtime.cancel(ref)

    expect(batch.deleteNamespacedJob.firstCall.args[0]).toMatchObject({
      name: `build-${UUID}`,
      namespace: 'marsa-builds',
      propagationPolicy: 'Background',
    })
  })

  it('reads a missing job as not found', async () => {
    batch.readNamespacedJob.rejects(notFound())

    expect(await runtime.readStatus(ref)).toEqual({ state: BuildState.NotFound })
  })

  it('maps the job and its pods', async () => {
    batch.readNamespacedJob.resolves({
      status: { conditions: [{ type: 'Complete', status: 'True' }] },
    })
    core.listNamespacedPod.resolves({ items: [] })

    expect(await runtime.readStatus(ref)).toEqual({ state: BuildState.Succeeded })
  })

  it('reads the build pod log and returns null when the pod is gone', async () => {
    core.listNamespacedPod.resolves({ items: [{ metadata: { name: 'p-1' } }] })
    core.readNamespacedPodLog.resolves('#1 DONE')

    expect(await runtime.readLogs(ref)).toBe('#1 DONE')
    expect(core.listNamespacedPod.firstCall.args[0].labelSelector).toBe(
      `batch.kubernetes.io/job-name=build-${UUID}`,
    )

    core.listNamespacedPod.resolves({ items: [] })
    expect(await runtime.readLogs(ref)).toBeNull()
  })
})
```

- [ ] **Step 7: Implement** `adapters/kubernetes/kubernetes-build-runtime.ts`:

```ts
import { BatchV1Api, CoreV1Api, KubeConfig, type V1Job, type V1Pod } from '@kubernetes/client-node'
import { Injectable } from '@nestjs/common'
import {
  BUILD_NAMESPACE,
  JOB_NAME_LABEL,
} from '#src/modules/runtime/adapters/kubernetes/build/build.constants.js'
import { mapBuildObservation } from '#src/modules/runtime/adapters/kubernetes/build/observe/map-build-observation.js'
import {
  buildJobName,
  renderBuildJob,
  renderGitSecret,
} from '#src/modules/runtime/adapters/kubernetes/build/render/render-build-job.js'
import { newestPod } from '#src/modules/runtime/adapters/kubernetes/app/rollout/newest-pod.js'
import {
  ignoreConflict,
  isConflict,
} from '#src/modules/runtime/adapters/kubernetes/shared/conflict.js'
import {
  ignoreNotFound,
  isNotFound,
} from '#src/modules/runtime/adapters/kubernetes/shared/not-found.js'
import { BuildRuntime } from '#src/modules/runtime/build-runtime.js'
import {
  type BuildObservation,
  type BuildRef,
  type BuildSpec,
  BuildState,
} from '#src/modules/runtime/runtime.types.js'

@Injectable()
export class KubernetesBuildRuntime extends BuildRuntime {
  private readonly batch: BatchV1Api
  private readonly core: CoreV1Api

  constructor() {
    super()
    const kc = new KubeConfig()
    kc.loadFromDefault()
    this.batch = kc.makeApiClient(BatchV1Api)
    this.core = kc.makeApiClient(CoreV1Api)
  }

  async start(ref: BuildRef, spec: BuildSpec): Promise<void> {
    const job = await this.createJob(ref, spec)
    const owner = {
      apiVersion: 'batch/v1',
      kind: 'Job',
      name: buildJobName(ref),
      uid: job.metadata?.uid ?? '',
    }
    // The pod waits on this Secret, so creating it after the Job only delays the first start.
    await ignoreConflict(() =>
      this.core.createNamespacedSecret({
        namespace: BUILD_NAMESPACE,
        body: renderGitSecret(ref, spec, owner),
      }),
    )
  }

  async cancel(ref: BuildRef): Promise<void> {
    await ignoreNotFound(() =>
      this.batch.deleteNamespacedJob({
        name: buildJobName(ref),
        namespace: BUILD_NAMESPACE,
        propagationPolicy: 'Background',
      }),
    )
  }

  async readStatus(ref: BuildRef): Promise<BuildObservation> {
    let job: V1Job
    try {
      job = await this.batch.readNamespacedJob({
        name: buildJobName(ref),
        namespace: BUILD_NAMESPACE,
      })
    } catch (error) {
      if (isNotFound(error)) {
        return { state: BuildState.NotFound }
      }
      throw error
    }
    return mapBuildObservation(job, await this.listPods(ref))
  }

  async readLogs(ref: BuildRef): Promise<string | null> {
    const name = newestPod(await this.listPods(ref))?.metadata?.name
    if (!name) {
      return null
    }
    try {
      return await this.core.readNamespacedPodLog({ name, namespace: BUILD_NAMESPACE })
    } catch (error) {
      if (isNotFound(error)) {
        return null
      }
      throw error
    }
  }

  private async createJob(ref: BuildRef, spec: BuildSpec): Promise<V1Job> {
    try {
      return await this.batch.createNamespacedJob({
        namespace: BUILD_NAMESPACE,
        body: renderBuildJob(ref, spec),
      })
    } catch (error) {
      if (!isConflict(error)) {
        throw error
      }
      return this.batch.readNamespacedJob({ name: buildJobName(ref), namespace: BUILD_NAMESPACE })
    }
  }

  private async listPods(ref: BuildRef): Promise<V1Pod[]> {
    const { items } = await this.core.listNamespacedPod({
      namespace: BUILD_NAMESPACE,
      labelSelector: `${JOB_NAME_LABEL}=${buildJobName(ref)}`,
    })
    return items
  }
}
```

(Check `newestPod`'s signature in `app/rollout/newest-pod.ts`; if it takes something other than
`V1Pod[]`, sort by `metadata.creationTimestamp` inline instead.)

Bind it in `kubernetes-runtime.module.ts`: `{ provide: BuildRuntime, useClass: KubernetesBuildRuntime }`
and export `BuildRuntime`.

- [ ] **Step 8:** typecheck, lint, test → PASS; the three new suites green.
- [ ] **Step 9: Commit** `feat: run builds as rootless BuildKit Jobs`.

---

## Task 5: `GithubClient.getBranchHead`

**Files:** modify `github-client.types.ts`, `github-client.ts`, `octokit-github-client.ts`,
`mock-github-client.ts`.

**Interfaces — Produces:** `interface BranchHeadParams { token: string; repo: string; branch: string }`;
`abstract getBranchHead(params: BranchHeadParams): Promise<string>`; `MOCK_COMMIT_SHA` exported from
`mock-github-client.ts` (`'c0ffee' + '0'.repeat(34)`).

- [ ] **Step 1: Implement.** Types:

```ts
/** Inputs for resolving a branch's head commit with an installation token. */
export interface BranchHeadParams {
  token: string
  repo: string
  branch: string
}
```

Port (`github-client.ts`, keep the file's existing JSDoc style for port methods):

```ts
  /** Resolve a branch's current head commit SHA (#21). */
  abstract getBranchHead(params: BranchHeadParams): Promise<string>
```

Octokit:

```ts
  async getBranchHead({ token, repo, branch }: BranchHeadParams): Promise<string> {
    const [owner, name] = repo.split('/')
    try {
      const response = await request('GET /repos/{owner}/{repo}/commits/{ref}', {
        owner,
        repo: name,
        ref: branch,
        headers: { authorization: `token ${token}`, accept: 'application/vnd.github.sha' },
        request: { signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS) },
      })
      return String(response.data).trim()
    } catch (error) {
      const status = (error as { status?: number }).status
      if (status === 404 || status === 422) {
        throw new Error(
          `Branch '${branch}' of '${repo}' was not found, or the GitHub App cannot access it.`,
        )
      }
      this.logger.error(`branch head lookup failed: ${(error as Error).message}`)
      throw new Error(`Could not read '${repo}' from GitHub.`)
    }
  }
```

Mock:

```ts
export const MOCK_COMMIT_SHA = `c0ffee${'0'.repeat(34)}`
…
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getBranchHead(_params: BranchHeadParams): Promise<string> {
    return Promise.resolve(MOCK_COMMIT_SHA)
  }
```

- [ ] **Step 2:** typecheck + lint + test → PASS (no behaviour change for existing callers).
- [ ] **Step 3: Commit** `feat: resolve a branch head through the GitHub client`.

---

## Task 6: `BuildStarter` and the rebuild endpoint

**Files:** create `build/services/build-starter.repository.ts`, `build/services/build-starter.service.ts`,
`build/services/tests/build-starter.service.unit.test.ts`, `build/responses/build-summary.response.ts`,
`build/use-cases/start-build/{start-build.controller,start-build.use-case,start-build.repository,start-build.module}.ts`,
`build/use-cases/start-build/tests/{start-build.use-case.unit.test,start-build.e2e.test}.ts`,
`build/build.module.ts`; modify `modules/api/api.module.ts`.

**Interfaces — Produces:**

```ts
class BuildStarter {
  mintToken(tx: Executor, source: AppSource): Promise<string>
  start(tx: Executor, app: App, options: { trigger: BuildTrigger; commitSha: string }): Promise<Build>
}
class BuildSummary { uuid; commitSha; branch; status: BuildStatus; trigger: BuildTrigger; imageRef: string|null; failureReason: string|null; createdAt; updatedAt; constructor(build: Build) }
POST /api/v1/apps/:slug/builds → 201 BuildSummary | 404 no app | 409 app has no source | 422 branch unreachable | 502 GitHub App/token failure
```

`BuildStarter.start` requires `app.source`. Sequence (all inside the caller's `tx`, runtime last):
cancel running builds (DB) → insert the new `running` build → mint token → `BuildRuntime.cancel`
for each cancelled build → `BuildRuntime.start`. Any error after the insert marks the new build
`failed` with the error message and returns it; it never throws.

- [ ] **Step 1: Repository** `build/services/build-starter.repository.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import { type Build, buildTable, type NewBuild } from '#src/app/build/entities/build.table.js'
import type { BuildUuid } from '#src/app/build/entities/build.uuid.js'
import { BuildStatus } from '#src/app/build/enums/build-status.enum.js'
import { githubAppTable } from '#src/app/github-app/entities/github-app.table.js'
import { githubInstallationTable } from '#src/app/github-app/entities/github-installation.table.js'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

export interface InstallationCredentials {
  installationId: string
  githubAppId: string
  privateKeyPemEnc: string
}

@Injectable()
export class BuildStarterRepository {
  async cancelRunning(tx: Executor, appUuid: AppUuid): Promise<Build[]> {
    return tx
      .update(buildTable)
      .set({ status: BuildStatus.Cancelled })
      .where(and(eq(buildTable.appUuid, appUuid), eq(buildTable.status, BuildStatus.Running)))
      .returning()
  }

  async insert(tx: Executor, build: NewBuild): Promise<Build> {
    const [inserted] = await tx.insert(buildTable).values(build).returning()
    if (!inserted) {
      throw new Error('Inserting a build returned no row')
    }
    return inserted
  }

  async fail(tx: Executor, uuid: BuildUuid, failureReason: string): Promise<Build> {
    const [failed] = await tx
      .update(buildTable)
      .set({ status: BuildStatus.Failed, failureReason })
      .where(eq(buildTable.uuid, uuid))
      .returning()
    if (!failed) {
      throw new Error(`Build ${uuid} vanished while failing it`)
    }
    return failed
  }

  async findCredentials(
    tx: Executor,
    installationUuid: GitHubInstallationUuid,
  ): Promise<InstallationCredentials | undefined> {
    const [row] = await tx
      .select({
        installationId: githubInstallationTable.installationId,
        githubAppId: githubAppTable.githubAppId,
        privateKeyPemEnc: githubAppTable.privateKeyPemEnc,
      })
      .from(githubInstallationTable)
      .innerJoin(githubAppTable, eq(githubInstallationTable.appUuid, githubAppTable.uuid))
      .where(eq(githubInstallationTable.uuid, installationUuid))
      .limit(1)
    return row
  }
}
```

- [ ] **Step 2: Failing service tests** `build/services/tests/build-starter.service.unit.test.ts`:

```ts
import { before, describe, it } from 'node:test'
import { expect } from 'expect'
import { createStubInstance, match } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import type { AppSource } from '#src/app/app-management/entities/app-source.js'
import { BuildBuilder } from '#src/app/build/entities/build.builder.js'
import { BuildStatus } from '#src/app/build/enums/build-status.enum.js'
import { BuildTrigger } from '#src/app/build/enums/build-trigger.enum.js'
import { BuildStarter } from '#src/app/build/services/build-starter.service.js'
import { BuildStarterRepository } from '#src/app/build/services/build-starter.repository.js'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { MockGithubClient } from '#src/modules/github-client/mock-github-client.js'
import { MockBuildRuntime } from '#src/modules/runtime/adapters/mock/mock-build-runtime.js'
import { MockImageRegistry } from '#src/modules/runtime/adapters/mock/mock-image-registry.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { generateUuid } from '#src/utils/uuid.js'

const SHA = 'd'.repeat(40)
const source: AppSource = {
  type: 'github',
  installationUuid: generateUuid<GitHubInstallationUuid>(),
  repo: 'acme/shop',
  branch: 'main',
  rootDir: 'apps/api',
  dockerfilePath: 'Dockerfile',
}
const app = new AppBuilder().withSlug('shop').withSource(source).build()
const tx = {} as never

function build() {
  const repository = createStubInstance(BuildStarterRepository)
  const previous = new BuildBuilder().withApp(app).build()
  repository.cancelRunning.resolves([previous])
  repository.insert.callsFake((_tx, row) =>
    Promise.resolve({ ...new BuildBuilder().build(), ...row } as never),
  )
  repository.fail.callsFake((_tx, uuid, reason) =>
    Promise.resolve({
      ...new BuildBuilder().build(),
      uuid,
      status: BuildStatus.Failed,
      failureReason: reason,
    }),
  )
  repository.findCredentials.resolves({
    installationId: '7',
    githubAppId: '42',
    privateKeyPemEnc: 'enc',
  })
  const cipher = createStubInstance(SecretCipherService)
  cipher.decrypt.returns('pem')
  const github = createStubInstance(MockGithubClient)
  github.getInstallationToken.resolves('ghs_token')
  const runtime = createStubInstance(MockBuildRuntime)
  runtime.start.resolves()
  runtime.cancel.resolves()
  const registry = new MockImageRegistry()
  const starter = new BuildStarter(repository, cipher, github, runtime, registry)
  return { starter, repository, github, runtime, previous }
}

describe('BuildStarter', () => {
  before(() => TestBench.setupUnitTest())

  it('cancels the running build, then starts the new one with a pinned commit', async () => {
    const { starter, repository, runtime, previous } = build()

    const started = await starter.start(tx, app, { trigger: BuildTrigger.Manual, commitSha: SHA })

    expect(repository.insert.firstCall.args[1]).toMatchObject({
      appUuid: app.uuid,
      commitSha: SHA,
      branch: 'main',
      status: BuildStatus.Running,
      trigger: BuildTrigger.Manual,
    })
    expect(runtime.cancel.calledOnceWith(match({ build: { uuid: previous.uuid } }))).toBe(true)
    const [ref, spec] = runtime.start.firstCall.args
    expect(ref).toEqual({ build: { uuid: started.uuid }, app: { slug: 'shop' } })
    expect(spec).toEqual({
      repoUrl: 'https://github.com/acme/shop.git',
      commitSha: SHA,
      rootDir: 'apps/api',
      dockerfilePath: 'Dockerfile',
      gitToken: 'ghs_token',
      pushRef: `registry.mock.test/shop:${SHA}`,
    })
    expect(runtime.cancel.getCall(0).calledBefore(runtime.start.getCall(0))).toBe(true)
  })

  it('records a token failure on the new build instead of throwing', async () => {
    const { starter, github, runtime } = build()
    github.getInstallationToken.rejects(
      new Error('Could not mint a GitHub installation access token.'),
    )

    const failed = await starter.start(tx, app, { trigger: BuildTrigger.Push, commitSha: SHA })

    expect(failed.status).toBe(BuildStatus.Failed)
    expect(failed.failureReason).toBe('Could not mint a GitHub installation access token.')
    expect(runtime.start.called).toBe(false)
  })

  it('records a runtime failure on the new build', async () => {
    const { starter, runtime } = build()
    runtime.start.rejects(new Error('cluster down'))

    const failed = await starter.start(tx, app, { trigger: BuildTrigger.Push, commitSha: SHA })

    expect(failed.failureReason).toBe('cluster down')
  })

  it('fails the build when the installation is gone', async () => {
    const { starter, repository } = build()
    repository.findCredentials.resolves(undefined)

    const failed = await starter.start(tx, app, { trigger: BuildTrigger.Push, commitSha: SHA })

    expect(failed.failureReason).toBe('The GitHub App installation for acme/shop no longer exists.')
  })
})
```

- [ ] **Step 3: Implement** `build/services/build-starter.service.ts`:

```ts
import { Injectable } from '@nestjs/common'
import type { AppSource } from '#src/app/app-management/entities/app-source.js'
import type { App } from '#src/app/app-management/entities/app.table.js'
import type { Build } from '#src/app/build/entities/build.table.js'
import { BuildStatus } from '#src/app/build/enums/build-status.enum.js'
import type { BuildTrigger } from '#src/app/build/enums/build-trigger.enum.js'
import { BuildStarterRepository } from '#src/app/build/services/build-starter.repository.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'
import { GithubClient } from '#src/modules/github-client/github-client.js'
import { BuildRuntime } from '#src/modules/runtime/build-runtime.js'
import { ImageRegistry } from '#src/modules/runtime/image-registry.js'
import type { BuildRef } from '#src/modules/runtime/runtime.types.js'

export interface StartBuildOptions {
  trigger: BuildTrigger
  commitSha: string
}

const refOf = (app: App, build: Build): BuildRef => ({
  build: { uuid: build.uuid },
  app: { slug: app.slug },
})

@Injectable()
export class BuildStarter {
  constructor(
    private readonly repository: BuildStarterRepository,
    private readonly cipher: SecretCipherService,
    private readonly github: GithubClient,
    private readonly buildRuntime: BuildRuntime,
    private readonly imageRegistry: ImageRegistry,
  ) {}

  async mintToken(tx: Executor, source: AppSource): Promise<string> {
    const credentials = await this.repository.findCredentials(tx, source.installationUuid)
    if (!credentials) {
      throw new Error(`The GitHub App installation for ${source.repo} no longer exists.`)
    }
    return this.github.getInstallationToken({
      githubAppId: credentials.githubAppId,
      privateKeyPem: this.cipher.decrypt(credentials.privateKeyPemEnc),
      installationId: credentials.installationId,
    })
  }

  async start(tx: Executor, app: App, { trigger, commitSha }: StartBuildOptions): Promise<Build> {
    const source = app.source
    if (!source) {
      throw new Error(`App '${app.slug}' has no source to build.`)
    }
    const superseded = await this.repository.cancelRunning(tx, app.uuid)
    const build = await this.repository.insert(tx, {
      appUuid: app.uuid,
      commitSha,
      branch: source.branch,
      status: BuildStatus.Running,
      trigger,
    })
    try {
      const gitToken = await this.mintToken(tx, source)
      for (const old of superseded) {
        await this.buildRuntime.cancel(refOf(app, old))
      }
      await this.buildRuntime.start(refOf(app, build), {
        repoUrl: `https://github.com/${source.repo}.git`,
        commitSha,
        rootDir: source.rootDir,
        dockerfilePath: source.dockerfilePath,
        gitToken,
        pushRef: this.imageRegistry.pushRefFor(app.slug, commitSha),
      })
      return build
    } catch (error) {
      return this.repository.fail(tx, build.uuid, (error as Error).message)
    }
  }
}
```

- [ ] **Step 4:** run the unit test → PASS.

- [ ] **Step 5: Response** `build/responses/build-summary.response.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger'
import type { Build } from '#src/app/build/entities/build.table.js'
import { BuildStatus, BuildStatusApiProperty } from '#src/app/build/enums/build-status.enum.js'
import { BuildTrigger } from '#src/app/build/enums/build-trigger.enum.js'

export class BuildSummary {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly uuid: string

  @ApiProperty({ type: String, example: 'c0ffee0000000000000000000000000000000000' })
  readonly commitSha: string

  @ApiProperty({ type: String, example: 'main' })
  readonly branch: string

  @BuildStatusApiProperty({ example: BuildStatus.Succeeded })
  readonly status: BuildStatus

  @ApiProperty({ enum: BuildTrigger, enumName: 'BuildTrigger', example: BuildTrigger.Push })
  readonly trigger: BuildTrigger

  @ApiProperty({ type: String, nullable: true, description: 'Set once the build succeeds.' })
  readonly imageRef: string | null

  @ApiProperty({ type: String, nullable: true, description: 'Why the build failed.' })
  readonly failureReason: string | null

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: string

  @ApiProperty({ type: String, format: 'date-time' })
  readonly updatedAt: string

  constructor(build: Build) {
    this.uuid = build.uuid
    this.commitSha = build.commitSha
    this.branch = build.branch
    this.status = build.status
    this.trigger = build.trigger
    this.imageRef = build.imageRef
    this.failureReason = build.failureReason
    this.createdAt = build.createdAt.toISOString()
    this.updatedAt = build.updatedAt.toISOString()
  }
}
```

- [ ] **Step 6: Failing use-case tests** `start-build/tests/start-build.use-case.unit.test.ts`:

```ts
import { before, describe, it } from 'node:test'
import {
  BadGatewayException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance, match } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import { BuildBuilder } from '#src/app/build/entities/build.builder.js'
import { BuildTrigger } from '#src/app/build/enums/build-trigger.enum.js'
import { BuildStarter } from '#src/app/build/services/build-starter.service.js'
import { StartBuildRepository } from '#src/app/build/use-cases/start-build/start-build.repository.js'
import { StartBuildUseCase } from '#src/app/build/use-cases/start-build/start-build.use-case.js'
import { MOCK_COMMIT_SHA, MockGithubClient } from '#src/modules/github-client/mock-github-client.js'
import { stubDatabase } from '#src/test/setup/stub-database.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { generateUuid } from '#src/utils/uuid.js'

const sourced = new AppBuilder()
  .withSlug('shop')
  .withSource({
    type: 'github',
    installationUuid: generateUuid<GitHubInstallationUuid>(),
    repo: 'acme/shop',
    branch: 'main',
    rootDir: '.',
    dockerfilePath: 'Dockerfile',
  })
  .build()

function build(app = sourced) {
  const repository = createStubInstance(StartBuildRepository)
  repository.findAppBySlug.resolves(app)
  const starter = createStubInstance(BuildStarter)
  starter.mintToken.resolves('ghs_t')
  starter.start.resolves(new BuildBuilder().withApp(app).withCommitSha(MOCK_COMMIT_SHA).build())
  const github = createStubInstance(MockGithubClient)
  github.getBranchHead.resolves(MOCK_COMMIT_SHA)
  const usecase = new StartBuildUseCase(stubDatabase(), repository, starter, github)
  return { usecase, repository, starter, github }
}

describe('StartBuildUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('builds the branch head as a manual build', async () => {
    const { usecase, starter, github } = build()

    const summary = await usecase.execute('shop')

    expect(
      github.getBranchHead.calledOnceWith({ token: 'ghs_t', repo: 'acme/shop', branch: 'main' }),
    ).toBe(true)
    expect(
      starter.start.calledOnceWith(match.any, sourced, {
        trigger: BuildTrigger.Manual,
        commitSha: MOCK_COMMIT_SHA,
      }),
    ).toBe(true)
    expect(summary.commitSha).toBe(MOCK_COMMIT_SHA)
  })

  it('404s an unknown app', async () => {
    const { usecase, repository } = build()
    repository.findAppBySlug.resolves(undefined)

    await expect(usecase.execute('ghost')).rejects.toThrow(NotFoundException)
  })

  it('409s an app that deploys a prebuilt image', async () => {
    const { usecase } = build(new AppBuilder().withSlug('img').build())

    await expect(usecase.execute('img')).rejects.toThrow(ConflictException)
  })

  it('502s when no installation token can be minted, with the reason', async () => {
    const { usecase, starter } = build()
    starter.mintToken.rejects(new Error('Could not mint a GitHub installation access token.'))

    await expect(usecase.execute('shop')).rejects.toThrow(BadGatewayException)
  })

  it('422s when the branch cannot be resolved, and starts nothing', async () => {
    const { usecase, github, starter } = build()
    github.getBranchHead.rejects(new Error("Branch 'main' of 'acme/shop' was not found"))

    await expect(usecase.execute('shop')).rejects.toThrow(UnprocessableEntityException)
    expect(starter.start.called).toBe(false)
  })
})
```

- [ ] **Step 7: Implement the use-case, repository, controller, module.**

`start-build.repository.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

@Injectable()
export class StartBuildRepository {
  async findAppBySlug(tx: Executor, slug: string): Promise<App | undefined> {
    const [app] = await tx
      .select()
      .from(appTable)
      .where(eq(appTable.slug, slug))
      .limit(1)
      .for('update')
    return app
  }
}
```

`start-build.use-case.ts`:

```ts
import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { BuildTrigger } from '#src/app/build/enums/build-trigger.enum.js'
import { BuildSummary } from '#src/app/build/responses/build-summary.response.js'
import { BuildStarter } from '#src/app/build/services/build-starter.service.js'
import { StartBuildRepository } from '#src/app/build/use-cases/start-build/start-build.repository.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { GithubClient } from '#src/modules/github-client/github-client.js'

@Injectable()
export class StartBuildUseCase {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: StartBuildRepository,
    private readonly starter: BuildStarter,
    private readonly github: GithubClient,
  ) {}

  async execute(slug: string): Promise<BuildSummary> {
    return this.db.transaction(async (tx) => {
      const app = await this.repository.findAppBySlug(tx, slug)
      if (!app) {
        throw new NotFoundException(`App '${slug}' was not found.`)
      }
      const source = app.source
      if (!source) {
        throw new ConflictException(
          `App '${slug}' deploys a prebuilt image; there is nothing to build.`,
        )
      }
      const token = await this.starter.mintToken(tx, source).catch((error: Error) => {
        throw new BadGatewayException(error.message, { cause: error })
      })
      const commitSha = await this.github
        .getBranchHead({ token, repo: source.repo, branch: source.branch })
        .catch((error: Error) => {
          throw new UnprocessableEntityException(error.message, { cause: error })
        })
      const build = await this.starter.start(tx, app, { trigger: BuildTrigger.Manual, commitSha })
      return new BuildSummary(build)
    })
  }
}
```

`start-build.controller.ts` (mirror `CreateReleaseController`):

```ts
import { Controller, Param, Post } from '@nestjs/common'
import {
  ApiBadGatewayResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { BuildSummary } from '#src/app/build/responses/build-summary.response.js'
import { StartBuildUseCase } from '#src/app/build/use-cases/start-build/start-build.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('builds')
@Controller({ path: 'apps/:slug/builds', version: '1' })
export class StartBuildController {
  constructor(private readonly usecase: StartBuildUseCase) {}

  @Post()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiCreatedResponse({ type: BuildSummary })
  @ApiNotFoundResponse({ description: 'No app with that slug.' })
  @ApiConflictResponse({ description: 'The app deploys a prebuilt image.' })
  @ApiUnprocessableEntityResponse({ description: 'The branch is missing or not accessible.' })
  @ApiBadGatewayResponse({ description: 'GitHub refused the installation token.' })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(@Param('slug') slug: string): Promise<BuildSummary> {
    return this.usecase.execute(slug)
  }
}
```

`start-build.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { BuildStarterRepository } from '#src/app/build/services/build-starter.repository.js'
import { BuildStarter } from '#src/app/build/services/build-starter.service.js'
import { StartBuildController } from '#src/app/build/use-cases/start-build/start-build.controller.js'
import { StartBuildRepository } from '#src/app/build/use-cases/start-build/start-build.repository.js'
import { StartBuildUseCase } from '#src/app/build/use-cases/start-build/start-build.use-case.js'
import { GitHubClientModule } from '#src/modules/github-client/github-client.module.js'

@Module({
  imports: [GitHubClientModule],
  controllers: [StartBuildController],
  providers: [StartBuildUseCase, StartBuildRepository, BuildStarter, BuildStarterRepository],
})
export class StartBuildModule {}
```

`build/build.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { StartBuildModule } from '#src/app/build/use-cases/start-build/start-build.module.js'

@Module({ imports: [StartBuildModule] })
export class BuildModule {}
```

Add `BuildModule` to `ApiModule`'s `AppModule.forRoot([...])` list after `ReleaseModule`.

- [ ] **Step 8: e2e** `start-build/tests/start-build.e2e.test.ts`:

```ts
import { after, before, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import request from 'supertest'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { buildTable } from '#src/app/build/entities/build.table.js'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import { GitHubAppBuilder } from '#src/app/github-app/entities/github-app.builder.js'
import { githubAppTable } from '#src/app/github-app/entities/github-app.table.js'
import { GitHubInstallationBuilder } from '#src/app/github-app/entities/github-installation.builder.js'
import { githubInstallationTable } from '#src/app/github-app/entities/github-installation.table.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { MOCK_COMMIT_SHA } from '#src/modules/github-client/mock-github-client.js'
import type { MockBuildRuntime } from '#src/modules/runtime/adapters/mock/mock-build-runtime.js'
import { BuildRuntime } from '#src/modules/runtime/build-runtime.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const SLUG = 'build-e2e-app'

describe('POST /api/v1/apps/:slug/builds (e2e)', () => {
  let setup: TestSetup
  let environment: Environment
  let sessionCookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    sessionCookie = await setup.authenticate()
    environment = (await setup.seedEnvironment()).environment
    const cipher = setup.testModule.get(SecretCipherService)
    const githubApp = {
      ...new GitHubAppBuilder().withGithubAppId('4242').build(),
      slug: 'marsa-build-e2e',
      privateKeyPemEnc: cipher.encrypt('pem'),
    }
    const installation = new GitHubInstallationBuilder()
      .withInstallationId('4242')
      .withAppUuid(githubApp.uuid)
      .build()
    await setup.db.insert(githubAppTable).values(githubApp)
    await setup.db.insert(githubInstallationTable).values(installation)
    const app = new AppBuilder()
      .withEnvironmentUuid(environment.uuid)
      .withSlug(SLUG)
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

  it('starts a build of the branch head', async () => {
    const response = await request(setup.httpServer)
      .post(`/api/v1/apps/${SLUG}/builds`)
      .set('Cookie', sessionCookie)
      .expect(201)

    expect(response.body).toMatchObject({
      commitSha: MOCK_COMMIT_SHA,
      status: 'running',
      trigger: 'manual',
    })
    const runtime = setup.testModule.get<BuildRuntime, MockBuildRuntime>(BuildRuntime)
    expect(runtime.started.get(response.body.uuid)?.repoUrl).toBe(
      'https://github.com/acme/shop.git',
    )
  })

  it('supersedes the running build on a second rebuild', async () => {
    await request(setup.httpServer)
      .post(`/api/v1/apps/${SLUG}/builds`)
      .set('Cookie', sessionCookie)
      .expect(201)

    const [app] = await setup.db.select().from(appTable).where(eq(appTable.slug, SLUG))
    const builds = await setup.db.select().from(buildTable).where(eq(buildTable.appUuid, app!.uuid))
    expect(builds.filter((b) => b.status === 'running')).toHaveLength(1)
    expect(builds.filter((b) => b.status === 'cancelled').length).toBeGreaterThan(0)
  })

  it('409s an app without a source', async () => {
    const plain = new AppBuilder()
      .withEnvironmentUuid(environment.uuid)
      .withSlug('build-e2e-plain')
      .build()
    await setup.db.insert(appTable).values(plain)

    await request(setup.httpServer)
      .post('/api/v1/apps/build-e2e-plain/builds')
      .set('Cookie', sessionCookie)
      .expect(409)
  })
})
```

(If `GitHubAppBuilder` or `GitHubInstallationBuilder` lacks a `with…` used above, override the
field on the built object as done for `slug`.)

- [ ] **Step 9:** typecheck, lint, full test → PASS.
- [ ] **Step 10: Commit** `feat: rebuild an app's branch head on demand`.

---

## Task 7: Completing builds — `CompleteBuildUseCase` and the sweeper

**Files:** add `@nestjs/schedule` to the catalog (`pnpm-workspace.yaml`: `'@nestjs/schedule': ^12.0.2`)
and `apps/api/package.json` (`"@nestjs/schedule": "catalog:"`), `pnpm install`; create
`build/use-cases/complete-build/{complete-build.use-case,complete-build.repository,complete-build.module}.ts`

- `tests/complete-build.use-case.unit.test.ts`; create
  `build/use-cases/sweep-builds/{build-sweeper,sweep-builds.repository,sweep-builds.module}.ts` +
  `tests/build-sweeper.integration.test.ts`; modify `build/build.module.ts`.

**Interfaces — Produces:**

```ts
class CompleteBuildUseCase {
  execute(buildUuid: BuildUuid, observation: BuildObservation): Promise<void>
}
class BuildSweeper {
  sweep(now?: Date): Promise<void>
} // @Cron('*/5 * * * * *', { name: 'build-sweep', waitForCompletion: true })
```

Behaviour of `CompleteBuildUseCase` (one transaction):

1. `claimRunning(tx, uuid)` — `SELECT … FROM build WHERE uuid = $1 AND status = 'running' FOR UPDATE SKIP LOCKED`; none → return.
2. `Running` → return. `Failed` → status `failed`, `failureReason = reason`. `NotFound` → `failed`, `"The build job disappeared before it finished."`.
3. `Succeeded`: lock the placement (`selectAppPlacement(tx).for('update', { of: appTable })`),
   `imageRef = imageRegistry.imageRefFor(app.slug, build.commitSha)`, set the build `succeeded` +
   `imageRef`, set `app.image = imageRef`, insert a release
   `new ReleaseBuilder().withApp({ ...app, image: imageRef }).withBuildUuid(build.uuid).withTriggeredBy(build.trigger === BuildTrigger.Push ? ReleaseTrigger.Webhook : ReleaseTrigger.Manual).withDeployStatus(DeployStatus.Pending).build()`.
4. Deploy inside `tx.transaction(savepoint => …)`: credentials =
   `imageRegistry.pullCredentialsFor(release.imageRef) ?? cipher.openForApp(slug, release.imagePullCredentialsEnc)`,
   `appRuntime.deploy(placement, deploySpecOf(placement, release, { baseDomain, credentials }))`.
   On error: set the release `failed` in the outer `tx`; do not rethrow (the build stays
   `succeeded`, `app.image` stays updated).

- [ ] **Step 1: Failing unit tests** `complete-build/tests/complete-build.use-case.unit.test.ts`
      (stub `CompleteBuildRepository`, `MockAppRuntime`, `MockImageRegistry`, `ImagePullCredentialsCipher`,
      `ConfigService` like `deploy-release.use-case.unit.test.ts`; `stubDatabase()` supports nested
      `transaction`). Cases, each asserting repository calls:
  - `does nothing when another replica already claimed the build` — `claimRunning` resolves
    `undefined` → no `finish`, no `insertRelease`, no deploy.
  - `records a failure with its reason` — observation `{ state: Failed, reason: 'no Dockerfile' }`
    → `finish(tx, uuid, { status: Failed, failureReason: 'no Dockerfile' })`, no release.
  - `fails a build whose job disappeared` — `NotFound` → `failureReason` = `'The build job disappeared before it finished.'`.
  - `turns a successful build into a deployed release` — `Succeeded` → `finish(…, { status:
Succeeded, imageRef: 'registry.mock.test/my-app:<sha>' })`, `setAppImage(tx, app.uuid, same)`,
    `insertRelease` with `buildUuid`, `imageRef`, `triggeredBy: Manual`, then `appRuntime.deploy`
    once with `spec.image === imageRef`.
  - `marks the release a webhook release for a push build` — build trigger `Push` →
    `triggeredBy: Webhook`.
  - `keeps the build succeeded when the deploy fails` — `appRuntime.deploy` rejects →
    `setReleaseDeployStatus(tx, release.uuid, Failed)`, promise resolves, no second `finish`.

- [ ] **Step 2: Implement** `complete-build.repository.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import {
  type AppPlacement,
  selectAppPlacement,
} from '#src/app/app-management/queries/app-placement.js'
import { type Build, buildTable } from '#src/app/build/entities/build.table.js'
import type { BuildUuid } from '#src/app/build/entities/build.uuid.js'
import { BuildStatus } from '#src/app/build/enums/build-status.enum.js'
import { type Release, releaseTable } from '#src/app/release/entities/release.table.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import type { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

export type BuildOutcome =
  | { status: BuildStatus.Succeeded; imageRef: string }
  | { status: BuildStatus.Failed; failureReason: string }

@Injectable()
export class CompleteBuildRepository {
  // SKIP LOCKED: a second sweeper (another api replica) moves on instead of waiting.
  async claimRunning(tx: Executor, uuid: BuildUuid): Promise<Build | undefined> {
    const [build] = await tx
      .select()
      .from(buildTable)
      .where(and(eq(buildTable.uuid, uuid), eq(buildTable.status, BuildStatus.Running)))
      .limit(1)
      .for('update', { skipLocked: true })
    return build
  }

  async finish(tx: Executor, uuid: BuildUuid, outcome: BuildOutcome): Promise<void> {
    await tx.update(buildTable).set(outcome).where(eq(buildTable.uuid, uuid))
  }

  async findPlacement(tx: Executor, appUuid: AppUuid): Promise<AppPlacement | undefined> {
    const [placement] = await selectAppPlacement(tx)
      .where(eq(appTable.uuid, appUuid))
      .limit(1)
      .for('update', { of: appTable })
    return placement
  }

  async setAppImage(tx: Executor, appUuid: AppUuid, image: string): Promise<void> {
    await tx.update(appTable).set({ image }).where(eq(appTable.uuid, appUuid))
  }

  async insertRelease(tx: Executor, release: Release): Promise<void> {
    await tx.insert(releaseTable).values(release)
  }

  async setReleaseDeployStatus(
    tx: Executor,
    uuid: ReleaseUuid,
    deployStatus: DeployStatus,
  ): Promise<void> {
    await tx.update(releaseTable).set({ deployStatus }).where(eq(releaseTable.uuid, uuid))
  }
}
```

`complete-build.use-case.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AppPlacement } from '#src/app/app-management/queries/app-placement.js'
import type { Build } from '#src/app/build/entities/build.table.js'
import type { BuildUuid } from '#src/app/build/entities/build.uuid.js'
import { BuildStatus } from '#src/app/build/enums/build-status.enum.js'
import { BuildTrigger } from '#src/app/build/enums/build-trigger.enum.js'
import { CompleteBuildRepository } from '#src/app/build/use-cases/complete-build/complete-build.repository.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import type { Release } from '#src/app/release/entities/release.table.js'
import { deploySpecOf } from '#src/app/release/entities/release-deploy-spec.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import { ReleaseTrigger } from '#src/app/release/enums/release-trigger.enum.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import type { Database, Transaction } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'
import { ImageRegistry } from '#src/modules/runtime/image-registry.js'
import { type BuildObservation, BuildState } from '#src/modules/runtime/runtime.types.js'

const DISAPPEARED = 'The build job disappeared before it finished.'

@Injectable()
export class CompleteBuildUseCase {
  private readonly baseDomain: string

  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: CompleteBuildRepository,
    private readonly appRuntime: AppRuntime,
    private readonly imageRegistry: ImageRegistry,
    private readonly cipher: ImagePullCredentialsCipher,
    config: ConfigService,
  ) {
    this.baseDomain = config.getOrThrow<string>('MARSA_BASE_DOMAIN')
  }

  async execute(buildUuid: BuildUuid, observation: BuildObservation): Promise<void> {
    await this.db.transaction(async (tx) => {
      const build = await this.repository.claimRunning(tx, buildUuid)
      if (!build || observation.state === BuildState.Running) {
        return
      }
      if (observation.state === BuildState.Failed || observation.state === BuildState.NotFound) {
        const failureReason =
          observation.state === BuildState.Failed ? observation.reason : DISAPPEARED
        await this.repository.finish(tx, build.uuid, { status: BuildStatus.Failed, failureReason })
        return
      }
      await this.release(tx, build)
    })
  }

  private async release(tx: Transaction, build: Build): Promise<void> {
    const placement = await this.repository.findPlacement(tx, build.appUuid)
    if (!placement) {
      return
    }
    const imageRef = this.imageRegistry.imageRefFor(placement.app.slug, build.commitSha)
    await this.repository.finish(tx, build.uuid, { status: BuildStatus.Succeeded, imageRef })
    await this.repository.setAppImage(tx, placement.app.uuid, imageRef)
    const app = { ...placement.app, image: imageRef }
    const release = new ReleaseBuilder()
      .withApp(app)
      .withBuildUuid(build.uuid)
      .withTriggeredBy(
        build.trigger === BuildTrigger.Push ? ReleaseTrigger.Webhook : ReleaseTrigger.Manual,
      )
      .withDeployStatus(DeployStatus.Pending)
      .build()
    await this.repository.insertRelease(tx, release)
    try {
      await tx.transaction(() => this.deploy({ ...placement, app }, release))
    } catch {
      // The image is built and stored; only its rollout failed, which the release records.
      await this.repository.setReleaseDeployStatus(tx, release.uuid, DeployStatus.Failed)
    }
  }

  private async deploy(placement: AppPlacement, release: Release): Promise<void> {
    const credentials =
      this.imageRegistry.pullCredentialsFor(release.imageRef) ??
      this.cipher.openForApp(placement.app.slug, release.imagePullCredentialsEnc)
    const spec = deploySpecOf(placement, release, { baseDomain: this.baseDomain, credentials })
    await this.appRuntime.deploy(placement, spec)
  }
}
```

(If `Transaction` is not exported by `drizzle.factory.ts` as a type usable here, use `Executor`
and call `.transaction` the way `deploy-release.use-case.ts` does.)

`complete-build.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { CompleteBuildRepository } from '#src/app/build/use-cases/complete-build/complete-build.repository.js'
import { CompleteBuildUseCase } from '#src/app/build/use-cases/complete-build/complete-build.use-case.js'

@Module({
  providers: [CompleteBuildUseCase, CompleteBuildRepository],
  exports: [CompleteBuildUseCase],
})
export class CompleteBuildModule {}
```

- [ ] **Step 3:** unit tests → PASS.

- [ ] **Step 4: Sweeper.** `sweep-builds.repository.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { type Build, buildTable } from '#src/app/build/entities/build.table.js'
import { BuildStatus } from '#src/app/build/enums/build-status.enum.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

export interface RunningBuild {
  build: Build
  appSlug: string
}

@Injectable()
export class SweepBuildsRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findRunning(): Promise<RunningBuild[]> {
    return this.db
      .select({ build: buildTable, appSlug: appTable.slug })
      .from(buildTable)
      .innerJoin(appTable, eq(buildTable.appUuid, appTable.uuid))
      .where(eq(buildTable.status, BuildStatus.Running))
  }
}
```

`build-sweeper.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { CompleteBuildUseCase } from '#src/app/build/use-cases/complete-build/complete-build.use-case.js'
import {
  type RunningBuild,
  SweepBuildsRepository,
} from '#src/app/build/use-cases/sweep-builds/sweep-builds.repository.js'
import { BUILD_DEADLINE_SECONDS, BuildRuntime } from '#src/modules/runtime/build-runtime.js'
import { type BuildObservation, BuildState } from '#src/modules/runtime/runtime.types.js'

const GRACE_SECONDS = 300

@Injectable()
export class BuildSweeper {
  private readonly logger = new Logger(BuildSweeper.name)

  constructor(
    private readonly repository: SweepBuildsRepository,
    private readonly buildRuntime: BuildRuntime,
    private readonly completeBuild: CompleteBuildUseCase,
  ) {}

  @Cron('*/5 * * * * *', { name: 'build-sweep', waitForCompletion: true })
  async sweep(now: Date = new Date()): Promise<void> {
    for (const running of await this.repository.findRunning()) {
      try {
        const observation = await this.observe(running, now)
        if (observation.state !== BuildState.Running) {
          await this.completeBuild.execute(running.build.uuid, observation)
        }
      } catch (error) {
        this.logger.error(
          `sweeping build ${running.build.uuid} failed: ${(error as Error).message}`,
        )
      }
    }
  }

  private async observe({ build, appSlug }: RunningBuild, now: Date): Promise<BuildObservation> {
    const observation = await this.buildRuntime.readStatus({
      build: { uuid: build.uuid },
      app: { slug: appSlug },
    })
    const ageSeconds = (now.getTime() - build.createdAt.getTime()) / 1000
    // Backstop for a runtime that never reports a terminal state.
    if (
      observation.state === BuildState.Running &&
      ageSeconds > BUILD_DEADLINE_SECONDS + GRACE_SECONDS
    ) {
      return { state: BuildState.Failed, reason: 'The build exceeded its deadline.' }
    }
    return observation
  }
}
```

`sweep-builds.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { CompleteBuildModule } from '#src/app/build/use-cases/complete-build/complete-build.module.js'
import { BuildSweeper } from '#src/app/build/use-cases/sweep-builds/build-sweeper.js'
import { SweepBuildsRepository } from '#src/app/build/use-cases/sweep-builds/sweep-builds.repository.js'

@Module({
  imports: [CompleteBuildModule],
  providers: [BuildSweeper, SweepBuildsRepository],
})
export class SweepBuildsModule {}
```

`build/build.module.ts` becomes:

```ts
import { Module } from '@nestjs/common'
import { ConditionalModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { StartBuildModule } from '#src/app/build/use-cases/start-build/start-build.module.js'
import { SweepBuildsModule } from '#src/app/build/use-cases/sweep-builds/sweep-builds.module.js'

@Module({
  imports: [
    // Tests and `pnpm dev:api` run the mock runtime; they drive sweep() directly, never on a timer.
    ConditionalModule.registerWhen(ScheduleModule.forRoot(), (env) => env.MARSA_RUNTIME !== 'mock'),
    StartBuildModule,
    SweepBuildsModule,
  ],
})
export class BuildModule {}
```

- [ ] **Step 5: Integration test** `sweep-builds/tests/build-sweeper.integration.test.ts`
      (boot with `TestBench.setupEndToEndTest()`, get `BuildSweeper`, `BuildRuntime` (as
      `MockBuildRuntime`) and `AppRuntime` (as `MockAppRuntime`) from `setup.testModule`; seed an
      environment, an app with a source, and builds directly):
  - `turns a finished build into a deployed release` — running build, `runtime.observe(uuid,
{ state: Succeeded })`, `sweep()` → build `succeeded`, `imageRef =
registry.mock.test/<slug>:<sha>`; `app.image` equals it; one release with `buildUuid`,
    `deployStatus: pending`; `mockAppRuntime` live release = that release.
  - `records a failed build and deploys nothing` — observe `{ Failed, 'no Dockerfile' }` → build
    `failed` with that reason; no release; `app.image` unchanged.
  - `fails a build whose job vanished` — no observation queued, never started → `NotFound` →
    `failed`, reason `The build job disappeared before it finished.`
  - `leaves a running build alone` — observe `{ Running }` → still `running`.
  - `fails a build stuck past its deadline` — `withCreatedAt(new Date(Date.now() - 3 * 3600_000))`,
    observe `{ Running }` → `failed`, `The build exceeded its deadline.`
  - `completes a build only once when two sweeps race` — `await Promise.all([sweeper.sweep(), sweeper.sweep()])`
    for one succeeded build → exactly one release row.
  - `does not schedule itself under the mock runtime` — `setup.testModule.get(SchedulerRegistry, { strict: false })`
    throws, or `getCronJobs()` has no `build-sweep` (import `SchedulerRegistry` from `@nestjs/schedule`).

- [ ] **Step 6:** `pnpm install` (lockfile updated), typecheck, lint, full test → PASS.
- [ ] **Step 7: Commit** `feat: complete builds into releases on a five-second sweep` (include
      `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `apps/api/package.json`).

---

## Task 8: Build history and build logs endpoints (#116)

**Files:** create `build/use-cases/view-build-index/*` (controller, use-case, repository, module,
`query/view-build-index.query.ts`, `view-build-index.response.ts`, `tests/view-build-index.e2e.test.ts`)
and `build/use-cases/view-build-logs/*` (controller, use-case, repository, module, response,
`tests/view-build-logs.e2e.test.ts`, `tests/view-build-logs.use-case.unit.test.ts`); register both
modules in `BuildModule`.

**Interfaces — Produces:**
`GET /api/v1/apps/:slug/builds` → `ViewBuildIndexResponse { items: BuildSummary[]; meta: { next: { uuid } | null } }`
(keyset on `build.uuid` desc, same query shape as releases);
`GET /api/v1/apps/:slug/builds/:buildUuid/logs` → `ViewBuildLogsResponse { logs: string }`,
404 unknown app/build (`Build '<uuid>' was not found for app '<slug>'.`), 404 when the runtime no
longer has them (`Build logs are kept for one hour after the build finishes.`), 400 non-uuid
`buildUuid` (`ParseUUIDPipe`).

- [ ] **Step 1: Index — copy the release index shape.** Create the files by copying
      `release/use-cases/view-release-index/` and applying: `Release`→`Build`, `releaseTable`→`buildTable`,
      `ReleaseUuid`→`BuildUuid`, `ReleaseSummary`→`BuildSummary` (import from
      `build/responses/build-summary.response.js`), class prefixes `ViewReleaseIndex`→`ViewBuildIndex`,
      `@ApiTags('builds')`, path `apps/:slug/builds`. Drop the head-refresh logic entirely:

```ts
@Injectable()
export class ViewBuildIndexUseCase {
  constructor(private readonly repository: ViewBuildIndexRepository) {}

  async execute(slug: string, query: ViewBuildIndexQuery): Promise<ViewBuildIndexResponse> {
    const builds = await this.repository.findByAppSlug(
      slug,
      keysetLimit(query.pagination),
      query.pagination?.key?.uuid,
    )
    return new ViewBuildIndexResponse(builds)
  }
}
```

and the repository keeps only `findByAppSlug` (join `appTable`, `lt(buildTable.uuid, after)`,
`desc(buildTable.uuid)`). The response maps `builds.map((build) => new BuildSummary(build))`.

e2e (`view-build-index.e2e.test.ts`): seed an app and three builds (statuses running, failed
with reason, succeeded with imageRef); `GET …/builds` returns them newest first with
`failureReason`/`imageRef`; `?pagination[limit]=2` (use the exact query encoding from
`view-release-index.e2e.test.ts`) returns two items and a `meta.next.uuid`; 401 without cookie.

- [ ] **Step 2: Logs — failing unit test** `view-build-logs.use-case.unit.test.ts`:
  - returns `{ logs }` from `BuildRuntime.readLogs({ build: { uuid }, app: { slug } })` for a build of that app;
  - `NotFoundException` with `Build '<uuid>' was not found for app 'shop'.` when the repository returns nothing;
  - `NotFoundException` with `Build logs are kept for one hour after the build finishes.` when `readLogs` resolves `null`.

- [ ] **Step 3: Implement.** Repository:

```ts
@Injectable()
export class ViewBuildLogsRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findBuild(slug: string, uuid: BuildUuid): Promise<Build | undefined> {
    const [row] = await this.db
      .select({ build: buildTable })
      .from(buildTable)
      .innerJoin(appTable, eq(buildTable.appUuid, appTable.uuid))
      .where(and(eq(appTable.slug, slug), eq(buildTable.uuid, uuid)))
      .limit(1)
    return row?.build
  }
}
```

Use-case:

```ts
@Injectable()
export class ViewBuildLogsUseCase {
  constructor(
    private readonly repository: ViewBuildLogsRepository,
    private readonly buildRuntime: BuildRuntime,
  ) {}

  async execute(slug: string, buildUuid: BuildUuid): Promise<ViewBuildLogsResponse> {
    const build = await this.repository.findBuild(slug, buildUuid)
    if (!build) {
      throw new NotFoundException(`Build '${buildUuid}' was not found for app '${slug}'.`)
    }
    const logs = await this.buildRuntime.readLogs({ build: { uuid: build.uuid }, app: { slug } })
    if (logs === null) {
      throw new NotFoundException('Build logs are kept for one hour after the build finishes.')
    }
    return new ViewBuildLogsResponse(logs)
  }
}
```

Response: `class ViewBuildLogsResponse { @ApiProperty({ type: String }) readonly logs: string; constructor(logs) }`.
Controller: `@Controller({ path: 'apps/:slug/builds/:buildUuid/logs', version: '1' })`, `@Get()`,
`@Param('buildUuid', new ParseUUIDPipe()) buildUuid: string` cast to `BuildUuid`, same auth
decorators as the index, `@ApiNotFoundResponse`.

e2e: seed a build, mark it started in `MockBuildRuntime` (`runtime.started.set(uuid, spec)`) →
200 with `mock build log for <uuid>`; a build not started → 404 with the retention message;
a random uuid → 404; `not-a-uuid` → 400.

- [ ] **Step 4:** register `ViewBuildIndexModule` and `ViewBuildLogsModule` in `BuildModule`;
      typecheck, lint, full test → PASS.
- [ ] **Step 5: Commit** `feat: list an app's builds and read build logs`.

---

## Task 9: Contract, AgDRs, verification, push

- [ ] **Step 1: Regenerate the contract.**

```bash
cd apps/api && cp -n .env.test .env; cd ../..
pnpm --filter api generate:openapi && pnpm --filter web generate:api
git status --short apps/api/openapi.json apps/web/app/api
```

Expected: new `builds` operations and `BuildSummary`/`BuildStatus`/`BuildTrigger` schemas.
`pnpm --filter web typecheck && pnpm --filter web test` → PASS (no UI uses them yet).

- [ ] **Step 2: AgDRs** (next free numbers after 0048, re-checked against `origin/main`):
      `docs/agdr/AgDR-0049-in-cluster-builds-rootless-buildkit.md` — Dockerfile-first, rootless
      BuildKit (Kaniko archived), git context pinned to a commit with the installation token as a
      BuildKit secret, `marsa-builds` namespace, push to the in-cluster Service; the spike results
      above as evidence. `docs/agdr/AgDR-0050-build-completion-sweep.md` — sweep via `@nestjs/schedule`
      `@Cron` + `waitForCompletion` vs watch vs callback, `SKIP LOCKED` claim, mock runtime disables
      the timer. Same front matter shape as AgDR-0048.

- [ ] **Step 3: Full verification.** `pnpm format:check`, `pnpm lint`, both typechecks,
      `cd apps/api && DB_NAME=marsa_test_phase_c pnpm test` (report coverage), web tests, shellcheck
      unchanged scripts skipped. Local cluster e2e is **not** expected to run (host disk); say so.

- [ ] **Step 4: Commit and push** both repos; update marsa#237's body (append a "Part 1 — build
      engine" section: what changed and why, testing, glossary entries for BuildKit, sweep, `SKIP
LOCKED`, build namespace). Do not merge.

---

## Self-review notes

- Spec §2 coverage: schema (Task 2; `app.image` nullability + CHECK deliberately moved to Part 3
  where repo-first create needs it), port + types (Task 3), Kubernetes adapter incl. per-build
  Secret, deadline/TTL, termination-message reasons (Task 4), token minting + start sequence with
  failure recording (Task 6), `CompleteBuildUseCase` + sweeper + deadline backstop + mock-disabled
  timer (Task 7), `GET/POST builds` (Tasks 6, 8), `create-release` 409 for `image = null` → Part 3
  (no null images exist before then). §5 logs → Task 8. Chart namespace/RBAC/push Secret → Task 1.
- Deviations from the spec, both small: build resources are adapter constants rather than chart
  values (YAGNI until someone needs to tune them), and `BuildSpec` carries `pushRef` only (the
  feature records `imageRef` itself via `ImageRegistry.imageRefFor`).
- Parts 2–4 depend on: `BuildStarter.start/mintToken`, `BuildTrigger.Push/Create`,
  `GithubClient.getBranchHead`, `AppSource`, `app_source_repo_branch_idx`.
