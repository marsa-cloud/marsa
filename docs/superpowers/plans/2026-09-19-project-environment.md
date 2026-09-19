# Project & Environment Implementation Plan (#142)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group apps into Projects and per-project Environments, each Environment owning its own derived Kubernetes namespace that Marsa creates and deletes, with the chart RBAC and admission policy to allow exactly that.

**Architecture:** Two new feature modules (`project/`, `environment/`) own the new aggregates; `app-management/` and `release/` resolve an app's namespace by joining app → environment → project (`AppPlacement`) instead of the `OPERATOR_APPS_NAMESPACE` constant. A new `NamespaceBackend` port (real + mock) provisions/destroys labelled namespaces plus a `marsa-deployer` RoleBinding. The chart swaps the single-namespace `Role` for an unbound `ClusterRole` bound per namespace, a namespace-manager `ClusterRole`, and a `ValidatingAdmissionPolicy` fencing marsa-api to Marsa-labelled namespaces.

**Tech Stack:** NestJS 11 + Fastify, Drizzle `1.0.0-rc.4`, `@kubernetes/client-node`, `node:test` + `expect` + sinon; Nuxt 4 + Nuxt UI v4 + vitest; Helm + helm-unittest.

**Spec:** `docs/superpowers/specs/2026-09-19-project-environment-design.md`

## Global Constraints

- Branch `feature/142-project-environment` in `marsa`; a branch of the same name in `marsa-charts` for Task 11. Commits `type: subject` + `Refs #142`; never `git add -A` / `git add .`.
- API imports: `#src/...` subpath with `.js` extension, one unbroken import block (`.claude/rules/api/imports.md`).
- Comments: single-line, only a non-obvious _why_ (`.claude/rules/comments.md`). No JSDoc.
- Never run repo-wide `pnpm format` (a watcher rewrites files); format only touched files: `npx prettier --write <files>`.
- Slugs: project ≤ **30** chars, environment ≤ **32** chars, both DNS-1123 labels (`/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/`). Namespace = `${project.slug}-${environment.slug}` (≤ 63), **never stored**.
- `App.slug` stays **globally unique**; hosts stay `${slug}.${MARSA_BASE_DOMAIN}`; `/apps/:slug` routes unchanged.
- App env vars stay on `App`. No environment-level variables.
- Deletion blocked until empty: Environment → 409 while it has apps; Project → 409 while it has environments.
- Labels: `marsa.cloud/managed-by: marsa-api`, `marsa.cloud/environment-uuid: <uuid>`. ClusterRole / RoleBinding name: `marsa-deployer`. API service account: `marsa-api`.
- Every `@Roles` route: `@Roles(UserRole.Operator, UserRole.Member)` + `@ApiCookieAuth` + `@ApiForbiddenResponse` + `@ApiUnauthorizedResponse`.
- API tests: `pnpm --filter api test` (builds, then runs against `dist/`; needs `docker compose up -d`). Web: `pnpm --filter web test`. Lint: `pnpm --filter <api|web> lint`. Typecheck web: `pnpm --filter web typecheck`.
- Coverage floors unchanged (api 80/75/75, web 88/85/60).

## File map

**API — new**

- `src/utils/dns-label.ts` — shared DNS-1123 label regex.
- `src/app/project/` — `entities/{project.table,project.uuid,project.builder,project-config.constants}.ts`, `use-cases/{create-project,view-project-index,delete-project}/`, `project.module.ts`.
- `src/app/environment/` — `entities/{environment.table,environment.uuid,environment.builder,environment-config.constants,namespace}.ts`, `use-cases/{create-environment,view-environment-index,delete-environment}/`, `environment.module.ts`.
- `src/app/app-management/entities/app-placement.ts` (+ `app-placement.builder.ts`, `app-placement.response.ts`) — the app→env→project join and its wire refs.
- `src/modules/kubernetes/{namespace-backend,namespace-backend.constants,direct-namespace-backend,mock-namespace-backend,conflict}.ts`.
- `src/modules/database/postgres-errors.ts` — FK-violation detection.
- `src/test/fixtures/seed-environment.ts` — e2e fixture.
- `src/sql/drizzle/<ts>_truncate_apps_for_environments/`, `src/sql/drizzle/<ts>_project_environment/` — migrations.
- `src/app/app-management/use-cases/view-app-logs/view-app-logs.repository.ts`.

**API — modified:** `app.table.ts`, `app.builder.ts`, `sql/schema.ts`, `sql/relations.ts`, `config/env.config.ts`, `kubernetes.module.ts`, `deploy-backend.constants.ts`, create-app / view-app-index / view-app-detail / view-app-health / view-app-logs / delete-app slices, `apply-release.service.ts`, deploy-release / view-release-index slices, `entrypoints/seed-dev.ts`, `modules/api/api.module.ts`, every e2e test that inserts an `App`, `openapi.json`, `apps/api/.claude/CLAUDE.md`.

**Web:** `app/composables/{useProjectList,useCreateProject,useDeleteProject,useEnvironmentList,useCreateEnvironment,useDeleteEnvironment}.ts`, `app/components/ProjectEnvironmentPicker.vue`, `app/pages/apps/{new,index,[slug]}.vue`, `app/api/*` (generated), tests beside each.

**marsa-charts:** `charts/marsa/templates/{rbac.yml,admission-policy.yml,deployment.yml,traefik-config.yaml}`, delete `apps-namespace.yml`, `values.yaml`, `values.schema.json`, `tests/{rbac_test,admission-policy_test}.yaml`, `Chart.yaml`, `README.md`.

**Scripts/docs:** `scripts/e2e-test.sh`, root `.claude/CLAUDE.md`.

---

### Task 1: Project & Environment schema; apps belong to an environment

Delivers the data model end to end: both tables, the app FK, migrations, builders, the `AppPlacement` join, `namespaceOf`, and `POST /v1/apps` requiring `environmentUuid`. Every existing e2e suite that inserts an app is updated so the suite stays green.

**Files:**

- Create: `apps/api/src/utils/dns-label.ts`
- Create: `apps/api/src/app/project/entities/{project.uuid,project-config.constants,project.table,project.builder}.ts`
- Create: `apps/api/src/app/environment/entities/{environment.uuid,environment-config.constants,environment.table,environment.builder,namespace}.ts`
- Create: `apps/api/src/app/environment/entities/tests/namespace.unit.test.ts`
- Create: `apps/api/src/app/app-management/entities/{app-placement,app-placement.builder}.ts`
- Create: `apps/api/src/test/fixtures/seed-environment.ts`
- Modify: `apps/api/src/app/app-management/entities/{app.table,app.builder}.ts`, `apps/api/src/sql/{schema,relations}.ts`
- Modify: `apps/api/src/app/app-management/use-cases/create-app/{create-app.command,create-app.command.builder,create-app.repository,create-app.use-case,create-app.controller}.ts` + its `tests/`
- Modify (fixture only): every e2e test listed in Step 12, and `apps/api/src/entrypoints/seed-dev.ts`
- Generate: two migrations under `apps/api/src/sql/drizzle/`

**Interfaces:**

- Produces:
  - `DNS_LABEL_PATTERN: RegExp` (`#src/utils/dns-label.js`)
  - `ProjectUuid`, `projectTable`, `Project`, `ProjectBuilder` (`withName`, `withSlug`), `PROJECT_SLUG_MAX_LENGTH = 30`, `PROJECT_NAME_MAX_LENGTH = 255`
  - `EnvironmentUuid`, `environmentTable`, `Environment`, `EnvironmentBuilder` (`withProject(project: Project)`, `withName`, `withSlug`), `ENVIRONMENT_SLUG_MAX_LENGTH = 32`, `ENVIRONMENT_NAME_MAX_LENGTH = 255`
  - `namespaceOf(project: Pick<Project, 'slug'>, environment: Pick<Environment, 'slug'>): string`
  - `App.environmentUuid: EnvironmentUuid`; `AppBuilder.withEnvironment(environment: Environment)` / `withEnvironmentUuid(uuid: EnvironmentUuid)`
  - `interface AppPlacement { app: App; environment: Environment; project: Project }`, `selectAppPlacement(db: Executor)` (a select builder you finish with `.where(...)`), `AppPlacementBuilder` (`withApp(app)`, `build(): AppPlacement`; defaults namespace `my-project-production`)
  - `seedEnvironment(db: Database): Promise<{ project: Project; environment: Environment }>`
  - `CreateAppCommand.environmentUuid: EnvironmentUuid`; `CreateAppCommandBuilder.withEnvironmentUuid(uuid)`

- [ ] **Step 1: Shared DNS-label regex**

`apps/api/src/utils/dns-label.ts`:

```ts
export const DNS_LABEL_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/
```

- [ ] **Step 2: Project entity**

`apps/api/src/app/project/entities/project.uuid.ts`:

```ts
import type { Uuid } from '#src/utils/uuid.js'

export type ProjectUuid = Uuid<'Project'>
```

`apps/api/src/app/project/entities/project-config.constants.ts`:

```ts
// Leaves room for "-" + a 32-char environment slug inside the 63-char namespace limit.
export const PROJECT_SLUG_MAX_LENGTH = 30
export const PROJECT_NAME_MAX_LENGTH = 255
```

`apps/api/src/app/project/entities/project.table.ts`:

```ts
import { sql } from 'drizzle-orm'
import { pgTable, uuid, varchar } from 'drizzle-orm/pg-core'
import {
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_SLUG_MAX_LENGTH,
} from '#src/app/project/entities/project-config.constants.js'
import type { ProjectUuid } from '#src/app/project/entities/project.uuid.js'
import { timestamps } from '#src/sql/timestamps.js'

export const projectTable = pgTable('project', {
  uuid: uuid()
    .$type<ProjectUuid>()
    .primaryKey()
    .default(sql`uuidv7()`),
  name: varchar({ length: PROJECT_NAME_MAX_LENGTH }).notNull(),
  slug: varchar({ length: PROJECT_SLUG_MAX_LENGTH }).unique().notNull(),
  ...timestamps,
})

export type Project = typeof projectTable.$inferSelect
export type NewProject = typeof projectTable.$inferInsert
```

`apps/api/src/app/project/entities/project.builder.ts`:

```ts
import type { Project } from '#src/app/project/entities/project.table.js'
import type { ProjectUuid } from '#src/app/project/entities/project.uuid.js'
import { generateUuid } from '#src/utils/uuid.js'

export class ProjectBuilder {
  private readonly project: Project

  constructor() {
    const now = new Date()
    this.project = {
      uuid: generateUuid<ProjectUuid>(),
      name: 'My Project',
      slug: 'my-project',
      createdAt: now,
      updatedAt: now,
    }
  }

  withName(name: string): this {
    this.project.name = name
    return this
  }

  withSlug(slug: string): this {
    this.project.slug = slug
    return this
  }

  build(): Project {
    return this.project
  }
}
```

- [ ] **Step 3: Environment entity**

`apps/api/src/app/environment/entities/environment.uuid.ts`:

```ts
import type { Uuid } from '#src/utils/uuid.js'

export type EnvironmentUuid = Uuid<'Environment'>
```

`apps/api/src/app/environment/entities/environment-config.constants.ts`:

```ts
export const ENVIRONMENT_SLUG_MAX_LENGTH = 32
export const ENVIRONMENT_NAME_MAX_LENGTH = 255
```

`apps/api/src/app/environment/entities/environment.table.ts`:

```ts
import { sql } from 'drizzle-orm'
import { pgTable, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import {
  ENVIRONMENT_NAME_MAX_LENGTH,
  ENVIRONMENT_SLUG_MAX_LENGTH,
} from '#src/app/environment/entities/environment-config.constants.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import { projectTable } from '#src/app/project/entities/project.table.js'
import type { ProjectUuid } from '#src/app/project/entities/project.uuid.js'
import { timestamps } from '#src/sql/timestamps.js'

export const environmentTable = pgTable(
  'environment',
  {
    uuid: uuid()
      .$type<EnvironmentUuid>()
      .primaryKey()
      .default(sql`uuidv7()`),
    projectUuid: uuid('project_uuid')
      .$type<ProjectUuid>()
      .notNull()
      .references(() => projectTable.uuid, { onDelete: 'restrict', onUpdate: 'cascade' }),
    name: varchar({ length: ENVIRONMENT_NAME_MAX_LENGTH }).notNull(),
    slug: varchar({ length: ENVIRONMENT_SLUG_MAX_LENGTH }).notNull(),
    ...timestamps,
  },
  (table) => [unique('environment_project_uuid_slug_unique').on(table.projectUuid, table.slug)],
)

export type Environment = typeof environmentTable.$inferSelect
export type NewEnvironment = typeof environmentTable.$inferInsert
```

`apps/api/src/app/environment/entities/environment.builder.ts`:

```ts
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import type { Project } from '#src/app/project/entities/project.table.js'
import type { ProjectUuid } from '#src/app/project/entities/project.uuid.js'
import { generateUuid } from '#src/utils/uuid.js'

export class EnvironmentBuilder {
  private readonly environment: Environment

  constructor() {
    const now = new Date()
    this.environment = {
      uuid: generateUuid<EnvironmentUuid>(),
      projectUuid: generateUuid<ProjectUuid>(),
      name: 'Production',
      slug: 'production',
      createdAt: now,
      updatedAt: now,
    }
  }

  withProject(project: Project): this {
    this.environment.projectUuid = project.uuid
    return this
  }

  withName(name: string): this {
    this.environment.name = name
    return this
  }

  withSlug(slug: string): this {
    this.environment.slug = slug
    return this
  }

  build(): Environment {
    return this.environment
  }
}
```

- [ ] **Step 4: Write the failing `namespaceOf` test**

`apps/api/src/app/environment/entities/tests/namespace.unit.test.ts`:

```ts
import { before, describe, it } from 'node:test'
import { expect } from 'expect'
import { namespaceOf } from '#src/app/environment/entities/namespace.js'
import { TestBench } from '#src/test/setup/test-bench.js'

describe('namespaceOf', () => {
  before(() => TestBench.setupUnitTest())

  it('joins the project and environment slugs', () => {
    expect(namespaceOf({ slug: 'demo' }, { slug: 'dev' })).toBe('demo-dev')
  })

  it('fits the longest allowed slugs inside a 63-char DNS label', () => {
    expect(namespaceOf({ slug: 'p'.repeat(30) }, { slug: 'e'.repeat(32) })).toHaveLength(63)
  })
})
```

- [ ] **Step 5: Implement `namespaceOf`**

`apps/api/src/app/environment/entities/namespace.ts`:

```ts
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import type { Project } from '#src/app/project/entities/project.table.js'

// Derived, never stored (AgDR-0029).
export function namespaceOf(
  project: Pick<Project, 'slug'>,
  environment: Pick<Environment, 'slug'>,
): string {
  return `${project.slug}-${environment.slug}`
}
```

- [ ] **Step 6: App belongs to an environment**

In `apps/api/src/app/app-management/entities/app.table.ts` add the imports and the column (after `uuid`):

```ts
import { environmentTable } from '#src/app/environment/entities/environment.table.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
```

```ts
  environmentUuid: uuid('environment_uuid')
    .$type<EnvironmentUuid>()
    .notNull()
    .references(() => environmentTable.uuid, { onDelete: 'restrict', onUpdate: 'cascade' }),
```

In `apps/api/src/app/app-management/entities/app.builder.ts`: import `Environment` / `EnvironmentUuid` types, add `environmentUuid: generateUuid<EnvironmentUuid>(),` to the constructor defaults (after `uuid`), and add:

```ts
  withEnvironment(environment: Environment): this {
    return this.withEnvironmentUuid(environment.uuid)
  }

  withEnvironmentUuid(environmentUuid: EnvironmentUuid): this {
    this.app.environmentUuid = environmentUuid
    return this
  }
```

- [ ] **Step 7: Register tables and relations**

`apps/api/src/sql/schema.ts` — add (keep alphabetical order):

```ts
export * from '#src/app/environment/entities/environment.table.js'
export * from '#src/app/project/entities/project.table.js'
```

`apps/api/src/sql/relations.ts` — replace the `appTable` entry and add two:

```ts
  projectTable: {
    environments: r.many.environmentTable(),
  },
  environmentTable: {
    project: r.one.projectTable({
      from: r.environmentTable.projectUuid,
      to: r.projectTable.uuid,
      optional: false,
    }),
    apps: r.many.appTable(),
  },
  appTable: {
    environment: r.one.environmentTable({
      from: r.appTable.environmentUuid,
      to: r.environmentTable.uuid,
      optional: false,
    }),
    releases: r.many.releaseTable(),
  },
```

- [ ] **Step 8: Generate the migrations**

Existing rows can't satisfy the new NOT NULL FK and we agreed not to backfill, so a custom migration truncates first; it must sort **before** the schema migration, so generate it first.

```bash
cd apps/api
pnpm exec drizzle-kit generate --custom --name truncate_apps_for_environments
```

Write into the generated `src/sql/drizzle/<ts>_truncate_apps_for_environments/migration.sql`:

```sql
-- No backfill (#142): the only install is redeployed, so existing apps are dropped.
TRUNCATE "release", "app";
```

Then:

```bash
pnpm db:generate --name project_environment
```

Expected: a new `<ts>_project_environment/migration.sql` creating `project`, `environment` (with `environment_project_uuid_slug_unique`), adding `app.environment_uuid` NOT NULL with a `ON DELETE restrict` FK. Do not edit it. Confirm the truncate folder's timestamp sorts earlier: `ls src/sql/drizzle | tail -2`.

- [ ] **Step 9: `AppPlacement` — the app → environment → project join**

`apps/api/src/app/app-management/entities/app-placement.ts`:

```ts
import { eq } from 'drizzle-orm'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import {
  type Environment,
  environmentTable,
} from '#src/app/environment/entities/environment.table.js'
import { type Project, projectTable } from '#src/app/project/entities/project.table.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

export interface AppPlacement {
  app: App
  environment: Environment
  project: Project
}

export function selectAppPlacement(db: Executor) {
  return db
    .select({ app: appTable, environment: environmentTable, project: projectTable })
    .from(appTable)
    .innerJoin(environmentTable, eq(appTable.environmentUuid, environmentTable.uuid))
    .innerJoin(projectTable, eq(environmentTable.projectUuid, projectTable.uuid))
}
```

`apps/api/src/app/app-management/entities/app-placement.builder.ts`:

```ts
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import type { App } from '#src/app/app-management/entities/app.table.js'
import type { AppPlacement } from '#src/app/app-management/entities/app-placement.js'
import { EnvironmentBuilder } from '#src/app/environment/entities/environment.builder.js'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'

export class AppPlacementBuilder {
  private readonly placement: AppPlacement

  constructor() {
    const project = new ProjectBuilder().build()
    const environment = new EnvironmentBuilder().withProject(project).build()
    this.placement = {
      app: new AppBuilder().withEnvironment(environment).build(),
      environment,
      project,
    }
  }

  withApp(app: App): this {
    this.placement.app = { ...app, environmentUuid: this.placement.environment.uuid }
    return this
  }

  build(): AppPlacement {
    return this.placement
  }
}
```

- [ ] **Step 10: e2e fixture**

`apps/api/src/test/fixtures/seed-environment.ts`:

```ts
import { EnvironmentBuilder } from '#src/app/environment/entities/environment.builder.js'
import {
  type Environment,
  environmentTable,
} from '#src/app/environment/entities/environment.table.js'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'
import { type Project, projectTable } from '#src/app/project/entities/project.table.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'

export async function seedEnvironment(
  db: Database,
): Promise<{ project: Project; environment: Environment }> {
  const project = new ProjectBuilder().build()
  const environment = new EnvironmentBuilder().withProject(project).build()
  await db.insert(projectTable).values(project)
  await db.insert(environmentTable).values(environment)
  return { project, environment }
}
```

- [ ] **Step 11: `create-app` takes an `environmentUuid`**

Append to `CreateAppCommand` (import `IsUUID` from class-validator and the `EnvironmentUuid` type):

```ts
  @ApiProperty({ type: String, format: 'uuid', description: 'Environment the app lives in.' })
  @IsUUID()
  environmentUuid!: EnvironmentUuid
```

`CreateAppCommandBuilder`: default `this.command.environmentUuid = generateUuid<EnvironmentUuid>()` in the constructor, plus:

```ts
  withEnvironmentUuid(environmentUuid: EnvironmentUuid): this {
    this.command.environmentUuid = environmentUuid
    return this
  }
```

`CreateAppRepository` — add:

```ts
  async environmentExists(uuid: EnvironmentUuid): Promise<boolean> {
    const rows = await this.db
      .select({ uuid: environmentTable.uuid })
      .from(environmentTable)
      .where(eq(environmentTable.uuid, uuid))
      .limit(1)
    return rows.length > 0
  }
```

`CreateAppUseCase.execute` — first lines, and the builder gains the FK:

```ts
if (!(await this.repository.environmentExists(command.environmentUuid))) {
  throw new NotFoundException(`Environment '${command.environmentUuid}' was not found.`)
}
```

```ts
      .withEnvironmentUuid(command.environmentUuid)
```

`CreateAppController`: add `@ApiNotFoundResponse({ description: 'No environment with that uuid.' })`.

- [ ] **Step 12: Update create-app tests, then every e2e suite that inserts an app**

`create-app.use-case.unit.test.ts`: in `build()`, `repository.environmentExists.resolves(true)`; assert `environmentUuid` lands on the inserted app; add:

```ts
it('rejects an unknown environment with 404 and inserts nothing', async () => {
  const { usecase, repository } = build()
  repository.environmentExists.resolves(false)

  await expect(usecase.execute(new CreateAppCommandBuilder().build())).rejects.toThrow(
    NotFoundException,
  )
  expect(repository.insert.called).toBe(false)
})
```

`create-app.e2e.test.ts`: in `before`, `environment = (await seedEnvironment(setup.db)).environment`; send `environmentUuid: environment.uuid` in each body; assert `app.environmentUuid === environment.uuid`; add a case posting a random uuid (`generateUuid<EnvironmentUuid>()`) → `404`.

For **each** file below: declare `let environment: Environment` at `describe` scope; in `before`, right after `setup.authenticate()`, add `environment = (await seedEnvironment(setup.db)).environment`; chain `.withEnvironment(environment)` onto **every** `new AppBuilder()` in the file (including the ones inside `it` blocks):

- `src/app/app-management/use-cases/delete-app/tests/delete-app.e2e.test.ts`
- `src/app/app-management/use-cases/update-app/tests/update-app.e2e.test.ts`
- `src/app/app-management/use-cases/view-app-detail/tests/view-app-detail.e2e.test.ts`
- `src/app/app-management/use-cases/view-app-index/tests/view-app-index.e2e.test.ts`
- `src/app/release/use-cases/create-release/tests/create-release.e2e.test.ts` (the spread `{ ...old, image, env }` keeps the FK because `old` carries it)
- `src/app/release/use-cases/deploy-release/tests/deploy-release.e2e.test.ts`
- `src/app/release/use-cases/view-release-index/tests/view-release-index.e2e.test.ts`
- `src/utils/pagination/tests/keyset-pagination.e2e.test.ts`

`src/entrypoints/seed-dev.ts` — add the imports (`and`, `EnvironmentBuilder`, `environmentTable`, `ProjectBuilder`, `projectTable`) and, inside `if (!userOnly) {` before the sample-app loop:

```ts
let [project] = await db.select().from(projectTable).where(eq(projectTable.slug, 'dev'))
if (!project) {
  project = new ProjectBuilder().withName('Dev').withSlug('dev').build()
  await db.insert(projectTable).values(project)
}
let [environment] = await db
  .select()
  .from(environmentTable)
  .where(
    and(eq(environmentTable.projectUuid, project.uuid), eq(environmentTable.slug, 'production')),
  )
if (!environment) {
  environment = new EnvironmentBuilder().withProject(project).build()
  await db.insert(environmentTable).values(environment)
}
```

and chain `.withEnvironment(environment)` onto the sample `new AppBuilder()`.

- [ ] **Step 13: Run the API suite**

```bash
docker compose up -d
pnpm --filter api test
```

Expected: PASS, including the two `namespaceOf` tests and the new create-app 404 cases. Coverage floors hold.

- [ ] **Step 14: Lint, format, commit**

```bash
pnpm --filter api lint
npx prettier --write $(git diff --name-only; git ls-files --others --exclude-standard apps/api/src)
git add apps/api/src/utils/dns-label.ts apps/api/src/app/project apps/api/src/app/environment \
  apps/api/src/app/app-management apps/api/src/app/release apps/api/src/sql \
  apps/api/src/test/fixtures apps/api/src/utils/pagination apps/api/src/entrypoints/seed-dev.ts
git commit -m "feat: add Project and Environment entities and place every app in an environment

Refs #142"
```

---

### Task 2: `NamespaceBackend` port — provision and destroy an environment's namespace

**Files:**

- Create: `apps/api/src/modules/kubernetes/{namespace-backend,namespace-backend.constants,conflict,direct-namespace-backend,mock-namespace-backend}.ts`
- Create: `apps/api/src/modules/kubernetes/tests/direct-namespace-backend.unit.test.ts`
- Modify: `apps/api/src/modules/kubernetes/kubernetes.module.ts`, `apps/api/src/config/env.config.ts`

**Interfaces:**

- Consumes: `ignoreNotFound` from `#src/modules/kubernetes/not-found.js`.
- Produces:
  - `abstract class NamespaceBackend { provision(namespace: string, environmentUuid: string): Promise<void>; destroy(namespace: string): Promise<void> }`
  - `class NamespaceConflictError extends Error` — thrown by `provision` when the name is owned by something else or still terminating.
  - `MockNamespaceBackend` (stateless, always resolves), `DirectNamespaceBackend(apiNamespace: string)`
  - `KubernetesModule` exports `NamespaceBackend` alongside `DeployBackend`.
  - Env var `MARSA_API_NAMESPACE` (default `marsa`) — the namespace marsa-api's service account lives in.

- [ ] **Step 1: Constants, port, conflict helper**

`apps/api/src/modules/kubernetes/namespace-backend.constants.ts`:

```ts
export const MANAGED_BY_LABEL = 'marsa.cloud/managed-by'
export const MANAGED_BY_VALUE = 'marsa-api'
export const ENVIRONMENT_UUID_LABEL = 'marsa.cloud/environment-uuid'

// Shipped by marsa-charts; the api only ever binds this one ClusterRole.
export const DEPLOYER_CLUSTER_ROLE = 'marsa-deployer'
export const DEPLOYER_ROLE_BINDING = 'marsa-deployer'
export const API_SERVICE_ACCOUNT = 'marsa-api'
```

`apps/api/src/modules/kubernetes/namespace-backend.ts`:

```ts
export class NamespaceConflictError extends Error {}

export abstract class NamespaceBackend {
  // Idempotent for the same environment uuid; NamespaceConflictError otherwise.
  abstract provision(namespace: string, environmentUuid: string): Promise<void>

  // A namespace that is already gone counts as deleted, so a retry completes.
  abstract destroy(namespace: string): Promise<void>
}
```

`apps/api/src/modules/kubernetes/conflict.ts`:

```ts
import { ApiException } from '@kubernetes/client-node'

export function isConflict(error: unknown): boolean {
  return error instanceof ApiException && error.code === 409
}

export async function ignoreConflict(create: () => Promise<unknown>): Promise<void> {
  try {
    await create()
  } catch (error) {
    if (isConflict(error)) {
      return
    }
    throw error
  }
}
```

- [ ] **Step 2: Write the failing backend tests**

`apps/api/src/modules/kubernetes/tests/direct-namespace-backend.unit.test.ts`:

```ts
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  ApiException,
  CoreV1Api,
  KubeConfig,
  RbacAuthorizationV1Api,
  type V1Namespace,
} from '@kubernetes/client-node'
import { expect } from 'expect'
import {
  createSandbox,
  createStubInstance,
  type SinonSandbox,
  type SinonStubbedInstance,
} from 'sinon'
import { DirectNamespaceBackend } from '#src/modules/kubernetes/direct-namespace-backend.js'
import { NamespaceConflictError } from '#src/modules/kubernetes/namespace-backend.js'

const NS = 'demo-dev'
const ENV_UUID = '0190c3c0-0000-7000-8000-000000000001'

const conflict = () => new ApiException(409, 'Conflict', {}, {})
const notFound = () => new ApiException(404, 'Not Found', {}, {})

function namespace(labels: Record<string, string>, terminating = false): V1Namespace {
  return {
    metadata: {
      name: NS,
      labels,
      ...(terminating ? { deletionTimestamp: new Date() } : {}),
    },
  }
}

describe('DirectNamespaceBackend', () => {
  let core: SinonStubbedInstance<CoreV1Api>
  let rbac: SinonStubbedInstance<RbacAuthorizationV1Api>
  let sandbox: SinonSandbox
  let backend: DirectNamespaceBackend

  beforeEach(() => {
    core = createStubInstance(CoreV1Api)
    rbac = createStubInstance(RbacAuthorizationV1Api)
    sandbox = createSandbox()
    sandbox.stub(KubeConfig.prototype, 'loadFromDefault')
    sandbox
      .stub(KubeConfig.prototype, 'makeApiClient')
      .withArgs(CoreV1Api)
      .returns(core)
      .withArgs(RbacAuthorizationV1Api)
      .returns(rbac)
    backend = new DirectNamespaceBackend('marsa')
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('creates a labelled namespace and binds the deployer ClusterRole to marsa-api', async () => {
    await backend.provision(NS, ENV_UUID)

    expect(core.createNamespace.firstCall.args[0].body.metadata).toEqual({
      name: NS,
      labels: { 'marsa.cloud/managed-by': 'marsa-api', 'marsa.cloud/environment-uuid': ENV_UUID },
    })
    const { namespace, body } = rbac.createNamespacedRoleBinding.firstCall.args[0]
    expect(namespace).toBe(NS)
    expect(body.roleRef).toEqual({
      apiGroup: 'rbac.authorization.k8s.io',
      kind: 'ClusterRole',
      name: 'marsa-deployer',
    })
    expect(body.subjects).toEqual([
      { kind: 'ServiceAccount', name: 'marsa-api', namespace: 'marsa' },
    ])
  })

  it('treats a namespace it already owns as provisioned', async () => {
    core.createNamespace.rejects(conflict())
    core.readNamespace.resolves(namespace({ 'marsa.cloud/environment-uuid': ENV_UUID }))
    rbac.createNamespacedRoleBinding.rejects(conflict())

    await backend.provision(NS, ENV_UUID)
  })

  it('refuses a namespace owned by anything else', async () => {
    core.createNamespace.rejects(conflict())
    core.readNamespace.resolves(namespace({}))

    await expect(backend.provision(NS, ENV_UUID)).rejects.toThrow(NamespaceConflictError)
    expect(rbac.createNamespacedRoleBinding.called).toBe(false)
  })

  it('refuses a namespace that is still terminating', async () => {
    core.createNamespace.rejects(conflict())
    core.readNamespace.resolves(namespace({ 'marsa.cloud/environment-uuid': ENV_UUID }, true))

    await expect(backend.provision(NS, ENV_UUID)).rejects.toThrow(/still being deleted/)
  })

  it('rethrows any other create failure', async () => {
    core.createNamespace.rejects(new ApiException(403, 'Forbidden', {}, {}))

    await expect(backend.provision(NS, ENV_UUID)).rejects.toThrow(ApiException)
  })

  it('deletes the namespace, treating an already-missing one as done', async () => {
    await backend.destroy(NS)
    expect(core.deleteNamespace.calledOnceWith({ name: NS })).toBe(true)

    core.deleteNamespace.rejects(notFound())
    await backend.destroy(NS)
  })
})
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `pnpm --filter api test`
Expected: FAIL — `Cannot find module .../direct-namespace-backend.js`.

- [ ] **Step 4: Implement the real and mock backends**

`apps/api/src/modules/kubernetes/direct-namespace-backend.ts`:

```ts
import {
  CoreV1Api,
  KubeConfig,
  RbacAuthorizationV1Api,
  type V1RoleBinding,
} from '@kubernetes/client-node'
import { Injectable } from '@nestjs/common'
import { ignoreConflict, isConflict } from '#src/modules/kubernetes/conflict.js'
import {
  NamespaceBackend,
  NamespaceConflictError,
} from '#src/modules/kubernetes/namespace-backend.js'
import {
  API_SERVICE_ACCOUNT,
  DEPLOYER_CLUSTER_ROLE,
  DEPLOYER_ROLE_BINDING,
  ENVIRONMENT_UUID_LABEL,
  MANAGED_BY_LABEL,
  MANAGED_BY_VALUE,
} from '#src/modules/kubernetes/namespace-backend.constants.js'
import { ignoreNotFound } from '#src/modules/kubernetes/not-found.js'

@Injectable()
export class DirectNamespaceBackend extends NamespaceBackend {
  private readonly core: CoreV1Api
  private readonly rbac: RbacAuthorizationV1Api

  constructor(private readonly apiNamespace: string) {
    super()
    const kc = new KubeConfig()
    kc.loadFromDefault()
    this.core = kc.makeApiClient(CoreV1Api)
    this.rbac = kc.makeApiClient(RbacAuthorizationV1Api)
  }

  async provision(namespace: string, environmentUuid: string): Promise<void> {
    await this.ensureNamespace(namespace, environmentUuid)
    await ignoreConflict(() =>
      this.rbac.createNamespacedRoleBinding({ namespace, body: this.deployerBinding(namespace) }),
    )
  }

  async destroy(namespace: string): Promise<void> {
    await ignoreNotFound(() => this.core.deleteNamespace({ name: namespace }))
  }

  private async ensureNamespace(name: string, environmentUuid: string): Promise<void> {
    try {
      await this.core.createNamespace({
        body: {
          metadata: {
            name,
            labels: {
              [MANAGED_BY_LABEL]: MANAGED_BY_VALUE,
              [ENVIRONMENT_UUID_LABEL]: environmentUuid,
            },
          },
        },
      })
      return
    } catch (error) {
      if (!isConflict(error)) {
        throw error
      }
    }

    const existing = await this.core.readNamespace({ name })
    if (existing.metadata?.deletionTimestamp) {
      throw new NamespaceConflictError(`Namespace '${name}' is still being deleted. Retry shortly.`)
    }
    if (existing.metadata?.labels?.[ENVIRONMENT_UUID_LABEL] !== environmentUuid) {
      throw new NamespaceConflictError(
        `Namespace '${name}' is already taken. Choose a different project or environment slug.`,
      )
    }
  }

  private deployerBinding(namespace: string): V1RoleBinding {
    return {
      metadata: {
        name: DEPLOYER_ROLE_BINDING,
        namespace,
        labels: { [MANAGED_BY_LABEL]: MANAGED_BY_VALUE },
      },
      roleRef: {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: 'ClusterRole',
        name: DEPLOYER_CLUSTER_ROLE,
      },
      subjects: [
        { kind: 'ServiceAccount', name: API_SERVICE_ACCOUNT, namespace: this.apiNamespace },
      ],
    }
  }
}
```

`apps/api/src/modules/kubernetes/mock-namespace-backend.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { NamespaceBackend } from '#src/modules/kubernetes/namespace-backend.js'

// Stateless on purpose: booted apps are cached across e2e suites, and truncation can't reset them.
@Injectable()
export class MockNamespaceBackend extends NamespaceBackend {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  provision(_namespace: string, _environmentUuid: string): Promise<void> {
    return Promise.resolve()
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  destroy(_namespace: string): Promise<void> {
    return Promise.resolve()
  }
}
```

- [ ] **Step 5: Wire it up**

`apps/api/src/config/env.config.ts` — add under `MARSA_BASE_DOMAIN`:

```ts
  // Namespace marsa-api runs in; each environment's RoleBinding names its service account there.
  MARSA_API_NAMESPACE: Joi.string().hostname().default('marsa'),
```

`apps/api/src/modules/kubernetes/kubernetes.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'
import { DirectApplyDeployBackend } from '#src/modules/kubernetes/direct-apply-deploy-backend.js'
import { DirectNamespaceBackend } from '#src/modules/kubernetes/direct-namespace-backend.js'
import { MockDeployBackend } from '#src/modules/kubernetes/mock-deploy-backend.js'
import { MockNamespaceBackend } from '#src/modules/kubernetes/mock-namespace-backend.js'
import { NamespaceBackend } from '#src/modules/kubernetes/namespace-backend.js'

const isMock = (config: ConfigService) => config.get<string>('DEPLOY_BACKEND', 'direct') === 'mock'

@Module({
  providers: [
    {
      provide: DeployBackend,
      useFactory: (config: ConfigService) =>
        isMock(config) ? new MockDeployBackend() : new DirectApplyDeployBackend(),
      inject: [ConfigService],
    },
    {
      provide: NamespaceBackend,
      useFactory: (config: ConfigService) =>
        isMock(config)
          ? new MockNamespaceBackend()
          : new DirectNamespaceBackend(config.getOrThrow<string>('MARSA_API_NAMESPACE')),
      inject: [ConfigService],
    },
  ],
  exports: [DeployBackend, NamespaceBackend],
})
export class KubernetesModule {}
```

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter api test`
Expected: PASS — all six `DirectNamespaceBackend` cases green.

- [ ] **Step 7: Commit**

```bash
pnpm --filter api lint
npx prettier --write apps/api/src/modules/kubernetes apps/api/src/config/env.config.ts
git add apps/api/src/modules/kubernetes apps/api/src/config/env.config.ts
git commit -m "feat: provision and destroy per-environment namespaces through a NamespaceBackend port

Refs #142"
```

---

### Task 3: `project/` feature — create, list, delete projects

**Files:**

- Create: `apps/api/src/modules/database/postgres-errors.ts`
- Create: `apps/api/src/app/project/project.module.ts`
- Create: `apps/api/src/app/project/use-cases/create-project/{create-project.command,create-project.command.builder,create-project.controller,create-project.module,create-project.repository,create-project.response,create-project.use-case}.ts` + `tests/{create-project.use-case.unit,create-project.e2e}.test.ts`
- Create: `apps/api/src/app/project/use-cases/view-project-index/{view-project-index.controller,view-project-index.module,view-project-index.repository,view-project-index.response,view-project-index.use-case}.ts`, `query/{view-project-index.query,view-project-index.query.builder}.ts` + `tests/view-project-index.e2e.test.ts`
- Create: `apps/api/src/app/project/use-cases/delete-project/{delete-project.controller,delete-project.module,delete-project.repository,delete-project.use-case}.ts` + `tests/{delete-project.use-case.unit,delete-project.e2e}.test.ts`
- Modify: `apps/api/src/modules/api/api.module.ts`

**Interfaces:**

- Consumes (Task 1): `projectTable`, `Project`, `ProjectBuilder`, `PROJECT_*` constants, `DNS_LABEL_PATTERN`, `seedEnvironment`.
- Produces:
  - `isForeignKeyViolation(error: unknown): boolean` (`#src/modules/database/postgres-errors.js`)
  - `POST /v1/projects` → 201 `CreateProjectResponse { uuid, name, slug }`; 409 duplicate slug
  - `GET /v1/projects` → `ViewProjectIndexResponse { items: ProjectSummary[] { uuid, name, slug, createdAt }, meta: { next: ViewProjectIndexQueryKey | null } }`
  - `DELETE /v1/projects/:slug` → 204; 404 unknown; 409 while it has environments
  - operationIds: `createProjectV1`, `viewProjectIndexV1`, `deleteProjectV1`

- [ ] **Step 1: FK-violation helper**

`apps/api/src/modules/database/postgres-errors.ts`:

```ts
// RESTRICT raises restrict_violation, NO ACTION raises foreign_key_violation; both mean "still referenced".
const REFERENCED_ROW_CODES = new Set(['23001', '23503'])

// Drizzle wraps the driver error, so the pg code can sit anywhere down the cause chain.
export function isForeignKeyViolation(error: unknown): boolean {
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    if (REFERENCED_ROW_CODES.has((current as Error & { code?: string }).code ?? '')) {
      return true
    }
  }
  return false
}
```

- [ ] **Step 2: Write the failing create-project tests**

`tests/create-project.use-case.unit.test.ts`:

```ts
import { before, describe, it } from 'node:test'
import { ConflictException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { CreateProjectCommandBuilder } from '#src/app/project/use-cases/create-project/create-project.command.builder.js'
import { CreateProjectRepository } from '#src/app/project/use-cases/create-project/create-project.repository.js'
import { CreateProjectUseCase } from '#src/app/project/use-cases/create-project/create-project.use-case.js'
import { TestBench } from '#src/test/setup/test-bench.js'

function build() {
  const repository = createStubInstance(CreateProjectRepository)
  repository.insert.resolves(true)
  return { usecase: new CreateProjectUseCase(repository), repository }
}

describe('CreateProjectUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('stores the project and returns it', async () => {
    const { usecase, repository } = build()

    const result = await usecase.execute(
      new CreateProjectCommandBuilder().withName('Demo').withSlug('demo').build(),
    )

    expect(result).toMatchObject({ name: 'Demo', slug: 'demo' })
    expect(repository.insert.firstCall.args[0]).toMatchObject({ name: 'Demo', slug: 'demo' })
  })

  it('rejects a taken slug with 409', async () => {
    const { usecase, repository } = build()
    repository.insert.resolves(false)

    await expect(usecase.execute(new CreateProjectCommandBuilder().build())).rejects.toThrow(
      ConflictException,
    )
  })
})
```

`tests/create-project.e2e.test.ts`:

```ts
import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('POST /api/v1/projects (e2e)', () => {
  let setup: TestSetup
  let cookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
  })

  after(async () => {
    await setup.teardown()
  })

  it('creates a project', async () => {
    const response = await request(setup.httpServer)
      .post('/api/v1/projects')
      .set('Cookie', cookie)
      .send({ name: 'Demo', slug: 'demo' })
      .expect(201)

    expect(response.body).toMatchObject({ name: 'Demo', slug: 'demo' })
    expect(response.body.uuid).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('rejects a duplicate slug with 409', async () => {
    await request(setup.httpServer)
      .post('/api/v1/projects')
      .set('Cookie', cookie)
      .send({ name: 'Again', slug: 'demo' })
      .expect(409)
  })

  it('rejects a slug longer than 30 characters with 400', async () => {
    await request(setup.httpServer)
      .post('/api/v1/projects')
      .set('Cookie', cookie)
      .send({ name: 'Long', slug: 'a'.repeat(31) })
      .expect(400)
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).post('/api/v1/projects').send({}).expect(401)
  })
})
```

- [ ] **Step 3: Implement create-project**

`create-project.command.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator'
import {
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_SLUG_MAX_LENGTH,
} from '#src/app/project/entities/project-config.constants.js'
import { DNS_LABEL_PATTERN } from '#src/utils/dns-label.js'

export class CreateProjectCommand {
  @ApiProperty({ type: String, example: 'Demo', maxLength: PROJECT_NAME_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PROJECT_NAME_MAX_LENGTH)
  name!: string

  @ApiProperty({
    type: String,
    example: 'demo',
    description: 'First half of every environment namespace name.',
    pattern: DNS_LABEL_PATTERN.source,
    maxLength: PROJECT_SLUG_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PROJECT_SLUG_MAX_LENGTH)
  @Matches(DNS_LABEL_PATTERN, { message: 'slug must be a valid DNS-1123 label' })
  slug!: string
}
```

`create-project.command.builder.ts`:

```ts
import { CreateProjectCommand } from '#src/app/project/use-cases/create-project/create-project.command.js'

export class CreateProjectCommandBuilder {
  private readonly command: CreateProjectCommand

  constructor() {
    this.command = new CreateProjectCommand()
    this.command.name = 'My Project'
    this.command.slug = 'my-project'
  }

  withName(name: string): this {
    this.command.name = name
    return this
  }

  withSlug(slug: string): this {
    this.command.slug = slug
    return this
  }

  build(): CreateProjectCommand {
    return this.command
  }
}
```

`create-project.repository.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { type Project, projectTable } from '#src/app/project/entities/project.table.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class CreateProjectRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async insert(project: Project): Promise<boolean> {
    const rows = await this.db
      .insert(projectTable)
      .values(project)
      .onConflictDoNothing({ target: projectTable.slug })
      .returning({ uuid: projectTable.uuid })
    return rows.length > 0
  }
}
```

`create-project.response.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger'
import type { Project } from '#src/app/project/entities/project.table.js'

export class CreateProjectResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly uuid: string

  @ApiProperty({ type: String, example: 'Demo' })
  readonly name: string

  @ApiProperty({ type: String, example: 'demo' })
  readonly slug: string

  constructor(project: Project) {
    this.uuid = project.uuid
    this.name = project.name
    this.slug = project.slug
  }
}
```

`create-project.use-case.ts`:

```ts
import { ConflictException, Injectable } from '@nestjs/common'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'
import { CreateProjectCommand } from '#src/app/project/use-cases/create-project/create-project.command.js'
import { CreateProjectRepository } from '#src/app/project/use-cases/create-project/create-project.repository.js'
import { CreateProjectResponse } from '#src/app/project/use-cases/create-project/create-project.response.js'

@Injectable()
export class CreateProjectUseCase {
  constructor(private readonly repository: CreateProjectRepository) {}

  async execute(command: CreateProjectCommand): Promise<CreateProjectResponse> {
    const project = new ProjectBuilder().withName(command.name).withSlug(command.slug).build()

    if (!(await this.repository.insert(project))) {
      throw new ConflictException(`A project with slug '${command.slug}' already exists.`)
    }

    return new CreateProjectResponse(project)
  }
}
```

`create-project.controller.ts`:

```ts
import { Body, Controller, Post } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { CreateProjectCommand } from '#src/app/project/use-cases/create-project/create-project.command.js'
import { CreateProjectResponse } from '#src/app/project/use-cases/create-project/create-project.response.js'
import { CreateProjectUseCase } from '#src/app/project/use-cases/create-project/create-project.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('projects')
@Controller({ path: 'projects', version: '1' })
export class CreateProjectController {
  constructor(private readonly usecase: CreateProjectUseCase) {}

  @Post()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiCreatedResponse({ type: CreateProjectResponse })
  @ApiBadRequestResponse({ description: 'Malformed body, or an invalid name / slug.' })
  @ApiConflictResponse({ description: 'A project with that slug already exists.' })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(@Body() command: CreateProjectCommand): Promise<CreateProjectResponse> {
    return this.usecase.execute(command)
  }
}
```

`create-project.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { CreateProjectController } from '#src/app/project/use-cases/create-project/create-project.controller.js'
import { CreateProjectRepository } from '#src/app/project/use-cases/create-project/create-project.repository.js'
import { CreateProjectUseCase } from '#src/app/project/use-cases/create-project/create-project.use-case.js'

@Module({
  controllers: [CreateProjectController],
  providers: [CreateProjectUseCase, CreateProjectRepository],
})
export class CreateProjectModule {}
```

- [ ] **Step 4: view-project-index (keyset, newest first)**

`query/view-project-index.query.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsNotEmpty, IsObject, IsOptional, IsUUID, ValidateNested } from 'class-validator'
import type { Project } from '#src/app/project/entities/project.table.js'
import type { ProjectUuid } from '#src/app/project/entities/project.uuid.js'
import {
  PaginatedKeysetQuery,
  PaginatedKeysetSearchQuery,
} from '#src/utils/pagination/keyset/paginated-keyset.query.js'

export class ViewProjectIndexQueryKey {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  uuid!: ProjectUuid

  static from(project: Project): ViewProjectIndexQueryKey {
    const key = new ViewProjectIndexQueryKey()
    key.uuid = project.uuid
    return key
  }

  static nextKey(projects: Project[]): ViewProjectIndexQueryKey | null {
    const last = projects.at(-1)
    return last ? this.from(last) : null
  }
}

export class ViewProjectIndexPaginationQuery extends PaginatedKeysetQuery {
  @ApiPropertyOptional({ type: ViewProjectIndexQueryKey, nullable: true })
  @IsOptional()
  @Type(() => ViewProjectIndexQueryKey)
  @ValidateNested()
  @IsObject()
  declare key?: ViewProjectIndexQueryKey | null
}

export class ViewProjectIndexQuery extends PaginatedKeysetSearchQuery {
  @ApiPropertyOptional({ type: ViewProjectIndexPaginationQuery })
  @IsOptional()
  @Type(() => ViewProjectIndexPaginationQuery)
  @ValidateNested()
  declare pagination?: ViewProjectIndexPaginationQuery
}
```

`query/view-project-index.query.builder.ts`:

```ts
import type { Project } from '#src/app/project/entities/project.table.js'
import {
  ViewProjectIndexPaginationQuery,
  ViewProjectIndexQuery,
  ViewProjectIndexQueryKey,
} from '#src/app/project/use-cases/view-project-index/query/view-project-index.query.js'
import { KeysetQueryBuilder } from '#src/utils/pagination/keyset/keyset-query.builder.js'

export class ViewProjectIndexQueryBuilder extends KeysetQueryBuilder<
  ViewProjectIndexQuery,
  ViewProjectIndexPaginationQuery,
  ViewProjectIndexQueryKey
> {
  constructor() {
    super(new ViewProjectIndexQuery(), new ViewProjectIndexPaginationQuery())
  }

  withCursorAt(project: Project): this {
    return this.withKey(ViewProjectIndexQueryKey.from(project))
  }
}
```

`view-project-index.repository.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { desc, lt } from 'drizzle-orm'
import { type Project, projectTable } from '#src/app/project/entities/project.table.js'
import type { ProjectUuid } from '#src/app/project/entities/project.uuid.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewProjectIndexRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async listProjects(limit: number, after?: ProjectUuid | null): Promise<Project[]> {
    return this.db
      .select()
      .from(projectTable)
      .where(after ? lt(projectTable.uuid, after) : undefined)
      .orderBy(desc(projectTable.uuid))
      .limit(limit)
  }
}
```

`view-project-index.response.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger'
import type { Project } from '#src/app/project/entities/project.table.js'
import { ViewProjectIndexQueryKey } from '#src/app/project/use-cases/view-project-index/query/view-project-index.query.js'
import {
  PaginatedKeysetResponse,
  PaginatedKeysetResponseMeta,
} from '#src/utils/pagination/keyset/paginated-keyset.response.js'

export class ProjectSummary {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly uuid: string

  @ApiProperty({ type: String, example: 'Demo' })
  readonly name: string

  @ApiProperty({ type: String, example: 'demo' })
  readonly slug: string

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: string

  constructor(project: Project) {
    this.uuid = project.uuid
    this.name = project.name
    this.slug = project.slug
    this.createdAt = project.createdAt.toISOString()
  }
}

export class ViewProjectIndexResponseMeta extends PaginatedKeysetResponseMeta {
  @ApiProperty({ type: ViewProjectIndexQueryKey, nullable: true })
  declare readonly next: ViewProjectIndexQueryKey | null

  constructor(projects: Project[]) {
    super(ViewProjectIndexQueryKey.nextKey(projects))
  }
}

export class ViewProjectIndexResponse extends PaginatedKeysetResponse<ProjectSummary> {
  @ApiProperty({ type: [ProjectSummary] })
  declare readonly items: ProjectSummary[]

  @ApiProperty({ type: ViewProjectIndexResponseMeta })
  declare readonly meta: ViewProjectIndexResponseMeta

  constructor(projects: Project[]) {
    super(
      projects.map((project) => new ProjectSummary(project)),
      new ViewProjectIndexResponseMeta(projects),
    )
  }
}
```

`view-project-index.use-case.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { ViewProjectIndexQuery } from '#src/app/project/use-cases/view-project-index/query/view-project-index.query.js'
import { ViewProjectIndexRepository } from '#src/app/project/use-cases/view-project-index/view-project-index.repository.js'
import { ViewProjectIndexResponse } from '#src/app/project/use-cases/view-project-index/view-project-index.response.js'
import { keysetLimit } from '#src/utils/pagination/pagination-mapper.js'

@Injectable()
export class ViewProjectIndexUseCase {
  constructor(private readonly repository: ViewProjectIndexRepository) {}

  async execute(query: ViewProjectIndexQuery): Promise<ViewProjectIndexResponse> {
    const projects = await this.repository.listProjects(
      keysetLimit(query.pagination),
      query.pagination?.key?.uuid,
    )
    return new ViewProjectIndexResponse(projects)
  }
}
```

`view-project-index.controller.ts`:

```ts
import { Controller, Get, Query } from '@nestjs/common'
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { ViewProjectIndexQuery } from '#src/app/project/use-cases/view-project-index/query/view-project-index.query.js'
import { ViewProjectIndexResponse } from '#src/app/project/use-cases/view-project-index/view-project-index.response.js'
import { ViewProjectIndexUseCase } from '#src/app/project/use-cases/view-project-index/view-project-index.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('projects')
@Controller({ path: 'projects', version: '1' })
export class ViewProjectIndexController {
  constructor(private readonly usecase: ViewProjectIndexUseCase) {}

  @Get()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiOkResponse({ type: ViewProjectIndexResponse })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(@Query() query: ViewProjectIndexQuery): Promise<ViewProjectIndexResponse> {
    return this.usecase.execute(query)
  }
}
```

`view-project-index.module.ts`: `@Module({ controllers: [ViewProjectIndexController], providers: [ViewProjectIndexUseCase, ViewProjectIndexRepository] })` exporting `ViewProjectIndexModule`.

`tests/view-project-index.e2e.test.ts`:

```ts
import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'
import { projectTable } from '#src/app/project/entities/project.table.js'
import { ViewProjectIndexQueryBuilder } from '#src/app/project/use-cases/view-project-index/query/view-project-index.query.builder.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('GET /api/v1/projects (e2e)', () => {
  let setup: TestSetup
  let cookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
    await setup.db
      .insert(projectTable)
      .values([
        new ProjectBuilder().withSlug('alpha').withName('Alpha').build(),
        new ProjectBuilder().withSlug('beta').withName('Beta').build(),
      ])
  })

  after(async () => {
    await setup.teardown()
  })

  it('lists projects newest first', async () => {
    const response = await request(setup.httpServer)
      .get('/api/v1/projects')
      .set('Cookie', cookie)
      .expect(200)

    expect(response.body.items.map((p: { slug: string }) => p.slug)).toEqual(['beta', 'alpha'])
  })

  it('returns one page plus a cursor when a limit is given', async () => {
    const response = await request(setup.httpServer)
      .get('/api/v1/projects')
      .query(new ViewProjectIndexQueryBuilder().withLimit(1).build())
      .set('Cookie', cookie)
      .expect(200)

    expect(response.body.items).toHaveLength(1)
    expect(response.body.meta.next.uuid).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).get('/api/v1/projects').expect(401)
  })
})
```

- [ ] **Step 5: Write the failing delete-project tests**

`tests/delete-project.use-case.unit.test.ts`:

```ts
import { before, describe, it } from 'node:test'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { DeleteProjectRepository } from '#src/app/project/use-cases/delete-project/delete-project.repository.js'
import { DeleteProjectUseCase } from '#src/app/project/use-cases/delete-project/delete-project.use-case.js'
import { TestBench } from '#src/test/setup/test-bench.js'

function build(outcome: 'deleted' | 'not-found' | 'in-use') {
  const repository = createStubInstance(DeleteProjectRepository)
  repository.delete.resolves(outcome)
  return new DeleteProjectUseCase(repository)
}

describe('DeleteProjectUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('deletes an empty project', async () => {
    await build('deleted').execute('demo')
  })

  it('throws 404 for an unknown project', async () => {
    await expect(build('not-found').execute('ghost')).rejects.toThrow(NotFoundException)
  })

  it('throws 409 while the project still has environments', async () => {
    await expect(build('in-use').execute('demo')).rejects.toThrow(ConflictException)
  })
})
```

`tests/delete-project.e2e.test.ts`:

```ts
import { after, before, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import request from 'supertest'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'
import { projectTable } from '#src/app/project/entities/project.table.js'
import { seedEnvironment } from '#src/test/fixtures/seed-environment.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('DELETE /api/v1/projects/:slug (e2e)', () => {
  let setup: TestSetup
  let cookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
  })

  after(async () => {
    await setup.teardown()
  })

  it('deletes an empty project', async () => {
    await setup.db.insert(projectTable).values(new ProjectBuilder().withSlug('empty').build())

    await request(setup.httpServer)
      .delete('/api/v1/projects/empty')
      .set('Cookie', cookie)
      .expect(204)

    expect(
      await setup.db.select().from(projectTable).where(eq(projectTable.slug, 'empty')),
    ).toEqual([])
  })

  it('refuses a project that still has an environment with 409', async () => {
    const { project } = await seedEnvironment(setup.db)

    await request(setup.httpServer)
      .delete(`/api/v1/projects/${project.slug}`)
      .set('Cookie', cookie)
      .expect(409)
  })

  it('returns 404 for an unknown project and 401 without a session', async () => {
    await request(setup.httpServer)
      .delete('/api/v1/projects/ghost')
      .set('Cookie', cookie)
      .expect(404)
    await request(setup.httpServer).delete('/api/v1/projects/ghost').expect(401)
  })
})
```

- [ ] **Step 6: Implement delete-project**

`delete-project.repository.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { projectTable } from '#src/app/project/entities/project.table.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { isForeignKeyViolation } from '#src/modules/database/postgres-errors.js'

@Injectable()
export class DeleteProjectRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  // The environment FK is RESTRICT, so a project with environments fails here, race-free.
  async delete(slug: string): Promise<'deleted' | 'not-found' | 'in-use'> {
    try {
      const rows = await this.db
        .delete(projectTable)
        .where(eq(projectTable.slug, slug))
        .returning({ uuid: projectTable.uuid })
      return rows.length > 0 ? 'deleted' : 'not-found'
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        return 'in-use'
      }
      throw error
    }
  }
}
```

`delete-project.use-case.ts`:

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DeleteProjectRepository } from '#src/app/project/use-cases/delete-project/delete-project.repository.js'

@Injectable()
export class DeleteProjectUseCase {
  constructor(private readonly repository: DeleteProjectRepository) {}

  async execute(slug: string): Promise<void> {
    const outcome = await this.repository.delete(slug)
    if (outcome === 'not-found') {
      throw new NotFoundException(`Project '${slug}' was not found.`)
    }
    if (outcome === 'in-use') {
      throw new ConflictException(`Project '${slug}' still has environments. Delete them first.`)
    }
  }
}
```

`delete-project.controller.ts`:

```ts
import { Controller, Delete, HttpCode, Param } from '@nestjs/common'
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { DeleteProjectUseCase } from '#src/app/project/use-cases/delete-project/delete-project.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('projects')
@Controller({ path: 'projects/:slug', version: '1' })
export class DeleteProjectController {
  constructor(private readonly usecase: DeleteProjectUseCase) {}

  @Delete()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'The project was deleted.' })
  @ApiNotFoundResponse({ description: 'No project with that slug.' })
  @ApiConflictResponse({ description: 'The project still has environments.' })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(@Param('slug') slug: string): Promise<void> {
    return this.usecase.execute(slug)
  }
}
```

`delete-project.module.ts`: `@Module({ controllers: [DeleteProjectController], providers: [DeleteProjectUseCase, DeleteProjectRepository] })` exporting `DeleteProjectModule`.

- [ ] **Step 7: Feature module + registration**

`apps/api/src/app/project/project.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { CreateProjectModule } from '#src/app/project/use-cases/create-project/create-project.module.js'
import { DeleteProjectModule } from '#src/app/project/use-cases/delete-project/delete-project.module.js'
import { ViewProjectIndexModule } from '#src/app/project/use-cases/view-project-index/view-project-index.module.js'

@Module({
  imports: [CreateProjectModule, ViewProjectIndexModule, DeleteProjectModule],
})
export class ProjectModule {}
```

In `apps/api/src/modules/api/api.module.ts` add `ProjectModule` to the `AppModule.forRoot([...])` list (before `ReleaseModule`) with its import.

- [ ] **Step 8: Run tests, lint, commit**

```bash
pnpm --filter api test
pnpm --filter api lint
npx prettier --write apps/api/src/app/project apps/api/src/modules/database/postgres-errors.ts apps/api/src/modules/api/api.module.ts
git add apps/api/src/app/project apps/api/src/modules/database/postgres-errors.ts apps/api/src/modules/api/api.module.ts
git commit -m "feat: create, list and delete projects

Refs #142"
```

Expected: all new unit + e2e cases PASS.

---

### Task 4: `environment/` feature — create (provisions namespace), list, delete (destroys namespace)

**Files:**

- Create: `apps/api/src/app/environment/environment.module.ts`
- Create: `apps/api/src/app/environment/use-cases/create-environment/{create-environment.command,create-environment.command.builder,create-environment.controller,create-environment.module,create-environment.repository,create-environment.response,create-environment.use-case}.ts` + `tests/{create-environment.use-case.unit,create-environment.e2e}.test.ts`
- Create: `apps/api/src/app/environment/use-cases/view-environment-index/{…controller,…module,…repository,…response,…use-case}.ts`, `query/{view-environment-index.query,view-environment-index.query.builder}.ts` + `tests/view-environment-index.e2e.test.ts`
- Create: `apps/api/src/app/environment/use-cases/delete-environment/{…controller,…module,…repository,…use-case}.ts` + `tests/{delete-environment.use-case.unit,delete-environment.e2e}.test.ts`
- Modify: `apps/api/src/modules/api/api.module.ts`

**Interfaces:**

- Consumes: Task 1 entities + `namespaceOf` + `seedEnvironment`; Task 2 `NamespaceBackend`, `NamespaceConflictError`, `MockNamespaceBackend`, `KubernetesModule`; Task 3 `isForeignKeyViolation`.
- Produces:
  - `POST /v1/projects/:projectSlug/environments` → 201 `CreateEnvironmentResponse { uuid, name, slug, namespace, projectSlug }`; 404 unknown project; 409 duplicate slug or namespace conflict; 502 cluster failure
  - `GET /v1/projects/:projectSlug/environments` → `ViewEnvironmentIndexResponse { items: EnvironmentSummary[] { uuid, name, slug, namespace, createdAt }, meta: { next: ViewEnvironmentIndexQueryKey | null } }`; 404 unknown project
  - `DELETE /v1/projects/:projectSlug/environments/:environmentSlug` → 204; 404; 409 while it has apps; 502 cluster failure
  - operationIds: `createEnvironmentV1`, `viewEnvironmentIndexV1`, `deleteEnvironmentV1`

- [ ] **Step 1: Write the failing create-environment unit test**

`tests/create-environment.use-case.unit.test.ts`:

```ts
import { before, describe, it } from 'node:test'
import { BadGatewayException, ConflictException, NotFoundException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'
import { CreateEnvironmentCommandBuilder } from '#src/app/environment/use-cases/create-environment/create-environment.command.builder.js'
import { CreateEnvironmentRepository } from '#src/app/environment/use-cases/create-environment/create-environment.repository.js'
import { CreateEnvironmentUseCase } from '#src/app/environment/use-cases/create-environment/create-environment.use-case.js'
import { MockNamespaceBackend } from '#src/modules/kubernetes/mock-namespace-backend.js'
import { NamespaceConflictError } from '#src/modules/kubernetes/namespace-backend.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const project = new ProjectBuilder().withSlug('demo').build()

function build() {
  const repository = createStubInstance(CreateEnvironmentRepository)
  repository.findProjectBySlug.resolves(project)
  // Runs the provision callback the way the real transaction does.
  repository.insertThen.callsFake(async (_environment, afterInsert) => {
    await afterInsert()
    return true
  })
  const namespaces = createStubInstance(MockNamespaceBackend)
  namespaces.provision.resolves()
  return { usecase: new CreateEnvironmentUseCase(repository, namespaces), repository, namespaces }
}

const command = () => new CreateEnvironmentCommandBuilder().withName('Dev').withSlug('dev').build()

describe('CreateEnvironmentUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('stores the environment and provisions its derived namespace', async () => {
    const { usecase, repository, namespaces } = build()

    const result = await usecase.execute('demo', command())

    const [environment] = repository.insertThen.firstCall.args
    expect(environment).toMatchObject({ projectUuid: project.uuid, name: 'Dev', slug: 'dev' })
    expect(namespaces.provision.calledOnceWithExactly('demo-dev', environment.uuid)).toBe(true)
    expect(result).toMatchObject({ slug: 'dev', namespace: 'demo-dev', projectSlug: 'demo' })
  })

  it('throws 404 for an unknown project and provisions nothing', async () => {
    const { usecase, repository, namespaces } = build()
    repository.findProjectBySlug.resolves(undefined)

    await expect(usecase.execute('ghost', command())).rejects.toThrow(NotFoundException)
    expect(namespaces.provision.called).toBe(false)
  })

  it('throws 409 when the slug is taken in this project', async () => {
    const { usecase, repository } = build()
    repository.insertThen.resolves(false)

    await expect(usecase.execute('demo', command())).rejects.toThrow(ConflictException)
  })

  it('maps a namespace conflict to 409', async () => {
    const { usecase, namespaces } = build()
    namespaces.provision.rejects(new NamespaceConflictError('taken'))

    await expect(usecase.execute('demo', command())).rejects.toThrow(ConflictException)
  })

  it('maps any other cluster failure to 502', async () => {
    const { usecase, namespaces } = build()
    namespaces.provision.rejects(new Error('connection refused'))

    await expect(usecase.execute('demo', command())).rejects.toThrow(BadGatewayException)
  })
})
```

Run: `pnpm --filter api test` → FAIL (modules missing).

- [ ] **Step 2: Implement create-environment**

`create-environment.command.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator'
import {
  ENVIRONMENT_NAME_MAX_LENGTH,
  ENVIRONMENT_SLUG_MAX_LENGTH,
} from '#src/app/environment/entities/environment-config.constants.js'
import { DNS_LABEL_PATTERN } from '#src/utils/dns-label.js'

export class CreateEnvironmentCommand {
  @ApiProperty({ type: String, example: 'Development', maxLength: ENVIRONMENT_NAME_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(ENVIRONMENT_NAME_MAX_LENGTH)
  name!: string

  @ApiProperty({
    type: String,
    example: 'dev',
    description: 'Unique within the project; second half of the namespace name.',
    pattern: DNS_LABEL_PATTERN.source,
    maxLength: ENVIRONMENT_SLUG_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(ENVIRONMENT_SLUG_MAX_LENGTH)
  @Matches(DNS_LABEL_PATTERN, { message: 'slug must be a valid DNS-1123 label' })
  slug!: string
}
```

`create-environment.command.builder.ts`:

```ts
import { CreateEnvironmentCommand } from '#src/app/environment/use-cases/create-environment/create-environment.command.js'

export class CreateEnvironmentCommandBuilder {
  private readonly command: CreateEnvironmentCommand

  constructor() {
    this.command = new CreateEnvironmentCommand()
    this.command.name = 'Production'
    this.command.slug = 'production'
  }

  withName(name: string): this {
    this.command.name = name
    return this
  }

  withSlug(slug: string): this {
    this.command.slug = slug
    return this
  }

  build(): CreateEnvironmentCommand {
    return this.command
  }
}
```

`create-environment.repository.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import {
  type Environment,
  environmentTable,
} from '#src/app/environment/entities/environment.table.js'
import { type Project, projectTable } from '#src/app/project/entities/project.table.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class CreateEnvironmentRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findProjectBySlug(slug: string): Promise<Project | undefined> {
    const [project] = await this.db
      .select()
      .from(projectTable)
      .where(eq(projectTable.slug, slug))
      .limit(1)
    return project
  }

  // afterInsert runs inside the transaction: if it throws, the row is rolled back with it.
  async insertThen(environment: Environment, afterInsert: () => Promise<void>): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .insert(environmentTable)
        .values(environment)
        .onConflictDoNothing({ target: [environmentTable.projectUuid, environmentTable.slug] })
        .returning({ uuid: environmentTable.uuid })
      if (rows.length === 0) {
        return false
      }
      await afterInsert()
      return true
    })
  }
}
```

`create-environment.response.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import { namespaceOf } from '#src/app/environment/entities/namespace.js'
import type { Project } from '#src/app/project/entities/project.table.js'

export class CreateEnvironmentResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly uuid: string

  @ApiProperty({ type: String, example: 'Development' })
  readonly name: string

  @ApiProperty({ type: String, example: 'dev' })
  readonly slug: string

  @ApiProperty({ type: String, example: 'demo-dev' })
  readonly namespace: string

  @ApiProperty({ type: String, example: 'demo' })
  readonly projectSlug: string

  constructor(project: Project, environment: Environment) {
    this.uuid = environment.uuid
    this.name = environment.name
    this.slug = environment.slug
    this.namespace = namespaceOf(project, environment)
    this.projectSlug = project.slug
  }
}
```

`create-environment.use-case.ts`:

```ts
import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { EnvironmentBuilder } from '#src/app/environment/entities/environment.builder.js'
import { namespaceOf } from '#src/app/environment/entities/namespace.js'
import { CreateEnvironmentCommand } from '#src/app/environment/use-cases/create-environment/create-environment.command.js'
import { CreateEnvironmentRepository } from '#src/app/environment/use-cases/create-environment/create-environment.repository.js'
import { CreateEnvironmentResponse } from '#src/app/environment/use-cases/create-environment/create-environment.response.js'
import {
  NamespaceBackend,
  NamespaceConflictError,
} from '#src/modules/kubernetes/namespace-backend.js'

@Injectable()
export class CreateEnvironmentUseCase {
  constructor(
    private readonly repository: CreateEnvironmentRepository,
    private readonly namespaces: NamespaceBackend,
  ) {}

  async execute(
    projectSlug: string,
    command: CreateEnvironmentCommand,
  ): Promise<CreateEnvironmentResponse> {
    const project = await this.repository.findProjectBySlug(projectSlug)
    if (!project) {
      throw new NotFoundException(`Project '${projectSlug}' was not found.`)
    }

    const environment = new EnvironmentBuilder()
      .withProject(project)
      .withName(command.name)
      .withSlug(command.slug)
      .build()
    const namespace = namespaceOf(project, environment)

    const created = await this.repository.insertThen(environment, () =>
      this.provision(namespace, environment.uuid),
    )
    if (!created) {
      throw new ConflictException(
        `Project '${projectSlug}' already has an environment '${command.slug}'.`,
      )
    }

    return new CreateEnvironmentResponse(project, environment)
  }

  private async provision(namespace: string, environmentUuid: string): Promise<void> {
    try {
      await this.namespaces.provision(namespace, environmentUuid)
    } catch (error) {
      if (error instanceof NamespaceConflictError) {
        throw new ConflictException(error.message)
      }
      throw new BadGatewayException(
        `Could not create namespace '${namespace}' on the cluster. Please try again.`,
        { cause: error },
      )
    }
  }
}
```

`create-environment.controller.ts`:

```ts
import { Body, Controller, Param, Post } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { CreateEnvironmentCommand } from '#src/app/environment/use-cases/create-environment/create-environment.command.js'
import { CreateEnvironmentResponse } from '#src/app/environment/use-cases/create-environment/create-environment.response.js'
import { CreateEnvironmentUseCase } from '#src/app/environment/use-cases/create-environment/create-environment.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('environments')
@Controller({ path: 'projects/:projectSlug/environments', version: '1' })
export class CreateEnvironmentController {
  constructor(private readonly usecase: CreateEnvironmentUseCase) {}

  @Post()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiCreatedResponse({ type: CreateEnvironmentResponse })
  @ApiBadRequestResponse({ description: 'Malformed body, or an invalid name / slug.' })
  @ApiNotFoundResponse({ description: 'No project with that slug.' })
  @ApiConflictResponse({
    description: 'The slug is taken in this project, or its namespace is taken or still deleting.',
  })
  @ApiResponse({ status: 502, description: 'The namespace could not be created on the cluster.' })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(
    @Param('projectSlug') projectSlug: string,
    @Body() command: CreateEnvironmentCommand,
  ): Promise<CreateEnvironmentResponse> {
    return this.usecase.execute(projectSlug, command)
  }
}
```

`create-environment.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { CreateEnvironmentController } from '#src/app/environment/use-cases/create-environment/create-environment.controller.js'
import { CreateEnvironmentRepository } from '#src/app/environment/use-cases/create-environment/create-environment.repository.js'
import { CreateEnvironmentUseCase } from '#src/app/environment/use-cases/create-environment/create-environment.use-case.js'
import { KubernetesModule } from '#src/modules/kubernetes/kubernetes.module.js'

@Module({
  imports: [KubernetesModule],
  controllers: [CreateEnvironmentController],
  providers: [CreateEnvironmentUseCase, CreateEnvironmentRepository],
})
export class CreateEnvironmentModule {}
```

`tests/create-environment.e2e.test.ts` — also proves the rollback: a stubbed provision failure leaves no row.

```ts
import { after, afterEach, before, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import { type SinonStub, stub } from 'sinon'
import request from 'supertest'
import { environmentTable } from '#src/app/environment/entities/environment.table.js'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'
import { projectTable } from '#src/app/project/entities/project.table.js'
import { NamespaceBackend } from '#src/modules/kubernetes/namespace-backend.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('POST /api/v1/projects/:projectSlug/environments (e2e)', () => {
  let setup: TestSetup
  let cookie: string
  let provision: SinonStub | undefined

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
    await setup.db.insert(projectTable).values(new ProjectBuilder().withSlug('demo').build())
  })

  afterEach(() => provision?.restore())

  after(async () => {
    await setup.teardown()
  })

  const post = (slug: string) =>
    request(setup.httpServer)
      .post('/api/v1/projects/demo/environments')
      .set('Cookie', cookie)
      .send({ name: 'Dev', slug })

  it('creates the environment and reports its namespace', async () => {
    const response = await post('dev').expect(201)

    expect(response.body).toMatchObject({ slug: 'dev', namespace: 'demo-dev', projectSlug: 'demo' })
  })

  it('rejects a duplicate slug in the same project with 409', async () => {
    await post('dev').expect(409)
  })

  it('rolls the row back when the namespace cannot be created', async () => {
    const namespaces = setup.app.get(NamespaceBackend)
    provision = stub(namespaces, 'provision').rejects(new Error('cluster down'))

    await post('staging').expect(502)

    const rows = await setup.db
      .select()
      .from(environmentTable)
      .where(eq(environmentTable.slug, 'staging'))
    expect(rows).toEqual([])
  })

  it('returns 404 for an unknown project, 400 for a bad slug, 401 without a session', async () => {
    await request(setup.httpServer)
      .post('/api/v1/projects/ghost/environments')
      .set('Cookie', cookie)
      .send({ name: 'Dev', slug: 'dev' })
      .expect(404)
    await post('Not_A_Label').expect(400)
    await request(setup.httpServer).post('/api/v1/projects/demo/environments').send({}).expect(401)
  })
})
```

`setup.app.get(NamespaceBackend)` is the single shared mock: `KubernetesModule` is imported (not re-listed) by each use-case module, so Nest instantiates its providers once. Stubbing that instance is what every use-case sees.

- [ ] **Step 3: view-environment-index**

Mirror Task 3's project index, scoped to one project (404 if the project is unknown). Files, full content:

`query/view-environment-index.query.ts` — identical in shape to `view-project-index.query.ts` with every `Project`/`ProjectUuid`/`projectTable` → `Environment`/`EnvironmentUuid`, class prefix `ViewEnvironmentIndex`, imports from `#src/app/environment/entities/environment.table.js` / `environment.uuid.js`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsNotEmpty, IsObject, IsOptional, IsUUID, ValidateNested } from 'class-validator'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import {
  PaginatedKeysetQuery,
  PaginatedKeysetSearchQuery,
} from '#src/utils/pagination/keyset/paginated-keyset.query.js'

export class ViewEnvironmentIndexQueryKey {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  uuid!: EnvironmentUuid

  static from(environment: Environment): ViewEnvironmentIndexQueryKey {
    const key = new ViewEnvironmentIndexQueryKey()
    key.uuid = environment.uuid
    return key
  }

  static nextKey(environments: Environment[]): ViewEnvironmentIndexQueryKey | null {
    const last = environments.at(-1)
    return last ? this.from(last) : null
  }
}

export class ViewEnvironmentIndexPaginationQuery extends PaginatedKeysetQuery {
  @ApiPropertyOptional({ type: ViewEnvironmentIndexQueryKey, nullable: true })
  @IsOptional()
  @Type(() => ViewEnvironmentIndexQueryKey)
  @ValidateNested()
  @IsObject()
  declare key?: ViewEnvironmentIndexQueryKey | null
}

export class ViewEnvironmentIndexQuery extends PaginatedKeysetSearchQuery {
  @ApiPropertyOptional({ type: ViewEnvironmentIndexPaginationQuery })
  @IsOptional()
  @Type(() => ViewEnvironmentIndexPaginationQuery)
  @ValidateNested()
  declare pagination?: ViewEnvironmentIndexPaginationQuery
}
```

`query/view-environment-index.query.builder.ts`:

```ts
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import {
  ViewEnvironmentIndexPaginationQuery,
  ViewEnvironmentIndexQuery,
  ViewEnvironmentIndexQueryKey,
} from '#src/app/environment/use-cases/view-environment-index/query/view-environment-index.query.js'
import { KeysetQueryBuilder } from '#src/utils/pagination/keyset/keyset-query.builder.js'

export class ViewEnvironmentIndexQueryBuilder extends KeysetQueryBuilder<
  ViewEnvironmentIndexQuery,
  ViewEnvironmentIndexPaginationQuery,
  ViewEnvironmentIndexQueryKey
> {
  constructor() {
    super(new ViewEnvironmentIndexQuery(), new ViewEnvironmentIndexPaginationQuery())
  }

  withCursorAt(environment: Environment): this {
    return this.withKey(ViewEnvironmentIndexQueryKey.from(environment))
  }
}
```

`view-environment-index.repository.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { and, desc, eq, lt } from 'drizzle-orm'
import {
  type Environment,
  environmentTable,
} from '#src/app/environment/entities/environment.table.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import { type Project, projectTable } from '#src/app/project/entities/project.table.js'
import type { ProjectUuid } from '#src/app/project/entities/project.uuid.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewEnvironmentIndexRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findProjectBySlug(slug: string): Promise<Project | undefined> {
    const [project] = await this.db
      .select()
      .from(projectTable)
      .where(eq(projectTable.slug, slug))
      .limit(1)
    return project
  }

  async listEnvironments(
    projectUuid: ProjectUuid,
    limit: number,
    after?: EnvironmentUuid | null,
  ): Promise<Environment[]> {
    return this.db
      .select()
      .from(environmentTable)
      .where(
        and(
          eq(environmentTable.projectUuid, projectUuid),
          after ? lt(environmentTable.uuid, after) : undefined,
        ),
      )
      .orderBy(desc(environmentTable.uuid))
      .limit(limit)
  }
}
```

`view-environment-index.response.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import { namespaceOf } from '#src/app/environment/entities/namespace.js'
import { ViewEnvironmentIndexQueryKey } from '#src/app/environment/use-cases/view-environment-index/query/view-environment-index.query.js'
import type { Project } from '#src/app/project/entities/project.table.js'
import {
  PaginatedKeysetResponse,
  PaginatedKeysetResponseMeta,
} from '#src/utils/pagination/keyset/paginated-keyset.response.js'

export class EnvironmentSummary {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly uuid: string

  @ApiProperty({ type: String, example: 'Development' })
  readonly name: string

  @ApiProperty({ type: String, example: 'dev' })
  readonly slug: string

  @ApiProperty({ type: String, example: 'demo-dev' })
  readonly namespace: string

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: string

  constructor(project: Project, environment: Environment) {
    this.uuid = environment.uuid
    this.name = environment.name
    this.slug = environment.slug
    this.namespace = namespaceOf(project, environment)
    this.createdAt = environment.createdAt.toISOString()
  }
}

export class ViewEnvironmentIndexResponseMeta extends PaginatedKeysetResponseMeta {
  @ApiProperty({ type: ViewEnvironmentIndexQueryKey, nullable: true })
  declare readonly next: ViewEnvironmentIndexQueryKey | null

  constructor(environments: Environment[]) {
    super(ViewEnvironmentIndexQueryKey.nextKey(environments))
  }
}

export class ViewEnvironmentIndexResponse extends PaginatedKeysetResponse<EnvironmentSummary> {
  @ApiProperty({ type: [EnvironmentSummary] })
  declare readonly items: EnvironmentSummary[]

  @ApiProperty({ type: ViewEnvironmentIndexResponseMeta })
  declare readonly meta: ViewEnvironmentIndexResponseMeta

  constructor(project: Project, environments: Environment[]) {
    super(
      environments.map((environment) => new EnvironmentSummary(project, environment)),
      new ViewEnvironmentIndexResponseMeta(environments),
    )
  }
}
```

`view-environment-index.use-case.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common'
import { ViewEnvironmentIndexQuery } from '#src/app/environment/use-cases/view-environment-index/query/view-environment-index.query.js'
import { ViewEnvironmentIndexRepository } from '#src/app/environment/use-cases/view-environment-index/view-environment-index.repository.js'
import { ViewEnvironmentIndexResponse } from '#src/app/environment/use-cases/view-environment-index/view-environment-index.response.js'
import { keysetLimit } from '#src/utils/pagination/pagination-mapper.js'

@Injectable()
export class ViewEnvironmentIndexUseCase {
  constructor(private readonly repository: ViewEnvironmentIndexRepository) {}

  async execute(
    projectSlug: string,
    query: ViewEnvironmentIndexQuery,
  ): Promise<ViewEnvironmentIndexResponse> {
    const project = await this.repository.findProjectBySlug(projectSlug)
    if (!project) {
      throw new NotFoundException(`Project '${projectSlug}' was not found.`)
    }
    const environments = await this.repository.listEnvironments(
      project.uuid,
      keysetLimit(query.pagination),
      query.pagination?.key?.uuid,
    )
    return new ViewEnvironmentIndexResponse(project, environments)
  }
}
```

`view-environment-index.controller.ts`:

```ts
import { Controller, Get, Param, Query } from '@nestjs/common'
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { ViewEnvironmentIndexQuery } from '#src/app/environment/use-cases/view-environment-index/query/view-environment-index.query.js'
import { ViewEnvironmentIndexResponse } from '#src/app/environment/use-cases/view-environment-index/view-environment-index.response.js'
import { ViewEnvironmentIndexUseCase } from '#src/app/environment/use-cases/view-environment-index/view-environment-index.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('environments')
@Controller({ path: 'projects/:projectSlug/environments', version: '1' })
export class ViewEnvironmentIndexController {
  constructor(private readonly usecase: ViewEnvironmentIndexUseCase) {}

  @Get()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiOkResponse({ type: ViewEnvironmentIndexResponse })
  @ApiNotFoundResponse({ description: 'No project with that slug.' })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(
    @Param('projectSlug') projectSlug: string,
    @Query() query: ViewEnvironmentIndexQuery,
  ): Promise<ViewEnvironmentIndexResponse> {
    return this.usecase.execute(projectSlug, query)
  }
}
```

`view-environment-index.module.ts`: `@Module({ controllers: [ViewEnvironmentIndexController], providers: [ViewEnvironmentIndexUseCase, ViewEnvironmentIndexRepository] })` exporting `ViewEnvironmentIndexModule`.

`tests/view-environment-index.e2e.test.ts`:

```ts
import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { EnvironmentBuilder } from '#src/app/environment/entities/environment.builder.js'
import { environmentTable } from '#src/app/environment/entities/environment.table.js'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'
import { projectTable } from '#src/app/project/entities/project.table.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('GET /api/v1/projects/:projectSlug/environments (e2e)', () => {
  let setup: TestSetup
  let cookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
    const demo = new ProjectBuilder().withSlug('demo').build()
    const other = new ProjectBuilder().withSlug('other').build()
    await setup.db.insert(projectTable).values([demo, other])
    await setup.db
      .insert(environmentTable)
      .values([
        new EnvironmentBuilder().withProject(demo).withSlug('dev').build(),
        new EnvironmentBuilder().withProject(other).withSlug('prod').build(),
      ])
  })

  after(async () => {
    await setup.teardown()
  })

  it("lists only that project's environments with their namespaces", async () => {
    const response = await request(setup.httpServer)
      .get('/api/v1/projects/demo/environments')
      .set('Cookie', cookie)
      .expect(200)

    expect(response.body.items).toHaveLength(1)
    expect(response.body.items[0]).toMatchObject({ slug: 'dev', namespace: 'demo-dev' })
  })

  it('returns 404 for an unknown project and 401 without a session', async () => {
    await request(setup.httpServer)
      .get('/api/v1/projects/ghost/environments')
      .set('Cookie', cookie)
      .expect(404)
    await request(setup.httpServer).get('/api/v1/projects/demo/environments').expect(401)
  })
})
```

- [ ] **Step 4: Write the failing delete-environment unit test**

`tests/delete-environment.use-case.unit.test.ts`:

```ts
import { before, describe, it } from 'node:test'
import { BadGatewayException, ConflictException, NotFoundException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { EnvironmentBuilder } from '#src/app/environment/entities/environment.builder.js'
import { DeleteEnvironmentRepository } from '#src/app/environment/use-cases/delete-environment/delete-environment.repository.js'
import { DeleteEnvironmentUseCase } from '#src/app/environment/use-cases/delete-environment/delete-environment.use-case.js'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'
import { MockNamespaceBackend } from '#src/modules/kubernetes/mock-namespace-backend.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const project = new ProjectBuilder().withSlug('demo').build()
const environment = new EnvironmentBuilder().withProject(project).withSlug('dev').build()

function build() {
  const repository = createStubInstance(DeleteEnvironmentRepository)
  repository.findBySlugs.resolves({ project, environment })
  repository.deleteThen.callsFake(async (_uuid, afterDelete) => {
    await afterDelete()
    return 'deleted'
  })
  const namespaces = createStubInstance(MockNamespaceBackend)
  namespaces.destroy.resolves()
  return { usecase: new DeleteEnvironmentUseCase(repository, namespaces), repository, namespaces }
}

describe('DeleteEnvironmentUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('deletes the row and destroys its namespace', async () => {
    const { usecase, repository, namespaces } = build()

    await usecase.execute('demo', 'dev')

    expect(repository.deleteThen.firstCall.args[0]).toBe(environment.uuid)
    expect(namespaces.destroy.calledOnceWithExactly('demo-dev')).toBe(true)
  })

  it('throws 404 for an unknown environment', async () => {
    const { usecase, repository } = build()
    repository.findBySlugs.resolves(undefined)

    await expect(usecase.execute('demo', 'ghost')).rejects.toThrow(NotFoundException)
  })

  it('throws 409 while the environment still has apps and leaves the namespace alone', async () => {
    const { usecase, repository, namespaces } = build()
    repository.deleteThen.resolves('in-use')

    await expect(usecase.execute('demo', 'dev')).rejects.toThrow(ConflictException)
    expect(namespaces.destroy.called).toBe(false)
  })

  it('throws 502 when the namespace cannot be deleted', async () => {
    const { usecase, namespaces } = build()
    namespaces.destroy.rejects(new Error('connection refused'))

    await expect(usecase.execute('demo', 'dev')).rejects.toThrow(BadGatewayException)
  })
})
```

- [ ] **Step 5: Implement delete-environment**

`delete-environment.repository.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import {
  type Environment,
  environmentTable,
} from '#src/app/environment/entities/environment.table.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import { type Project, projectTable } from '#src/app/project/entities/project.table.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { isForeignKeyViolation } from '#src/modules/database/postgres-errors.js'

@Injectable()
export class DeleteEnvironmentRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findBySlugs(
    projectSlug: string,
    environmentSlug: string,
  ): Promise<{ project: Project; environment: Environment } | undefined> {
    const [row] = await this.db
      .select({ project: projectTable, environment: environmentTable })
      .from(environmentTable)
      .innerJoin(projectTable, eq(environmentTable.projectUuid, projectTable.uuid))
      .where(and(eq(projectTable.slug, projectSlug), eq(environmentTable.slug, environmentSlug)))
      .limit(1)
    return row
  }

  // The app FK is RESTRICT, so the DELETE itself fails while apps remain — no check-then-act race.
  async deleteThen(
    uuid: EnvironmentUuid,
    afterDelete: () => Promise<void>,
  ): Promise<'deleted' | 'in-use'> {
    try {
      await this.db.transaction(async (tx) => {
        await tx.delete(environmentTable).where(eq(environmentTable.uuid, uuid))
        await afterDelete()
      })
      return 'deleted'
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        return 'in-use'
      }
      throw error
    }
  }
}
```

`delete-environment.use-case.ts`:

```ts
import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { namespaceOf } from '#src/app/environment/entities/namespace.js'
import { DeleteEnvironmentRepository } from '#src/app/environment/use-cases/delete-environment/delete-environment.repository.js'
import { NamespaceBackend } from '#src/modules/kubernetes/namespace-backend.js'

@Injectable()
export class DeleteEnvironmentUseCase {
  constructor(
    private readonly repository: DeleteEnvironmentRepository,
    private readonly namespaces: NamespaceBackend,
  ) {}

  async execute(projectSlug: string, environmentSlug: string): Promise<void> {
    const found = await this.repository.findBySlugs(projectSlug, environmentSlug)
    if (!found) {
      throw new NotFoundException(
        `Environment '${environmentSlug}' was not found in project '${projectSlug}'.`,
      )
    }
    const namespace = namespaceOf(found.project, found.environment)

    const outcome = await this.repository.deleteThen(found.environment.uuid, () =>
      this.destroy(namespace),
    )
    if (outcome === 'in-use') {
      throw new ConflictException(
        `Environment '${environmentSlug}' still has apps. Delete them first.`,
      )
    }
  }

  private async destroy(namespace: string): Promise<void> {
    try {
      await this.namespaces.destroy(namespace)
    } catch (error) {
      throw new BadGatewayException(
        `Could not delete namespace '${namespace}' from the cluster. Please try again.`,
        { cause: error },
      )
    }
  }
}
```

`delete-environment.controller.ts`:

```ts
import { Controller, Delete, HttpCode, Param } from '@nestjs/common'
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { DeleteEnvironmentUseCase } from '#src/app/environment/use-cases/delete-environment/delete-environment.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('environments')
@Controller({ path: 'projects/:projectSlug/environments/:environmentSlug', version: '1' })
export class DeleteEnvironmentController {
  constructor(private readonly usecase: DeleteEnvironmentUseCase) {}

  @Delete()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'The environment and its namespace were deleted.' })
  @ApiNotFoundResponse({ description: 'No environment with that slug in the project.' })
  @ApiConflictResponse({ description: 'The environment still has apps.' })
  @ApiResponse({ status: 502, description: 'The namespace could not be deleted; nothing changed.' })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(
    @Param('projectSlug') projectSlug: string,
    @Param('environmentSlug') environmentSlug: string,
  ): Promise<void> {
    return this.usecase.execute(projectSlug, environmentSlug)
  }
}
```

`delete-environment.module.ts`: `@Module({ imports: [KubernetesModule], controllers: [DeleteEnvironmentController], providers: [DeleteEnvironmentUseCase, DeleteEnvironmentRepository] })` exporting `DeleteEnvironmentModule`.

`tests/delete-environment.e2e.test.ts`:

```ts
import { after, before, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import request from 'supertest'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { environmentTable } from '#src/app/environment/entities/environment.table.js'
import { seedEnvironment } from '#src/test/fixtures/seed-environment.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('DELETE /api/v1/projects/:projectSlug/environments/:environmentSlug (e2e)', () => {
  let setup: TestSetup
  let cookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
  })

  after(async () => {
    await setup.teardown()
  })

  it('refuses while an app lives there, then deletes once it is empty', async () => {
    const { project, environment } = await seedEnvironment(setup.db)
    const app = new AppBuilder().withSlug('env-delete-e2e').withEnvironment(environment).build()
    await setup.db.insert(appTable).values(app)
    const url = `/api/v1/projects/${project.slug}/environments/${environment.slug}`

    await request(setup.httpServer).delete(url).set('Cookie', cookie).expect(409)

    await setup.db.delete(appTable).where(eq(appTable.uuid, app.uuid))
    await request(setup.httpServer).delete(url).set('Cookie', cookie).expect(204)

    const rows = await setup.db
      .select()
      .from(environmentTable)
      .where(eq(environmentTable.uuid, environment.uuid))
    expect(rows).toEqual([])
  })

  it('returns 404 for an unknown environment and 401 without a session', async () => {
    await request(setup.httpServer)
      .delete('/api/v1/projects/ghost/environments/dev')
      .set('Cookie', cookie)
      .expect(404)
    await request(setup.httpServer).delete('/api/v1/projects/ghost/environments/dev').expect(401)
  })
})
```

- [ ] **Step 6: Feature module + registration**

`apps/api/src/app/environment/environment.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { CreateEnvironmentModule } from '#src/app/environment/use-cases/create-environment/create-environment.module.js'
import { DeleteEnvironmentModule } from '#src/app/environment/use-cases/delete-environment/delete-environment.module.js'
import { ViewEnvironmentIndexModule } from '#src/app/environment/use-cases/view-environment-index/view-environment-index.module.js'

@Module({
  imports: [CreateEnvironmentModule, ViewEnvironmentIndexModule, DeleteEnvironmentModule],
})
export class EnvironmentModule {}
```

Add `EnvironmentModule` to `ApiModule`'s `AppModule.forRoot([...])` list, right after `ProjectModule`.

- [ ] **Step 7: Run tests, lint, commit**

```bash
pnpm --filter api test
pnpm --filter api lint
npx prettier --write apps/api/src/app/environment apps/api/src/modules/api/api.module.ts
git add apps/api/src/app/environment apps/api/src/modules/api/api.module.ts
git commit -m "feat: create, list and delete environments with their namespaces

Refs #142"
```

Expected: PASS, including the rollback case (no `staging` row after a 502).

---

### Task 5: App reads and delete resolve the app's own namespace; app responses expose project/environment

**Files:**

- Create: `apps/api/src/app/app-management/entities/app-placement.response.ts`
- Create: `apps/api/src/app/app-management/use-cases/view-app-logs/view-app-logs.repository.ts`
- Modify: `view-app-index/{view-app-index.repository,view-app-index.response}.ts`
- Modify: `view-app-detail/{view-app-detail.repository,view-app-detail.use-case,view-app-detail.response}.ts`
- Modify: `view-app-health/{view-app-health.repository,view-app-health.use-case,view-app-health.controller}.ts`
- Modify: `view-app-logs/{view-app-logs.use-case,view-app-logs.module,view-app-logs.controller}.ts`
- Modify: `delete-app/{delete-app.repository,delete-app.use-case}.ts`
- Modify tests: `view-app-index`, `view-app-detail`, `view-app-health`, `view-app-logs`, `delete-app` (`tests/*`)

**Interfaces:**

- Consumes: `AppPlacement`, `selectAppPlacement`, `AppPlacementBuilder`, `namespaceOf`, `seedEnvironment` (Task 1).
- Produces:
  - `AppProjectRef { slug, name }`, `AppEnvironmentRef { uuid, slug, name }` — added as `project` / `environment` on `AppSummary` (index) and `ViewAppDetailResponse`.
  - `GET /apps/:slug/health` and `GET /apps/:slug/logs` now **404** for an unknown app (they need the app's namespace).
  - No remaining app-management import of `OPERATOR_APPS_NAMESPACE`.

- [ ] **Step 1: Wire refs**

`apps/api/src/app/app-management/entities/app-placement.response.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import type { Project } from '#src/app/project/entities/project.table.js'

export class AppProjectRef {
  @ApiProperty({ type: String, example: 'demo' })
  readonly slug: string

  @ApiProperty({ type: String, example: 'Demo' })
  readonly name: string

  constructor(project: Project) {
    this.slug = project.slug
    this.name = project.name
  }
}

export class AppEnvironmentRef {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly uuid: string

  @ApiProperty({ type: String, example: 'dev' })
  readonly slug: string

  @ApiProperty({ type: String, example: 'Development' })
  readonly name: string

  constructor(environment: Environment) {
    this.uuid = environment.uuid
    this.slug = environment.slug
    this.name = environment.name
  }
}
```

- [ ] **Step 2: Update tests first**

`delete-app.use-case.unit.test.ts` — the repository now returns a placement, and teardown targets the app's namespace:

```ts
it('tears down the cluster resources before deleting the rows', async () => {
  const placement = new AppPlacementBuilder()
    .withApp(new AppBuilder().withSlug('my-app').build())
    .build()
  const { repository, deployBackend, usecase } = build()
  repository.findBySlug.resolves(placement)

  await usecase.execute('my-app')

  expect(deployBackend.destroy.calledOnceWith('my-project-production', 'my-app')).toBe(true)
  expect(repository.deleteWithReleases.calledOnceWith(placement.app.uuid)).toBe(true)
  expect(
    deployBackend.destroy.getCall(0).calledBefore(repository.deleteWithReleases.getCall(0)),
  ).toBe(true)
})
```

(The 502 case: `repository.findBySlug.resolves(new AppPlacementBuilder().build())`.)

`view-app-detail.use-case.unit.test.ts` — `const placement = new AppPlacementBuilder().withApp(new AppBuilder().withSlug('my-app').withEnv({ A: '1' }).build()).build()` and `const app = placement.app`; `repository.findBySlug.resolves(placement)`; add:

```ts
it('reads the live release from the app’s own namespace and names its placement', async () => {
  const { deployBackend, usecase } = build()

  const response = await usecase.execute('my-app')

  expect(deployBackend.readLiveReleaseUuid.calledOnceWith('my-project-production', 'my-app')).toBe(
    true,
  )
  expect(response.project).toEqual({ slug: 'my-project', name: 'My Project' })
  expect(response.environment).toMatchObject({ slug: 'production', name: 'Production' })
})
```

`view-app-health.use-case.unit.test.ts` — in `build`, `repository.findBySlug.resolves(new AppPlacementBuilder().withApp(new AppBuilder().withMinReplicas(minReplicas).build()).build())`; return `{ usecase, repository, deployBackend }` and adapt callers (`const { usecase } = build(...)`); add:

```ts
it('reads health from the app’s own namespace', async () => {
  const { usecase, deployBackend } = build(HEALTHY)

  await usecase.execute('my-app')

  expect(deployBackend.readAppHealth.firstCall.args[0]).toBe('my-project-production')
})

it('throws 404 for an unknown app', async () => {
  const { usecase, repository } = build(HEALTHY)
  repository.findBySlug.resolves(undefined)

  await expect(usecase.execute('ghost')).rejects.toThrow(NotFoundException)
})
```

with `const HEALTHY: AppHealth = { found: true, desiredReplicas: 1, availableReplicas: 1, updatedReplicas: 1 }` at file scope.

`view-app-logs.use-case.unit.test.ts` — build becomes:

```ts
function build(result: RunLogs | null) {
  const deployBackend = createStubInstance(MockDeployBackend)
  deployBackend.readRunLogs.resolves(result)
  const repository = createStubInstance(ViewAppLogsRepository)
  repository.findBySlug.resolves(new AppPlacementBuilder().build())
  return { usecase: new ViewAppLogsUseCase(repository, deployBackend), deployBackend, repository }
}
```

replace the `OPERATOR_APPS_NAMESPACE` expectation with `'my-project-production'`, change the "no pod" case to keep a placement (the backend returns `null`), and add a 404 case with `repository.findBySlug.resolves(undefined)`.

e2e: `view-app-health.e2e.test.ts` and `view-app-logs.e2e.test.ts` — in `before`, seed an environment and insert `new AppBuilder().withSlug(SLUG).withEnvironment(environment).build()`; add `it('returns 404 for an unknown app', …)` hitting `/api/v1/apps/ghost/health` (resp. `/logs`). `view-app-index.e2e.test.ts` and `view-app-detail.e2e.test.ts`: assert `project.slug === 'my-project'` and `environment.slug === 'production'` on the returned app.

Run: `pnpm --filter api test` → FAIL (types / expectations).

- [ ] **Step 3: Repositories return placements**

`view-app-index.repository.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { desc, lt } from 'drizzle-orm'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import {
  type AppPlacement,
  selectAppPlacement,
} from '#src/app/app-management/entities/app-placement.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewAppIndexRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async listApps(limit: number, after?: AppUuid | null): Promise<AppPlacement[]> {
    return selectAppPlacement(this.db)
      .where(after ? lt(appTable.uuid, after) : undefined)
      .orderBy(desc(appTable.uuid))
      .limit(limit)
  }
}
```

`view-app-detail.repository.ts`, `view-app-health.repository.ts`, `delete-app.repository.ts` — replace each `findBySlug` with:

```ts
  async findBySlug(slug: string): Promise<AppPlacement | undefined> {
    const [placement] = await selectAppPlacement(this.db).where(eq(appTable.slug, slug)).limit(1)
    return placement
  }
```

(drop the now-unused `App` import where it was only used by `findBySlug`).

New `view-app-logs/view-app-logs.repository.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import {
  type AppPlacement,
  selectAppPlacement,
} from '#src/app/app-management/entities/app-placement.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewAppLogsRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findBySlug(slug: string): Promise<AppPlacement | undefined> {
    const [placement] = await selectAppPlacement(this.db).where(eq(appTable.slug, slug)).limit(1)
    return placement
  }
}
```

Add it to `ViewAppLogsModule.providers`.

- [ ] **Step 4: Use-cases resolve the namespace**

`delete-app.use-case.ts`:

```ts
  async execute(slug: string): Promise<void> {
    const placement = await this.repository.findBySlug(slug)
    if (!placement) {
      throw new NotFoundException(`App '${slug}' was not found.`)
    }

    try {
      await this.deployBackend.destroy(namespaceOf(placement.project, placement.environment), slug)
    } catch (error) {
      // Rows stay put so the app remains listed and the delete can be retried.
      throw new BadGatewayException(
        `Could not remove '${slug}' from the cluster. Please try again.`,
        { cause: error },
      )
    }

    await this.repository.deleteWithReleases(placement.app.uuid)
  }
```

`view-app-health.use-case.ts` (`verdict` unchanged):

```ts
  async execute(slug: string): Promise<ViewAppHealthResponse> {
    const placement = await this.repository.findBySlug(slug)
    if (!placement) {
      throw new NotFoundException(`App '${slug}' was not found.`)
    }
    const namespace = namespaceOf(placement.project, placement.environment)
    const health = await this.deployBackend.readAppHealth(namespace, slug)
    return new ViewAppHealthResponse(verdict(health, placement.app.minReplicas), health)
  }
```

`view-app-logs.use-case.ts`:

```ts
@Injectable()
export class ViewAppLogsUseCase {
  constructor(
    private readonly repository: ViewAppLogsRepository,
    private readonly deployBackend: DeployBackend,
  ) {}

  async execute(slug: string, tailLines?: number): Promise<ViewAppLogsResponse> {
    const placement = await this.repository.findBySlug(slug)
    if (!placement) {
      throw new NotFoundException(`App '${slug}' was not found.`)
    }
    const logs = await this.deployBackend.readRunLogs(
      namespaceOf(placement.project, placement.environment),
      slug,
      { tailLines: tailLines ?? DEFAULT_TAIL_LINES },
    )
    return new ViewAppLogsResponse(logs)
  }
}
```

`view-app-detail.use-case.ts`:

```ts
  async execute(slug: string): Promise<ViewAppDetailResponse> {
    const placement = await this.repository.findBySlug(slug)
    if (!placement) {
      throw new NotFoundException(`App '${slug}' was not found.`)
    }

    return new ViewAppDetailResponse(
      placement,
      this.config.getOrThrow<string>('MARSA_BASE_DOMAIN'),
      await this.hasUndeployedChanges(placement),
    )
  }

  // Compared against what the cluster runs, not the newest row: a release can exist yet never ship.
  private async hasUndeployedChanges({ app, project, environment }: AppPlacement): Promise<boolean> {
    let liveUuid: string | null
    try {
      liveUuid = await this.deployBackend.readLiveReleaseUuid(
        namespaceOf(project, environment),
        app.slug,
      )
    } catch {
      // Unknown is not "changed"; the health card is where an unreachable cluster shows up.
      return false
    }
    const live = liveUuid && (await this.repository.findRelease(liveUuid as ReleaseUuid, app.uuid))
    return !live || !isSnapshotOf(live, app)
  }
```

In every one of these four use-case files: drop the `OPERATOR_APPS_NAMESPACE` import; add `import { namespaceOf } from '#src/app/environment/entities/namespace.js'` (+ `NotFoundException`, `AppPlacement` type where used).

Controllers `view-app-health.controller.ts` and `view-app-logs.controller.ts`: add `@ApiNotFoundResponse({ description: 'No app with that slug.' })`.

- [ ] **Step 5: Responses carry project + environment**

`view-app-index.response.ts` — `AppSummary` now takes a placement:

```ts
export class AppSummary {
  @ApiProperty({ type: String, example: 'my-app' })
  readonly slug: string

  @ApiProperty({ type: String, example: 'nginx:1.27' })
  readonly image: string

  @ApiProperty({ type: String, example: 'https://my-app.demo.marsa.cc' })
  readonly url: string

  @ApiProperty({ type: AppProjectRef })
  readonly project: AppProjectRef

  @ApiProperty({ type: AppEnvironmentRef })
  readonly environment: AppEnvironmentRef

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: string

  @ApiProperty({ type: String, format: 'date-time' })
  readonly updatedAt: string

  constructor({ app, project, environment }: AppPlacement, baseDomain: string) {
    this.slug = app.slug
    this.image = app.image
    this.url = `https://${app.slug}.${baseDomain}`
    this.project = new AppProjectRef(project)
    this.environment = new AppEnvironmentRef(environment)
    this.createdAt = app.createdAt.toISOString()
    this.updatedAt = app.updatedAt.toISOString()
  }
}
```

and in the same file:

```ts
export class ViewAppIndexResponseMeta extends PaginatedKeysetResponseMeta {
  @ApiProperty({ type: ViewAppIndexQueryKey, nullable: true })
  declare readonly next: ViewAppIndexQueryKey | null

  constructor(placements: AppPlacement[]) {
    super(ViewAppIndexQueryKey.nextKey(placements.map((placement) => placement.app)))
  }
}
```

```ts
  constructor(placements: AppPlacement[], baseDomain: string) {
    super(
      placements.map((placement) => new AppSummary(placement, baseDomain)),
      new ViewAppIndexResponseMeta(placements),
    )
  }
```

`view-app-index.use-case.ts`: rename the local `apps` → `placements` (types flow through).

`view-app-detail.response.ts` — add the two fields (between `url` and `containerPort`) and switch the constructor to `constructor({ app, project, environment }: AppPlacement, baseDomain: string, hasUndeployedChanges: boolean)`, setting `this.project = new AppProjectRef(project)` and `this.environment = new AppEnvironmentRef(environment)`; every other assignment keeps reading from `app`.

- [ ] **Step 6: Run tests, lint, commit**

```bash
pnpm --filter api test
pnpm --filter api lint
npx prettier --write apps/api/src/app/app-management
git add apps/api/src/app/app-management
git commit -m "feat: read and tear down apps in their environment's namespace

Refs #142"
```

Expected: PASS. `grep -rn OPERATOR_APPS_NAMESPACE apps/api/src/app/app-management` prints nothing.

---

### Task 6: Deploys provision and target the environment's namespace; retire `OPERATOR_APPS_NAMESPACE`

**Files:**

- Modify: `apps/api/src/app/release/services/apply-release/apply-release.service.ts`
- Modify: `apps/api/src/app/release/use-cases/deploy-release/{deploy-release.repository,deploy-release.use-case}.ts` + `tests/deploy-release.use-case.unit.test.ts`
- Modify: `apps/api/src/app/release/use-cases/view-release-index/{view-release-index.repository,view-release-index.use-case}.ts` + `tests/view-release-index.use-case.unit.test.ts`
- Modify: `apps/api/src/modules/kubernetes/deploy-backend.constants.ts`, `apps/api/src/modules/kubernetes/tests/direct-apply-deploy-backend.unit.test.ts`

**Interfaces:**

- Consumes: `AppPlacement`, `selectAppPlacement`, `AppPlacementBuilder`, `namespaceOf` (Task 1); `NamespaceBackend`, `NamespaceConflictError`, `MockNamespaceBackend` (Task 2).
- Produces:
  - `ApplyReleaseService` constructor `(deployBackend: DeployBackend, namespaces: NamespaceBackend, credentialsCipher: ImagePullCredentialsCipher, config: ConfigService)`; `apply(placement: AppPlacement, release: Release): Promise<void>` — provisions the namespace, then applies. A `NamespaceConflictError` surfaces as 409.
  - `DeployReleaseRepository.findAppWithNewestRelease(slug): Promise<{ placement: AppPlacement; release: Release | null } | undefined>`
  - `ViewReleaseIndexRepository.findPlacement(slug): Promise<AppPlacement | undefined>`
  - `OPERATOR_APPS_NAMESPACE` no longer exists.

- [ ] **Step 1: Update the deploy-release unit test first**

In `deploy-release.use-case.unit.test.ts`:

```ts
const placement = new AppPlacementBuilder()
  .withApp(new AppBuilder().withSlug('my-app').build())
  .build()
const app = placement.app

function build(release = new ReleaseBuilder().withApp(app).withImageRef('nginx:1.27').build()) {
  const repository = createStubInstance(DeployReleaseRepository)
  repository.findAppWithNewestRelease.resolves({ placement, release })
  repository.setDeployStatus.resolves()

  const deployBackend = createStubInstance(MockDeployBackend)
  deployBackend.apply.resolves()
  const namespaces = createStubInstance(MockNamespaceBackend)
  namespaces.provision.resolves()
  const config = createStubInstance(ConfigService)
  config.getOrThrow.returns('demo.marsa.cc')
  const cipher = createStubInstance(ImagePullCredentialsCipher)
  cipher.open.returns({ registry: 'ghcr.io', username: 'org', password: 'pw' })

  const applyRelease = new ApplyReleaseService(deployBackend, namespaces, cipher, config)
  return {
    usecase: new DeployReleaseUseCase(repository, applyRelease),
    repository,
    deployBackend,
    namespaces,
    cipher,
    release,
  }
}
```

Every other `repository.findAppWithNewestRelease.resolves({ app, release: X })` in the file becomes `{ placement, release: X }`. Add:

```ts
it('provisions the environment namespace, then applies into it', async () => {
  const { usecase, deployBackend, namespaces } = build()

  await usecase.execute('my-app')

  expect(
    namespaces.provision.calledOnceWithExactly('my-project-production', placement.environment.uuid),
  ).toBe(true)
  expect(deployBackend.apply.firstCall.args[0]).toBe('my-project-production')
  expect(namespaces.provision.calledBefore(deployBackend.apply)).toBe(true)
})

it('reports a namespace taken by something else as 409 and marks the release failed', async () => {
  const { usecase, namespaces, repository, release } = build()
  namespaces.provision.rejects(new NamespaceConflictError('taken'))

  await expect(usecase.execute('my-app')).rejects.toThrow(ConflictException)
  expect(repository.setDeployStatus.calledWith(release.uuid, DeployStatus.Failed)).toBe(true)
})
```

In `view-release-index.use-case.unit.test.ts`, in `build`: `repository.findPlacement.resolves(new AppPlacementBuilder().withApp(new AppBuilder().withSlug(SLUG).build()).build())`; add:

```ts
it('reconciles against the app’s own namespace', async () => {
  const { usecase, deployBackend } = build()
  deployBackend.readRolloutStatus.resolves(RolloutStatus.Complete)

  await usecase.execute(SLUG, firstPage())

  expect(deployBackend.readLiveReleaseUuid.firstCall.args[0]).toBe('my-project-production')
  expect(deployBackend.readRolloutStatus.firstCall.args[0]).toBe('my-project-production')
})
```

In `direct-apply-deploy-backend.unit.test.ts`: drop `OPERATOR_APPS_NAMESPACE` from the import and add `const NAMESPACE = 'demo-dev'` at file scope; replace every `OPERATOR_APPS_NAMESPACE` in the file with `NAMESPACE`.

Run: `pnpm --filter api test` → FAIL.

- [ ] **Step 2: `ApplyReleaseService` provisions then applies**

```ts
import { ConflictException, Injectable, InternalServerErrorException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AppPlacement } from '#src/app/app-management/entities/app-placement.js'
import { namespaceOf } from '#src/app/environment/entities/namespace.js'
import type { Release } from '#src/app/release/entities/release.table.js'
import { renderManifests } from '#src/app/release/render/render-manifests.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'
import type { RegistryCredentials } from '#src/modules/kubernetes/deploy-backend.types.js'
import {
  NamespaceBackend,
  NamespaceConflictError,
} from '#src/modules/kubernetes/namespace-backend.js'

@Injectable()
export class ApplyReleaseService {
  readonly baseDomain: string

  constructor(
    private readonly deployBackend: DeployBackend,
    private readonly namespaces: NamespaceBackend,
    private readonly credentialsCipher: ImagePullCredentialsCipher,
    config: ConfigService,
  ) {
    this.baseDomain = config.getOrThrow<string>('MARSA_BASE_DOMAIN')
  }

  async apply({ app, project, environment }: AppPlacement, release: Release): Promise<void> {
    const credentials = this.openCredentials(app.slug, release)
    const manifests = renderManifests(app.slug, release, this.baseDomain, credentials)
    const namespace = namespaceOf(project, environment)

    // Also heals a namespace someone deleted by hand; a no-op when it already exists.
    try {
      await this.namespaces.provision(namespace, environment.uuid)
    } catch (error) {
      if (error instanceof NamespaceConflictError) {
        throw new ConflictException(error.message)
      }
      throw error
    }
    await this.deployBackend.apply(namespace, manifests)
  }

  private openCredentials(slug: string, release: Release): RegistryCredentials | undefined {
    if (!release.imagePullCredentialsEnc) {
      return undefined
    }

    try {
      return this.credentialsCipher.open(release.imagePullCredentialsEnc)
    } catch (error) {
      throw new InternalServerErrorException(
        `Stored image pull credentials for '${slug}' could not be decrypted. ` +
          'Re-enter the registry credentials and deploy again.',
        { cause: error },
      )
    }
  }
}
```

(`ApplyReleaseModule` already imports `KubernetesModule`, which now exports `NamespaceBackend` — no module change.)

- [ ] **Step 3: deploy-release reads the placement**

`deploy-release.repository.ts` — replace `findAppWithNewestRelease`:

```ts
  // uuidv7 sorts by creation time, which is the order the release list uses too.
  async findAppWithNewestRelease(
    slug: string,
  ): Promise<{ placement: AppPlacement; release: Release | null } | undefined> {
    const [placement] = await selectAppPlacement(this.db).where(eq(appTable.slug, slug)).limit(1)
    if (!placement) {
      return undefined
    }
    const [release] = await this.db
      .select()
      .from(releaseTable)
      .where(eq(releaseTable.appUuid, placement.app.uuid))
      .orderBy(desc(releaseTable.uuid))
      .limit(1)
    return { placement, release: release ?? null }
  }
```

`deploy-release.use-case.ts`:

```ts
  async execute(slug: string): Promise<DeployReleaseResponse> {
    const found = await this.repository.findAppWithNewestRelease(slug)
    if (!found) {
      throw new NotFoundException(`App '${slug}' was not found.`)
    }
    const { placement, release } = found
    if (!release) {
      throw new ConflictException(`App '${slug}' has no release to deploy. Create one first.`)
    }

    const deployStatus =
      release.deployStatus === DeployStatus.Succeeded
        ? await this.reapplyRunning(placement, release)
        : await this.rollOut(placement, release)

    return new DeployReleaseResponse(
      placement.app.slug,
      { ...release, deployStatus },
      this.applyRelease.baseDomain,
    )
  }

  // Already live, so the apply is a cluster no-op; a failed retry must not mark it failed.
  private async reapplyRunning(placement: AppPlacement, release: Release): Promise<DeployStatus> {
    await this.applyRelease.apply(placement, release)
    return release.deployStatus
  }

  private async rollOut(placement: AppPlacement, release: Release): Promise<DeployStatus> {
    await this.repository.setDeployStatus(release.uuid, DeployStatus.Pending)
    try {
      await this.applyRelease.apply(placement, release)
    } catch (error) {
      await this.repository.setDeployStatus(release.uuid, DeployStatus.Failed)
      throw error
    }
    return DeployStatus.Pending
  }
```

- [ ] **Step 4: view-release-index reconciles in the right namespace**

`view-release-index.repository.ts` — add:

```ts
  async findPlacement(slug: string): Promise<AppPlacement | undefined> {
    const [placement] = await selectAppPlacement(this.db).where(eq(appTable.slug, slug)).limit(1)
    return placement
  }
```

`view-release-index.use-case.ts` — `refreshHead` resolves the namespace once and passes it down:

```ts
  private async refreshHead(releases: Release[], slug: string): Promise<ReleaseHead | null> {
    const head = releases.at(0)
    if (!head) return null
    const placement = await this.repository.findPlacement(slug)
    if (!placement) return null
    const namespace = namespaceOf(placement.project, placement.environment)

    const deployStatus = TERMINAL_STATUSES.has(head.deployStatus)
      ? head.deployStatus
      : await this.reconcile(head, namespace, slug)

    // A failure reason is read live from the pods (never stored, #115), and only the head
    // maps to the live Deployment — no older release's failure can be described this way.
    const failure =
      deployStatus === DeployStatus.Failed
        ? await this.deployBackend.readDeployFailure(namespace, slug)
        : null

    return { uuid: head.uuid, deployStatus, failure }
  }

  private async reconcile(release: Release, namespace: string, slug: string): Promise<DeployStatus> {
    // A release that was created but never deployed must not inherit the live rollout.
    const live = await this.deployBackend.readLiveReleaseUuid(namespace, slug)
    if (live !== release.uuid) return release.deployStatus

    const rollout = await this.deployBackend.readRolloutStatus(namespace, slug)
    const observed = toDeployStatus(rollout)

    // `null` (NotFound) is absence of observation, never a state — persisting one there
    // would repeat the #98 false negative (pod not yet observable → wrongly terminal).
    if (observed === null || observed === release.deployStatus) return release.deployStatus

    await this.repository.setReleaseDeployStatus(release.uuid, observed)
    return observed
  }
```

Drop the `OPERATOR_APPS_NAMESPACE` import; import `namespaceOf`.

- [ ] **Step 5: Delete the constant**

Remove the `OPERATOR_APPS_NAMESPACE` export and its comment from `apps/api/src/modules/kubernetes/deploy-backend.constants.ts`. Then:

```bash
grep -rn OPERATOR_APPS_NAMESPACE apps/api/src
```

Expected: no output.

- [ ] **Step 6: Run tests, lint, commit**

```bash
pnpm --filter api test
pnpm --filter api lint
npx prettier --write apps/api/src/app/release apps/api/src/modules/kubernetes
git add apps/api/src/app/release apps/api/src/modules/kubernetes
git commit -m "feat: deploy each app into its environment's namespace, provisioning it first

Refs #142"
```

---

### Task 7: Regenerate the contract and document the new features

**Files:**

- Modify: `apps/api/openapi.json` (generated), `apps/web/app/api/*` (generated)
- Modify: `apps/api/.claude/CLAUDE.md`

- [ ] **Step 1: Regenerate**

```bash
pnpm --filter api build
pnpm --filter api generate:openapi
pnpm --filter web generate:api
```

Expected: `openapi.json` gains `createProjectV1`, `viewProjectIndexV1`, `deleteProjectV1`, `createEnvironmentV1`, `viewEnvironmentIndexV1`, `deleteEnvironmentV1`; `CreateAppCommand` requires `environmentUuid`; `AppSummary` / `ViewAppDetailResponse` gain `project` + `environment`. Check every `{placeholder}` in the new routes (`projectSlug`, `environmentSlug`, `slug`) appears under `parameters`.

- [ ] **Step 2: Web still typechecks against the new client**

```bash
pnpm --filter web typecheck
```

Expected: a failure in `app/pages/apps/new.vue` (`environmentUuid` missing from `CreateAppCommand`) — that is Task 9's job. Note the exact errors; nothing else should fail. If other files fail, fix them in this task.

- [ ] **Step 3: Document**

In `apps/api/.claude/CLAUDE.md` § "Source layout", extend the feature list to `app-management/`, `release/`, `project/`, `environment/`, `auth/`, `user/`, `github-app/`, and add under "Feature module boundaries":

```markdown
- **Placement**: `project/ ← environment/ ← app-management/ ← release/`. An app's Kubernetes namespace is derived by `namespaceOf(project, environment)` (never stored); app-keyed repositories load it through `selectAppPlacement` in `app-management/entities/app-placement.ts`. `NamespaceBackend` (`src/modules/kubernetes/`) creates an environment's namespace on create and on every deploy, and deletes it with the environment.
```

- [ ] **Step 4: Commit**

```bash
npx prettier --write apps/api/.claude/CLAUDE.md
git add apps/api/openapi.json apps/web/app/api apps/api/.claude/CLAUDE.md
git commit -m "chore: regenerate the api contract for projects and environments

Refs #142"
```

---

### Task 8: Web composables for projects and environments

**Files:**

- Create: `apps/web/app/composables/{useProjectList,useCreateProject,useDeleteProject,useEnvironmentList,useCreateEnvironment,useDeleteEnvironment}.ts`
- Create: `apps/web/app/composables/__tests__/{useProjectList,useCreateProject,useDeleteProject,useEnvironmentList,useCreateEnvironment,useDeleteEnvironment}.nuxt.spec.ts`

**Interfaces:**

- Consumes (Task 7 generated client): `ProjectSummary`, `EnvironmentSummary`, `CreateProjectCommand`, `CreateProjectResponse`, `CreateEnvironmentCommand`, `CreateEnvironmentResponse`, `zViewProjectIndexResponse`, `zViewEnvironmentIndexResponse`, `zCreateProjectResponse`, `zCreateEnvironmentResponse`.
- Produces:
  - `useProjectList(): { list(): Promise<ProjectSummary[]> }`
  - `useEnvironmentList(): { list(projectSlug: string): Promise<EnvironmentSummary[]> }`
  - `useCreateProject(): { create(command: CreateProjectCommand): Promise<CreateProjectResponse> }`
  - `useCreateEnvironment(): { create(projectSlug: string, command: CreateEnvironmentCommand): Promise<CreateEnvironmentResponse> }`
  - `useDeleteProject(): { remove(slug: string): Promise<void> }`
  - `useDeleteEnvironment(): { remove(projectSlug: string, environmentSlug: string): Promise<void> }`

These back a picker, not a browsable page, so the lists fetch one max-size page (100, the API's cap) instead of using `useKeysetList`. Paging arrives with the management UI (#217).

- [ ] **Step 1: Write the failing specs**

`useProjectList.nuxt.spec.ts`:

```ts
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import { useProjectList } from '../useProjectList'

const project = {
  uuid: '0190c3c0-0000-7000-8000-000000000001',
  name: 'Demo',
  slug: 'demo',
  createdAt: '2026-09-19T00:00:00.000Z',
}

registerEndpoint('/api/v1/projects', {
  method: 'GET',
  handler: () => ({ items: [project], meta: { next: null } }),
})

describe('useProjectList.list', () => {
  it('returns the contract-validated projects', async () => {
    expect(await useProjectList().list()).toEqual([project])
  })
})
```

`useEnvironmentList.nuxt.spec.ts`:

```ts
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import { useEnvironmentList } from '../useEnvironmentList'

const environment = {
  uuid: '0190c3c0-0000-7000-8000-000000000002',
  name: 'Dev',
  slug: 'dev',
  namespace: 'demo-dev',
  createdAt: '2026-09-19T00:00:00.000Z',
}

registerEndpoint('/api/v1/projects/demo/environments', {
  method: 'GET',
  handler: () => ({ items: [environment], meta: { next: null } }),
})

describe('useEnvironmentList.list', () => {
  it("returns the project's environments", async () => {
    expect(await useEnvironmentList().list('demo')).toEqual([environment])
  })
})
```

`useCreateProject.nuxt.spec.ts`:

```ts
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import { useCreateProject } from '../useCreateProject'

const created = { uuid: '0190c3c0-0000-7000-8000-000000000001', name: 'Demo', slug: 'demo' }

registerEndpoint('/api/v1/projects', { method: 'POST', handler: () => created })

describe('useCreateProject.create', () => {
  it('POSTs the project and returns the validated response', async () => {
    expect(await useCreateProject().create({ name: 'Demo', slug: 'demo' })).toEqual(created)
  })
})
```

`useCreateEnvironment.nuxt.spec.ts`:

```ts
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import { useCreateEnvironment } from '../useCreateEnvironment'

const created = {
  uuid: '0190c3c0-0000-7000-8000-000000000002',
  name: 'Dev',
  slug: 'dev',
  namespace: 'demo-dev',
  projectSlug: 'demo',
}

registerEndpoint('/api/v1/projects/demo/environments', { method: 'POST', handler: () => created })

describe('useCreateEnvironment.create', () => {
  it('POSTs the environment under its project', async () => {
    expect(await useCreateEnvironment().create('demo', { name: 'Dev', slug: 'dev' })).toEqual(
      created,
    )
  })
})
```

`useDeleteProject.nuxt.spec.ts`:

```ts
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'

import { useDeleteProject } from '../useDeleteProject'

const handler = vi.fn(() => null)
registerEndpoint('/api/v1/projects/demo', { method: 'DELETE', handler: () => handler() })
registerEndpoint('/api/v1/projects/busy', {
  method: 'DELETE',
  handler: () => {
    throw new Error('still has environments')
  },
})

describe('useDeleteProject.remove', () => {
  it('DELETEs the project', async () => {
    await useDeleteProject().remove('demo')
    expect(handler).toHaveBeenCalled()
  })

  it('propagates a refusal so the caller can show it', async () => {
    await expect(useDeleteProject().remove('busy')).rejects.toBeDefined()
  })
})
```

`useDeleteEnvironment.nuxt.spec.ts`:

```ts
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'

import { useDeleteEnvironment } from '../useDeleteEnvironment'

const handler = vi.fn(() => null)
registerEndpoint('/api/v1/projects/demo/environments/dev', {
  method: 'DELETE',
  handler: () => handler(),
})

describe('useDeleteEnvironment.remove', () => {
  it('DELETEs the environment under its project', async () => {
    await useDeleteEnvironment().remove('demo', 'dev')
    expect(handler).toHaveBeenCalled()
  })
})
```

Run: `pnpm --filter web test` → FAIL (modules missing).

- [ ] **Step 2: Implement**

`useProjectList.ts`:

```ts
import type { ProjectSummary } from '~/api/types.gen'
import { zViewProjectIndexResponse } from '~/api/zod.gen'

const PICKER_LIMIT = 100

export function useProjectList() {
  const { $api } = useNuxtApp()

  async function list(): Promise<ProjectSummary[]> {
    const raw = await $api('/v1/projects', { query: { 'pagination[limit]': PICKER_LIMIT } })
    return zViewProjectIndexResponse.parse(raw).items
  }

  return { list }
}
```

`useEnvironmentList.ts`:

```ts
import type { EnvironmentSummary } from '~/api/types.gen'
import { zViewEnvironmentIndexResponse } from '~/api/zod.gen'

const PICKER_LIMIT = 100

export function useEnvironmentList() {
  const { $api } = useNuxtApp()

  async function list(projectSlug: string): Promise<EnvironmentSummary[]> {
    const raw = await $api(`/v1/projects/${encodeURIComponent(projectSlug)}/environments`, {
      query: { 'pagination[limit]': PICKER_LIMIT },
    })
    return zViewEnvironmentIndexResponse.parse(raw).items
  }

  return { list }
}
```

`useCreateProject.ts`:

```ts
import type { CreateProjectCommand, CreateProjectResponse } from '~/api/types.gen'
import { zCreateProjectResponse } from '~/api/zod.gen'

export function useCreateProject() {
  const { $api } = useNuxtApp()

  async function create(command: CreateProjectCommand): Promise<CreateProjectResponse> {
    return zCreateProjectResponse.parse(
      await $api('/v1/projects', { method: 'POST', body: command }),
    )
  }

  return { create }
}
```

`useCreateEnvironment.ts`:

```ts
import type { CreateEnvironmentCommand, CreateEnvironmentResponse } from '~/api/types.gen'
import { zCreateEnvironmentResponse } from '~/api/zod.gen'

export function useCreateEnvironment() {
  const { $api } = useNuxtApp()

  async function create(
    projectSlug: string,
    command: CreateEnvironmentCommand,
  ): Promise<CreateEnvironmentResponse> {
    const raw = await $api(`/v1/projects/${encodeURIComponent(projectSlug)}/environments`, {
      method: 'POST',
      body: command,
    })
    return zCreateEnvironmentResponse.parse(raw)
  }

  return { create }
}
```

`useDeleteProject.ts`:

```ts
export function useDeleteProject() {
  const { $api } = useNuxtApp()

  async function remove(slug: string): Promise<void> {
    await $api(`/v1/projects/${encodeURIComponent(slug)}`, { method: 'DELETE' })
  }

  return { remove }
}
```

`useDeleteEnvironment.ts`:

```ts
export function useDeleteEnvironment() {
  const { $api } = useNuxtApp()

  async function remove(projectSlug: string, environmentSlug: string): Promise<void> {
    const path = `/v1/projects/${encodeURIComponent(projectSlug)}/environments/${encodeURIComponent(environmentSlug)}`
    await $api(path, { method: 'DELETE' })
  }

  return { remove }
}
```

- [ ] **Step 3: Run tests, lint, commit**

```bash
pnpm --filter web test
pnpm --filter web lint
npx prettier --write apps/web/app/composables
git add apps/web/app/composables
git commit -m "feat(web): project and environment composables

Refs #142"
```

Expected: the six new specs PASS. (The `new.vue` typecheck failure from Task 7 is still expected here.)

---

### Task 9: Pick (or create / delete) a project and environment when creating an app

**Files:**

- Create: `apps/web/app/composables/useProjectEnvironmentPicker.ts` + `__tests__/useProjectEnvironmentPicker.nuxt.spec.ts`
- Create: `apps/web/app/components/ProjectEnvironmentPicker.vue` + `__tests__/ProjectEnvironmentPicker.nuxt.spec.ts`
- Modify: `apps/web/app/pages/apps/new.vue` + `__tests__/new.nuxt.spec.ts`

**Interfaces:**

- Consumes: Task 8 composables; `extractApiError` (auto-import from `apiHelpers.ts`).
- Produces:
  - `useProjectEnvironmentPicker(environmentUuid: Ref<string | undefined>)` → `{ projects, environments, projectSlug, loadProjects, createProject(name, slug), createEnvironment(name, slug), deleteProject(slug), deleteEnvironment(slug) }` — every action throws on API failure; the component turns that into a toast / inline error.
  - `<ProjectEnvironmentPicker v-model="state.environmentUuid" />`

The state logic lives in a composable so it is tested without driving reka-ui popovers; the component only renders it.

- [ ] **Step 1: Write the failing composable spec**

`useProjectEnvironmentPicker.nuxt.spec.ts`:

```ts
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import { useProjectEnvironmentPicker } from '../useProjectEnvironmentPicker'

const listProjects = vi.hoisted(() => vi.fn())
const listEnvironments = vi.hoisted(() => vi.fn())
const createProject = vi.hoisted(() => vi.fn())
const createEnvironment = vi.hoisted(() => vi.fn())
const removeProject = vi.hoisted(() => vi.fn())
const removeEnvironment = vi.hoisted(() => vi.fn())

mockNuxtImport('useProjectList', () => () => ({ list: listProjects }))
mockNuxtImport('useEnvironmentList', () => () => ({ list: listEnvironments }))
mockNuxtImport('useCreateProject', () => () => ({ create: createProject }))
mockNuxtImport('useCreateEnvironment', () => () => ({ create: createEnvironment }))
mockNuxtImport('useDeleteProject', () => () => ({ remove: removeProject }))
mockNuxtImport('useDeleteEnvironment', () => () => ({ remove: removeEnvironment }))

const demo = { uuid: 'p1', name: 'Demo', slug: 'demo', createdAt: '2026-09-19T00:00:00.000Z' }
const dev = {
  uuid: 'e1',
  name: 'Dev',
  slug: 'dev',
  namespace: 'demo-dev',
  createdAt: '2026-09-19T00:00:00.000Z',
}
const flush = () => new Promise((resolve) => setTimeout(resolve))

beforeEach(() => {
  listProjects.mockReset().mockResolvedValue([demo])
  listEnvironments.mockReset().mockResolvedValue([dev])
  createProject.mockReset()
  createEnvironment.mockReset()
  removeProject.mockReset().mockResolvedValue(undefined)
  removeEnvironment.mockReset().mockResolvedValue(undefined)
})

describe('useProjectEnvironmentPicker', () => {
  it('loads environments for the chosen project and clears a stale environment', async () => {
    const selected = ref<string | undefined>('stale')
    const picker = useProjectEnvironmentPicker(selected)
    await picker.loadProjects()

    picker.projectSlug.value = 'demo'
    await nextTick()
    await flush()

    expect(listEnvironments).toHaveBeenCalledWith('demo')
    expect(picker.environments.value).toEqual([dev])
    expect(selected.value).toBeUndefined()
  })

  it('creates a project and selects it', async () => {
    createProject.mockResolvedValue({ uuid: 'p2', name: 'New', slug: 'new' })
    const picker = useProjectEnvironmentPicker(ref())

    await picker.createProject('New', 'new')

    expect(createProject).toHaveBeenCalledWith({ name: 'New', slug: 'new' })
    expect(listProjects).toHaveBeenCalled()
    expect(picker.projectSlug.value).toBe('new')
  })

  it('creates an environment in the chosen project and selects it', async () => {
    createEnvironment.mockResolvedValue({ ...dev, projectSlug: 'demo' })
    const selected = ref<string | undefined>()
    const picker = useProjectEnvironmentPicker(selected)
    picker.projectSlug.value = 'demo'
    await nextTick()
    await flush()

    await picker.createEnvironment('Dev', 'dev')

    expect(createEnvironment).toHaveBeenCalledWith('demo', { name: 'Dev', slug: 'dev' })
    expect(selected.value).toBe('e1')
  })

  it('clears the selection when the selected environment is deleted', async () => {
    const selected = ref<string | undefined>()
    const picker = useProjectEnvironmentPicker(selected)
    picker.projectSlug.value = 'demo'
    await nextTick()
    await flush()
    selected.value = 'e1'

    await picker.deleteEnvironment('dev')

    expect(removeEnvironment).toHaveBeenCalledWith('demo', 'dev')
    expect(selected.value).toBeUndefined()
  })

  it('clears the project when the selected project is deleted', async () => {
    const picker = useProjectEnvironmentPicker(ref())
    picker.projectSlug.value = 'demo'

    await picker.deleteProject('demo')

    expect(removeProject).toHaveBeenCalledWith('demo')
    expect(picker.projectSlug.value).toBeUndefined()
  })

  it('surfaces a refused delete to the caller', async () => {
    removeProject.mockRejectedValue({
      data: { statusCode: 409, message: 'still has environments' },
    })
    const picker = useProjectEnvironmentPicker(ref())

    await expect(picker.deleteProject('demo')).rejects.toBeDefined()
  })
})
```

Run: `pnpm --filter web test` → FAIL.

- [ ] **Step 2: Implement the composable**

`apps/web/app/composables/useProjectEnvironmentPicker.ts`:

```ts
import type { Ref } from 'vue'

import type { EnvironmentSummary, ProjectSummary } from '~/api/types.gen'

export function useProjectEnvironmentPicker(environmentUuid: Ref<string | undefined>) {
  const { list: listProjects } = useProjectList()
  const { list: listEnvironments } = useEnvironmentList()
  const { create: postProject } = useCreateProject()
  const { create: postEnvironment } = useCreateEnvironment()
  const { remove: removeProject } = useDeleteProject()
  const { remove: removeEnvironment } = useDeleteEnvironment()

  const projects = ref<ProjectSummary[]>([])
  const environments = ref<EnvironmentSummary[]>([])
  const projectSlug = ref<string | undefined>()

  async function loadProjects(): Promise<void> {
    projects.value = await listProjects()
  }

  async function loadEnvironments(): Promise<void> {
    environments.value = projectSlug.value ? await listEnvironments(projectSlug.value) : []
  }

  watch(projectSlug, async () => {
    environmentUuid.value = undefined
    await loadEnvironments()
  })

  async function createProject(name: string, slug: string): Promise<void> {
    const project = await postProject({ name, slug })
    await loadProjects()
    projectSlug.value = project.slug
  }

  async function createEnvironment(name: string, slug: string): Promise<void> {
    if (!projectSlug.value) return
    const environment = await postEnvironment(projectSlug.value, { name, slug })
    await loadEnvironments()
    environmentUuid.value = environment.uuid
  }

  async function deleteProject(slug: string): Promise<void> {
    await removeProject(slug)
    if (projectSlug.value === slug) projectSlug.value = undefined
    await loadProjects()
  }

  async function deleteEnvironment(slug: string): Promise<void> {
    if (!projectSlug.value) return
    const deleted = environments.value.find((environment) => environment.slug === slug)
    await removeEnvironment(projectSlug.value, slug)
    if (deleted && environmentUuid.value === deleted.uuid) environmentUuid.value = undefined
    await loadEnvironments()
  }

  return {
    projects,
    environments,
    projectSlug,
    loadProjects,
    createProject,
    createEnvironment,
    deleteProject,
    deleteEnvironment,
  }
}
```

Run: `pnpm --filter web test` → the composable spec PASSES.

- [ ] **Step 3: Write the failing component spec**

`apps/web/app/components/__tests__/ProjectEnvironmentPicker.nuxt.spec.ts`:

```ts
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import ProjectEnvironmentPicker from '../ProjectEnvironmentPicker.vue'

const picker = vi.hoisted(() => ({ value: null as unknown }))
mockNuxtImport('useProjectEnvironmentPicker', () => () => picker.value)
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))

function stubPicker(projectSlug?: string) {
  picker.value = {
    projects: ref([{ uuid: 'p1', name: 'Demo', slug: 'demo', createdAt: '' }]),
    environments: ref([]),
    projectSlug: ref(projectSlug),
    loadProjects: vi.fn().mockResolvedValue(undefined),
    createProject: vi.fn(),
    createEnvironment: vi.fn(),
    deleteProject: vi.fn(),
    deleteEnvironment: vi.fn(),
  }
  return picker.value as { loadProjects: ReturnType<typeof vi.fn> }
}

describe('ProjectEnvironmentPicker', () => {
  it('loads projects on mount and renders both fields', async () => {
    const state = stubPicker()
    const wrapper = await mountSuspended(ProjectEnvironmentPicker, {
      props: { modelValue: undefined },
    })

    expect(state.loadProjects).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Project')
    expect(wrapper.text()).toContain('Environment')
  })

  it('keeps the environment controls disabled until a project is chosen', async () => {
    stubPicker()
    const wrapper = await mountSuspended(ProjectEnvironmentPicker, {
      props: { modelValue: undefined },
    })

    expect(wrapper.find('[aria-label="New environment"]').attributes('disabled')).toBeDefined()
  })

  it('enables the environment controls once a project is chosen', async () => {
    stubPicker('demo')
    const wrapper = await mountSuspended(ProjectEnvironmentPicker, {
      props: { modelValue: undefined },
    })

    expect(wrapper.find('[aria-label="New environment"]').attributes('disabled')).toBeUndefined()
  })
})
```

- [ ] **Step 4: Implement the component**

`apps/web/app/components/ProjectEnvironmentPicker.vue`:

```vue
<script setup lang="ts">
// useProjectEnvironmentPicker / useToast / extractApiError are auto-imports, left un-imported so
// tests can mock them via mockNuxtImport.

const environmentUuid = defineModel<string | undefined>({ required: true })

const {
  projects,
  environments,
  projectSlug,
  loadProjects,
  createProject,
  createEnvironment,
  deleteProject,
  deleteEnvironment,
} = useProjectEnvironmentPicker(environmentUuid)
const toast = useToast()

type Kind = 'project' | 'environment'

function fail(title: string, err: unknown) {
  toast.add({
    title,
    description: extractApiError(err),
    color: 'error',
    icon: 'i-lucide-triangle-alert',
  })
}

onMounted(() => loadProjects().catch((err) => fail("Couldn't load projects", err)))

const creating = ref<Kind | null>(null)
const draft = reactive({ name: '', slug: '' })
const createError = ref<string | null>(null)
const saving = ref(false)

function openCreate(kind: Kind) {
  creating.value = kind
  draft.name = ''
  draft.slug = ''
  createError.value = null
}

async function submitCreate() {
  saving.value = true
  createError.value = null
  try {
    if (creating.value === 'project') await createProject(draft.name, draft.slug)
    else await createEnvironment(draft.name, draft.slug)
    creating.value = null
  } catch (err) {
    createError.value = extractApiError(err)
  } finally {
    saving.value = false
  }
}

const deleting = ref<{ kind: Kind; slug: string } | null>(null)

async function confirmDelete() {
  const target = deleting.value
  if (!target) return
  deleting.value = null
  try {
    if (target.kind === 'project') await deleteProject(target.slug)
    else await deleteEnvironment(target.slug)
  } catch (err) {
    fail(`Couldn't delete ${target.slug}`, err)
  }
}
</script>

<template>
  <div class="space-y-4">
    <UFormField label="Project" name="project" required>
      <div class="flex gap-2">
        <USelectMenu
          v-model="projectSlug"
          :items="projects"
          value-key="slug"
          label-key="name"
          placeholder="Choose a project"
          class="flex-1"
        >
          <template #item-trailing="{ item }">
            <UButton
              icon="i-lucide-trash-2"
              variant="ghost"
              color="error"
              size="xs"
              :aria-label="`Delete project ${item.slug}`"
              @pointerdown.stop
              @click.stop="deleting = { kind: 'project', slug: item.slug }"
            />
          </template>
        </USelectMenu>
        <UButton
          icon="i-lucide-plus"
          variant="subtle"
          color="neutral"
          aria-label="New project"
          @click="openCreate('project')"
        />
      </div>
    </UFormField>

    <UFormField
      label="Environment"
      name="environmentUuid"
      description="Each environment is its own Kubernetes namespace"
      required
    >
      <div class="flex gap-2">
        <USelectMenu
          v-model="environmentUuid"
          :items="environments"
          value-key="uuid"
          label-key="name"
          :disabled="!projectSlug"
          placeholder="Choose an environment"
          class="flex-1"
        >
          <template #item-trailing="{ item }">
            <UButton
              icon="i-lucide-trash-2"
              variant="ghost"
              color="error"
              size="xs"
              :aria-label="`Delete environment ${item.slug}`"
              @pointerdown.stop
              @click.stop="deleting = { kind: 'environment', slug: item.slug }"
            />
          </template>
        </USelectMenu>
        <UButton
          icon="i-lucide-plus"
          variant="subtle"
          color="neutral"
          aria-label="New environment"
          :disabled="!projectSlug"
          @click="openCreate('environment')"
        />
      </div>
    </UFormField>

    <UModal
      :open="creating !== null"
      :title="creating === 'project' ? 'New project' : 'New environment'"
      @update:open="
        (open) => {
          if (!open) creating = null
        }
      "
    >
      <template #body>
        <div class="space-y-3">
          <UAlert
            v-if="createError"
            color="error"
            icon="i-lucide-triangle-alert"
            :title="createError"
          />
          <UFormField label="Name">
            <UInput id="picker-name" v-model="draft.name" class="w-full" />
          </UFormField>
          <UFormField
            label="Slug"
            :description="creating === 'project' ? 'Up to 30 characters' : 'Up to 32 characters'"
          >
            <UInput id="picker-slug" v-model="draft.slug" class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton label="Create" :loading="saving" @click="submitCreate" />
      </template>
    </UModal>

    <UModal
      :open="deleting !== null"
      :title="`Delete ${deleting?.kind} ${deleting?.slug}?`"
      description="Only possible while it is empty."
      @update:open="
        (open) => {
          if (!open) deleting = null
        }
      "
    >
      <template #footer>
        <UButton color="error" label="Delete" @click="confirmDelete" />
      </template>
    </UModal>
  </div>
</template>
```

Before moving on, confirm in the browser (Step 7) that clicking the trash icon inside an open `USelectMenu` does **not** also select that item; `@pointerdown.stop` is what prevents reka-ui's selection. If it still selects, check the Nuxt UI v4 SelectMenu docs via Context7 for the item-slot event model and adjust.

- [ ] **Step 5: Wire it into `/apps/new`**

In `apps/web/app/pages/apps/new.vue`:

- Add to the zod schema object: `environmentUuid: z.string({ error: 'Pick an environment' }).min(1, 'Pick an environment'),`
- Add `environmentUuid: string | undefined` to the `state` type and `environmentUuid: undefined` to its initial value.
- In `toCommand`, add `environmentUuid: data.environmentUuid,` as the first field.
- In the template, as the **first** child of `<UForm>`: `<ProjectEnvironmentPicker v-model="state.environmentUuid" />`.

In `apps/web/app/pages/apps/__tests__/new.nuxt.spec.ts`:

- Stub the picker so the page test stays about the page: `mockComponent('ProjectEnvironmentPicker', { props: ['modelValue'], emits: ['update:modelValue'], setup: (_, { emit }) => { emit('update:modelValue', 'e1'); return () => h('div') } })` (import `mockComponent` from `@nuxt/test-utils/runtime`, `h` from `vue`).
- Update the expected command: `{ environmentUuid: 'e1', slug: 'my-app', image: 'nginx:1.27', containerPort: 80 }`.
- Add a case where the stub emits nothing and submit shows "Pick an environment" and does not call `create`.

- [ ] **Step 6: Run tests, typecheck, lint**

```bash
pnpm --filter web test
pnpm --filter web typecheck
pnpm --filter web lint
```

Expected: PASS; the Task 7 typecheck error in `new.vue` is gone. Coverage floors hold (the composable carries the logic, so branch coverage stays up).

- [ ] **Step 7: Click through it**

Follow root `.claude/CLAUDE.md` § "Running the FE locally without a cluster" (mock backends — namespace calls are no-ops). On `/apps/new`: create project `demo`, create environment `dev`, deploy `nginx:1.27` port 80; delete an empty environment from the dropdown's trash icon; try deleting `dev` while the app exists and confirm the "still has apps" toast.

- [ ] **Step 8: Commit**

```bash
npx prettier --write apps/web/app/composables/useProjectEnvironmentPicker.ts apps/web/app/components/ProjectEnvironmentPicker.vue apps/web/app/pages/apps/new.vue apps/web/app/composables/__tests__/useProjectEnvironmentPicker.nuxt.spec.ts apps/web/app/components/__tests__/ProjectEnvironmentPicker.nuxt.spec.ts apps/web/app/pages/apps/__tests__/new.nuxt.spec.ts
git add apps/web/app/composables/useProjectEnvironmentPicker.ts apps/web/app/composables/__tests__/useProjectEnvironmentPicker.nuxt.spec.ts apps/web/app/components/ProjectEnvironmentPicker.vue apps/web/app/components/__tests__/ProjectEnvironmentPicker.nuxt.spec.ts apps/web/app/pages/apps/new.vue apps/web/app/pages/apps/__tests__/new.nuxt.spec.ts
git commit -m "feat(web): choose, create and delete a project and environment when creating an app

Refs #142"
```

---

### Task 10: Show `project / environment` on the app list and app page

**Files:**

- Modify: `apps/web/app/pages/apps/index.vue`, `apps/web/app/pages/apps/[slug].vue`
- Modify: `apps/web/app/pages/apps/__tests__/{index,[slug]}.nuxt.spec.ts`, and any fixture typed as `AppSummary` / `ViewAppDetailResponse` (e.g. `app/components/__tests__/AppConfigForm.nuxt.spec.ts`, `app/composables/__tests__/useAppDetail*.spec.ts`, `useAppList*.spec.ts`)

- [ ] **Step 1: Update fixtures and add the failing assertions**

Every `AppSummary` / `ViewAppDetailResponse` fixture gains:

```ts
  project: { slug: 'demo', name: 'Demo' },
  environment: { uuid: '0190c3c0-0000-7000-8000-000000000002', slug: 'dev', name: 'Dev' },
```

`index.nuxt.spec.ts`: assert the row text contains `demo / dev`. `[slug].nuxt.spec.ts`: assert the header contains `demo / dev` once the detail resolves.

Run: `pnpm --filter web test` → the two new assertions FAIL.

- [ ] **Step 2: Render it**

`index.vue` — in the row, after the slug span:

```vue
<span class="text-xs text-muted">{{ app.project.slug }} / {{ app.environment.slug }}</span>
```

`[slug].vue` — in `UDashboardNavbar`'s `#right` slot, before the Redeploy button:

```vue
<UBadge
  v-if="config"
  variant="subtle"
  color="neutral"
  :label="`${config.project.slug} / ${config.environment.slug}`"
/>
```

- [ ] **Step 3: Run tests, typecheck, lint, commit**

```bash
pnpm --filter web test
pnpm --filter web typecheck
pnpm --filter web lint
npx prettier --write apps/web/app/pages/apps apps/web/app/components/__tests__ apps/web/app/composables/__tests__
git add apps/web/app/pages/apps apps/web/app/components/__tests__ apps/web/app/composables/__tests__
git commit -m "feat(web): show each app's project and environment

Refs #142"
```

---

### Task 11: marsa-charts — per-namespace RBAC and the admission fence

Work in the sibling repo `../marsa-charts` (`git -C ../marsa-charts switch -c feature/142-project-environment`). This PR **must be released before** the marsa PR's cluster e2e can pass: `scripts/install.sh` pulls the latest published chart.

**Files (all under `charts/marsa/`):**

- Delete: `templates/apps-namespace.yml`
- Modify: `templates/rbac.yml`, `templates/deployment.yml`, `templates/traefik-config.yaml`, `values.yaml`, `values.schema.json`, `Chart.yaml`, `tests/rbac_test.yaml`
- Create: `templates/admission-policy.yml`, `tests/admission-policy_test.yaml`
- Modify: `../../README.md` if it mentions `appsNamespace` (`grep -n appsNamespace README.md`)

**Interfaces:**

- Produces (what the api relies on): ClusterRole `marsa-deployer` (unbound); ClusterRole + ClusterRoleBinding `marsa-namespace-manager` for SA `marsa-api` in the release namespace; env `MARSA_API_NAMESPACE` on the marsa-api container; ValidatingAdmissionPolicy `marsa-api-namespace-fence` + binding.

- [ ] **Step 1: Rewrite the RBAC tests first**

Replace `tests/rbac_test.yaml`:

```yaml
suite: marsa-api RBAC over the namespaces it manages (#142)
templates:
  - templates/serviceaccount.yml
  - templates/rbac.yml
  - templates/deployment.yml
release:
  name: marsa
  namespace: marsa
tests:
  - it: creates a dedicated marsa-api ServiceAccount in the release namespace
    template: templates/serviceaccount.yml
    asserts:
      - isKind:
          of: ServiceAccount
      - equal:
          path: metadata.name
          value: marsa-api

  # ── marsa-deployer: the per-app rules, bound per environment namespace by the api ──
  - it: defines the deployer rules as a ClusterRole
    template: templates/rbac.yml
    documentIndex: 0
    asserts:
      - isKind:
          of: ClusterRole
      - equal:
          path: metadata.name
          value: marsa-deployer

  - it: grants broad verbs over the core + workload API groups
    template: templates/rbac.yml
    documentIndex: 0
    asserts:
      - contains:
          path: rules
          content:
            apiGroups: ['', 'apps', 'batch', 'autoscaling', 'networking.k8s.io', 'policy']
            resources: ['*']
            verbs: ['*']

  - it: grants control over the Traefik CRDs the operator applies per app
    template: templates/rbac.yml
    documentIndex: 0
    asserts:
      - contains:
          path: rules
          content:
            apiGroups: ['traefik.io']
            resources: ['*']
            verbs: ['*']

  - it: grants control over the KEDA HTTPScaledObject only
    template: templates/rbac.yml
    documentIndex: 0
    asserts:
      - contains:
          path: rules
          content:
            apiGroups: ['http.keda.sh']
            resources: ['httpscaledobjects']
            verbs: ['*']
      - lengthEqual:
          path: rules
          count: 3

  # ── marsa-namespace-manager: create/delete namespaces and hand out marsa-deployer only ──
  - it: lets marsa-api manage namespaces and bind nothing but marsa-deployer
    template: templates/rbac.yml
    documentIndex: 1
    asserts:
      - isKind:
          of: ClusterRole
      - equal:
          path: metadata.name
          value: marsa-namespace-manager
      - contains:
          path: rules
          content:
            apiGroups: ['']
            resources: ['namespaces']
            verbs: ['get', 'create', 'delete']
      - contains:
          path: rules
          content:
            apiGroups: ['rbac.authorization.k8s.io']
            resources: ['rolebindings']
            verbs: ['get', 'create']
      - contains:
          path: rules
          content:
            apiGroups: ['rbac.authorization.k8s.io']
            resources: ['clusterroles']
            verbs: ['bind']
            resourceNames: ['marsa-deployer']
      - lengthEqual:
          path: rules
          count: 3

  - it: binds the namespace manager to the marsa-api SA cluster-wide
    template: templates/rbac.yml
    documentIndex: 2
    asserts:
      - isKind:
          of: ClusterRoleBinding
      - equal:
          path: roleRef.name
          value: marsa-namespace-manager
      - equal:
          path: subjects[0].name
          value: marsa-api
      - equal:
          path: subjects[0].namespace
          value: marsa

  - it: renders exactly the two ClusterRoles and one ClusterRoleBinding (marsa-deployer is never bound cluster-wide)
    template: templates/rbac.yml
    asserts:
      - hasDocuments:
          count: 3

  # ── Deployment wiring ──
  - it: runs marsa-api under its ServiceAccount and tells it its own namespace
    template: templates/deployment.yml
    documentIndex: 1
    asserts:
      - equal:
          path: spec.template.spec.serviceAccountName
          value: marsa-api
      - contains:
          path: spec.template.spec.containers[0].env
          content:
            name: MARSA_API_NAMESPACE
            valueFrom:
              fieldRef:
                fieldPath: metadata.namespace
```

`tests/admission-policy_test.yaml`:

```yaml
suite: ValidatingAdmissionPolicy fencing marsa-api to namespaces it manages (#142)
templates:
  - templates/admission-policy.yml
release:
  name: marsa
  namespace: marsa
tests:
  - it: matches only the marsa-api service account of this release
    documentIndex: 0
    asserts:
      - isKind:
          of: ValidatingAdmissionPolicy
      - equal:
          path: spec.matchConditions[0].expression
          value: "request.userInfo.username == 'system:serviceaccount:marsa:marsa-api'"
      - equal:
          path: spec.failurePolicy
          value: Fail

  - it: covers namespace and rolebinding writes
    documentIndex: 0
    asserts:
      - lengthEqual:
          path: spec.matchConstraints.resourceRules
          count: 2
      - lengthEqual:
          path: spec.validations
          count: 4

  - it: is enforced with Deny
    documentIndex: 1
    asserts:
      - isKind:
          of: ValidatingAdmissionPolicyBinding
      - equal:
          path: spec.policyName
          value: marsa-api-namespace-fence
      - contains:
          path: spec.validationActions
          content: Deny
```

Run: `helm unittest charts/marsa` → FAIL.

- [ ] **Step 2: `rbac.yml`**

<!-- prettier-ignore-start -->
```yaml
# marsa-api creates one namespace per environment (#142) and binds marsa-deployer into each,
# so its write access is exactly the namespaces it manages. marsa-deployer is never bound
# cluster-wide. rbac.authorization.k8s.io stays out of the deployer rules so the SA can't
# escalate; the only RBAC it holds is creating RoleBindings, and `bind` limited to
# marsa-deployer means it can hand out nothing else. admission-policy.yml closes what RBAC
# can't express: which namespaces it may create, delete, or bind into.
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: marsa-deployer
rules:
  - apiGroups: ['', 'apps', 'batch', 'autoscaling', 'networking.k8s.io', 'policy']
    resources: ['*']
    verbs: ['*']
  # Traefik CRDs (IngressRoute, Middleware, ...) the operator applies per app.
  - apiGroups: ['traefik.io']
    resources: ['*']
    verbs: ['*']
  # Named, not wildcarded: http.keda.sh also holds InterceptorRoute, the add-on's own state (marsa#119).
  - apiGroups: ['http.keda.sh']
    resources: ['httpscaledobjects']
    verbs: ['*']
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: marsa-namespace-manager
rules:
  - apiGroups: ['']
    resources: ['namespaces']
    verbs: ['get', 'create', 'delete']
  - apiGroups: ['rbac.authorization.k8s.io']
    resources: ['rolebindings']
    verbs: ['get', 'create']
  - apiGroups: ['rbac.authorization.k8s.io']
    resources: ['clusterroles']
    verbs: ['bind']
    resourceNames: ['marsa-deployer']
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: marsa-namespace-manager
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: marsa-namespace-manager
subjects:
  - kind: ServiceAccount
    name: marsa-api
    namespace: {{ .Release.Namespace }}
```
<!-- prettier-ignore-end -->

- [ ] **Step 3: `admission-policy.yml`**

```yaml
# RBAC can't scope namespace create/delete or RoleBinding placement by label, so this does:
# marsa-api may only create namespaces it labels as its own, only delete/modify those, and
# only bind marsa-deployer (to itself) inside them. Other identities are unaffected.
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingAdmissionPolicy
metadata:
  name: marsa-api-namespace-fence
spec:
  failurePolicy: Fail
  matchConstraints:
    resourceRules:
      - apiGroups: ['']
        apiVersions: ['v1']
        operations: ['CREATE', 'UPDATE', 'DELETE']
        resources: ['namespaces']
      - apiGroups: ['rbac.authorization.k8s.io']
        apiVersions: ['v1']
        operations: ['CREATE', 'UPDATE', 'DELETE']
        resources: ['rolebindings']
  matchConditions:
    - name: marsa-api-only
      expression: "request.userInfo.username == 'system:serviceaccount:{{ .Release.Namespace }}:marsa-api'"
  variables:
    - name: isNamespace
      expression: "request.resource.resource == 'namespaces'"
  validations:
    - expression: >-
        !variables.isNamespace || request.operation != 'CREATE' ||
        (has(object.metadata.labels) && 'marsa.cloud/managed-by' in object.metadata.labels &&
        object.metadata.labels['marsa.cloud/managed-by'] == 'marsa-api')
      message: marsa-api may only create namespaces labelled marsa.cloud/managed-by=marsa-api
    - expression: >-
        !variables.isNamespace || request.operation == 'CREATE' ||
        (has(oldObject.metadata.labels) && 'marsa.cloud/managed-by' in oldObject.metadata.labels &&
        oldObject.metadata.labels['marsa.cloud/managed-by'] == 'marsa-api')
      message: marsa-api may only modify or delete namespaces it manages
    - expression: >-
        variables.isNamespace ||
        (has(namespaceObject.metadata.labels) && 'marsa.cloud/managed-by' in namespaceObject.metadata.labels &&
        namespaceObject.metadata.labels['marsa.cloud/managed-by'] == 'marsa-api')
      message: marsa-api may only write RoleBindings inside namespaces it manages
    - expression: >-
        variables.isNamespace || request.operation == 'DELETE' ||
        (object.roleRef.kind == 'ClusterRole' && object.roleRef.name == 'marsa-deployer' &&
        object.subjects.all(s, s.kind == 'ServiceAccount' && s.name == 'marsa-api' &&
        s.namespace == '{{ .Release.Namespace }}'))
      message: marsa-api may only bind marsa-deployer, and only to itself
---
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingAdmissionPolicyBinding
metadata:
  name: marsa-api-namespace-fence
spec:
  policyName: marsa-api-namespace-fence
  validationActions: [Deny]
```

- [ ] **Step 4: Deployment, values, schema, comments, version**

`templates/deployment.yml` — in the marsa-api container's `env:` list, append:

```yaml
- name: MARSA_API_NAMESPACE
  valueFrom:
    fieldRef:
      fieldPath: metadata.namespace
```

- `git rm charts/marsa/templates/apps-namespace.yml`
- `values.yaml`: delete the `appsNamespace` key and its comment block.
- `values.schema.json`: delete the `appsNamespace` property (the schema is `additionalProperties: false`, so an old values file that still sets it now fails loudly — intended).
- `templates/traefik-config.yaml`: in the residual-risk comment, replace "rbac.yml scopes it to `appsNamespace` precisely so it cannot touch other namespaces" with "rbac.yml + admission-policy.yml scope it to the namespaces it manages", and "`*` on core resources in appsNamespace" with "`*` on core resources in every environment namespace".
- `Chart.yaml`: `version: 0.0.1-alpha.8`.

- [ ] **Step 5: Verify, render, commit**

```bash
cd ../marsa-charts || exit 1
helm unittest charts/marsa
helm lint charts/marsa
helm template marsa charts/marsa --namespace marsa | grep -n "appsNamespace\|marsa-apps"
```

Expected: unittest PASS, lint clean, the grep prints nothing.

```bash
git add charts/marsa/templates/rbac.yml charts/marsa/templates/admission-policy.yml charts/marsa/templates/deployment.yml charts/marsa/templates/traefik-config.yaml charts/marsa/values.yaml charts/marsa/values.schema.json charts/marsa/Chart.yaml charts/marsa/tests/rbac_test.yaml charts/marsa/tests/admission-policy_test.yaml
git commit -m "feat: let marsa-api manage per-environment namespaces behind an admission fence

Refs marsa-cloud/marsa#142"
```

Open the PR and stop at the merge gate; the chart release follows its merge.

---

### Task 12: Cluster e2e exercises projects, environments, and the fence; docs

**Files:**

- Modify: `scripts/e2e-test.sh`
- Modify: root `.claude/CLAUDE.md` (only if it names `marsa-apps` / `MARSA_APPS_NAMESPACE` — `grep -n` first)

- [ ] **Step 1: Replace the deploy stages of `scripts/e2e-test.sh`**

Delete the `APPS_NS=...` line. Add near the other constants:

```bash
PROJECT_SLUG="e2e"
ENV_SLUG="dev"
APPS_NS="${PROJECT_SLUG}-${ENV_SLUG}"
```

Replace everything from `echo "== stage: deploy app via API =="` up to (not including) `echo "== stage: k8s resources created =="` with:

```bash
echo "== stage: create project + environment =="
api="https://api.${BASE_DOMAIN}${PORT_SUFFIX}/api/v1"
for attempt in $(seq 1 20); do
  http -X POST "${api}/projects" -H 'Content-Type: application/json' -H "Cookie: ${cookie}" \
    -d "{\"name\":\"E2E\",\"slug\":\"${PROJECT_SLUG}\"}" || true
  echo "  attempt ${attempt}: POST /projects -> ${HTTP_STATUS}"
  case "$HTTP_STATUS" in 2??|409) break ;; esac
  sleep 3
done
case "$HTTP_STATUS" in 2??|409) : ;; *) fail project "POST /projects -> ${HTTP_STATUS}; body: ${HTTP_BODY}" ;; esac

http -X POST "${api}/projects/${PROJECT_SLUG}/environments" -H 'Content-Type: application/json' \
  -H "Cookie: ${cookie}" -d "{\"name\":\"Dev\",\"slug\":\"${ENV_SLUG}\"}" || true
case "$HTTP_STATUS" in 2??|409) : ;; *) fail environment "POST environments -> ${HTTP_STATUS}; body: ${HTTP_BODY}" ;; esac

http "${api}/projects/${PROJECT_SLUG}/environments" -H "Cookie: ${cookie}" || true
env_uuid="$(printf '%s' "$HTTP_BODY" | grep -oE '"uuid":"[0-9a-f-]{36}"' | head -1 | cut -d'"' -f4)"
[ -n "$env_uuid" ] || fail environment "no environment uuid in: ${HTTP_BODY}"

echo "== stage: environment namespace provisioned =="
kubectl get ns "$APPS_NS" -o jsonpath='{.metadata.labels.marsa\.cloud/managed-by}' | grep -qx marsa-api \
  || fail namespace "namespace ${APPS_NS} missing or not labelled managed-by=marsa-api"
kubectl -n "$APPS_NS" get rolebinding marsa-deployer >/dev/null \
  || fail namespace "RoleBinding marsa-deployer missing in ${APPS_NS}"

echo "== stage: admission fence holds =="
# Server-side dry run runs admission. Target the release namespace: kube-public is refused by
# Kubernetes itself, which would pass without the policy.
fence_out="$(kubectl --as="system:serviceaccount:${NS}:marsa-api" delete ns "$NS" --dry-run=server 2>&1 || true)"
printf '%s' "$fence_out" | grep -q 'marsa-api-namespace-fence' \
  || fail fence "deleting ${NS} as marsa-api was not refused by the fence: ${fence_out}"

echo "== stage: deploy app via API =="
create_status=""
for attempt in $(seq 1 20); do
  http -X POST "${api}/apps" \
    -H 'Content-Type: application/json' \
    -H "Cookie: ${cookie}" \
    -d "{\"slug\":\"${APP_SLUG}\",\"image\":\"${APP_IMAGE}\",\"containerPort\":80,\"environmentUuid\":\"${env_uuid}\"}" || true
  create_status="$HTTP_STATUS"
  echo "  attempt ${attempt}: POST /apps -> ${create_status}"
  case "$create_status" in
    2??|409) break ;;
  esac
  sleep 3
done
case "$create_status" in
  2??|409) : ;;
  *) fail deploy "POST /apps -> ${create_status}; body: ${HTTP_BODY}" ;;
esac

http -X POST "${api}/apps/${APP_SLUG}/releases" \
  -H 'Content-Type: application/json' -H "Cookie: ${cookie}" -d '{}' || true
case "$HTTP_STATUS" in
  2??) : ;;
  *) fail deploy "POST /apps/${APP_SLUG}/releases -> ${HTTP_STATUS}; body: ${HTTP_BODY}" ;;
esac
http -X POST "${api}/apps/${APP_SLUG}/deploy" -H "Cookie: ${cookie}" || true
case "$HTTP_STATUS" in
  2??) : ;;
  *) fail deploy "POST /apps/${APP_SLUG}/deploy -> ${HTTP_STATUS}; body: ${HTTP_BODY}" ;;
esac
```

(The existing `k8s resources created` and KEDA stages keep using `$APPS_NS`, which now names the derived namespace.)

- [ ] **Step 2: Replace the reachability stage's `exit 0` with teardown assertions**

Change the reachability loop so success `break`s instead of `exit 0`, then append:

```bash
reachable=""
for _ in $(seq 1 30); do
  if http "https://${APP_SLUG}.${BASE_DOMAIN}${PORT_SUFFIX}/" && [ "$HTTP_STATUS" = 200 ]; then
    reachable=1
    break
  fi
  sleep 2
done
[ -n "$reachable" ] || fail app-reachable "GET https://${APP_SLUG}.${BASE_DOMAIN}${PORT_SUFFIX}/ -> ${HTTP_STATUS}; body: ${HTTP_BODY}"
echo "  ${APP_SLUG}.${BASE_DOMAIN} reachable over HTTPS (200)"

echo "== stage: environment delete is blocked while it has an app =="
env_url="${api}/projects/${PROJECT_SLUG}/environments/${ENV_SLUG}"
http -X DELETE "$env_url" -H "Cookie: ${cookie}" || true
[ "$HTTP_STATUS" = 409 ] || fail env-delete "expected 409 deleting a non-empty environment, got ${HTTP_STATUS}"

echo "== stage: teardown =="
http -X DELETE "${api}/apps/${APP_SLUG}" -H "Cookie: ${cookie}" || true
[ "$HTTP_STATUS" = 204 ] || fail teardown "DELETE /apps/${APP_SLUG} -> ${HTTP_STATUS}; body: ${HTTP_BODY}"
http -X DELETE "$env_url" -H "Cookie: ${cookie}" || true
[ "$HTTP_STATUS" = 204 ] || fail teardown "DELETE environment -> ${HTTP_STATUS}; body: ${HTTP_BODY}"
kubectl wait --for=delete "ns/${APPS_NS}" --timeout=120s || fail teardown "namespace ${APPS_NS} was not deleted"
http -X DELETE "${api}/projects/${PROJECT_SLUG}" -H "Cookie: ${cookie}" || true
[ "$HTTP_STATUS" = 204 ] || fail teardown "DELETE /projects/${PROJECT_SLUG} -> ${HTTP_STATUS}"

echo "E2E PASS"
```

- [ ] **Step 3: Run it against k3d**

Needs the Task 11 chart **published** (install pulls the latest). With the marsa PR labelled `preview` (root `.claude/CLAUDE.md` § "Clicking through a branch on a real cluster"):

```bash
MARSA_E2E_HTTP_PORT=8080 bash scripts/e2e-up.sh --image-tag sha-<short>
bash scripts/e2e-test.sh
pnpm e2e:down
```

Expected: `E2E PASS`. `bash -n scripts/e2e-test.sh` must be clean regardless.

- [ ] **Step 4: Docs + commit**

`grep -n "marsa-apps\|MARSA_APPS_NAMESPACE" .claude/CLAUDE.md docs/local-dev.md` — update any hit to describe per-environment namespaces (`<project>-<environment>`). Then:

```bash
git add scripts/e2e-test.sh .claude/CLAUDE.md docs/local-dev.md
git commit -m "test: cover projects, environments and the namespace fence in the cluster e2e

Refs #142"
```

(Only `git add` the doc files that actually changed.)

---

## Finishing

- [ ] Full local gate from the repo root: `pnpm format:check && pnpm lint && pnpm --filter api test && pnpm --filter web test && pnpm --filter web typecheck && pnpm build:web`.
- [ ] `git diff main -- apps/api/openapi.json apps/web/app/api` is committed and matches a fresh `generate:openapi` + `generate:api` (CI drift check).
- [ ] Open the marsa PR (`feat(#142): projects and environments with per-environment namespaces`), glossary included, linking the marsa-charts PR. Get the Rex review; the PR touches `**/kubernetes/**` RBAC-adjacent code and the chart touches RBAC — run the security review too.
- [ ] **Stop at the per-PR CEO merge gate for both PRs.** Chart merges and releases first.
