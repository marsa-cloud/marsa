# Attach a Database to an App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An operator attaches a database to an app and the app's pods receive that database's connection variables as `secretKeyRef` entries — Marsa never copying the password (#207).

**Architecture:** An attachment is a row in `database_attachment` joining an app to a database with an optional alias. It is _placement_, not config: never snapshotted onto a `Release`, resolved live by every deploy path, and re-applied immediately when it changes. `deploySpecOf` turns attachments plus the app's own env into the final env set — applying the alias prefix and dropping any colliding app-owned variable — and the Kubernetes adapter expands each attachment into `secretKeyRef` entries against the database's existing `<slug>-credentials` Secret.

**Tech Stack:** NestJS 11 on Fastify (ESM, Node ≥ 24), Drizzle (`drizzle-orm@1.0.0-rc.4`, Postgres 18), `@kubernetes/client-node`, `node:test` + `expect` + `sinon`, Nuxt 4 + Nuxt UI v4 + Vitest, k3d.

**Design spec:** `docs/superpowers/specs/2026-09-23-attach-database-design.md`. Read it before Task 1.

## Global Constraints

- **Branch:** `feature/207-attach-database`, already created off `feature/206-database-resource`. The PR targets **that branch**, not `main`, until #235 merges.
- **Run `npx prettier --write <paths>` on what you touched before each commit**; never run repo-wide `pnpm format` (a watcher rewrites files it should ignore).
- **Comments:** minimum, single-line, why-not-what. No JSDoc `@param` / `@returns`.
- **Never hand-edit** `apps/api/src/sql/drizzle/**`, `apps/api/openapi.json`, or `apps/web/app/api/**`. Regenerate and commit.
- **API tests** run against compiled output: `pnpm --filter api test`. No watch mode.
- **Coverage floors are ratchets** — api lines 80 / branches 75 / functions 75; web lines+statements 88 / branches 85 / functions 60.
- **Alias shape:** `^[a-z][a-z0-9-]*$`, max 63 chars, normalised to `UPPER_SNAKE` + `_` for the env prefix (`analytics` → `ANALYTICS_`). Omitted alias = unprefixed.
- **Published keys, in this order:** `DATABASE_URL`, `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`.
- **Imports** use `#src/...` with an explicit `.js` extension; features import `#src/modules/runtime/*`, never an adapter (tests may import the mock).
- **Cross-feature rule:** a feature may import another feature's `entities/`, `queries/`, `enums/`, `errors/`, `events/` — never its use-cases, repositories, commands or responses.

---

## File Structure

**API — runtime (`apps/api/src/modules/runtime/`)**

| File                                                                   | Responsibility                                                                                                           |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `runtime.types.ts` (modify)                                            | `SecretEnvRef` moves here from the persistent renderer; add `AttachedDatabaseSpec`; add `attachments` to `AppDeploySpec` |
| `adapters/kubernetes/persistent/persistent-workload.types.ts` (modify) | Re-export/import `SecretEnvRef` instead of declaring it                                                                  |
| `adapters/kubernetes/app/render/render-manifests.ts` (modify)          | Expand `attachments` into `secretKeyRef` env entries                                                                     |

**API — database feature (`apps/api/src/app/database/`)**

| File                                                                 | Responsibility                                            |
| -------------------------------------------------------------------- | --------------------------------------------------------- |
| `entities/database-attachment.table.ts` · `.uuid.ts` · `.builder.ts` | Row, brand, test builder                                  |
| `entities/engine-catalogue.ts` (modify)                              | Add `publishedKeys` to each entry                         |
| `entities/attachment-env.ts`                                         | `envPrefixOf(alias)`, pure                                |
| `queries/app-attachments.ts`                                         | `selectAttachmentsForApp`, `AttachedDatabase`             |
| `queries/dependent-apps.ts`                                          | `dependentAppsOf` for the 409 body and the Used-by list   |
| `use-cases/attach-database/**` · `detach-database/**`                | The two writes, routed under `/apps/:slug/attachments`    |
| `use-cases/view-app-attachment-index/**`                             | `GET /v1/apps/:slug/attachments` for the app page         |
| `use-cases/view-database-dependent-index/**`                         | `GET /v1/databases/:slug/dependents` for the Used-by list |
| `use-cases/delete-database/*` (modify)                               | 409 on the FK violation, naming dependents                |
| `use-cases/view-database-index/*` (modify)                           | Optional `environmentUuid` filter                         |

**API — release (`apps/api/src/app/release/`)**

| File                                                                              | Responsibility                                        |
| --------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `entities/release-deploy-spec.ts` (modify)                                        | Accept `attachments`, apply prefixes, drop collisions |
| `use-cases/deploy-release/deploy-release.repository.ts` + `.use-case.ts` (modify) | Load attachments, pass them in                        |

**API — app-management:** `use-cases/update-app/update-app.repository.ts` + `.use-case.ts` (modify) — same load, in `reapply`.

**Web (`apps/web/app/`):** `composables/useAppAttachments.ts`, `useAttachDatabase.ts`, `useDetachDatabase.ts`, `useDatabaseDependents.ts`; `components/AppDatabasesCard.vue`; `pages/apps/[slug].vue` and `components/AppConfigForm.vue` (override badge); `pages/databases/[slug].vue` (Used by).

**Scripts:** `scripts/e2e-test.sh` (attachment stage).

---

### Task 1: Runtime port and renderer carry attachments

**Files:**

- Modify: `apps/api/src/modules/runtime/runtime.types.ts`
- Modify: `apps/api/src/modules/runtime/adapters/kubernetes/persistent/persistent-workload.types.ts`
- Modify: `apps/api/src/modules/runtime/adapters/kubernetes/app/render/render-manifests.ts`
- Test: `apps/api/src/modules/runtime/adapters/kubernetes/app/render/tests/render-manifests.unit.test.ts` (extend)

**Interfaces:**

- Consumes: `credentialsSecretName(slug)` from `#src/modules/runtime/adapters/kubernetes/database/render-credentials-secret.js` (shipped by #206).
- Produces: `SecretEnvRef { name, secret, key }` (now exported from `runtime.types.ts`), `AttachedDatabaseSpec { databaseSlug, envPrefix, keys }`, and `AppDeploySpec.attachments: AttachedDatabaseSpec[]` (required, `[]` when none).

- [ ] **Step 1: Move `SecretEnvRef` and add the attachment spec**

In `apps/api/src/modules/runtime/runtime.types.ts`, add:

```ts
export interface SecretEnvRef {
  name: string
  secret: string
  key: string
}

// What the app should receive, not how: the adapter decides this means a secretKeyRef.
export interface AttachedDatabaseSpec {
  databaseSlug: string
  envPrefix: string | null
  keys: string[]
}
```

and add to `AppDeploySpec`, after `env`:

```ts
  attachments: AttachedDatabaseSpec[]
```

In `apps/api/src/modules/runtime/adapters/kubernetes/persistent/persistent-workload.types.ts`, delete the local `SecretEnvRef` declaration and import it instead, re-exporting so existing importers keep working:

```ts
import type { NodePinSpec, SecretEnvRef } from '#src/modules/runtime/runtime.types.js'

export type { SecretEnvRef }
```

- [ ] **Step 2: Write the failing renderer test**

Append inside the existing `describe` in `apps/api/src/modules/runtime/adapters/kubernetes/app/render/tests/render-manifests.unit.test.ts` (read the file first and reuse its `spec()` helper, adding `attachments: []` to its defaults):

```ts
it('expands an unprefixed attachment into secretKeyRef entries', () => {
  const { deployment } = renderManifests(
    'billing-api',
    spec({
      attachments: [{ databaseSlug: 'orders', envPrefix: null, keys: ['DATABASE_URL', 'PGHOST'] }],
    }),
  )

  expect(deployment.spec?.template.spec?.containers[0]?.env).toEqual([
    {
      name: 'DATABASE_URL',
      valueFrom: { secretKeyRef: { name: 'orders-credentials', key: 'DATABASE_URL' } },
    },
    {
      name: 'PGHOST',
      valueFrom: { secretKeyRef: { name: 'orders-credentials', key: 'PGHOST' } },
    },
  ])
})

it('prefixes an aliased attachment without changing the Secret key it reads', () => {
  const { deployment } = renderManifests(
    'billing-api',
    spec({
      attachments: [
        { databaseSlug: 'analytics-db', envPrefix: 'ANALYTICS_', keys: ['DATABASE_URL'] },
      ],
    }),
  )

  expect(deployment.spec?.template.spec?.containers[0]?.env).toEqual([
    {
      name: 'ANALYTICS_DATABASE_URL',
      valueFrom: { secretKeyRef: { name: 'analytics-db-credentials', key: 'DATABASE_URL' } },
    },
  ])
})

it('keeps plain env first, then the attachment refs', () => {
  const { deployment } = renderManifests(
    'billing-api',
    spec({
      env: { LOG_LEVEL: 'info' },
      attachments: [{ databaseSlug: 'orders', envPrefix: null, keys: ['DATABASE_URL'] }],
    }),
  )

  const env = deployment.spec?.template.spec?.containers[0]?.env
  expect(env?.[0]).toEqual({ name: 'LOG_LEVEL', value: 'info' })
  expect(env?.[1]?.name).toBe('DATABASE_URL')
})

it('never puts a literal value on an attachment variable', () => {
  const { deployment } = renderManifests(
    'billing-api',
    spec({ attachments: [{ databaseSlug: 'orders', envPrefix: null, keys: ['PGPASSWORD'] }] }),
  )

  const entry = deployment.spec?.template.spec?.containers[0]?.env?.[0]
  expect(entry?.value).toBeUndefined()
  expect(entry?.valueFrom?.secretKeyRef?.name).toBe('orders-credentials')
})
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `cd apps/api && pnpm typecheck`
Expected: FAIL — every existing `spec()` literal and `deploySpecOf` call is missing the new required `attachments` property, and `renderManifests` ignores it.

- [ ] **Step 4: Expand attachments in the renderer**

In `apps/api/src/modules/runtime/adapters/kubernetes/app/render/render-manifests.ts`, import the Secret-name helper and build the extra entries:

```ts
import { credentialsSecretName } from '#src/modules/runtime/adapters/kubernetes/database/render-credentials-secret.js'
```

Replace the existing `const env = …` line with:

```ts
const env = [
  ...Object.entries(spec.env).map(([key, value]) => ({ name: key, value })),
  ...spec.attachments.flatMap((attachment) =>
    attachment.keys.map((key) => ({
      name: `${attachment.envPrefix ?? ''}${key}`,
      valueFrom: {
        secretKeyRef: { name: credentialsSecretName(attachment.databaseSlug), key },
      },
    })),
  ),
]
```

Fix the compile errors this surfaces by adding `attachments: []` to every `AppDeploySpec` literal in existing tests (`kubernetes-app-runtime.unit.test.ts`, `render-manifests.unit.test.ts`) and to `deploySpecOf`'s return in `apps/api/src/app/release/entities/release-deploy-spec.ts` — Task 4 replaces that placeholder with the real value.

- [ ] **Step 5: Run the tests and verify they pass**

Run: `cd apps/api && pnpm typecheck && pnpm test 2>&1 | grep -E '^ℹ (tests|pass|fail)'`
Expected: `fail 0`, with the four new renderer tests counted.

- [ ] **Step 6: Commit**

```bash
npx prettier --write apps/api/src/modules/runtime apps/api/src/app/release/entities/release-deploy-spec.ts
git add apps/api/src/modules/runtime apps/api/src/app/release/entities/release-deploy-spec.ts
git commit -m "feat(#207): carry database attachments through the runtime port

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The `database_attachment` table

**Files:**

- Create: `apps/api/src/app/database/entities/database-attachment.uuid.ts`, `database-attachment.table.ts`, `database-attachment.builder.ts`
- Modify: `apps/api/src/sql/schema.ts`, `apps/api/src/sql/relations.ts`
- Generated: `apps/api/src/sql/drizzle/<timestamp>_*/`

**Interfaces:**

- Produces: `DatabaseAttachmentUuid`, `databaseAttachmentTable`, `DatabaseAttachmentRow`, `DatabaseAttachmentBuilder` with `withApp(app)` / `withDatabase(database)` / `withAlias(alias)`.

- [ ] **Step 1: Write the uuid brand and the table**

`apps/api/src/app/database/entities/database-attachment.uuid.ts`:

```ts
import type { Uuid } from '#src/utils/uuid.js'

export type DatabaseAttachmentUuid = Uuid<'DatabaseAttachment'>
```

`apps/api/src/app/database/entities/database-attachment.table.ts`:

```ts
import { sql } from 'drizzle-orm'
import { pgTable, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import { databaseTable } from '#src/app/database/entities/database.table.js'
import type { DatabaseAttachmentUuid } from '#src/app/database/entities/database-attachment.uuid.js'
import type { DatabaseUuid } from '#src/app/database/entities/database.uuid.js'
import { ALIAS_MAX_LENGTH } from '#src/app/database/entities/attachment-env.js'
import { timestamps } from '#src/sql/timestamps.js'

export const databaseAttachmentTable = pgTable(
  'database_attachment',
  {
    uuid: uuid()
      .$type<DatabaseAttachmentUuid>()
      .primaryKey()
      .default(sql`uuidv7()`),
    appUuid: uuid('app_uuid')
      .$type<AppUuid>()
      .notNull()
      .references(() => appTable.uuid, { onDelete: 'cascade', onUpdate: 'cascade' }),
    // restrict is the mechanism behind "deleting an attached database is blocked".
    databaseUuid: uuid('database_uuid')
      .$type<DatabaseUuid>()
      .notNull()
      .references(() => databaseTable.uuid, { onDelete: 'restrict', onUpdate: 'cascade' }),
    alias: varchar({ length: ALIAS_MAX_LENGTH }),
    ...timestamps,
  },
  (table) => [
    // nullsNotDistinct: two unprefixed attachments both hold a null alias, and a plain unique
    // index treats those as distinct — which is exactly the case this must reject.
    unique('database_attachment_app_uuid_alias_unique')
      .on(table.appUuid, table.alias)
      .nullsNotDistinct(),
    unique('database_attachment_app_uuid_database_uuid_unique').on(
      table.appUuid,
      table.databaseUuid,
    ),
  ],
)

export type DatabaseAttachmentRow = typeof databaseAttachmentTable.$inferSelect
export type NewDatabaseAttachmentRow = typeof databaseAttachmentTable.$inferInsert
```

- [ ] **Step 2: Write the alias helper the table imports**

`apps/api/src/app/database/entities/attachment-env.ts`:

```ts
export const ALIAS_PATTERN = /^[a-z][a-z0-9-]*$/
export const ALIAS_MAX_LENGTH = 63

/** `analytics-db` → `ANALYTICS_DB_`; null stays null, which is the unprefixed attachment. */
export function envPrefixOf(alias: string | null): string | null {
  return alias === null ? null : `${alias.replaceAll('-', '_').toUpperCase()}_`
}
```

- [ ] **Step 3: Write the builder**

`apps/api/src/app/database/entities/database-attachment.builder.ts`:

```ts
import type { App } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import type { DatabaseRow } from '#src/app/database/entities/database.table.js'
import type { DatabaseAttachmentRow } from '#src/app/database/entities/database-attachment.table.js'
import type { DatabaseAttachmentUuid } from '#src/app/database/entities/database-attachment.uuid.js'
import type { DatabaseUuid } from '#src/app/database/entities/database.uuid.js'
import { generateUuid } from '#src/utils/uuid.js'

export class DatabaseAttachmentBuilder {
  private readonly attachment: DatabaseAttachmentRow

  constructor() {
    const now = new Date()
    this.attachment = {
      uuid: generateUuid<DatabaseAttachmentUuid>(),
      appUuid: generateUuid<AppUuid>(),
      databaseUuid: generateUuid<DatabaseUuid>(),
      alias: null,
      createdAt: now,
      updatedAt: now,
    }
  }

  withApp(app: App): this {
    this.attachment.appUuid = app.uuid
    return this
  }

  withDatabase(database: DatabaseRow): this {
    this.attachment.databaseUuid = database.uuid
    return this
  }

  withAlias(alias: string | null): this {
    this.attachment.alias = alias
    return this
  }

  build(): DatabaseAttachmentRow {
    return this.attachment
  }
}
```

- [ ] **Step 4: Register in the schema barrel and relations**

Add to `apps/api/src/sql/schema.ts`, keeping alphabetical order:

```ts
export * from '#src/app/database/entities/database-attachment.table.js'
```

In `apps/api/src/sql/relations.ts`, add `attachments: r.many.databaseAttachmentTable(),` to both the `appTable` and `databaseTable` blocks, then a new block:

```ts
  databaseAttachmentTable: {
    app: r.one.appTable({
      from: r.databaseAttachmentTable.appUuid,
      to: r.appTable.uuid,
      optional: false,
    }),
    database: r.one.databaseTable({
      from: r.databaseAttachmentTable.databaseUuid,
      to: r.databaseTable.uuid,
      optional: false,
    }),
  },
```

- [ ] **Step 5: Generate the migration and check the unique index**

Run:

```bash
cd apps/api && set -a && . ./.env.test && set +a && pnpm db:generate
grep -A2 'app_uuid_alias_unique' src/sql/drizzle/*/migration.sql | tail -5
```

Expected: the newest migration creates `database_attachment` and its unique constraint carries `NULLS NOT DISTINCT`. If that phrase is absent, stop — the constraint would allow two unprefixed attachments, which is the one silent failure this table must not have.

- [ ] **Step 6: Run the tests**

Run: `cd apps/api && pnpm test 2>&1 | grep -E '^ℹ (tests|pass|fail)'`
Expected: `fail 0` — the migration applies during `test:setup`.

- [ ] **Step 7: Commit**

```bash
npx prettier --write apps/api/src/app/database apps/api/src/sql
git add apps/api/src/app/database apps/api/src/sql
git commit -m "feat(#207): add the database_attachment table

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Attachment queries and published keys

**Files:**

- Modify: `apps/api/src/app/database/entities/engine-catalogue.ts`
- Create: `apps/api/src/app/database/queries/app-attachments.ts`, `apps/api/src/app/database/queries/dependent-apps.ts`
- Test: `apps/api/src/app/database/entities/tests/engine-catalogue.unit.test.ts` (extend)

**Interfaces:**

- Produces:
  - `EngineCatalogueEntry.publishedKeys: string[]`
  - `AttachedDatabase { alias: string | null; databaseSlug: string; engine: DatabaseEngine; version: string }`
  - `selectAttachmentsForApp(tx: Executor, appUuid: AppUuid): Promise<AttachedDatabase[]>`
  - `dependentAppsOf(tx: Executor, databaseUuid: DatabaseUuid): Promise<string[]>` (app slugs, sorted)

- [ ] **Step 1: Write the failing catalogue test**

Append to `apps/api/src/app/database/entities/tests/engine-catalogue.unit.test.ts`:

```ts
it('publishes its variable names without needing a connection to name them', () => {
  const entry = catalogueEntry(DatabaseEngine.Postgres, '17')

  expect(entry?.publishedKeys).toEqual([
    'DATABASE_URL',
    'PGHOST',
    'PGPORT',
    'PGUSER',
    'PGPASSWORD',
    'PGDATABASE',
  ])
})

it('keeps publishedKeys in step with what publishedVariables actually returns', () => {
  const entry = catalogueEntry(DatabaseEngine.Postgres, '17')
  const produced = entry?.publishedVariables({
    host: 'h',
    port: 5432,
    user: 'u',
    password: 'p',
    database: 'd',
  })

  expect(Object.keys(produced ?? {}).sort()).toEqual([...(entry?.publishedKeys ?? [])].sort())
})
```

- [ ] **Step 2: Run it and verify it fails**

Run: `cd apps/api && pnpm typecheck`
Expected: FAIL — `publishedKeys` does not exist on `EngineCatalogueEntry`.

- [ ] **Step 3: Add `publishedKeys` to the catalogue**

In `apps/api/src/app/database/entities/engine-catalogue.ts`, add the field to the interface:

```ts
  publishedKeys: string[]
```

add the constant above `postgres()`:

```ts
const POSTGRES_PUBLISHED_KEYS = [
  'DATABASE_URL',
  'PGHOST',
  'PGPORT',
  'PGUSER',
  'PGPASSWORD',
  'PGDATABASE',
]
```

and add `publishedKeys: POSTGRES_PUBLISHED_KEYS,` to the object `postgres()` returns.

- [ ] **Step 4: Write the two queries**

`apps/api/src/app/database/queries/app-attachments.ts`:

```ts
import { asc, eq } from 'drizzle-orm'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import { databaseAttachmentTable } from '#src/app/database/entities/database-attachment.table.js'
import { databaseTable } from '#src/app/database/entities/database.table.js'
import type { DatabaseEngine } from '#src/app/database/enums/database-engine.enum.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

export interface AttachedDatabase {
  alias: string | null
  databaseSlug: string
  engine: DatabaseEngine
  version: string
}

// Ordered by uuid so the rendered env list is stable across deploys of unchanged config.
export function selectAttachmentsForApp(
  tx: Executor,
  appUuid: AppUuid,
): Promise<AttachedDatabase[]> {
  return tx
    .select({
      alias: databaseAttachmentTable.alias,
      databaseSlug: databaseTable.slug,
      engine: databaseTable.engine,
      version: databaseTable.version,
    })
    .from(databaseAttachmentTable)
    .innerJoin(databaseTable, eq(databaseAttachmentTable.databaseUuid, databaseTable.uuid))
    .where(eq(databaseAttachmentTable.appUuid, appUuid))
    .orderBy(asc(databaseAttachmentTable.uuid))
}
```

`apps/api/src/app/database/queries/dependent-apps.ts`:

```ts
import { asc, eq } from 'drizzle-orm'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { databaseAttachmentTable } from '#src/app/database/entities/database-attachment.table.js'
import type { DatabaseUuid } from '#src/app/database/entities/database.uuid.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

export async function dependentAppsOf(tx: Executor, databaseUuid: DatabaseUuid): Promise<string[]> {
  const rows = await tx
    .select({ slug: appTable.slug })
    .from(databaseAttachmentTable)
    .innerJoin(appTable, eq(databaseAttachmentTable.appUuid, appTable.uuid))
    .where(eq(databaseAttachmentTable.databaseUuid, databaseUuid))
    .orderBy(asc(appTable.slug))
  return rows.map((row) => row.slug)
}
```

- [ ] **Step 5: Run the tests**

Run: `cd apps/api && pnpm test 2>&1 | grep -E '^ℹ (tests|pass|fail)'`
Expected: `fail 0`.

- [ ] **Step 6: Commit**

```bash
npx prettier --write apps/api/src/app/database
git add apps/api/src/app/database
git commit -m "feat(#207): publish attachment queries and the engine's variable names

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `deploySpecOf` injects attachments

This is the task the whole feature hinges on: the prefixing and the collision rule live here, as pure functions, so every deploy path gets them.

**Files:**

- Modify: `apps/api/src/app/release/entities/release-deploy-spec.ts`
- Test: `apps/api/src/app/release/entities/tests/release-deploy-spec.unit.test.ts` (extend)

**Interfaces:**

- Consumes: `AttachedDatabase` (Task 3), `catalogueEntry` + `EngineCatalogueEntry.publishedKeys` (Task 3), `envPrefixOf` (Task 2), `AttachedDatabaseSpec` (Task 1).
- Produces: `DeploySpecOptions` gains `attachments: AttachedDatabase[]`; `deploySpecOf` returns a spec whose `env` has collided keys removed and whose `attachments` carry resolved prefixes and keys.

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/app/release/entities/tests/release-deploy-spec.unit.test.ts` (read it first; reuse its existing placement/release fixtures and add `attachments: []` to its current `deploySpecOf` calls):

```ts
const attached = (over: Partial<AttachedDatabase> = {}): AttachedDatabase => ({
  alias: null,
  databaseSlug: 'orders',
  engine: DatabaseEngine.Postgres,
  version: '17',
  ...over,
})

it('resolves an unprefixed attachment to the engine keys with no prefix', () => {
  const spec = deploySpecOf(placement, release, {
    baseDomain: 'demo.marsa.cc',
    attachments: [attached()],
  })

  expect(spec.attachments).toEqual([
    {
      databaseSlug: 'orders',
      envPrefix: null,
      keys: ['DATABASE_URL', 'PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE'],
    },
  ])
})

it('uppercases an alias into an env prefix', () => {
  const spec = deploySpecOf(placement, release, {
    baseDomain: 'demo.marsa.cc',
    attachments: [attached({ alias: 'analytics-db', databaseSlug: 'analytics-db' })],
  })

  expect(spec.attachments[0]?.envPrefix).toBe('ANALYTICS_DB_')
})

it('drops an app env entry the attachment overrides, keeping the rest', () => {
  const withEnv = {
    ...release,
    env: { DATABASE_URL: 'postgres://hand-written', LOG_LEVEL: 'info' },
  }

  const spec = deploySpecOf(placement, withEnv, {
    baseDomain: 'demo.marsa.cc',
    attachments: [attached()],
  })

  expect(spec.env).toEqual({ LOG_LEVEL: 'info' })
})

it('only drops the names the prefix actually claims', () => {
  const withEnv = {
    ...release,
    env: { DATABASE_URL: 'keep-me', ANALYTICS_DATABASE_URL: 'drop-me' },
  }

  const spec = deploySpecOf(placement, withEnv, {
    baseDomain: 'demo.marsa.cc',
    attachments: [attached({ alias: 'analytics', databaseSlug: 'analytics' })],
  })

  expect(spec.env).toEqual({ DATABASE_URL: 'keep-me' })
})

it('carries two attachments at once', () => {
  const spec = deploySpecOf(placement, release, {
    baseDomain: 'demo.marsa.cc',
    attachments: [attached(), attached({ alias: 'analytics', databaseSlug: 'analytics' })],
  })

  expect(spec.attachments.map((a) => a.envPrefix)).toEqual([null, 'ANALYTICS_'])
})

it('ignores an attachment whose engine version left the catalogue', () => {
  const spec = deploySpecOf(placement, release, {
    baseDomain: 'demo.marsa.cc',
    attachments: [attached({ version: '15' })],
  })

  expect(spec.attachments).toEqual([])
})
```

with the imports `AttachedDatabase` from `#src/app/database/queries/app-attachments.js` and `DatabaseEngine` from `#src/app/database/enums/database-engine.enum.js`.

- [ ] **Step 2: Run it and verify it fails**

Run: `cd apps/api && pnpm typecheck`
Expected: FAIL — `DeploySpecOptions` has no `attachments`.

- [ ] **Step 3: Implement the injection**

Rewrite `apps/api/src/app/release/entities/release-deploy-spec.ts` so it reads:

```ts
import type { NodePin } from '#src/app/app-management/entities/node-pin.js'
import { PinStrategy } from '#src/app/app-management/enums/pin-strategy.enum.js'
import type { AppPlacement } from '#src/app/app-management/queries/app-placement.js'
import { envPrefixOf } from '#src/app/database/entities/attachment-env.js'
import { catalogueEntry } from '#src/app/database/entities/engine-catalogue.js'
import type { AttachedDatabase } from '#src/app/database/queries/app-attachments.js'
import type { Release } from '#src/app/release/entities/release.table.js'
import {
  type AppDeploySpec,
  type AttachedDatabaseSpec,
  type NodePinSpec,
  NodePinStrategy,
  type RegistryCredentials,
} from '#src/modules/runtime/runtime.types.js'

export interface DeploySpecOptions {
  baseDomain: string
  attachments: AttachedDatabase[]
  credentials?: RegistryCredentials
}

// The pin is placement, not config: it comes from the app today, never from the release.
// Attachments are placement for the same reason (#207).
export function deploySpecOf(
  placement: AppPlacement,
  release: Release,
  { baseDomain, attachments, credentials }: DeploySpecOptions,
): AppDeploySpec {
  const { app } = placement
  const resolved = resolveAttachments(attachments)
  return {
    releaseUuid: release.uuid,
    image: release.imageRef,
    port: release.containerPort,
    env: withoutInjectedNames(release.env, resolved),
    minReplicas: release.minReplicas,
    maxReplicas: release.maxReplicas,
    host: `${app.slug}.${baseDomain}`,
    nodePin: nodePinSpecOf(app.nodePin),
    attachments: resolved,
    ...(credentials ? { credentials } : {}),
  }
}

// An attachment whose engine-major is no longer in the catalogue cannot name its keys, so it
// injects nothing rather than guessing.
function resolveAttachments(attachments: AttachedDatabase[]): AttachedDatabaseSpec[] {
  return attachments.flatMap((attachment) => {
    const entry = catalogueEntry(attachment.engine, attachment.version)
    if (!entry) {
      return []
    }
    return [
      {
        databaseSlug: attachment.databaseSlug,
        envPrefix: envPrefixOf(attachment.alias),
        keys: entry.publishedKeys,
      },
    ]
  })
}

// The attachment wins a name collision, and it wins here rather than in the manifest — two env
// entries with one name resolve silently in Kubernetes.
function withoutInjectedNames(
  env: Record<string, string>,
  attachments: AttachedDatabaseSpec[],
): Record<string, string> {
  const injected = new Set(
    attachments.flatMap((attachment) =>
      attachment.keys.map((key) => `${attachment.envPrefix ?? ''}${key}`),
    ),
  )
  return Object.fromEntries(Object.entries(env).filter(([key]) => !injected.has(key)))
}

function nodePinSpecOf(nodePin: NodePin | null): NodePinSpec | null {
  if (!nodePin) {
    return null
  }
  const strategy =
    nodePin.strategy === PinStrategy.Required ? NodePinStrategy.Required : NodePinStrategy.Preferred
  return { key: nodePin.key, values: nodePin.values, strategy }
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd apps/api && pnpm typecheck 2>&1 | tail -5`
Expected: FAIL, listing exactly the two existing call sites (`deploy-release.use-case.ts`, `update-app.use-case.ts`) that don't pass `attachments`. That failure is the point — it proves no deploy path can silently skip the load. Task 5 fixes them.

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/api/src/app/release/entities
git add apps/api/src/app/release/entities
git commit -m "feat(#207): inject attachment variables when building a deploy spec

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

> This commit leaves the api not compiling. That is deliberate and lasts one task; if you prefer a green tree at every commit, fold Tasks 4 and 5 into one.

---

### Task 5: Both existing deploy paths load attachments

**Files:**

- Modify: `apps/api/src/app/release/use-cases/deploy-release/deploy-release.repository.ts` + `deploy-release.use-case.ts`
- Modify: `apps/api/src/app/app-management/use-cases/update-app/update-app.repository.ts` + `update-app.use-case.ts`
- Test: `apps/api/src/app/release/use-cases/deploy-release/tests/deploy-release.use-case.unit.test.ts` (extend)
- Test: `apps/api/src/app/app-management/use-cases/update-app/tests/update-app.use-case.unit.test.ts` (extend)

**Interfaces:**

- Consumes: `selectAttachmentsForApp` (Task 3), `deploySpecOf` (Task 4).
- Produces: `DeployReleaseRepository.findAttachments(tx, appUuid)` and `UpdateAppRepository.findAttachments(tx, appUuid)`, both `Promise<AttachedDatabase[]>`.

- [ ] **Step 1: Write the failing tests**

In `deploy-release.use-case.unit.test.ts` (read it first; stub the new repository method with `repository.findAttachments.resolves([])` in its existing `build()`), append:

```ts
  it('deploys with the app's attachments injected', async () => {
    const { repository, appRuntime, usecase } = build()
    repository.findAttachments.resolves([
      { alias: null, databaseSlug: 'orders', engine: DatabaseEngine.Postgres, version: '17' },
    ])

    await usecase.execute('my-app')

    expect(appRuntime.deploy.firstCall.args[1].attachments).toEqual([
      {
        databaseSlug: 'orders',
        envPrefix: null,
        keys: ['DATABASE_URL', 'PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE'],
      },
    ])
  })
```

In `update-app.use-case.unit.test.ts` (same treatment), append:

```ts
it('keeps attachments injected when a pin change re-applies the live release', async () => {
  const { repository, appRuntime, usecase } = build()
  repository.findAttachments.resolves([
    { alias: null, databaseSlug: 'orders', engine: DatabaseEngine.Postgres, version: '17' },
  ])

  await usecase.execute('my-app', {
    nodePin: { key: 'kubernetes.io/hostname', values: ['node-b'], strategy: PinStrategy.Required },
  } as UpdateAppCommand)

  expect(appRuntime.deploy.firstCall.args[1].attachments).toHaveLength(1)
})
```

Both need `import { DatabaseEngine } from '#src/app/database/enums/database-engine.enum.js'`.

- [ ] **Step 2: Run them and verify they fail**

Run: `cd apps/api && pnpm typecheck 2>&1 | tail -5`
Expected: FAIL — `findAttachments` is not a member of either repository.

- [ ] **Step 3: Add the repository method to both**

Append to `DeployReleaseRepository` **and** to `UpdateAppRepository` (identical body; they are separate use-case-scoped repositories by convention):

```ts
  // Attachments are placement, so they are read live rather than restored from the release.
  findAttachments(tx: Executor, appUuid: AppUuid): Promise<AttachedDatabase[]> {
    return selectAttachmentsForApp(tx, appUuid)
  }
```

with imports:

```ts
import type { AttachedDatabase } from '#src/app/database/queries/app-attachments.js'
import { selectAttachmentsForApp } from '#src/app/database/queries/app-attachments.js'
```

- [ ] **Step 4: Load and pass them in both use-cases**

In `deploy-release.use-case.ts`, change `deploy` to take the attachments (it already receives `tx` through its caller — thread it):

```ts
  private async deploy(tx: Executor, placement: AppPlacement, release: Release): Promise<void> {
    const credentials = this.cipher.openForApp(placement.app.slug, release.imagePullCredentialsEnc)
    const attachments = await this.repository.findAttachments(tx, placement.app.uuid)
    const spec = deploySpecOf(placement, release, {
      baseDomain: this.baseDomain,
      attachments,
      credentials,
    })
    await this.appRuntime.deploy(placement, spec)
  }
```

and update its three call sites inside `deployNewest` to pass `tx` (`await this.deploy(tx, placement, release)` and, inside the savepoint, `await this.deploy(savepoint, placement, release)`). Import `Executor` from `#src/modules/database/drizzle.factory.js`.

In `update-app.use-case.ts`, inside `reapply`, after loading the release:

```ts
const attachments = await this.repository.findAttachments(tx, placement.app.uuid)
const spec = deploySpecOf(placement, release, {
  baseDomain: this.baseDomain,
  attachments,
  credentials,
})
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `cd apps/api && pnpm typecheck && pnpm test 2>&1 | grep -E '^ℹ (tests|pass|fail)'`
Expected: `fail 0`. The tree compiles again.

- [ ] **Step 6: Commit**

```bash
npx prettier --write apps/api/src/app/release apps/api/src/app/app-management
git add apps/api/src/app/release apps/api/src/app/app-management
git commit -m "feat(#207): load attachments on every deploy path

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `attach-database`

**Files:**

- Create: `apps/api/src/app/database/use-cases/attach-database/attach-database.{command,command.builder,controller,repository,response,use-case,module}.ts`
- Modify: `apps/api/src/app/database/database.module.ts`
- Test: `apps/api/src/app/database/use-cases/attach-database/tests/attach-database.use-case.unit.test.ts`
- Test: `apps/api/src/app/database/use-cases/attach-database/tests/attach-database.e2e.test.ts`

**Interfaces:**

- Consumes: `selectAttachmentsForApp`, `isForeignKeyViolation`-style unique handling, `deploySpecOf`, `AppRuntime`, `ImagePullCredentialsCipher`.
- Produces: `AttachDatabaseCommand { databaseSlug, alias? }`, `AttachDatabaseResponse { databaseSlug, alias, variables }`, `AttachDatabaseUseCase.execute(appSlug, command)`.

- [ ] **Step 1: Write the command, its builder and the response**

`attach-database.command.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator'
import {
  ALIAS_MAX_LENGTH,
  ALIAS_PATTERN,
} from '#src/app/database/entities/attachment-env.js'
import {
  DATABASE_SLUG_MAX_LENGTH,
  DATABASE_SLUG_PATTERN,
} from '#src/app/database/entities/database-config.constants.js'

export class AttachDatabaseCommand {
  @ApiProperty({
    type: String,
    example: 'orders',
    description: 'Database in this app's environment.',
    pattern: DATABASE_SLUG_PATTERN.source,
    maxLength: DATABASE_SLUG_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(DATABASE_SLUG_MAX_LENGTH)
  @Matches(DATABASE_SLUG_PATTERN, { message: 'databaseSlug must be a valid DNS-1123 label' })
  databaseSlug!: string

  @ApiPropertyOptional({
    type: String,
    example: 'analytics',
    description: 'Prefixes the injected variables (ANALYTICS_DATABASE_URL). Required for a second attachment.',
    pattern: ALIAS_PATTERN.source,
    maxLength: ALIAS_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(ALIAS_MAX_LENGTH)
  @Matches(ALIAS_PATTERN, { message: 'alias must start with a letter and use lowercase letters, numbers or hyphens' })
  alias?: string
}
```

`attach-database.command.builder.ts` seeds `databaseSlug = 'my-database'` and exposes `withDatabaseSlug` / `withAlias`, each returning `this`, mirroring `CreateDatabaseCommandBuilder`.

`attach-database.response.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger'

export class AttachDatabaseResponse {
  @ApiProperty({ type: String, example: 'orders' })
  readonly databaseSlug: string

  @ApiProperty({ type: String, nullable: true, example: 'analytics' })
  readonly alias: string | null

  @ApiProperty({
    type: [String],
    example: ['DATABASE_URL', 'PGHOST'],
    description: 'Variable names this attachment injects into the app.',
  })
  readonly variables: string[]

  constructor(databaseSlug: string, alias: string | null, variables: string[]) {
    this.databaseSlug = databaseSlug
    this.alias = alias
    this.variables = variables
  }
}
```

- [ ] **Step 2: Write the failing use-case test**

`tests/attach-database.use-case.unit.test.ts`:

```ts
import { before, describe, it } from 'node:test'
import { BadGatewayException, ConflictException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { AppPlacementBuilder } from '#src/app/app-management/queries/app-placement.builder.js'
import { DatabaseBuilder } from '#src/app/database/entities/database.builder.js'
import { AttachDatabaseCommandBuilder } from '#src/app/database/use-cases/attach-database/attach-database.command.builder.js'
import { AttachDatabaseRepository } from '#src/app/database/use-cases/attach-database/attach-database.repository.js'
import { AttachDatabaseUseCase } from '#src/app/database/use-cases/attach-database/attach-database.use-case.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { MockAppRuntime } from '#src/modules/runtime/adapters/mock/mock-app-runtime.js'
import { stubDatabase } from '#src/test/setup/stub-database.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const placement = new AppPlacementBuilder()
  .withApp(new AppBuilder().withSlug('my-app').build())
  .build()

function build() {
  const repository = createStubInstance(AttachDatabaseRepository)
  repository.lockApp.resolves(placement)
  repository.findDatabaseInEnvironment.resolves(
    new DatabaseBuilder()
      .withEnvironmentUuid(placement.environment.uuid)
      .withSlug('orders')
      .build(),
  )
  repository.insert.resolves('inserted')
  repository.findAttachments.resolves([])

  const appRuntime = createStubInstance(MockAppRuntime)
  appRuntime.readLiveReleaseUuid.resolves(null)
  appRuntime.deploy.resolves()

  const cipher = createStubInstance(ImagePullCredentialsCipher)
  const config = createStubInstance(ConfigService)
  config.getOrThrow.returns('demo.marsa.cc')

  const usecase = new AttachDatabaseUseCase(stubDatabase(), repository, appRuntime, cipher, config)
  return { repository, appRuntime, usecase, command: new AttachDatabaseCommandBuilder().withDatabaseSlug('orders').build() }
}

describe('AttachDatabaseUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('stores the attachment and reports the variables it injects', async () => {
    const { repository, usecase, command } = build()

    const response = await usecase.execute('my-app', command)

    expect(repository.insert.calledOnce).toBe(true)
    expect(response.variables).toEqual([
      'DATABASE_URL',
      'PGHOST',
      'PGPORT',
      'PGUSER',
      'PGPASSWORD',
      'PGDATABASE',
    ])
  })

  it('prefixes the reported variables when an alias is given', async () => {
    const { usecase } = build()
    const command = new AttachDatabaseCommandBuilder()
      .withDatabaseSlug('orders')
      .withAlias('analytics')
      .build()

    const response = await usecase.execute('my-app', command)

    expect(response.variables[0]).toBe('ANALYTICS_DATABASE_URL')
  })

  it('throws 404 for an unknown app', async () => {
    const { repository, usecase, command } = build()
    repository.lockApp.resolves(undefined)

    await expect(usecase.execute('ghost', command)).rejects.toThrow(NotFoundException)
  })

  it('throws 404 when the database is not in this app's environment', async () => {
    const { repository, usecase, command } = build()
    repository.findDatabaseInEnvironment.resolves(undefined)

    await expect(usecase.execute('my-app', command)).rejects.toThrow(NotFoundException)
  })

  it('throws 409 naming the fix when a second attachment has no alias', async () => {
    const { repository, usecase, command } = build()
    repository.insert.resolves('alias-taken')

    await expect(usecase.execute('my-app', command)).rejects.toThrow(ConflictException)
  })

  it('throws 409 when the same database is attached twice', async () => {
    const { repository, usecase, command } = build()
    repository.insert.resolves('already-attached')

    await expect(usecase.execute('my-app', command)).rejects.toThrow(ConflictException)
  })

  it('does not touch the runtime when the app has never deployed', async () => {
    const { appRuntime, usecase, command } = build()

    await usecase.execute('my-app', command)

    expect(appRuntime.deploy.called).toBe(false)
  })

  it('re-applies the live release so a running app picks the variables up', async () => {
    const { repository, appRuntime, usecase, command } = build()
    const release = { uuid: 'r1', env: {}, imageRef: 'nginx:1.27', containerPort: 80, minReplicas: 1, maxReplicas: 1, imagePullCredentialsEnc: null }
    appRuntime.readLiveReleaseUuid.resolves('r1')
    repository.findRelease.resolves(release)

    await usecase.execute('my-app', command)

    expect(appRuntime.deploy.calledOnce).toBe(true)
  })

  it('maps a runtime failure to 502 so the attachment rolls back', async () => {
    const { repository, appRuntime, usecase, command } = build()
    appRuntime.readLiveReleaseUuid.resolves('r1')
    repository.findRelease.resolves({ uuid: 'r1', env: {}, imageRef: 'nginx:1.27', containerPort: 80, minReplicas: 1, maxReplicas: 1, imagePullCredentialsEnc: null })
    appRuntime.deploy.rejects(new Error('cluster down'))

    await expect(usecase.execute('my-app', command)).rejects.toThrow(BadGatewayException)
  })
})
```

> The two `release` literals are deliberately partial — cast them with `as unknown as Release` if the stub's type complains; the use-case only reads the fields listed.

- [ ] **Step 3: Run it and verify it fails**

Run: `cd apps/api && pnpm typecheck`
Expected: FAIL — the `attach-database` module files do not exist.

- [ ] **Step 4: Write the repository**

`attach-database.repository.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import {
  type AppPlacement,
  selectAppPlacement,
} from '#src/app/app-management/queries/app-placement.js'
import { databaseAttachmentTable } from '#src/app/database/entities/database-attachment.table.js'
import { type DatabaseRow, databaseTable } from '#src/app/database/entities/database.table.js'
import type { DatabaseUuid } from '#src/app/database/entities/database.uuid.js'
import {
  type AttachedDatabase,
  selectAttachmentsForApp,
} from '#src/app/database/queries/app-attachments.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import { type Release, releaseTable } from '#src/app/release/entities/release.table.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'
import { isUniqueViolation } from '#src/modules/database/postgres-errors.js'

export type InsertOutcome = 'inserted' | 'alias-taken' | 'already-attached'

@Injectable()
export class AttachDatabaseRepository {
  async lockApp(tx: Executor, slug: string): Promise<AppPlacement | undefined> {
    const [placement] = await selectAppPlacement(tx)
      .where(eq(appTable.slug, slug))
      .limit(1)
      .for('update', { of: appTable })
    return placement
  }

  // Scoped to the environment: a database elsewhere is not found, not forbidden.
  async findDatabaseInEnvironment(
    tx: Executor,
    environmentUuid: EnvironmentUuid,
    slug: string,
  ): Promise<DatabaseRow | undefined> {
    const [database] = await tx
      .select()
      .from(databaseTable)
      .where(and(eq(databaseTable.environmentUuid, environmentUuid), eq(databaseTable.slug, slug)))
      .limit(1)
    return database
  }

  async insert(
    tx: Executor,
    appUuid: AppUuid,
    databaseUuid: DatabaseUuid,
    alias: string | null,
  ): Promise<InsertOutcome> {
    try {
      await tx.insert(databaseAttachmentTable).values({ appUuid, databaseUuid, alias })
      return 'inserted'
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error
      }
      // Which constraint fired decides the message, so the operator learns what to change.
      return String(error).includes('app_uuid_database_uuid') ? 'already-attached' : 'alias-taken'
    }
  }

  findAttachments(tx: Executor, appUuid: AppUuid): Promise<AttachedDatabase[]> {
    return selectAttachmentsForApp(tx, appUuid)
  }

  async findRelease(
    tx: Executor,
    uuid: ReleaseUuid,
    appUuid: AppUuid,
  ): Promise<Release | undefined> {
    const [release] = await tx
      .select()
      .from(releaseTable)
      .where(and(eq(releaseTable.uuid, uuid), eq(releaseTable.appUuid, appUuid)))
      .limit(1)
    return release
  }
}
```

Add the missing helper to `apps/api/src/modules/database/postgres-errors.ts`:

```ts
const UNIQUE_VIOLATION = '23505'

export function isUniqueViolation(error: unknown): boolean {
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    if ((current as Error & { code?: string }).code === UNIQUE_VIOLATION) {
      return true
    }
  }
  return false
}
```

- [ ] **Step 5: Write the use-case**

`attach-database.use-case.ts`:

```ts
import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AppPlacement } from '#src/app/app-management/queries/app-placement.js'
import { envPrefixOf } from '#src/app/database/entities/attachment-env.js'
import { catalogueEntry } from '#src/app/database/entities/engine-catalogue.js'
import { AttachDatabaseCommand } from '#src/app/database/use-cases/attach-database/attach-database.command.js'
import { AttachDatabaseRepository } from '#src/app/database/use-cases/attach-database/attach-database.repository.js'
import { AttachDatabaseResponse } from '#src/app/database/use-cases/attach-database/attach-database.response.js'
import { deploySpecOf } from '#src/app/release/entities/release-deploy-spec.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import type { Database, Executor } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'

@Injectable()
export class AttachDatabaseUseCase {
  private readonly baseDomain: string

  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: AttachDatabaseRepository,
    private readonly appRuntime: AppRuntime,
    private readonly cipher: ImagePullCredentialsCipher,
    config: ConfigService,
  ) {
    this.baseDomain = config.getOrThrow<string>('MARSA_BASE_DOMAIN')
  }

  async execute(appSlug: string, command: AttachDatabaseCommand): Promise<AttachDatabaseResponse> {
    const alias = command.alias ?? null

    return this.db.transaction(async (tx) => {
      const placement = await this.repository.lockApp(tx, appSlug)
      if (!placement) {
        throw new NotFoundException(`App '${appSlug}' was not found.`)
      }

      const database = await this.repository.findDatabaseInEnvironment(
        tx,
        placement.app.environmentUuid,
        command.databaseSlug,
      )
      if (!database) {
        throw new NotFoundException(
          `Database '${command.databaseSlug}' was not found in this app's environment.`,
        )
      }

      const outcome = await this.repository.insert(tx, placement.app.uuid, database.uuid, alias)
      if (outcome === 'already-attached') {
        throw new ConflictException(
          `Database '${command.databaseSlug}' is already attached to '${appSlug}'.`,
        )
      }
      if (outcome === 'alias-taken') {
        throw new ConflictException(
          alias === null
            ? `App '${appSlug}' already has an unprefixed database attached. Pass an alias, e.g. "analytics".`
            : `App '${appSlug}' already has an attachment aliased '${alias}'.`,
        )
      }

      await this.reapply(tx, placement)

      const entry = catalogueEntry(database.engine, database.version)
      const prefix = envPrefixOf(alias) ?? ''
      const variables = (entry?.publishedKeys ?? []).map((key) => `${prefix}${key}`)
      return new AttachDatabaseResponse(database.slug, alias, variables)
    })
  }

  // Nothing live means nothing to patch: the variables land on the app's first deploy.
  private async reapply(tx: Executor, placement: AppPlacement): Promise<void> {
    const liveUuid = await this.appRuntime.readLiveReleaseUuid(placement)
    if (!liveUuid) {
      return
    }
    const release = await this.repository.findRelease(tx, liveUuid, placement.app.uuid)
    if (!release) {
      return
    }

    const credentials = this.cipher.openForApp(placement.app.slug, release.imagePullCredentialsEnc)
    const attachments = await this.repository.findAttachments(tx, placement.app.uuid)
    const spec = deploySpecOf(placement, release, {
      baseDomain: this.baseDomain,
      attachments,
      credentials,
    })

    try {
      await this.appRuntime.deploy(placement, spec)
    } catch (error) {
      throw new BadGatewayException(
        `Could not update '${placement.app.slug}' in the cluster. Please try again.`,
        { cause: error },
      )
    }
  }
}
```

- [ ] **Step 6: Write the controller and module**

`attach-database.controller.ts` — `@ApiTags('databases')`, `@Controller({ path: 'apps/:slug/attachments', version: '1' })`, `@Post()`, `@Roles(UserRole.Operator, UserRole.Member)`, `@ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)`, `@ApiCreatedResponse({ type: AttachDatabaseResponse })`, `@ApiBadRequestResponse`, `@ApiNotFoundResponse({ description: 'No such app, or no such database in its environment.' })`, `@ApiConflictResponse({ description: 'Already attached, or the alias is taken.' })`, `@ApiForbiddenResponse`, `@ApiUnauthorizedResponse`, `@ApiResponse({ status: 502, description: 'The cluster update failed; the attachment was not kept.' })`, with `handle(@Param('slug') slug: string, @Body() command: AttachDatabaseCommand)`.

`attach-database.module.ts` declares `controllers: [AttachDatabaseController]`, `providers: [AttachDatabaseUseCase, AttachDatabaseRepository]`. Add it to `database.module.ts`'s imports.

- [ ] **Step 7: Write the e2e test**

`tests/attach-database.e2e.test.ts` seeds an app and a database in one environment with direct inserts (`AppBuilder`, `DatabaseBuilder`) and asserts:

1. `POST /api/v1/apps/:slug/attachments` with `{ databaseSlug }` → 201, `variables` starting `DATABASE_URL`, and a row in `database_attachment`.
2. A second attachment of another database with no alias → 409.
3. The same database twice → 409.
4. A database in a _different_ environment (seed a second project + environment directly, as `create-database.e2e.test.ts` does) → 404.
5. Unknown app → 404; unauthenticated → 401.

- [ ] **Step 8: Run the tests and verify they pass**

Run: `cd apps/api && pnpm typecheck && pnpm test 2>&1 | grep -E '^ℹ (tests|pass|fail)'`
Expected: `fail 0`.

- [ ] **Step 9: Commit**

```bash
npx prettier --write apps/api/src/app/database apps/api/src/modules/database
git add apps/api/src/app/database apps/api/src/modules/database
git commit -m "feat(#207): attach a database to an app

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `detach-database`

**Files:**

- Create: `apps/api/src/app/database/use-cases/detach-database/detach-database.{controller,repository,use-case,module}.ts`
- Modify: `apps/api/src/app/database/database.module.ts`
- Test: `apps/api/src/app/database/use-cases/detach-database/tests/detach-database.use-case.unit.test.ts`
- Test: `apps/api/src/app/database/use-cases/detach-database/tests/detach-database.e2e.test.ts`

**Interfaces:**

- Produces: `DetachDatabaseUseCase.execute(appSlug: string, databaseSlug: string): Promise<void>`; `DetachDatabaseRepository` with `lockApp`, `deleteAttachment(tx, appUuid, databaseSlug): Promise<boolean>`, `findAttachments`, `findRelease`.

- [ ] **Step 1: Write the failing unit test**

`tests/detach-database.use-case.unit.test.ts`, same `build()` shape as Task 6's, asserting:

```ts
it('removes the attachment, then re-applies the live release', async () => {
  const { repository, appRuntime, usecase } = build()
  appRuntime.readLiveReleaseUuid.resolves('r1')

  await usecase.execute('my-app', 'orders')

  expect(repository.deleteAttachment.calledOnce).toBe(true)
  expect(repository.deleteAttachment.getCall(0).calledBefore(appRuntime.deploy.getCall(0))).toBe(
    true,
  )
})

it('throws 404 when that database is not attached to the app', async () => {
  const { repository, appRuntime, usecase } = build()
  repository.deleteAttachment.resolves(false)

  await expect(usecase.execute('my-app', 'orders')).rejects.toThrow(NotFoundException)

  expect(appRuntime.deploy.called).toBe(false)
})

it('maps a runtime failure to 502 so the attachment stays', async () => {
  const { repository, appRuntime, usecase } = build()
  appRuntime.readLiveReleaseUuid.resolves('r1')
  repository.findRelease.resolves({
    uuid: 'r1',
    env: {},
    imageRef: 'nginx:1.27',
    containerPort: 80,
    minReplicas: 1,
    maxReplicas: 1,
    imagePullCredentialsEnc: null,
  })
  appRuntime.deploy.rejects(new Error('cluster down'))

  await expect(usecase.execute('my-app', 'orders')).rejects.toThrow(BadGatewayException)
})
```

- [ ] **Step 2: Run it and verify it fails**

Run: `cd apps/api && pnpm typecheck`
Expected: FAIL — the `detach-database` files do not exist.

- [ ] **Step 3: Write the repository delete**

The distinguishing method (the rest mirrors Task 6's repository):

```ts
  // Keyed by database slug: the unprefixed attachment's alias is null and cannot address itself.
  async deleteAttachment(tx: Executor, appUuid: AppUuid, databaseSlug: string): Promise<boolean> {
    const deleted = await tx
      .delete(databaseAttachmentTable)
      .where(
        and(
          eq(databaseAttachmentTable.appUuid, appUuid),
          inArray(
            databaseAttachmentTable.databaseUuid,
            tx
              .select({ uuid: databaseTable.uuid })
              .from(databaseTable)
              .where(eq(databaseTable.slug, databaseSlug)),
          ),
        ),
      )
      .returning({ uuid: databaseAttachmentTable.uuid })
    return deleted.length > 0
  }
```

- [ ] **Step 4: Write the use-case, controller and module**

`detach-database.use-case.ts` is Task 6's shape with the middle replaced:

```ts
  async execute(appSlug: string, databaseSlug: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const placement = await this.repository.lockApp(tx, appSlug)
      if (!placement) {
        throw new NotFoundException(`App '${appSlug}' was not found.`)
      }

      const detached = await this.repository.deleteAttachment(
        tx,
        placement.app.uuid,
        databaseSlug,
      )
      if (!detached) {
        throw new NotFoundException(
          `Database '${databaseSlug}' is not attached to '${appSlug}'.`,
        )
      }

      await this.reapply(tx, placement)
    })
  }
```

`detach-database.controller.ts`: `@Controller({ path: 'apps/:slug/attachments/:databaseSlug', version: '1' })`, `@Delete()`, `@HttpCode(204)`, the same role and error decorators, `@ApiNoContentResponse({ description: 'The variables were removed and the app restarted.' })`.

Wire `DetachDatabaseModule` into `database.module.ts`.

- [ ] **Step 5: Write the e2e test**

`tests/detach-database.e2e.test.ts`: seed app + database + attachment directly, `DELETE /api/v1/apps/:slug/attachments/:databaseSlug` → 204 and no row; a database that is not attached → 404; unauthenticated → 401.

- [ ] **Step 6: Run the tests and verify they pass**

Run: `cd apps/api && pnpm typecheck && pnpm test 2>&1 | grep -E '^ℹ (tests|pass|fail)'`
Expected: `fail 0`.

- [ ] **Step 7: Commit**

```bash
npx prettier --write apps/api/src/app/database
git add apps/api/src/app/database
git commit -m "feat(#207): detach a database from an app

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Reading attachments and dependents

**Files:**

- Create: `apps/api/src/app/database/use-cases/view-app-attachment-index/{...controller,...repository,...response,...use-case,...module}.ts`
- Create: `apps/api/src/app/database/use-cases/view-database-dependent-index/{...controller,...repository,...response,...use-case,...module}.ts`
- Modify: `apps/api/src/app/database/database.module.ts`
- Test: one e2e per endpoint under each `tests/` folder

**Interfaces:**

- Produces: `GET /v1/apps/:slug/attachments` → `ViewAppAttachmentIndexResponse { items: AppAttachmentSummary[] }` where `AppAttachmentSummary { databaseSlug, alias, engine, version, variables }`; `GET /v1/databases/:slug/dependents` → `ViewDatabaseDependentIndexResponse { items: string[] }`.

Neither is paginated: an app's attachments and a database's dependents are both small, bounded sets, and the keyset machinery would add a cursor nobody pages through.

- [ ] **Step 1: Write the attachment index**

The response builds `variables` the same way the attach response does — `envPrefixOf(alias)` plus the catalogue's `publishedKeys` — so the app page can show what each attachment injects. The repository calls `selectAttachmentsForApp` after resolving the app by slug (404 when absent). The use-case needs no transaction.

- [ ] **Step 2: Write the dependents index**

The repository resolves the database by slug (404 when absent), then calls `dependentAppsOf`. The response is `{ items: ['api', 'worker'] }`.

- [ ] **Step 3: Write the e2e tests**

For attachments: seed app + database + attachment, `GET` → 200 with one item whose `variables[0]` is `DATABASE_URL`; unknown app → 404; unauthenticated → 401.
For dependents: seed two apps attached to one database, `GET` → `items` equal to both slugs sorted; a database with none → `items: []`; unauthenticated → 401.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd apps/api && pnpm typecheck && pnpm test 2>&1 | grep -E '^ℹ (tests|pass|fail)'`
Expected: `fail 0`.

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/api/src/app/database
git add apps/api/src/app/database
git commit -m "feat(#207): read an app's attachments and a database's dependents

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Deleting an attached database is blocked

**Files:**

- Modify: `apps/api/src/app/database/use-cases/delete-database/delete-database.repository.ts` + `delete-database.use-case.ts`
- Test: `apps/api/src/app/database/use-cases/delete-database/tests/delete-database.use-case.unit.test.ts` (extend)
- Test: `apps/api/src/app/database/use-cases/delete-database/tests/delete-database.e2e.test.ts` (extend)

**Interfaces:**

- Consumes: `dependentAppsOf` (Task 3), `isForeignKeyViolation` (existing).
- Produces: `delete-database` answers 409 naming the dependent apps.

- [ ] **Step 1: Write the failing tests**

Unit:

```ts
it('refuses to delete a database an app still uses, naming the apps', async () => {
  const { repository, runtime, usecase } = build()
  repository.delete.rejects(
    Object.assign(new Error('update or delete violates foreign key'), { code: '23503' }),
  )
  repository.dependentApps.resolves(['api', 'worker'])

  await expect(usecase.execute('orders')).rejects.toThrow(ConflictException)
  await expect(usecase.execute('orders')).rejects.toThrow(/api, worker/)

  expect(runtime.destroy.called).toBe(false)
})
```

E2E: seed a database, an app, and an attachment between them; `DELETE /api/v1/databases/:slug` → 409, body mentioning the app slug, and the row still present.

- [ ] **Step 2: Run them and verify they fail**

Run: `cd apps/api && pnpm test 2>&1 | grep -E '^not ok|^ℹ fail'`
Expected: the new cases fail — today the FK violation escapes as a 500.

- [ ] **Step 3: Catch the violation**

Add to `DeleteDatabaseRepository`:

```ts
  dependentApps(tx: Executor, databaseUuid: DatabaseUuid): Promise<string[]> {
    return dependentAppsOf(tx, databaseUuid)
  }
```

and wrap the delete in the use-case:

```ts
try {
  await this.repository.delete(tx, placement.database.uuid)
} catch (error) {
  if (!isForeignKeyViolation(error)) {
    throw error
  }
  // Read after the failure rather than checking first: a pre-check races a concurrent attach.
  const dependents = await this.repository.dependentApps(tx, placement.database.uuid)
  throw new ConflictException(
    `Database '${slug}' is still attached to ${dependents.join(', ')}. Detach it there first.`,
  )
}
```

> A failed statement aborts the surrounding transaction in Postgres, so the dependents read must run in a fresh context. Wrap the delete in a savepoint (`tx.transaction(async (savepoint) => …)`) exactly as `deploy-release` does, then run the read on `tx` after the savepoint rolls back.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd apps/api && pnpm test 2>&1 | grep -E '^ℹ (tests|pass|fail)'`
Expected: `fail 0`.

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/api/src/app/database
git add apps/api/src/app/database
git commit -m "feat(#207): block deleting a database that apps still use

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Filter the database index by environment

**Files:**

- Modify: `apps/api/src/app/database/use-cases/view-database-index/query/view-database-index.query.ts`, `...repository.ts`, `...use-case.ts`
- Test: `apps/api/src/app/database/use-cases/view-database-index/tests/view-database-index.e2e.test.ts` (extend)

**Interfaces:**

- Produces: `ViewDatabaseIndexQuery.environmentUuid?: EnvironmentUuid`; `listDatabases(limit, after, environmentUuid?)`.

- [ ] **Step 1: Write the failing e2e case**

```ts
it('lists only the databases of the environment asked for', async () => {
  const otherProject = new ProjectBuilder().withSlug('other-project').build()
  const other = new EnvironmentBuilder().withProject(otherProject).withSlug('staging').build()
  await setup.db.insert(projectTable).values(otherProject)
  await setup.db.insert(environmentTable).values(other)
  await setup.db
    .insert(databaseTable)
    .values(new DatabaseBuilder().withEnvironmentUuid(other.uuid).withSlug('elsewhere').build())

  const response = await request(setup.httpServer)
    .get('/api/v1/databases')
    .query({ environmentUuid: environment.uuid })
    .set('Cookie', cookie)
    .expect(200)

  expect(response.body.items.map((item: { slug: string }) => item.slug)).not.toContain('elsewhere')
})
```

- [ ] **Step 2: Run it and verify it fails**

Run: `cd apps/api && pnpm test 2>&1 | grep -E '^not ok' | head -3`
Expected: fails — `forbidNonWhitelisted` rejects the unknown query property with 400.

- [ ] **Step 3: Add the filter**

On `ViewDatabaseIndexQuery`:

```ts
  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Only databases in this environment.' })
  @IsOptional()
  @IsUUID()
  environmentUuid?: EnvironmentUuid
```

In the repository, combine the cursor and the filter:

```ts
  async listDatabases(
    limit: number,
    after?: DatabaseUuid | null,
    environmentUuid?: EnvironmentUuid,
  ): Promise<DatabasePlacement[]> {
    const filters = [
      after ? lt(databaseTable.uuid, after) : undefined,
      environmentUuid ? eq(databaseTable.environmentUuid, environmentUuid) : undefined,
    ].filter((filter) => filter !== undefined)

    return selectDatabasePlacement(this.db)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(databaseTable.uuid))
      .limit(limit)
  }
```

and pass `query.environmentUuid` from the use-case.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd apps/api && pnpm typecheck && pnpm test 2>&1 | grep -E '^ℹ (tests|pass|fail)'`
Expected: `fail 0`.

- [ ] **Step 5: Regenerate the contract and commit**

```bash
cd apps/api && pnpm generate:openapi && cd ../.. && pnpm --filter web generate:api
node -e "const d=require('./apps/api/openapi.json');console.log(Object.keys(d.paths).filter(p=>p.includes('attachments')||p.includes('dependents')))"
```

Expected: `/api/v1/apps/{slug}/attachments`, `/api/v1/apps/{slug}/attachments/{databaseSlug}`, `/api/v1/databases/{slug}/dependents`.

```bash
npx prettier --write apps/api/src/app/database apps/api/openapi.json apps/web/app/api
git add apps/api/src/app/database apps/api/openapi.json apps/web/app/api
git commit -m "feat(#207): filter databases by environment and regenerate the contract

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Web composables

**Files:**

- Create: `apps/web/app/composables/useAppAttachments.ts`, `useAttachDatabase.ts`, `useDetachDatabase.ts`, `useDatabaseDependents.ts`
- Test: `apps/web/app/composables/__tests__/useAppAttachments.nuxt.spec.ts`

**Interfaces:**

- Produces: `useAppAttachments(slug)` (`useAsyncData`, key `app-attachments-${slug}`), `useAttachDatabase().attach(appSlug, command)`, `useDetachDatabase().detach(appSlug, databaseSlug)`, `useDatabaseDependents(slug)`.

- [ ] **Step 1: Write the composables**

```ts
// app/composables/useAppAttachments.ts
import type { ViewAppAttachmentIndexResponse } from '~/api/types.gen'
import { zViewAppAttachmentIndexResponse } from '~/api/zod.gen'

export function useAppAttachments(slug: string) {
  const { $api } = useNuxtApp()
  return useAsyncData<ViewAppAttachmentIndexResponse>(
    `app-attachments-${slug}`,
    () => $api(`/v1/apps/${encodeURIComponent(slug)}/attachments`),
    {
      transform: (raw): ViewAppAttachmentIndexResponse =>
        zViewAppAttachmentIndexResponse.parse(raw),
    },
  )
}
```

```ts
// app/composables/useAttachDatabase.ts
import type { AttachDatabaseCommand, AttachDatabaseResponse } from '~/api/types.gen'
import { zAttachDatabaseResponse } from '~/api/zod.gen'

export function useAttachDatabase() {
  const { $api } = useNuxtApp()

  async function attach(
    appSlug: string,
    command: AttachDatabaseCommand,
  ): Promise<AttachDatabaseResponse> {
    return zAttachDatabaseResponse.parse(
      await $api(`/v1/apps/${encodeURIComponent(appSlug)}/attachments`, {
        method: 'POST',
        body: command,
      }),
    )
  }

  return { attach }
}
```

```ts
// app/composables/useDetachDatabase.ts
export function useDetachDatabase() {
  const { $api } = useNuxtApp()

  async function detach(appSlug: string, databaseSlug: string): Promise<void> {
    await $api(
      `/v1/apps/${encodeURIComponent(appSlug)}/attachments/${encodeURIComponent(databaseSlug)}`,
      { method: 'DELETE' },
    )
  }

  return { detach }
}
```

```ts
// app/composables/useDatabaseDependents.ts
import type { ViewDatabaseDependentIndexResponse } from '~/api/types.gen'
import { zViewDatabaseDependentIndexResponse } from '~/api/zod.gen'

export function useDatabaseDependents(slug: string) {
  const { $api } = useNuxtApp()
  return useAsyncData<ViewDatabaseDependentIndexResponse>(
    `database-dependents-${slug}`,
    () => $api(`/v1/databases/${encodeURIComponent(slug)}/dependents`),
    {
      transform: (raw): ViewDatabaseDependentIndexResponse =>
        zViewDatabaseDependentIndexResponse.parse(raw),
    },
  )
}
```

- [ ] **Step 2: Write the spec**

`__tests__/useAppAttachments.nuxt.spec.ts` follows `useDatabaseList.nuxt.spec.ts`: `registerEndpoint('/api/v1/apps/my-app/attachments', () => ({ items: [{ databaseSlug: 'orders', alias: null, engine: 'postgres', version: '17', variables: ['DATABASE_URL'] }] }))`, mount a component that calls the composable, assert the parsed items.

- [ ] **Step 3: Run the tests**

Run: `pnpm --filter web test 2>&1 | grep -E 'Test Files|Tests |FAIL'`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
npx prettier --write apps/web/app/composables
git add apps/web/app/composables
git commit -m "feat(#207): add attachment API composables

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: The app page's Databases card

**Files:**

- Create: `apps/web/app/components/AppDatabasesCard.vue`
- Modify: `apps/web/app/pages/apps/[slug].vue`
- Test: `apps/web/app/components/__tests__/AppDatabasesCard.nuxt.spec.ts`

**Interfaces:**

- Consumes: `useAppAttachments`, `useAttachDatabase`, `useDetachDatabase`, `useDatabaseList` (filtered), `extractApiError`.
- Produces: `<AppDatabasesCard :slug="slug" :environment-uuid="config.environment.uuid" @changed="…" />`, emitting `changed` after a successful attach or detach so the page can refresh its config.

- [ ] **Step 1: Write the component**

Props `{ slug: string, environmentUuid: string }`. It renders a `UCard` titled "Databases" containing:

- one row per attachment: the database slug, a `UBadge` with the alias when present, the injected variable names in a muted monospace line, and a detach `UButton` with `:data-testid="`detach-${a.databaseSlug}`"`;
- an empty state — "No databases attached. Attach one to inject its connection variables.";
- an "Attach database" button opening a `UModal` with a `USelect` of databases in `environmentUuid` (fetched through `useDatabaseList` with the filter) and an optional alias `UInput`, submitting through `attach()`;
- a detach confirmation `UModal` stating "`<app>` will restart and lose these variables."

Both modals surface failures through `extractApiError` into a `UAlert` inside the modal, and the 409 message from the API is what the operator sees when they forget an alias.

- [ ] **Step 2: Mount it on the app page**

In `apps/web/app/pages/apps/[slug].vue`, after the config card:

```vue
<AppDatabasesCard
  v-if="config"
  :slug="slug"
  :environment-uuid="config.environment.uuid"
  @changed="refreshConfig()"
/>
```

- [ ] **Step 3: Write the component spec**

`__tests__/AppDatabasesCard.nuxt.spec.ts` mocks `useAppAttachments`, `useDatabaseList`, `useAttachDatabase` and `useDetachDatabase`, then asserts:

```ts
  it('lists an attachment with the variables it injects', async () => { /* … */ })
  it('attaches the chosen database with the typed alias', async () => { /* … */ })
  it('shows the API's conflict message when an alias is missing', async () => { /* … */ })
  it('detaches only after the confirmation is accepted', async () => { /* … */ })
  it('shows the empty state when nothing is attached', async () => { /* … */ })
```

Modals teleport out of the wrapper, so reach their controls with `document.querySelector`, mounting with `{ attachTo: document.body }` — the pattern in `app/pages/databases/__tests__/[slug].nuxt.spec.ts`.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter web test 2>&1 | grep -E 'Test Files|Tests |FAIL'`
Expected: all pass, coverage floors met.

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/web/app/components apps/web/app/pages/apps
git add apps/web/app/components apps/web/app/pages/apps
git commit -m "feat(#207): attach and detach databases from the app page

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: The override badge and the Used-by list

**Files:**

- Modify: `apps/web/app/components/AppConfigForm.vue`
- Modify: `apps/web/app/pages/apps/[slug].vue`
- Modify: `apps/web/app/pages/databases/[slug].vue`
- Test: `apps/web/app/components/__tests__/AppConfigForm.nuxt.spec.ts` (extend)
- Test: `apps/web/app/pages/databases/__tests__/[slug].nuxt.spec.ts` (extend)

**Interfaces:**

- Produces: `AppConfigForm` gains `overriddenKeys?: string[]`; `/databases/[slug]` renders a Used-by card.

- [ ] **Step 1: Write the failing tests**

For `AppConfigForm`:

```ts
it('marks an env row whose value an attachment overrides', async () => {
  const wrapper = await mountComponent(
    { env: { DATABASE_URL: 'hand-written', LOG_LEVEL: 'info' } },
    { overriddenKeys: ['DATABASE_URL'] },
  )

  expect(wrapper.text()).toContain('Overridden by an attached database')
})
```

For the database detail page:

```ts
it('lists the apps still using this database', async () => {
  dependents.value = { items: ['api', 'worker'] }

  const wrapper = await mountSuspended(Detail)

  expect(wrapper.text()).toContain('api')
  expect(wrapper.text()).toContain('worker')
})
```

- [ ] **Step 2: Run them and verify they fail**

Run: `pnpm --filter web test 2>&1 | grep -E 'FAIL|Tests '`
Expected: both new cases fail.

- [ ] **Step 3: Add the badge**

`AppConfigForm` takes `overriddenKeys?: string[]` (default `[]`) and, per env row, renders next to the key input when `props.overriddenKeys?.includes(row.key.trim())`:

```vue
<UBadge v-if="isOverridden(row.key)" color="warning" variant="subtle" size="sm">
              Overridden by an attached database
            </UBadge>
```

`/apps/[slug].vue` computes the list from the attachments it already fetches for the card and passes it down:

```ts
const { data: attachments } = useAppAttachments(slug.value)
const overriddenKeys = computed(
  () => attachments.value?.items.flatMap((item) => item.variables) ?? [],
)
```

- [ ] **Step 4: Add the Used-by card**

`/databases/[slug].vue` calls `useDatabaseDependents(slug)` and renders, above the danger zone, a card listing each dependent app as a `NuxtLink` to `/apps/<slug>`, or "No apps are using this database." when empty. The delete modal's `deleteError` already renders the API's 409 text, which names the apps.

- [ ] **Step 5: Run the tests and verify they pass**

Run: `pnpm --filter web test 2>&1 | grep -E 'Test Files|Tests |FAIL'`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
npx prettier --write apps/web/app
git add apps/web/app
git commit -m "feat(#207): surface overridden variables and a database's dependents

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: k3d e2e and the PR

**Files:**

- Modify: `scripts/e2e-test.sh`
- Modify: `docs/local-dev.md`

**Interfaces:**

- Consumes: the `api`, `cookie`, `APP_SLUG`, `DB_SLUG`, `APPS_NS` variables already defined in the script by #206's stages.

- [ ] **Step 1: Add the attachment stage**

Insert **before** the "deleting the database removes its resources" stage (the app must still exist, and the database must not be deleted yet):

```bash
echo "== stage: attach the database to the app =="
http -X POST "${api}/apps/${APP_SLUG}/attachments" -H 'Content-Type: application/json' \
  -H "Cookie: ${cookie}" -d "{\"databaseSlug\":\"${DB_SLUG}\"}" || true
case "$HTTP_STATUS" in 2??) : ;; *) fail attach "POST attachments -> ${HTTP_STATUS}; body: ${HTTP_BODY}" ;; esac

echo "== stage: the app's pods read the database's Secret, never a literal =="
kubectl -n "$APPS_NS" rollout status "deploy/${APP_SLUG}" --timeout=120s \
  || fail attach "app did not roll out after attaching"
env_json="$(kubectl -n "$APPS_NS" get "deploy/${APP_SLUG}" \
  -o jsonpath='{.spec.template.spec.containers[0].env}')"
printf '%s' "$env_json" | grep -q '"name":"DATABASE_URL"' \
  || fail attach "DATABASE_URL was not injected: ${env_json}"
printf '%s' "$env_json" | grep -q "\"name\":\"${DB_SLUG}-credentials\"" \
  || fail attach "DATABASE_URL does not reference the database's Secret: ${env_json}"
secret_password="$(kubectl -n "$APPS_NS" get "secret/${DB_SLUG}-credentials" \
  -o jsonpath='{.data.PGPASSWORD}' | base64 -d)"
printf '%s' "$env_json" | grep -q "$secret_password" \
  && fail attach "the password appears literally in the app's Deployment"

echo "== stage: deleting an attached database is refused =="
http -X DELETE "${api}/databases/${DB_SLUG}" -H "Cookie: ${cookie}" || true
[ "$HTTP_STATUS" = 409 ] || fail attach "expected 409 deleting an attached database, got ${HTTP_STATUS}"
printf '%s' "$HTTP_BODY" | grep -q "$APP_SLUG" \
  || fail attach "the 409 did not name the dependent app: ${HTTP_BODY}"

echo "== stage: detaching removes the variables =="
http -X DELETE "${api}/apps/${APP_SLUG}/attachments/${DB_SLUG}" -H "Cookie: ${cookie}" || true
[ "$HTTP_STATUS" = 204 ] || fail attach "DELETE attachment -> ${HTTP_STATUS}; body: ${HTTP_BODY}"
kubectl -n "$APPS_NS" rollout status "deploy/${APP_SLUG}" --timeout=120s \
  || fail attach "app did not roll out after detaching"
kubectl -n "$APPS_NS" get "deploy/${APP_SLUG}" \
  -o jsonpath='{.spec.template.spec.containers[0].env}' | grep -q '"name":"DATABASE_URL"' \
  && fail attach "DATABASE_URL survived the detach"
```

- [ ] **Step 2: Verify the script parses**

Run: `bash -n scripts/e2e-test.sh`
Expected: no output.

- [ ] **Step 3: Document it**

In `docs/local-dev.md`, under "Reaching a database", add:

```markdown
An app receives a database's connection variables by **attachment**, not by copying: attach one
from the app's page and its pods get `DATABASE_URL` and the `PG*` variables as references to the
database's Secret. A second database on the same app needs an alias, which prefixes its variables
(`ANALYTICS_DATABASE_URL`). Detaching removes them and restarts the app.
```

- [ ] **Step 4: Run the full local gate**

```bash
npx prettier --check . && pnpm --filter api lint && pnpm --filter web lint \
  && pnpm --filter api typecheck && pnpm --filter web typecheck \
  && pnpm --filter api test && pnpm --filter web test && pnpm build:web
```

Expected: every command exits 0.

- [ ] **Step 5: Confirm no contract drift**

```bash
cd apps/api && pnpm generate:openapi && cd ../.. && pnpm --filter web generate:api && git status --short
```

Expected: a clean tree.

- [ ] **Step 6: Push and open the PR against the #206 branch**

```bash
git push -u origin feature/207-attach-database
gh pr create --repo marsa-cloud/marsa --base feature/206-database-resource \
  --head feature/207-attach-database \
  --title 'feat(#207): attach a database to an app'
```

The body needs a narrative Summary, a Testing section, `Refs #207`, and a Glossary (attachment, `secretKeyRef`, alias prefix, placement-vs-config). **Retarget to `main` once #235 merges**, then rebase.

- [ ] **Step 7: Update #207's ticket body**

Reword the AC "injects the connection variables into the app on its next release" to "immediately, and on every subsequent deploy"; delete the `$(MARSA_REF_…)` composition sketch, since the Secret already holds composed values; move the connectivity AC ("the example app talks to the database") to #31; move the credential-rotation AC to #234.

- [ ] **Step 8: Hand back for review**

Report the PR URL and stop. **Do not merge** — the merge needs an explicit per-PR approval, and a Rex review first.

---

## Self-Review

**Spec coverage** — placement semantics → Tasks 4, 5; alias naming → Tasks 2, 4, 6; collision override → Task 4 (drop) and Task 13 (badge); ownership and routes → Tasks 6, 7, 8; the nulls-not-distinct constraint → Task 2 (with an explicit stop-if-absent check); blocked delete → Task 9; environment filter → Task 10; UI → Tasks 11–13; manifest-level cluster proof → Task 14.

**Deliberate gaps:** real app-to-database connectivity (#31), credential rotation (#234), external access (#233) — all deferred in the spec.

**Type consistency** — `AttachedDatabase` (query row: `alias`, `databaseSlug`, `engine`, `version`) and `AttachedDatabaseSpec` (port: `databaseSlug`, `envPrefix`, `keys`) are distinct on purpose; `deploySpecOf` is the only place that converts one to the other. `findAttachments` is the repository method name on all four repositories. `envPrefixOf` returns `string | null`, and every caller spells the null case as `?? ''`.

**Known risks for the implementer:** Task 4 deliberately leaves the tree uncompiling for one commit; Task 9's dependents read must run after a savepoint rollback, not on an aborted transaction; and the unique-constraint check in Task 2 Step 5 is a hard stop, not a nicety.
