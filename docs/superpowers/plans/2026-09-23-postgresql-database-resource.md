# PostgreSQL Database Resource Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship PostgreSQL as a first-class Marsa resource (#206, absorbing #205): an operator creates a database in an environment, it runs as a StatefulSet with a PVC and a TCP Service, and other apps in the same environment can reach it in-cluster.

**Architecture:** Three layers. An adapter-internal _persistent-workload renderer_ turns a technology-neutral spec into a StatefulSet + ClusterIP Service. A `DatabaseRuntime` port (`provision` / `destroy` / `readStatus`) with Kubernetes and mock adapters sits on top. A `database` feature aggregate owns the row, the engine catalogue and the use-cases. No releases and no persisted status — status is read live.

**Tech Stack:** NestJS 11 on Fastify (ESM, Node ≥ 24), Drizzle (`drizzle-orm/node-postgres`), `@kubernetes/client-node`, `node:test` + `expect` + `sinon`, Nuxt 4 + Nuxt UI v4 + Vitest, k3d for the cluster e2e.

**Design spec:** `docs/superpowers/specs/2026-09-23-postgresql-database-resource-design.md`. Read it before Task 1.

## Global Constraints

- **Branch:** `feature/206-database-resource`, already created off `main`. Every commit lands there; the PR targets `main`.
- **One PR** for all tasks. #205 is absorbed and closes with the PR.
- **Run `pnpm format` on the files you touched before each commit** (`.claude/rules/git-workflow.md`); never run repo-wide `pnpm format` — a watcher rewrites files it should ignore. Prefer `npx prettier --write <paths>`.
- **Comments:** the absolute minimum, single-line, why-not-what (`.claude/rules/comments.md`). No JSDoc `@param` / `@returns`.
- **Never hand-edit** `apps/api/src/sql/drizzle/**` (generated SQL), `apps/api/openapi.json` (generated), or `apps/web/app/api/**` (generated). Regenerate and commit.
- **API tests** run against compiled output: `pnpm --filter api test` (clean → build → setup → run). There is no watch mode.
- **Coverage floors are ratchets** — api lines 80 / branches 75 / functions 75; web lines+statements 88 / branches 85 / functions 60. Add tests, never lower a floor.
- **Slug shape** is DNS-1123: `/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/`, max 63 chars.
- **Storage class** comes from `MARSA_DATABASE_STORAGE_CLASS` (default `local-path`) and is never hardcoded.
- **Pinned Postgres tags:** `16 → postgres:16.15`, `17 → postgres:17.11`, `18 → postgres:18.6`. Data path is per major: 16/17 mount `/var/lib/postgresql/data` with `PGDATA=/var/lib/postgresql/data/pgdata`; 18 mounts `/var/lib/postgresql` with `PGDATA=/var/lib/postgresql/18/docker`.
- **Imports** use the `#src/...` subpath with an explicit `.js` extension; features import `#src/modules/runtime/*` only, never an adapter (tests may import the mock).

---

## File Structure

**API — runtime layer (`apps/api/src/modules/runtime/`)**

| File                                                                    | Responsibility                                                                   |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `runtime.types.ts` (modify)                                             | Add `DatabaseRef`, `DatabaseDeploySpec`, `DatabaseCredentials`, `DatabaseStatus` |
| `database-runtime.ts` (create)                                          | The port: `provision` / `destroy` / `readStatus`                                 |
| `adapters/kubernetes/persistent/persistent-workload.types.ts` (create)  | `PersistentWorkloadSpec`, `SecretEnvRef`, `RenderedPersistentWorkload`           |
| `adapters/kubernetes/persistent/render-persistent-workload.ts` (create) | StatefulSet + Service renderer (engine-agnostic)                                 |
| `adapters/kubernetes/database/database.constants.ts` (create)           | `CREDENTIALS_SECRET_SUFFIX`, `DATA_VOLUME_NAME`                                  |
| `adapters/kubernetes/database/render-credentials-secret.ts` (create)    | The published-variables Secret                                                   |
| `adapters/kubernetes/database/map-database-status.ts` (create)          | StatefulSet + pod → `DatabaseStatus`                                             |
| `adapters/kubernetes/kubernetes-database-runtime.ts` (create)           | Applies and tears down the bundle                                                |
| `adapters/kubernetes/kubernetes-runtime.module.ts` (modify)             | Bind `DatabaseRuntime`                                                           |
| `adapters/mock/mock-database-runtime.ts` (create)                       | In-memory adapter with `failNext`                                                |
| `adapters/mock/mock-runtime.module.ts` (modify)                         | Bind the mock                                                                    |

**API — database feature (`apps/api/src/app/database/`)**

| File                                                                      | Responsibility                                                              |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `entities/database.table.ts` · `database.uuid.ts` · `database.builder.ts` | Row, brand, test builder                                                    |
| `entities/database-config.constants.ts`                                   | Slug pattern/length, storage bounds                                         |
| `entities/database-credentials.ts`                                        | `DatabaseCredentials` DTO-free type + generator                             |
| `enums/database-engine.enum.ts`                                           | `DatabaseEngine`, pg enum, ApiProperty decorator                            |
| `entities/engine-catalogue.ts`                                            | Per engine-major image, paths, env, published variables                     |
| `queries/database-placement.ts`                                           | `selectDatabasePlacement` (database ⨝ environment ⨝ project)                |
| `responses/database-refs.response.ts`                                     | `DatabaseProjectRef`, `DatabaseEnvironmentRef`, `DatabaseStatusApiProperty` |
| `use-cases/{create,delete,view-…}-database/**`                            | One folder per use-case, as the api rules prescribe                         |
| `database.module.ts`                                                      | Feature module, imported by `ApiModule`                                     |

**API — shared edits:** `sql/schema.ts`, `sql/relations.ts`, `config/env.config.ts`, `modules/crypto/database-credentials.cipher.ts` (+ `crypto.module.ts`), `app/environment/queries/name-taken-in-environment.ts`, `app/app-management/use-cases/create-app/*` (mirror check), `modules/api/api.module.ts`.

**Web (`apps/web/app/`):** `composables/useDatabaseList.ts`, `useCreateDatabase.ts`, `useDeleteDatabase.ts`, `useDatabaseDetail.ts`; `pages/databases/{index,new,[slug]}.vue`; `layouts/default.vue` (nav entry).

**Scripts/docs:** `scripts/e2e-test.sh` (database stage), `docs/local-dev.md` (how to reach a database locally).

---

### Task 1: Persistent-workload renderer

**Files:**

- Create: `apps/api/src/modules/runtime/adapters/kubernetes/persistent/persistent-workload.types.ts`
- Create: `apps/api/src/modules/runtime/adapters/kubernetes/persistent/render-persistent-workload.ts`
- Test: `apps/api/src/modules/runtime/adapters/kubernetes/persistent/tests/render-persistent-workload.unit.test.ts`

**Interfaces:**

- Consumes: `NodePinSpec`, `NodePinStrategy` from `#src/modules/runtime/runtime.types.js`; `buildNodeAffinity` from `#src/modules/runtime/adapters/kubernetes/app/render/node-affinity.js`.
- Produces: `renderPersistentWorkload(spec: PersistentWorkloadSpec): RenderedPersistentWorkload` where `RenderedPersistentWorkload = { statefulSet: V1StatefulSet; service: V1Service }`, and the types below.

- [ ] **Step 1: Write the types file**

`apps/api/src/modules/runtime/adapters/kubernetes/persistent/persistent-workload.types.ts`:

```ts
import type { V1Service, V1StatefulSet } from '@kubernetes/client-node'
import type { NodePinSpec } from '#src/modules/runtime/runtime.types.js'

export interface SecretEnvRef {
  name: string
  secret: string
  key: string
}

export interface PersistentWorkloadSpec {
  name: string
  image: string
  port: number
  env: Record<string, string>
  secretEnv: SecretEnvRef[]
  volume: { mountPath: string; sizeGib: number; storageClass: string }
  readinessExec: string[]
  nodePin: NodePinSpec | null
}

export interface RenderedPersistentWorkload {
  statefulSet: V1StatefulSet
  service: V1Service
}
```

- [ ] **Step 2: Write the failing test**

`apps/api/src/modules/runtime/adapters/kubernetes/persistent/tests/render-persistent-workload.unit.test.ts`:

```ts
import { describe, it } from 'node:test'
import { expect } from 'expect'
import { renderPersistentWorkload } from '#src/modules/runtime/adapters/kubernetes/persistent/render-persistent-workload.js'
import type { PersistentWorkloadSpec } from '#src/modules/runtime/adapters/kubernetes/persistent/persistent-workload.types.js'
import { NodePinStrategy } from '#src/modules/runtime/runtime.types.js'

const spec = (overrides: Partial<PersistentWorkloadSpec> = {}): PersistentWorkloadSpec => ({
  name: 'orders',
  image: 'postgres:17.11',
  port: 5432,
  env: { PGDATA: '/var/lib/postgresql/data/pgdata' },
  secretEnv: [{ name: 'POSTGRES_PASSWORD', secret: 'orders-credentials', key: 'PGPASSWORD' }],
  volume: { mountPath: '/var/lib/postgresql/data', sizeGib: 10, storageClass: 'local-path' },
  readinessExec: ['pg_isready', '-U', 'postgres'],
  nodePin: null,
  ...overrides,
})

describe('renderPersistentWorkload', () => {
  it('renders a single-replica StatefulSet owning its data volume', () => {
    const { statefulSet } = renderPersistentWorkload(spec())

    expect(statefulSet.kind).toBe('StatefulSet')
    expect(statefulSet.metadata?.name).toBe('orders')
    expect(statefulSet.spec?.replicas).toBe(1)
    expect(statefulSet.spec?.serviceName).toBe('orders')
    expect(statefulSet.spec?.volumeClaimTemplates?.[0]?.metadata?.name).toBe('data')
    expect(statefulSet.spec?.volumeClaimTemplates?.[0]?.spec?.storageClassName).toBe('local-path')
    expect(statefulSet.spec?.volumeClaimTemplates?.[0]?.spec?.resources?.requests?.storage).toBe(
      '10Gi',
    )
    expect(statefulSet.spec?.persistentVolumeClaimRetentionPolicy).toEqual({
      whenDeleted: 'Delete',
      whenScaled: 'Delete',
    })
  })

  it('mounts the volume and wires plain and secret env onto the container', () => {
    const container =
      renderPersistentWorkload(spec()).statefulSet.spec?.template.spec?.containers[0]

    expect(container?.volumeMounts).toEqual([
      { name: 'data', mountPath: '/var/lib/postgresql/data' },
    ])
    expect(container?.env).toEqual([
      { name: 'PGDATA', value: '/var/lib/postgresql/data/pgdata' },
      {
        name: 'POSTGRES_PASSWORD',
        valueFrom: { secretKeyRef: { name: 'orders-credentials', key: 'PGPASSWORD' } },
      },
    ])
  })

  it('probes readiness by command and liveness by socket', () => {
    const container =
      renderPersistentWorkload(spec()).statefulSet.spec?.template.spec?.containers[0]

    expect(container?.readinessProbe?.exec?.command).toEqual(['pg_isready', '-U', 'postgres'])
    expect(container?.livenessProbe?.tcpSocket?.port).toBe(5432)
  })

  it('renders a plain ClusterIP Service and nothing HTTP-shaped', () => {
    const rendered = renderPersistentWorkload(spec())

    expect(rendered.service.spec?.type).toBe('ClusterIP')
    expect(rendered.service.spec?.ports).toEqual([{ port: 5432, targetPort: 5432 }])
    expect(Object.keys(rendered)).toEqual(['statefulSet', 'service'])
  })

  it('applies a required node pin as node affinity', () => {
    const { statefulSet } = renderPersistentWorkload(
      spec({
        nodePin: {
          key: 'kubernetes.io/hostname',
          values: ['node-a'],
          strategy: NodePinStrategy.Required,
        },
      }),
    )

    expect(
      statefulSet.spec?.template.spec?.affinity?.nodeAffinity
        ?.requiredDuringSchedulingIgnoredDuringExecution?.nodeSelectorTerms,
    ).toEqual([
      { matchExpressions: [{ key: 'kubernetes.io/hostname', operator: 'In', values: ['node-a'] }] },
    ])
  })

  it('omits affinity entirely when the workload is unpinned', () => {
    const { statefulSet } = renderPersistentWorkload(spec())

    expect(statefulSet.spec?.template.spec?.affinity).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `cd apps/api && pnpm build`
Expected: FAIL — `Cannot find module '#src/modules/runtime/adapters/kubernetes/persistent/render-persistent-workload.js'` (the renderer does not exist yet).

- [ ] **Step 4: Write the renderer**

`apps/api/src/modules/runtime/adapters/kubernetes/persistent/render-persistent-workload.ts`:

```ts
import type { V1Container, V1EnvVar, V1Service, V1StatefulSet } from '@kubernetes/client-node'
import { DATA_VOLUME_NAME } from '#src/modules/runtime/adapters/kubernetes/database/database.constants.js'
import type {
  PersistentWorkloadSpec,
  RenderedPersistentWorkload,
} from '#src/modules/runtime/adapters/kubernetes/persistent/persistent-workload.types.js'
import { buildNodeAffinity } from '#src/modules/runtime/adapters/kubernetes/app/render/node-affinity.js'

export function renderPersistentWorkload(spec: PersistentWorkloadSpec): RenderedPersistentWorkload {
  const name = spec.name
  const labels = { app: name }
  const affinity = buildNodeAffinity(spec.nodePin)

  const env: V1EnvVar[] = [
    ...Object.entries(spec.env).map(([key, value]) => ({ name: key, value })),
    ...spec.secretEnv.map((ref) => ({
      name: ref.name,
      valueFrom: { secretKeyRef: { name: ref.secret, key: ref.key } },
    })),
  ]

  const container: V1Container = {
    name,
    image: spec.image,
    ports: [{ containerPort: spec.port }],
    env,
    volumeMounts: [{ name: DATA_VOLUME_NAME, mountPath: spec.volume.mountPath }],
    readinessProbe: { exec: { command: spec.readinessExec } },
    livenessProbe: { tcpSocket: { port: spec.port } },
  }

  const statefulSet: V1StatefulSet = {
    apiVersion: 'apps/v1',
    kind: 'StatefulSet',
    metadata: { name, labels },
    spec: {
      replicas: 1,
      serviceName: name,
      selector: { matchLabels: labels },
      // Delete: a database's volume is its data, and deleting the database deletes the data.
      persistentVolumeClaimRetentionPolicy: { whenDeleted: 'Delete', whenScaled: 'Delete' },
      volumeClaimTemplates: [
        {
          metadata: { name: DATA_VOLUME_NAME },
          spec: {
            accessModes: ['ReadWriteOnce'],
            storageClassName: spec.volume.storageClass,
            resources: { requests: { storage: `${spec.volume.sizeGib}Gi` } },
          },
        },
      ],
      template: {
        metadata: { labels },
        spec: {
          ...(affinity ? { affinity } : {}),
          containers: [container],
        },
      },
    },
  }

  const service: V1Service = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name, labels },
    spec: {
      type: 'ClusterIP',
      selector: labels,
      ports: [{ port: spec.port, targetPort: spec.port }],
    },
  }

  return { statefulSet, service }
}
```

And the constants it imports, `apps/api/src/modules/runtime/adapters/kubernetes/database/database.constants.ts`:

```ts
export const CREDENTIALS_SECRET_SUFFIX = '-credentials'

export const DATA_VOLUME_NAME = 'data'
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `cd apps/api && pnpm test 2>&1 | tail -20`
Expected: PASS — all `renderPersistentWorkload` tests green, no other suite broken.

- [ ] **Step 6: Commit**

```bash
npx prettier --write apps/api/src/modules/runtime/adapters/kubernetes/persistent apps/api/src/modules/runtime/adapters/kubernetes/database
git add apps/api/src/modules/runtime/adapters/kubernetes/persistent apps/api/src/modules/runtime/adapters/kubernetes/database/database.constants.ts
git commit -m "feat(#206): render a persistent workload as a StatefulSet + PVC + TCP Service

Refs #205

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `DatabaseRuntime` port and mock adapter

**Files:**

- Modify: `apps/api/src/modules/runtime/runtime.types.ts`
- Create: `apps/api/src/modules/runtime/database-runtime.ts`
- Create: `apps/api/src/modules/runtime/adapters/mock/mock-database-runtime.ts`
- Modify: `apps/api/src/modules/runtime/adapters/mock/mock-runtime.module.ts`

**Interfaces:**

- Consumes: `EnvironmentRef`, `NodePinSpec` from `runtime.types.ts`.
- Produces:
  - `DatabaseRef extends EnvironmentRef` with `database: { slug: string }`
  - `DatabaseCredentials = { user: string; password: string; database: string }`
  - `DatabaseDeploySpec = { image, port, dataMountPath, env, storageGib, storageClass, readinessExec, publishedVariables, credentialsSecretKeys, nodePin }` (exact shape below)
  - `enum DatabaseStatus { Provisioning, Ready, Failed, NotFound }`
  - `abstract class DatabaseRuntime { provision(ref, spec); destroy(ref); readStatus(ref) }`
  - `MockDatabaseRuntime` with `failNext(operation: 'provision' | 'destroy', error: Error)` and `setStatus(slug, status)`

- [ ] **Step 1: Add the runtime types**

Append to `apps/api/src/modules/runtime/runtime.types.ts`:

```ts
export interface DatabaseRef extends EnvironmentRef {
  database: { slug: string }
}

// Decrypted, held in memory only for the length of a provision (AgDR-0036).
export interface DatabaseCredentials {
  user: string
  password: string
  database: string
}

export interface DatabaseDeploySpec {
  image: string
  port: number
  dataMountPath: string
  env: Record<string, string>
  // env name -> published-variable key the engine image reads its init values from.
  credentialEnv: Array<{ name: string; key: string }>
  publishedVariables: Record<string, string>
  storageGib: number
  storageClass: string
  readinessExec: string[]
  nodePin: NodePinSpec | null
}

export enum DatabaseStatus {
  Provisioning = 'provisioning',
  Ready = 'ready',
  Failed = 'failed',
  NotFound = 'not_found',
}
```

- [ ] **Step 2: Write the port**

`apps/api/src/modules/runtime/database-runtime.ts`:

```ts
import type {
  DatabaseDeploySpec,
  DatabaseRef,
  DatabaseStatus,
} from '#src/modules/runtime/runtime.types.js'

export abstract class DatabaseRuntime {
  // Provisions the environment too, so a hand-deleted one is healed on the next provision.
  abstract provision(database: DatabaseRef, spec: DatabaseDeploySpec): Promise<void>

  // Idempotent: a retry after a partial teardown still completes, and it deletes the data.
  abstract destroy(database: DatabaseRef): Promise<void>

  abstract readStatus(database: DatabaseRef): Promise<DatabaseStatus>
}
```

- [ ] **Step 3: Write the mock adapter**

`apps/api/src/modules/runtime/adapters/mock/mock-database-runtime.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { DatabaseRuntime } from '#src/modules/runtime/database-runtime.js'
import {
  type DatabaseDeploySpec,
  type DatabaseRef,
  DatabaseStatus,
} from '#src/modules/runtime/runtime.types.js'

@Injectable()
export class MockDatabaseRuntime extends DatabaseRuntime {
  private readonly statuses = new Map<string, DatabaseStatus>()
  private readonly armedFailures = new Map<'provision' | 'destroy', Error>()

  failNext(operation: 'provision' | 'destroy', error: Error): void {
    this.armedFailures.set(operation, error)
  }

  setStatus(slug: string, status: DatabaseStatus): void {
    this.statuses.set(slug, status)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  provision(ref: DatabaseRef, _spec: DatabaseDeploySpec): Promise<void> {
    const failure = this.takeFailure('provision')
    if (failure) {
      return Promise.reject(failure)
    }
    this.statuses.set(ref.database.slug, DatabaseStatus.Ready)
    return Promise.resolve()
  }

  destroy(ref: DatabaseRef): Promise<void> {
    const failure = this.takeFailure('destroy')
    if (failure) {
      return Promise.reject(failure)
    }
    this.statuses.delete(ref.database.slug)
    return Promise.resolve()
  }

  readStatus(ref: DatabaseRef): Promise<DatabaseStatus> {
    return Promise.resolve(this.statuses.get(ref.database.slug) ?? DatabaseStatus.NotFound)
  }

  private takeFailure(operation: 'provision' | 'destroy'): Error | undefined {
    const failure = this.armedFailures.get(operation)
    this.armedFailures.delete(operation)
    return failure
  }
}
```

- [ ] **Step 4: Bind it in the mock module**

In `apps/api/src/modules/runtime/adapters/mock/mock-runtime.module.ts`, add the import, the provider and the export so the file reads:

```ts
import { Global, Module } from '@nestjs/common'
import { MockAppRuntime } from '#src/modules/runtime/adapters/mock/mock-app-runtime.js'
import { MockDatabaseRuntime } from '#src/modules/runtime/adapters/mock/mock-database-runtime.js'
import { MockEnvironmentRuntime } from '#src/modules/runtime/adapters/mock/mock-environment-runtime.js'
import { MockNodeRuntime } from '#src/modules/runtime/adapters/mock/mock-node-runtime.js'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'
import { DatabaseRuntime } from '#src/modules/runtime/database-runtime.js'
import { EnvironmentRuntime } from '#src/modules/runtime/environment-runtime.js'
import { NodeRuntime } from '#src/modules/runtime/node-runtime.js'

@Global()
@Module({
  providers: [
    { provide: AppRuntime, useClass: MockAppRuntime },
    { provide: DatabaseRuntime, useClass: MockDatabaseRuntime },
    { provide: EnvironmentRuntime, useClass: MockEnvironmentRuntime },
    { provide: NodeRuntime, useClass: MockNodeRuntime },
  ],
  exports: [AppRuntime, DatabaseRuntime, EnvironmentRuntime, NodeRuntime],
})
export class MockRuntimeModule {}
```

- [ ] **Step 5: Verify it compiles and nothing regressed**

Run: `cd apps/api && pnpm test 2>&1 | tail -10`
Expected: PASS — the existing suites still pass; no new tests yet (the port has no behaviour, the mock is exercised from Task 7 onward).

- [ ] **Step 6: Commit**

```bash
npx prettier --write apps/api/src/modules/runtime
git add apps/api/src/modules/runtime/runtime.types.ts apps/api/src/modules/runtime/database-runtime.ts apps/api/src/modules/runtime/adapters/mock
git commit -m "feat(#206): add the DatabaseRuntime port and its mock adapter

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Kubernetes `DatabaseRuntime` adapter

**Files:**

- Create: `apps/api/src/modules/runtime/adapters/kubernetes/database/render-credentials-secret.ts`
- Create: `apps/api/src/modules/runtime/adapters/kubernetes/database/map-database-status.ts`
- Create: `apps/api/src/modules/runtime/adapters/kubernetes/kubernetes-database-runtime.ts`
- Modify: `apps/api/src/modules/runtime/adapters/kubernetes/kubernetes-runtime.module.ts`
- Modify: `apps/api/src/config/env.config.ts`
- Modify: `apps/api/.env` and `apps/api/.env.test` (add the new var)
- Test: `apps/api/src/modules/runtime/adapters/kubernetes/database/tests/map-database-status.unit.test.ts`
- Test: `apps/api/src/modules/runtime/adapters/kubernetes/tests/kubernetes-database-runtime.unit.test.ts`

**Interfaces:**

- Consumes: `renderPersistentWorkload` (Task 1), `DatabaseRuntime` + types (Task 2), `namespaceOf`, `ignoreNotFound` / `isNotFound`, `DEPLOY_FIELD_MANAGER`, `EnvironmentRuntime`.
- Produces: `KubernetesDatabaseRuntime` (constructor `(environments: EnvironmentRuntime)`), `renderCredentialsSecret(slug, publishedVariables): V1Secret`, `mapDatabaseStatus(statefulSet, pods): DatabaseStatus`.

- [ ] **Step 1: Write the failing status-mapping test**

`apps/api/src/modules/runtime/adapters/kubernetes/database/tests/map-database-status.unit.test.ts`:

```ts
import { describe, it } from 'node:test'
import type { V1Pod, V1StatefulSet } from '@kubernetes/client-node'
import { expect } from 'expect'
import { mapDatabaseStatus } from '#src/modules/runtime/adapters/kubernetes/database/map-database-status.js'
import { DatabaseStatus } from '#src/modules/runtime/runtime.types.js'

const statefulSet = (readyReplicas: number): V1StatefulSet => ({
  spec: { replicas: 1, selector: {}, serviceName: 'orders', template: {} },
  status: { readyReplicas, replicas: 1, availableReplicas: readyReplicas },
})

const podWaiting = (reason: string): V1Pod => ({
  status: { containerStatuses: [{ name: 'orders', state: { waiting: { reason } } }] },
})

describe('mapDatabaseStatus', () => {
  it('reports not-found when the StatefulSet is absent', () => {
    expect(mapDatabaseStatus(null, [])).toBe(DatabaseStatus.NotFound)
  })

  it('reports ready once the single replica is ready', () => {
    expect(mapDatabaseStatus(statefulSet(1), [])).toBe(DatabaseStatus.Ready)
  })

  it('reports provisioning while no replica is ready yet', () => {
    expect(mapDatabaseStatus(statefulSet(0), [])).toBe(DatabaseStatus.Provisioning)
  })

  it('reports failed when the pod is stuck on a terminal waiting reason', () => {
    expect(mapDatabaseStatus(statefulSet(0), [podWaiting('CrashLoopBackOff')])).toBe(
      DatabaseStatus.Failed,
    )
    expect(mapDatabaseStatus(statefulSet(0), [podWaiting('ImagePullBackOff')])).toBe(
      DatabaseStatus.Failed,
    )
  })

  it('keeps a pulling pod in provisioning rather than calling it failed', () => {
    expect(mapDatabaseStatus(statefulSet(0), [podWaiting('ContainerCreating')])).toBe(
      DatabaseStatus.Provisioning,
    )
  })
})
```

- [ ] **Step 2: Run it and verify it fails**

Run: `cd apps/api && pnpm build`
Expected: FAIL — `Cannot find module '…/database/map-database-status.js'`.

- [ ] **Step 3: Write the status mapper and the Secret renderer**

`apps/api/src/modules/runtime/adapters/kubernetes/database/map-database-status.ts`:

```ts
import type { V1Pod, V1StatefulSet } from '@kubernetes/client-node'
import { DatabaseStatus } from '#src/modules/runtime/runtime.types.js'

const TERMINAL_WAITING_REASONS = new Set([
  'CrashLoopBackOff',
  'ImagePullBackOff',
  'ErrImagePull',
  'CreateContainerConfigError',
  'InvalidImageName',
])

export function mapDatabaseStatus(
  statefulSet: V1StatefulSet | null,
  pods: V1Pod[],
): DatabaseStatus {
  if (statefulSet === null) {
    return DatabaseStatus.NotFound
  }
  if ((statefulSet.status?.readyReplicas ?? 0) > 0) {
    return DatabaseStatus.Ready
  }

  const waiting = pods.flatMap(
    (pod) =>
      pod.status?.containerStatuses?.map((container) => container.state?.waiting?.reason) ?? [],
  )
  const failed = waiting.some((reason) => reason && TERMINAL_WAITING_REASONS.has(reason))
  return failed ? DatabaseStatus.Failed : DatabaseStatus.Provisioning
}
```

`apps/api/src/modules/runtime/adapters/kubernetes/database/render-credentials-secret.ts`:

```ts
import type { V1Secret } from '@kubernetes/client-node'
import { CREDENTIALS_SECRET_SUFFIX } from '#src/modules/runtime/adapters/kubernetes/database/database.constants.js'

export function credentialsSecretName(slug: string): string {
  return `${slug}${CREDENTIALS_SECRET_SUFFIX}`
}

export function renderCredentialsSecret(
  slug: string,
  publishedVariables: Record<string, string>,
): V1Secret {
  return {
    apiVersion: 'v1',
    kind: 'Secret',
    type: 'Opaque',
    metadata: { name: credentialsSecretName(slug), labels: { app: slug } },
    stringData: publishedVariables,
  }
}
```

- [ ] **Step 4: Write the failing adapter test**

`apps/api/src/modules/runtime/adapters/kubernetes/tests/kubernetes-database-runtime.unit.test.ts`:

```ts
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  ApiException,
  AppsV1Api,
  CoreV1Api,
  KubeConfig,
  type V1Status,
} from '@kubernetes/client-node'
import { expect } from 'expect'
import {
  createSandbox,
  createStubInstance,
  type SinonSandbox,
  type SinonStubbedInstance,
} from 'sinon'
import { KubernetesDatabaseRuntime } from '#src/modules/runtime/adapters/kubernetes/kubernetes-database-runtime.js'
import { MockEnvironmentRuntime } from '#src/modules/runtime/adapters/mock/mock-environment-runtime.js'
import {
  type DatabaseDeploySpec,
  type DatabaseRef,
  DatabaseStatus,
} from '#src/modules/runtime/runtime.types.js'
import { generateUuid, type Uuid } from '#src/utils/uuid.js'

const SLUG = 'orders'
const NAMESPACE = 'demo-dev'

const DATABASE: DatabaseRef = {
  project: { slug: 'demo' },
  environment: { uuid: generateUuid<Uuid<'Environment'>>(), slug: 'dev' },
  database: { slug: SLUG },
}

const spec = (): DatabaseDeploySpec => ({
  image: 'postgres:17.11',
  port: 5432,
  dataMountPath: '/var/lib/postgresql/data',
  env: { PGDATA: '/var/lib/postgresql/data/pgdata' },
  credentialEnv: [{ name: 'POSTGRES_PASSWORD', key: 'PGPASSWORD' }],
  publishedVariables: {
    DATABASE_URL: 'postgres://postgres:pw@orders:5432/orders',
    PGHOST: 'orders',
    PGPORT: '5432',
    PGUSER: 'postgres',
    PGPASSWORD: 'pw',
    PGDATABASE: 'orders',
  },
  storageGib: 10,
  storageClass: 'local-path',
  readinessExec: ['pg_isready', '-U', 'postgres'],
  nodePin: null,
})

describe('KubernetesDatabaseRuntime', () => {
  let apps: SinonStubbedInstance<AppsV1Api>
  let core: SinonStubbedInstance<CoreV1Api>
  let sandbox: SinonSandbox
  let environments: SinonStubbedInstance<MockEnvironmentRuntime>
  let runtime: KubernetesDatabaseRuntime

  beforeEach(() => {
    apps = createStubInstance(AppsV1Api)
    core = createStubInstance(CoreV1Api)
    sandbox = createSandbox()
    sandbox.stub(KubeConfig.prototype, 'loadFromDefault')
    sandbox
      .stub(KubeConfig.prototype, 'makeApiClient')
      .withArgs(AppsV1Api)
      .returns(apps)
      .withArgs(CoreV1Api)
      .returns(core)
    environments = createStubInstance(MockEnvironmentRuntime)
    environments.provision.resolves()
    runtime = new KubernetesDatabaseRuntime(environments)
  })

  afterEach(() => sandbox.restore())

  it('provisions the environment, then the Secret, then the StatefulSet', async () => {
    await runtime.provision(DATABASE, spec())

    expect(environments.provision.calledOnceWithExactly(DATABASE)).toBe(true)
    expect(core.patchNamespacedSecret.calledOnce).toBe(true)
    expect(core.patchNamespacedSecret.firstCall.args[0].namespace).toBe(NAMESPACE)
    expect(
      core.patchNamespacedSecret.firstCall.calledBefore(apps.patchNamespacedStatefulSet.firstCall),
    ).toBe(true)
    expect(
      environments.provision.firstCall.calledBefore(core.patchNamespacedSecret.firstCall),
    ).toBe(true)
  })

  it('deletes the StatefulSet, Service, Secret and PVC on destroy', async () => {
    await runtime.destroy(DATABASE)

    expect(apps.deleteNamespacedStatefulSet.calledOnce).toBe(true)
    expect(core.deleteNamespacedService.calledOnce).toBe(true)
    expect(core.deleteNamespacedSecret.calledOnce).toBe(true)
    expect(core.deleteNamespacedPersistentVolumeClaim.calledOnce).toBe(true)
    expect(core.deleteNamespacedPersistentVolumeClaim.firstCall.args[0]).toEqual({
      name: `data-${SLUG}-0`,
      namespace: NAMESPACE,
    })
  })

  it('tolerates a 404 from any teardown step so a retry can finish', async () => {
    apps.deleteNamespacedStatefulSet.rejects(new ApiException(404, 'Not Found', {}, {}))
    core.deleteNamespacedService.rejects(new ApiException(404, 'Not Found', {}, {}))
    core.deleteNamespacedSecret.resolves({} as V1Status)
    core.deleteNamespacedPersistentVolumeClaim.rejects(new ApiException(404, 'Not Found', {}, {}))

    await runtime.destroy(DATABASE)

    expect(core.deleteNamespacedSecret.calledOnce).toBe(true)
  })

  it('reports not-found when the StatefulSet does not exist', async () => {
    apps.readNamespacedStatefulSet.rejects(new ApiException(404, 'Not Found', {}, {}))

    expect(await runtime.readStatus(DATABASE)).toBe(DatabaseStatus.NotFound)
  })

  it('reports ready when the replica is ready', async () => {
    apps.readNamespacedStatefulSet.resolves({
      spec: { selector: { matchLabels: { app: SLUG } }, serviceName: SLUG, template: {} },
      status: { readyReplicas: 1, replicas: 1 },
    })

    expect(await runtime.readStatus(DATABASE)).toBe(DatabaseStatus.Ready)
  })
})
```

- [ ] **Step 5: Write the adapter**

`apps/api/src/modules/runtime/adapters/kubernetes/kubernetes-database-runtime.ts`:

```ts
import {
  AppsV1Api,
  CoreV1Api,
  KubeConfig,
  PatchStrategy,
  setHeaderOptions,
  type V1Pod,
  type V1StatefulSet,
} from '@kubernetes/client-node'
import { Injectable } from '@nestjs/common'
import { DEPLOY_FIELD_MANAGER } from '#src/modules/runtime/adapters/kubernetes/app/app.constants.js'
import { DATA_VOLUME_NAME } from '#src/modules/runtime/adapters/kubernetes/database/database.constants.js'
import { mapDatabaseStatus } from '#src/modules/runtime/adapters/kubernetes/database/map-database-status.js'
import {
  credentialsSecretName,
  renderCredentialsSecret,
} from '#src/modules/runtime/adapters/kubernetes/database/render-credentials-secret.js'
import { namespaceOf } from '#src/modules/runtime/adapters/kubernetes/environment/namespace-name.js'
import { renderPersistentWorkload } from '#src/modules/runtime/adapters/kubernetes/persistent/render-persistent-workload.js'
import {
  ignoreNotFound,
  isNotFound,
} from '#src/modules/runtime/adapters/kubernetes/shared/not-found.js'
import { DatabaseRuntime } from '#src/modules/runtime/database-runtime.js'
import { EnvironmentRuntime } from '#src/modules/runtime/environment-runtime.js'
import type {
  DatabaseDeploySpec,
  DatabaseRef,
  DatabaseStatus,
} from '#src/modules/runtime/runtime.types.js'

@Injectable()
export class KubernetesDatabaseRuntime extends DatabaseRuntime {
  private readonly apps: AppsV1Api
  private readonly core: CoreV1Api

  constructor(private readonly environments: EnvironmentRuntime) {
    super()
    const kc = new KubeConfig()
    kc.loadFromDefault()
    this.apps = kc.makeApiClient(AppsV1Api)
    this.core = kc.makeApiClient(CoreV1Api)
  }

  async provision(ref: DatabaseRef, spec: DatabaseDeploySpec): Promise<void> {
    await this.environments.provision(ref)

    const namespace = namespaceOf(ref)
    const name = ref.database.slug
    const ssa = setHeaderOptions('Content-Type', PatchStrategy.ServerSideApply)
    const secret = renderCredentialsSecret(name, spec.publishedVariables)

    // Before the StatefulSet: the pod mounts these keys, so a pod that schedules first
    // crash-loops on a Secret that does not exist yet (#99).
    await this.core.patchNamespacedSecret(
      {
        name: credentialsSecretName(name),
        namespace,
        body: secret,
        fieldManager: DEPLOY_FIELD_MANAGER,
        force: true,
      },
      ssa,
    )

    const { statefulSet, service } = renderPersistentWorkload({
      name,
      image: spec.image,
      port: spec.port,
      env: spec.env,
      secretEnv: spec.credentialEnv.map((ref) => ({
        name: ref.name,
        secret: credentialsSecretName(name),
        key: ref.key,
      })),
      volume: {
        mountPath: spec.dataMountPath,
        sizeGib: spec.storageGib,
        storageClass: spec.storageClass,
      },
      readinessExec: spec.readinessExec,
      nodePin: spec.nodePin,
    })

    await this.apps.patchNamespacedStatefulSet(
      { name, namespace, body: statefulSet, fieldManager: DEPLOY_FIELD_MANAGER, force: true },
      ssa,
    )

    await this.core.patchNamespacedService(
      { name, namespace, body: service, fieldManager: DEPLOY_FIELD_MANAGER, force: true },
      ssa,
    )
  }

  async destroy(ref: DatabaseRef): Promise<void> {
    const namespace = namespaceOf(ref)
    const name = ref.database.slug

    await ignoreNotFound(() => this.apps.deleteNamespacedStatefulSet({ name, namespace }))
    await ignoreNotFound(() => this.core.deleteNamespacedService({ name, namespace }))
    await ignoreNotFound(() =>
      this.core.deleteNamespacedSecret({ name: credentialsSecretName(name), namespace }),
    )
    // The retention policy deletes it with the StatefulSet; this covers a volume left by an
    // older policy or a partial teardown, and a 404 is the normal case.
    await ignoreNotFound(() =>
      this.core.deleteNamespacedPersistentVolumeClaim({
        name: `${DATA_VOLUME_NAME}-${name}-0`,
        namespace,
      }),
    )
  }

  async readStatus(ref: DatabaseRef): Promise<DatabaseStatus> {
    const namespace = namespaceOf(ref)
    const statefulSet = await this.readStatefulSet(namespace, ref.database.slug)
    if (statefulSet === null) {
      return mapDatabaseStatus(null, [])
    }
    const pods = await this.listPods(namespace, ref.database.slug)
    return mapDatabaseStatus(statefulSet, pods)
  }

  private async listPods(namespace: string, name: string): Promise<V1Pod[]> {
    const { items } = await this.core.listNamespacedPod({
      namespace,
      labelSelector: `app=${name}`,
    })
    return items
  }

  private async readStatefulSet(namespace: string, name: string): Promise<V1StatefulSet | null> {
    try {
      return await this.apps.readNamespacedStatefulSet({ name, namespace })
    } catch (error) {
      if (isNotFound(error)) {
        return null
      }
      throw error
    }
  }
}
```

- [ ] **Step 6: Bind the adapter and add the storage-class config**

In `apps/api/src/modules/runtime/adapters/kubernetes/kubernetes-runtime.module.ts`, add to `providers` (and to `exports`):

```ts
    {
      provide: DatabaseRuntime,
      useFactory: (environments: EnvironmentRuntime) =>
        new KubernetesDatabaseRuntime(environments),
      inject: [EnvironmentRuntime],
    },
```

with the imports `DatabaseRuntime` from `#src/modules/runtime/database-runtime.js` and `KubernetesDatabaseRuntime` from `#src/modules/runtime/adapters/kubernetes/kubernetes-database-runtime.js`.

In `apps/api/src/config/env.config.ts`, add inside `envValidationSchema`:

```ts
  // A volume cannot change storage class in place, so a fresh install must be able to pick
  // another backend on day one (#210).
  MARSA_DATABASE_STORAGE_CLASS: Joi.string().default('local-path'),
```

Add `MARSA_DATABASE_STORAGE_CLASS=local-path` to `apps/api/.env` and `apps/api/.env.test`.

- [ ] **Step 7: Run the tests and verify they pass**

Run: `cd apps/api && pnpm test 2>&1 | tail -20`
Expected: PASS — `mapDatabaseStatus` and `KubernetesDatabaseRuntime` suites green.

- [ ] **Step 8: Commit**

```bash
npx prettier --write apps/api/src/modules/runtime apps/api/src/config/env.config.ts
git add apps/api/src/modules/runtime apps/api/src/config/env.config.ts apps/api/.env.test
git commit -m "feat(#206): add the Kubernetes DatabaseRuntime adapter

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

> `apps/api/.env` is gitignored — set the variable locally, and add it to the chart in Task 16's doc step.

---

### Task 4: `database` table, engine enum, catalogue, builder, migration

**Files:**

- Create: `apps/api/src/app/database/entities/database.uuid.ts`, `database.table.ts`, `database.builder.ts`, `database-config.constants.ts`, `engine-catalogue.ts`
- Create: `apps/api/src/app/database/enums/database-engine.enum.ts`
- Modify: `apps/api/src/sql/schema.ts`, `apps/api/src/sql/relations.ts`
- Test: `apps/api/src/app/database/entities/tests/engine-catalogue.unit.test.ts`
- Generated: `apps/api/src/sql/drizzle/<timestamp>_*/`

**Interfaces:**

- Produces: `DatabaseUuid`, `databaseTable`, `Database`/`NewDatabase` row types (**note:** import the row type as `DatabaseRow` where `Database` already means the Drizzle client), `DatabaseBuilder`, `DatabaseEngine`, `databaseEngineEnum`, `DatabaseEngineApiProperty`, `SUPPORTED_MAJORS`, `catalogueEntry(engine, version)`, `EngineCatalogueEntry`.

- [ ] **Step 1: Write the enum, uuid, constants and table**

`apps/api/src/app/database/enums/database-engine.enum.ts`:

```ts
import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger'
import { pgEnum } from 'drizzle-orm/pg-core'

export enum DatabaseEngine {
  Postgres = 'postgres',
}

export const databaseEngineEnum = pgEnum('database_engine_enum', DatabaseEngine)

export const DatabaseEngineApiProperty = (options?: ApiPropertyOptions): PropertyDecorator =>
  ApiProperty({ ...options, enum: DatabaseEngine, enumName: 'DatabaseEngine' })
```

`apps/api/src/app/database/entities/database.uuid.ts`:

```ts
import type { Uuid } from '#src/utils/uuid.js'

export type DatabaseUuid = Uuid<'Database'>
```

`apps/api/src/app/database/entities/database-config.constants.ts`:

```ts
/** DNS-1123 label: the slug is the in-cluster hostname and the K8s object name. */
export const DATABASE_SLUG_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/
export const DATABASE_SLUG_MAX_LENGTH = 63

/** local-path ignores the request and cannot resize, so the ceiling is advisory (#209). */
export const MIN_STORAGE_GIB = 1
export const MAX_STORAGE_GIB = 1024
export const DEFAULT_STORAGE_GIB = 10
```

`apps/api/src/app/database/entities/database.table.ts`:

```ts
import { sql } from 'drizzle-orm'
import { integer, jsonb, pgTable, text, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import type { NodePin } from '#src/app/app-management/entities/node-pin.js'
import { DATABASE_SLUG_MAX_LENGTH } from '#src/app/database/entities/database-config.constants.js'
import type { DatabaseUuid } from '#src/app/database/entities/database.uuid.js'
import { databaseEngineEnum } from '#src/app/database/enums/database-engine.enum.js'
import { environmentTable } from '#src/app/environment/entities/environment.table.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import { timestamps } from '#src/sql/timestamps.js'

export const databaseTable = pgTable(
  'database',
  {
    uuid: uuid()
      .$type<DatabaseUuid>()
      .primaryKey()
      .default(sql`uuidv7()`),
    environmentUuid: uuid('environment_uuid')
      .$type<EnvironmentUuid>()
      .notNull()
      .references(() => environmentTable.uuid, { onDelete: 'restrict', onUpdate: 'cascade' }),
    slug: varchar({ length: DATABASE_SLUG_MAX_LENGTH }).notNull(),
    engine: databaseEngineEnum().notNull(),
    version: varchar({ length: 8 }).notNull(),
    image: varchar({ length: 255 }).notNull(),
    credentialsEnc: text('credentials_enc').notNull(),
    storageGib: integer('storage_gib').notNull(),
    nodePin: jsonb('node_pin').$type<NodePin>(),
    ...timestamps,
  },
  (table) => [
    unique('database_environment_uuid_slug_unique').on(table.environmentUuid, table.slug),
  ],
)

export type DatabaseRow = typeof databaseTable.$inferSelect
export type NewDatabaseRow = typeof databaseTable.$inferInsert
```

> The row type is `DatabaseRow`, not `Database`: `Database` is already the Drizzle client type from `#src/modules/database/drizzle.factory.js`, and both are imported together in every repository.

- [ ] **Step 2: Write the failing catalogue test**

`apps/api/src/app/database/entities/tests/engine-catalogue.unit.test.ts`:

```ts
import { describe, it } from 'node:test'
import { expect } from 'expect'
import { catalogueEntry, SUPPORTED_MAJORS } from '#src/app/database/entities/engine-catalogue.js'
import { DatabaseEngine } from '#src/app/database/enums/database-engine.enum.js'

describe('engine catalogue', () => {
  it('offers exactly the supported Postgres majors', () => {
    expect(SUPPORTED_MAJORS[DatabaseEngine.Postgres]).toEqual(['16', '17', '18'])
  })

  it('pins an exact tag per major so a reschedule is deterministic', () => {
    expect(catalogueEntry(DatabaseEngine.Postgres, '17')?.image).toBe('postgres:17.11')
  })

  it('mounts the pre-18 data path with PGDATA in a subdirectory', () => {
    const entry = catalogueEntry(DatabaseEngine.Postgres, '17')

    expect(entry?.dataMountPath).toBe('/var/lib/postgresql/data')
    expect(entry?.env.PGDATA).toBe('/var/lib/postgresql/data/pgdata')
  })

  it('uses the version-specific data path that Postgres 18 moved to', () => {
    const entry = catalogueEntry(DatabaseEngine.Postgres, '18')

    expect(entry?.dataMountPath).toBe('/var/lib/postgresql')
    expect(entry?.env.PGDATA).toBe('/var/lib/postgresql/18/docker')
  })

  it('publishes a composed connection string plus the libpq variables', () => {
    const entry = catalogueEntry(DatabaseEngine.Postgres, '17')

    expect(
      entry?.publishedVariables({
        host: 'orders',
        port: 5432,
        user: 'postgres',
        password: 'abc123',
        database: 'orders',
      }),
    ).toEqual({
      DATABASE_URL: 'postgres://postgres:abc123@orders:5432/orders',
      PGHOST: 'orders',
      PGPORT: '5432',
      PGUSER: 'postgres',
      PGPASSWORD: 'abc123',
      PGDATABASE: 'orders',
    })
  })

  it('returns undefined for a major it does not carry', () => {
    expect(catalogueEntry(DatabaseEngine.Postgres, '15')).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run it and verify it fails**

Run: `cd apps/api && pnpm build`
Expected: FAIL — `Cannot find module '#src/app/database/entities/engine-catalogue.js'`.

- [ ] **Step 4: Write the catalogue**

`apps/api/src/app/database/entities/engine-catalogue.ts`:

```ts
import { DatabaseEngine } from '#src/app/database/enums/database-engine.enum.js'

export interface ConnectionDetails {
  host: string
  port: number
  user: string
  password: string
  database: string
}

export interface EngineCatalogueEntry {
  image: string
  port: number
  dataMountPath: string
  env: Record<string, string>
  // Env the engine image reads its init values from, keyed by published-variable name.
  credentialEnv: Array<{ name: string; key: string }>
  readinessExec: string[]
  publishedVariables: (connection: ConnectionDetails) => Record<string, string>
}

const POSTGRES_CREDENTIAL_ENV = [
  { name: 'POSTGRES_USER', key: 'PGUSER' },
  { name: 'POSTGRES_PASSWORD', key: 'PGPASSWORD' },
  { name: 'POSTGRES_DB', key: 'PGDATABASE' },
]

const postgresPublishedVariables = ({
  host,
  port,
  user,
  password,
  database,
}: ConnectionDetails): Record<string, string> => ({
  DATABASE_URL: `postgres://${user}:${password}@${host}:${port}/${database}`,
  PGHOST: host,
  PGPORT: String(port),
  PGUSER: user,
  PGPASSWORD: password,
  PGDATABASE: database,
})

const postgres = (image: string, dataMountPath: string, pgData: string): EngineCatalogueEntry => ({
  image,
  port: 5432,
  dataMountPath,
  // A local-path directory can hold entries initdb refuses to start in, so PGDATA is a subdir.
  env: { PGDATA: pgData },
  credentialEnv: POSTGRES_CREDENTIAL_ENV,
  // A TCP probe calls Postgres ready while it is still recovering.
  readinessExec: ['pg_isready', '-U', 'postgres'],
  publishedVariables: postgresPublishedVariables,
})

const CATALOGUE: Record<DatabaseEngine, Record<string, EngineCatalogueEntry>> = {
  [DatabaseEngine.Postgres]: {
    '16': postgres('postgres:16.15', '/var/lib/postgresql/data', '/var/lib/postgresql/data/pgdata'),
    '17': postgres('postgres:17.11', '/var/lib/postgresql/data', '/var/lib/postgresql/data/pgdata'),
    // 18 moved PGDATA to a version-specific path and the VOLUME up one level.
    '18': postgres('postgres:18.6', '/var/lib/postgresql', '/var/lib/postgresql/18/docker'),
  },
}

export const SUPPORTED_MAJORS: Record<DatabaseEngine, string[]> = {
  [DatabaseEngine.Postgres]: Object.keys(CATALOGUE[DatabaseEngine.Postgres]),
}

export function catalogueEntry(
  engine: DatabaseEngine,
  version: string,
): EngineCatalogueEntry | undefined {
  return CATALOGUE[engine][version]
}
```

- [ ] **Step 5: Write the builder**

`apps/api/src/app/database/entities/database.builder.ts`:

```ts
import type { NodePin } from '#src/app/app-management/entities/node-pin.js'
import type { DatabaseRow } from '#src/app/database/entities/database.table.js'
import type { DatabaseUuid } from '#src/app/database/entities/database.uuid.js'
import { DEFAULT_STORAGE_GIB } from '#src/app/database/entities/database-config.constants.js'
import { DatabaseEngine } from '#src/app/database/enums/database-engine.enum.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import { generateUuid } from '#src/utils/uuid.js'

export class DatabaseBuilder {
  private readonly database: DatabaseRow

  constructor() {
    const now = new Date()
    this.database = {
      uuid: generateUuid<DatabaseUuid>(),
      environmentUuid: generateUuid<EnvironmentUuid>(),
      slug: 'my-database',
      engine: DatabaseEngine.Postgres,
      version: '17',
      image: 'postgres:17.11',
      credentialsEnc: 'sealed',
      storageGib: DEFAULT_STORAGE_GIB,
      nodePin: null,
      createdAt: now,
      updatedAt: now,
    }
  }

  withEnvironmentUuid(environmentUuid: EnvironmentUuid): this {
    this.database.environmentUuid = environmentUuid
    return this
  }

  withSlug(slug: string): this {
    this.database.slug = slug
    return this
  }

  withEngine(engine: DatabaseEngine): this {
    this.database.engine = engine
    return this
  }

  withVersion(version: string): this {
    this.database.version = version
    return this
  }

  withImage(image: string): this {
    this.database.image = image
    return this
  }

  withCredentialsEnc(credentialsEnc: string): this {
    this.database.credentialsEnc = credentialsEnc
    return this
  }

  withStorageGib(storageGib: number): this {
    this.database.storageGib = storageGib
    return this
  }

  withNodePin(nodePin: NodePin | null): this {
    this.database.nodePin = nodePin
    return this
  }

  build(): DatabaseRow {
    return this.database
  }
}
```

- [ ] **Step 6: Register the table in the schema barrel and relations**

Add to `apps/api/src/sql/schema.ts` (keep the file alphabetically ordered):

```ts
export * from '#src/app/database/entities/database.table.js'
export { databaseEngineEnum } from '#src/app/database/enums/database-engine.enum.js'
```

In `apps/api/src/sql/relations.ts`, add `databases: r.many.databaseTable(),` to the `environmentTable` block and a new block:

```ts
  databaseTable: {
    environment: r.one.environmentTable({
      from: r.databaseTable.environmentUuid,
      to: r.environmentTable.uuid,
      optional: false,
    }),
  },
```

> drizzle-kit reads **only** the barrel; a table missing from it silently produces no migration.

- [ ] **Step 7: Generate the migration**

Run: `cd apps/api && pnpm db:generate`
Expected: a new folder under `src/sql/drizzle/` containing `CREATE TYPE "public"."database_engine_enum"` and `CREATE TABLE "database"`. Do not edit the SQL.

- [ ] **Step 8: Run the tests and verify they pass**

Run: `cd apps/api && pnpm test 2>&1 | tail -20`
Expected: PASS — the catalogue suite is green and the migration applies cleanly in `test:setup`.

- [ ] **Step 9: Commit**

```bash
npx prettier --write apps/api/src/app/database apps/api/src/sql
git add apps/api/src/app/database apps/api/src/sql
git commit -m "feat(#206): add the database table, engine enum and catalogue

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Credential generation and sealing

**Files:**

- Create: `apps/api/src/app/database/entities/database-credentials.ts`
- Create: `apps/api/src/modules/crypto/database-credentials.cipher.ts`
- Modify: `apps/api/src/modules/crypto/crypto.module.ts`
- Test: `apps/api/src/app/database/entities/tests/database-credentials.unit.test.ts`

**Interfaces:**

- Consumes: `SecretCipherService` from `#src/modules/crypto/secret-cipher.service.js`; `DatabaseCredentials` from `#src/modules/runtime/runtime.types.js`.
- Produces: `generateCredentials(slug: string): DatabaseCredentials`, `databaseNameOf(slug: string): string`, `DatabaseCredentialsCipher` with `seal(credentials)` / `open(token)` / `openForDatabase(slug, token)`.

- [ ] **Step 1: Write the failing test**

`apps/api/src/app/database/entities/tests/database-credentials.unit.test.ts`:

```ts
import { describe, it } from 'node:test'
import { expect } from 'expect'
import {
  databaseNameOf,
  generateCredentials,
} from '#src/app/database/entities/database-credentials.js'

describe('generateCredentials', () => {
  it('issues the superuser role so CREATE EXTENSION works out of the box', () => {
    expect(generateCredentials('orders').user).toBe('postgres')
  })

  it('names the database after the slug, with hyphens made SQL-safe', () => {
    expect(databaseNameOf('my-orders-db')).toBe('my_orders_db')
    expect(generateCredentials('my-orders-db').database).toBe('my_orders_db')
  })

  it('generates a 64-character hex password so DATABASE_URL needs no escaping', () => {
    const { password } = generateCredentials('orders')

    expect(password).toMatch(/^[0-9a-f]{64}$/)
  })

  it('never repeats a password', () => {
    expect(generateCredentials('orders').password).not.toBe(generateCredentials('orders').password)
  })
})
```

- [ ] **Step 2: Run it and verify it fails**

Run: `cd apps/api && pnpm build`
Expected: FAIL — `Cannot find module '#src/app/database/entities/database-credentials.js'`.

- [ ] **Step 3: Write the generator**

`apps/api/src/app/database/entities/database-credentials.ts`:

```ts
import { randomBytes } from 'node:crypto'
import type { DatabaseCredentials } from '#src/modules/runtime/runtime.types.js'

const PASSWORD_BYTES = 32

/** Superuser: CREATE EXTENSION and ORM-created shadow/test databases both need it. */
const SUPERUSER = 'postgres'

export function databaseNameOf(slug: string): string {
  return slug.replaceAll('-', '_')
}

export function generateCredentials(slug: string): DatabaseCredentials {
  return {
    user: SUPERUSER,
    // Hex, so the password is URL-safe inside the composed DATABASE_URL.
    password: randomBytes(PASSWORD_BYTES).toString('hex'),
    database: databaseNameOf(slug),
  }
}
```

- [ ] **Step 4: Write the cipher and register it**

`apps/api/src/modules/crypto/database-credentials.cipher.ts`:

```ts
import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import type { DatabaseCredentials } from '#src/modules/runtime/runtime.types.js'

@Injectable()
export class DatabaseCredentialsCipher {
  constructor(private readonly cipher: SecretCipherService) {}

  seal(credentials: DatabaseCredentials): string {
    return this.cipher.encrypt(JSON.stringify(credentials))
  }

  open(token: string): DatabaseCredentials {
    return JSON.parse(this.cipher.decrypt(token)) as DatabaseCredentials
  }

  openForDatabase(slug: string, token: string): DatabaseCredentials {
    try {
      return this.open(token)
    } catch (error) {
      throw new InternalServerErrorException(
        `Stored credentials for database '${slug}' could not be decrypted.`,
        { cause: error },
      )
    }
  }
}
```

In `apps/api/src/modules/crypto/crypto.module.ts`, add `DatabaseCredentialsCipher` to both `providers` and `exports`, with its import.

- [ ] **Step 5: Run the tests and verify they pass**

Run: `cd apps/api && pnpm test 2>&1 | tail -20`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npx prettier --write apps/api/src/app/database apps/api/src/modules/crypto
git add apps/api/src/app/database/entities apps/api/src/modules/crypto
git commit -m "feat(#206): generate and seal database credentials

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Cross-kind name uniqueness inside an environment

**Files:**

- Create: `apps/api/src/app/environment/queries/name-taken-in-environment.ts`
- Create: `apps/api/src/app/environment/queries/environment-placement.ts`
- Modify: `apps/api/src/app/app-management/use-cases/create-app/create-app.repository.ts`
- Modify: `apps/api/src/app/app-management/use-cases/create-app/create-app.use-case.ts`
- Test: `apps/api/src/app/app-management/use-cases/create-app/tests/create-app.use-case.unit.test.ts` (extend)
- Test: `apps/api/src/app/app-management/use-cases/create-app/tests/create-app.e2e.test.ts` (extend)

**Interfaces:**

- Produces:
  - `EnvironmentPlacement = { environment: Environment; project: Project }`, `selectEnvironmentPlacement(db: Executor)`, `lockEnvironmentPlacement(tx: Executor, uuid: EnvironmentUuid): Promise<EnvironmentPlacement | undefined>`
  - `isNameTakenInEnvironment(tx: Executor, environmentUuid: EnvironmentUuid, name: string): Promise<boolean>`
- Consumed by: Task 7 (`create-database`) and `create-app`.

- [ ] **Step 1: Write the placement query**

`apps/api/src/app/environment/queries/environment-placement.ts`:

```ts
import { eq } from 'drizzle-orm'
import {
  type Environment,
  environmentTable,
} from '#src/app/environment/entities/environment.table.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import { type Project, projectTable } from '#src/app/project/entities/project.table.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

export interface EnvironmentPlacement {
  environment: Environment
  project: Project
}

export function selectEnvironmentPlacement(db: Executor) {
  return db
    .select({ environment: environmentTable, project: projectTable })
    .from(environmentTable)
    .innerJoin(projectTable, eq(environmentTable.projectUuid, projectTable.uuid))
}

/** Locked: the cross-table name check below is not a constraint, so concurrent creates
 * must serialise on the environment row. */
export async function lockEnvironmentPlacement(
  tx: Executor,
  uuid: EnvironmentUuid,
): Promise<EnvironmentPlacement | undefined> {
  const [placement] = await selectEnvironmentPlacement(tx)
    .where(eq(environmentTable.uuid, uuid))
    .limit(1)
    .for('update', { of: environmentTable })
  return placement
}
```

- [ ] **Step 2: Write the name-taken query**

`apps/api/src/app/environment/queries/name-taken-in-environment.ts`:

```ts
import { and, eq, or } from 'drizzle-orm'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { databaseTable } from '#src/app/database/entities/database.table.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

/** Apps and databases share one namespace per environment, so their names cannot collide.
 * No unique index can span two tables — the caller holds the environment row lock. */
export async function isNameTakenInEnvironment(
  tx: Executor,
  environmentUuid: EnvironmentUuid,
  name: string,
): Promise<boolean> {
  const [app] = await tx
    .select({ slug: appTable.slug })
    .from(appTable)
    .where(and(eq(appTable.environmentUuid, environmentUuid), eq(appTable.slug, name)))
    .limit(1)
  if (app) {
    return true
  }

  const [database] = await tx
    .select({ slug: databaseTable.slug })
    .from(databaseTable)
    .where(and(eq(databaseTable.environmentUuid, environmentUuid), eq(databaseTable.slug, name)))
    .limit(1)
  return Boolean(database)
}
```

> `or` is imported for readability parity with the repo's other queries; if lint flags it as unused, drop it from the import list.

- [ ] **Step 3: Write the failing `create-app` test**

Append to `apps/api/src/app/app-management/use-cases/create-app/tests/create-app.e2e.test.ts` (inside the existing `describe`, reusing its `setup`, `environment` and `sessionCookie` fixtures — read the file first and match its naming):

```ts
it('rejects an app whose name a database in the same environment already uses', async () => {
  const database = new DatabaseBuilder()
    .withEnvironmentUuid(environment.uuid)
    .withSlug('collides')
    .build()
  await setup.db.insert(databaseTable).values(database)

  await request(setup.httpServer)
    .post('/api/v1/apps')
    .set('Cookie', sessionCookie)
    .send(
      new CreateAppCommandBuilder()
        .withEnvironmentUuid(environment.uuid)
        .withSlug('collides')
        .build(),
    )
    .expect(409)
})
```

with imports `DatabaseBuilder` from `#src/app/database/entities/database.builder.js` and `databaseTable` from `#src/app/database/entities/database.table.js`. If `CreateAppCommandBuilder` does not exist, build the body literal the existing tests in that file use.

- [ ] **Step 4: Run it and verify it fails**

Run: `cd apps/api && pnpm test 2>&1 | grep -A5 'collides'`
Expected: FAIL — the request returns 201 because no cross-table check exists yet.

- [ ] **Step 5: Add the check to `create-app`**

In `create-app.repository.ts`, add a method that runs inside the caller's transaction:

```ts
  async isNameTaken(tx: Executor, environmentUuid: EnvironmentUuid, slug: string): Promise<boolean> {
    return isNameTakenInEnvironment(tx, environmentUuid, slug)
  }
```

with imports for `Executor`, `EnvironmentUuid` and `isNameTakenInEnvironment`.

In `create-app.use-case.ts`, inject `@InjectDatabase() private readonly db: Database`, wrap the existing body in one transaction, and take the environment lock before inserting:

```ts
  async execute(command: CreateAppCommand): Promise<CreateAppResponse> {
    const app = /* unchanged builder chain */

    const outcome = await this.db.transaction(async (tx) => {
      const placement = await lockEnvironmentPlacement(tx, command.environmentUuid)
      if (!placement) {
        return 'environment-missing' as const
      }
      const taken = await this.repository.isNameTaken(tx, command.environmentUuid, command.slug)
      if (taken) {
        return 'slug-taken' as const
      }
      return this.repository.insert(tx, app)
    })

    if (outcome === 'environment-missing') {
      throw new NotFoundException(`Environment '${command.environmentUuid}' was not found.`)
    }
    if (outcome === 'slug-taken') {
      throw new ConflictException(
        `An app or database named '${command.slug}' already exists in this environment.`,
      )
    }

    return new CreateAppResponse(app, this.config.getOrThrow<string>('MARSA_BASE_DOMAIN'))
  }
```

Change `CreateAppRepository.insert` to take the executor as its first parameter (`insert(tx: Executor, app: App)`) and use `tx` instead of `this.db`; keep its `onConflictDoNothing` + FK handling, which still guards the global slug constraint.

- [ ] **Step 6: Run the tests and verify they pass**

Run: `cd apps/api && pnpm test 2>&1 | tail -20`
Expected: PASS — the new 409 case and every pre-existing `create-app` test.

- [ ] **Step 7: Commit**

```bash
npx prettier --write apps/api/src/app/environment/queries apps/api/src/app/app-management/use-cases/create-app
git add apps/api/src/app/environment/queries apps/api/src/app/app-management/use-cases/create-app
git commit -m "feat(#206): reserve a name across apps and databases per environment

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `create-database`

**Files:**

- Create: `apps/api/src/app/database/use-cases/create-database/create-database.{command,command.builder,controller,repository,response,use-case,module}.ts`
- Create: `apps/api/src/app/database/queries/database-placement.ts`
- Create: `apps/api/src/app/database/responses/database-refs.response.ts`
- Create: `apps/api/src/app/database/database.module.ts`
- Modify: `apps/api/src/modules/api/api.module.ts`
- Test: `apps/api/src/app/database/use-cases/create-database/tests/create-database.use-case.unit.test.ts`
- Test: `apps/api/src/app/database/use-cases/create-database/tests/create-database.e2e.test.ts`

**Interfaces:**

- Consumes: `lockEnvironmentPlacement`, `isNameTakenInEnvironment` (Task 6); `catalogueEntry`, `SUPPORTED_MAJORS` (Task 4); `generateCredentials`, `DatabaseCredentialsCipher` (Task 5); `DatabaseRuntime` (Task 2).
- Produces: `CreateDatabaseCommand { environmentUuid, slug, engine, version, storageGib?, nodePin? }`, `CreateDatabaseResponse { slug, engine, version, host, port }`, `CreateDatabaseUseCase.execute(command)`, `deploySpecOf(database, entry, credentials, storageClass): DatabaseDeploySpec`, `DatabasePlacement`, `selectDatabasePlacement`, `databaseRefOf(placement): DatabaseRef`.

- [ ] **Step 1: Write the placement query and shared refs**

`apps/api/src/app/database/queries/database-placement.ts`:

```ts
import { eq } from 'drizzle-orm'
import { type DatabaseRow, databaseTable } from '#src/app/database/entities/database.table.js'
import {
  type Environment,
  environmentTable,
} from '#src/app/environment/entities/environment.table.js'
import { type Project, projectTable } from '#src/app/project/entities/project.table.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'
import type { DatabaseRef } from '#src/modules/runtime/runtime.types.js'

export interface DatabasePlacement {
  database: DatabaseRow
  environment: Environment
  project: Project
}

export function selectDatabasePlacement(db: Executor) {
  return db
    .select({ database: databaseTable, environment: environmentTable, project: projectTable })
    .from(databaseTable)
    .innerJoin(environmentTable, eq(databaseTable.environmentUuid, environmentTable.uuid))
    .innerJoin(projectTable, eq(environmentTable.projectUuid, projectTable.uuid))
}

export function databaseRefOf({ database, environment, project }: DatabasePlacement): DatabaseRef {
  return { project, environment, database: { slug: database.slug } }
}
```

`apps/api/src/app/database/responses/database-refs.response.ts`:

```ts
import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import type { Project } from '#src/app/project/entities/project.table.js'
import { DatabaseStatus } from '#src/modules/runtime/runtime.types.js'

export class DatabaseProjectRef {
  @ApiProperty({ type: String, example: 'demo' })
  readonly slug: string

  @ApiProperty({ type: String, example: 'Demo' })
  readonly name: string

  constructor(project: Project) {
    this.slug = project.slug
    this.name = project.name
  }
}

export class DatabaseEnvironmentRef {
  @ApiProperty({ type: String, example: 'dev' })
  readonly slug: string

  @ApiProperty({ type: String, example: 'Development' })
  readonly name: string

  constructor(environment: Environment) {
    this.slug = environment.slug
    this.name = environment.name
  }
}

// The status enum lives with the runtime port (a feature never owns a runtime type); the
// decorator lives here so `enum` + `enumName` stay paired for the generated web client.
export const DatabaseStatusApiProperty = (options?: ApiPropertyOptions): PropertyDecorator =>
  ApiProperty({ ...options, enum: DatabaseStatus, enumName: 'DatabaseStatus' })
```

> Check `Project` / `Environment` actually expose `name` and `slug` before relying on both; drop `name` from a ref if the row has none.

- [ ] **Step 2: Write the command, its builder and the response**

`create-database.command.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import { NodePin } from '#src/app/app-management/entities/node-pin.js'
import {
  DATABASE_SLUG_MAX_LENGTH,
  DATABASE_SLUG_PATTERN,
  MAX_STORAGE_GIB,
  MIN_STORAGE_GIB,
} from '#src/app/database/entities/database-config.constants.js'
import { SUPPORTED_MAJORS } from '#src/app/database/entities/engine-catalogue.js'
import {
  DatabaseEngine,
  DatabaseEngineApiProperty,
} from '#src/app/database/enums/database-engine.enum.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'

export class CreateDatabaseCommand {
  @ApiProperty({ type: String, format: 'uuid', description: 'Environment the database lives in.' })
  @IsUUID()
  environmentUuid!: EnvironmentUuid

  @ApiProperty({
    type: String,
    example: 'orders',
    description: 'In-cluster hostname + K8s object name.',
    pattern: DATABASE_SLUG_PATTERN.source,
    maxLength: DATABASE_SLUG_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(DATABASE_SLUG_MAX_LENGTH)
  @Matches(DATABASE_SLUG_PATTERN, { message: 'slug must be a valid DNS-1123 label' })
  slug!: string

  @DatabaseEngineApiProperty({ example: DatabaseEngine.Postgres })
  @IsIn(Object.values(DatabaseEngine))
  engine!: DatabaseEngine

  @ApiProperty({ type: String, example: '17', description: 'Major version, pinned at creation.' })
  @IsIn(Object.values(SUPPORTED_MAJORS).flat())
  version!: string

  @ApiPropertyOptional({
    type: 'integer',
    example: 10,
    description: 'Requested volume size. Recorded but not enforced by local-path (#209).',
    minimum: MIN_STORAGE_GIB,
    maximum: MAX_STORAGE_GIB,
  })
  @IsOptional()
  @IsInt()
  @Min(MIN_STORAGE_GIB)
  @Max(MAX_STORAGE_GIB)
  storageGib?: number

  @ApiPropertyOptional({
    type: NodePin,
    description: 'Node the data lives on. Set at creation; immutable afterwards.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => NodePin)
  nodePin?: NodePin
}
```

`create-database.command.builder.ts` follows `CreateAppCommandBuilder`'s shape: a constructor seeding a valid command (`slug: 'my-database'`, `engine: DatabaseEngine.Postgres`, `version: '17'`) plus `withEnvironmentUuid` / `withSlug` / `withVersion` / `withStorageGib` / `withNodePin` setters returning `this`.

`create-database.response.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger'
import type { DatabaseRow } from '#src/app/database/entities/database.table.js'
import {
  DatabaseEngine,
  DatabaseEngineApiProperty,
} from '#src/app/database/enums/database-engine.enum.js'

export class CreateDatabaseResponse {
  @ApiProperty({ type: String, example: 'orders' })
  readonly slug: string

  @DatabaseEngineApiProperty({ example: DatabaseEngine.Postgres })
  readonly engine: DatabaseEngine

  @ApiProperty({ type: String, example: '17' })
  readonly version: string

  @ApiProperty({ type: String, example: 'orders', description: 'In-cluster hostname.' })
  readonly host: string

  @ApiProperty({ type: 'integer', example: 5432 })
  readonly port: number

  constructor(database: DatabaseRow, port: number) {
    this.slug = database.slug
    this.engine = database.engine
    this.version = database.version
    this.host = database.slug
    this.port = port
  }
}
```

- [ ] **Step 3: Write the failing use-case unit test**

`apps/api/src/app/database/use-cases/create-database/tests/create-database.use-case.unit.test.ts`:

```ts
import { before, describe, it } from 'node:test'
import { BadGatewayException, ConflictException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { DatabaseBuilder } from '#src/app/database/entities/database.builder.js'
import { CreateDatabaseCommandBuilder } from '#src/app/database/use-cases/create-database/create-database.command.builder.js'
import { CreateDatabaseRepository } from '#src/app/database/use-cases/create-database/create-database.repository.js'
import { CreateDatabaseUseCase } from '#src/app/database/use-cases/create-database/create-database.use-case.js'
import { EnvironmentBuilder } from '#src/app/environment/entities/environment.builder.js'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'
import { DatabaseCredentialsCipher } from '#src/modules/crypto/database-credentials.cipher.js'
import { MockDatabaseRuntime } from '#src/modules/runtime/adapters/mock/mock-database-runtime.js'
import { stubDatabase } from '#src/test/setup/stub-database.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const project = new ProjectBuilder().build()
const environment = new EnvironmentBuilder().withProject(project).build()

function build() {
  const repository = createStubInstance(CreateDatabaseRepository)
  repository.lockEnvironment.resolves({ environment, project })
  repository.isNameTaken.resolves(false)
  repository.insert.resolves()

  const cipher = createStubInstance(DatabaseCredentialsCipher)
  cipher.seal.returns('sealed-token')

  const runtime = createStubInstance(MockDatabaseRuntime)
  runtime.provision.resolves()

  const config = createStubInstance(ConfigService)
  config.getOrThrow.returns('local-path')

  const usecase = new CreateDatabaseUseCase(stubDatabase(), repository, cipher, runtime, config)
  const command = new CreateDatabaseCommandBuilder()
    .withEnvironmentUuid(environment.uuid)
    .withSlug('orders')
    .build()

  return { repository, cipher, runtime, usecase, command }
}

describe('CreateDatabaseUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('inserts the row, then provisions the runtime last', async () => {
    const { repository, runtime, usecase, command } = build()

    await usecase.execute(command)

    expect(repository.insert.calledOnce).toBe(true)
    expect(runtime.provision.calledOnce).toBe(true)
    expect(repository.insert.getCall(0).calledBefore(runtime.provision.getCall(0))).toBe(true)
  })

  it('resolves the pinned image from the catalogue and seals the credentials', async () => {
    const { repository, cipher, usecase, command } = build()

    await usecase.execute(command)

    expect(repository.insert.firstCall.args[1].image).toBe('postgres:17.11')
    expect(repository.insert.firstCall.args[1].credentialsEnc).toBe('sealed-token')
    expect(cipher.seal.firstCall.args[0]).toMatchObject({ user: 'postgres', database: 'orders' })
  })

  it('passes the configured storage class and the pinned node to the runtime', async () => {
    const { runtime, usecase, command } = build()

    await usecase.execute(command)

    expect(runtime.provision.firstCall.args[1]).toMatchObject({
      image: 'postgres:17.11',
      port: 5432,
      storageClass: 'local-path',
      nodePin: null,
    })
    expect(runtime.provision.firstCall.args[0]).toMatchObject({
      database: { slug: 'orders' },
      project: { slug: project.slug },
    })
  })

  it('throws 404 when the environment does not exist', async () => {
    const { repository, runtime, usecase, command } = build()
    repository.lockEnvironment.resolves(undefined)

    await expect(usecase.execute(command)).rejects.toThrow(NotFoundException)

    expect(runtime.provision.called).toBe(false)
  })

  it('throws 409 when an app or database already owns the name', async () => {
    const { repository, runtime, usecase, command } = build()
    repository.isNameTaken.resolves(true)

    await expect(usecase.execute(command)).rejects.toThrow(ConflictException)

    expect(repository.insert.called).toBe(false)
    expect(runtime.provision.called).toBe(false)
  })

  it('maps a runtime failure to 502 so the row rolls back', async () => {
    const { runtime, usecase, command } = build()
    runtime.provision.rejects(new Error('cluster down'))

    await expect(usecase.execute(command)).rejects.toThrow(BadGatewayException)
  })
})
```

- [ ] **Step 4: Run it and verify it fails**

Run: `cd apps/api && pnpm build`
Expected: FAIL — `create-database.use-case.js` and its siblings do not exist.

- [ ] **Step 5: Write the repository, use-case, controller and module**

`create-database.repository.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { type DatabaseRow, databaseTable } from '#src/app/database/entities/database.table.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import {
  type EnvironmentPlacement,
  lockEnvironmentPlacement,
} from '#src/app/environment/queries/environment-placement.js'
import { isNameTakenInEnvironment } from '#src/app/environment/queries/name-taken-in-environment.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

@Injectable()
export class CreateDatabaseRepository {
  lockEnvironment(tx: Executor, uuid: EnvironmentUuid): Promise<EnvironmentPlacement | undefined> {
    return lockEnvironmentPlacement(tx, uuid)
  }

  isNameTaken(tx: Executor, environmentUuid: EnvironmentUuid, slug: string): Promise<boolean> {
    return isNameTakenInEnvironment(tx, environmentUuid, slug)
  }

  async insert(tx: Executor, database: DatabaseRow): Promise<void> {
    await tx.insert(databaseTable).values(database)
  }
}
```

`create-database.use-case.ts`:

```ts
import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DatabaseBuilder } from '#src/app/database/entities/database.builder.js'
import { DEFAULT_STORAGE_GIB } from '#src/app/database/entities/database-config.constants.js'
import { generateCredentials } from '#src/app/database/entities/database-credentials.js'
import type { DatabaseRow } from '#src/app/database/entities/database.table.js'
import {
  catalogueEntry,
  type EngineCatalogueEntry,
} from '#src/app/database/entities/engine-catalogue.js'
import type { DatabasePlacement } from '#src/app/database/queries/database-placement.js'
import { databaseRefOf } from '#src/app/database/queries/database-placement.js'
import { CreateDatabaseCommand } from '#src/app/database/use-cases/create-database/create-database.command.js'
import { CreateDatabaseRepository } from '#src/app/database/use-cases/create-database/create-database.repository.js'
import { CreateDatabaseResponse } from '#src/app/database/use-cases/create-database/create-database.response.js'
import { DatabaseCredentialsCipher } from '#src/modules/crypto/database-credentials.cipher.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { DatabaseRuntime } from '#src/modules/runtime/database-runtime.js'
import type { DatabaseCredentials, DatabaseDeploySpec } from '#src/modules/runtime/runtime.types.js'

@Injectable()
export class CreateDatabaseUseCase {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: CreateDatabaseRepository,
    private readonly cipher: DatabaseCredentialsCipher,
    private readonly runtime: DatabaseRuntime,
    private readonly config: ConfigService,
  ) {}

  async execute(command: CreateDatabaseCommand): Promise<CreateDatabaseResponse> {
    const entry = catalogueEntry(command.engine, command.version)
    if (!entry) {
      throw new NotFoundException(
        `${command.engine} ${command.version} is not an available version.`,
      )
    }

    const credentials = generateCredentials(command.slug)
    const database = new DatabaseBuilder()
      .withEnvironmentUuid(command.environmentUuid)
      .withSlug(command.slug)
      .withEngine(command.engine)
      .withVersion(command.version)
      .withImage(entry.image)
      .withCredentialsEnc(this.cipher.seal(credentials))
      .withStorageGib(command.storageGib ?? DEFAULT_STORAGE_GIB)
      .withNodePin(command.nodePin ?? null)
      .build()

    await this.db.transaction(async (tx) => {
      const placement = await this.repository.lockEnvironment(tx, command.environmentUuid)
      if (!placement) {
        throw new NotFoundException(`Environment '${command.environmentUuid}' was not found.`)
      }

      const taken = await this.repository.isNameTaken(tx, command.environmentUuid, command.slug)
      if (taken) {
        throw new ConflictException(
          `An app or database named '${command.slug}' already exists in this environment.`,
        )
      }

      await this.repository.insert(tx, database)
      await this.provision({ ...placement, database }, entry, credentials)
    })

    return new CreateDatabaseResponse(database, entry.port)
  }

  private async provision(
    placement: DatabasePlacement,
    entry: EngineCatalogueEntry,
    credentials: DatabaseCredentials,
  ): Promise<void> {
    const spec = this.deploySpecOf(placement.database, entry, credentials)
    try {
      await this.runtime.provision(databaseRefOf(placement), spec)
    } catch (error) {
      // The row rolls back, so the database is never listed half-created and a retry is clean.
      throw new BadGatewayException(
        `Could not create '${placement.database.slug}' in the cluster. Please try again.`,
        { cause: error },
      )
    }
  }

  private deploySpecOf(
    database: DatabaseRow,
    entry: EngineCatalogueEntry,
    credentials: DatabaseCredentials,
  ): DatabaseDeploySpec {
    return {
      image: database.image,
      port: entry.port,
      dataMountPath: entry.dataMountPath,
      env: entry.env,
      credentialEnv: entry.credentialEnv,
      publishedVariables: entry.publishedVariables({
        host: database.slug,
        port: entry.port,
        ...credentials,
      }),
      storageGib: database.storageGib,
      storageClass: this.config.getOrThrow<string>('MARSA_DATABASE_STORAGE_CLASS'),
      readinessExec: entry.readinessExec,
      nodePin: database.nodePin
        ? {
            key: database.nodePin.key,
            values: database.nodePin.values,
            strategy: database.nodePin.strategy,
          }
        : null,
    }
  }
}
```

> `NodePin.strategy` is `PinStrategy`; `NodePinSpec.strategy` is `NodePinStrategy`. Map them the way `deploySpecOf` does in `app/release/entities/release-deploy-spec.ts` rather than casting.

`create-database.controller.ts` mirrors `CreateAppController`: `@ApiTags('databases')`, `@Controller({ path: 'databases', version: '1' })`, `@Post()`, `@Roles(UserRole.Operator, UserRole.Member)`, `@ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)`, `@ApiCreatedResponse({ type: CreateDatabaseResponse })`, plus `@ApiBadRequestResponse`, `@ApiNotFoundResponse` ("No environment with that uuid, or an unavailable version."), `@ApiConflictResponse`, `@ApiForbiddenResponse`, `@ApiUnauthorizedResponse`, and `@ApiResponse({ status: 502, description: 'Kubernetes provisioning failed; nothing was created.' })`.

`create-database.module.ts` declares `controllers: [CreateDatabaseController]` and `providers: [CreateDatabaseUseCase, CreateDatabaseRepository]`.

`apps/api/src/app/database/database.module.ts` imports `CreateDatabaseModule` (and, as later tasks land, the other use-case modules). Add `DatabaseModule as DatabaseFeatureModule` to `ApiModule`'s `AppModule.forRoot([...])` list — alias it, since `DatabaseModule` already names the infrastructure module in `#src/modules/database/database.module.js`.

- [ ] **Step 6: Write the e2e test**

`apps/api/src/app/database/use-cases/create-database/tests/create-database.e2e.test.ts` follows `create-app.e2e.test.ts`: `TestBench.setupEndToEndTest()`, `setup.authenticate()`, `setup.seedEnvironment()`, and cases for

1. `201` with a body whose `host` is the slug and `port` is 5432, and a `database` row whose `image` is `postgres:17.11`;
2. no plaintext password anywhere in the response body (`expect(JSON.stringify(response.body)).not.toContain('PGPASSWORD')`);
3. `409` when an app in the same environment already owns the name;
4. `201` for the same name in a _different_ environment (seed a second environment via `setup.seedEnvironment()`);
5. `502` plus **no** row when the runtime fails — arm it with
   `setup.testModule.get<DatabaseRuntime, MockDatabaseRuntime>(DatabaseRuntime).failNext('provision', new Error('cluster down'))`;
6. `401` unauthenticated.

- [ ] **Step 7: Run the tests and verify they pass**

Run: `cd apps/api && pnpm test 2>&1 | tail -20`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
npx prettier --write apps/api/src/app/database apps/api/src/modules/api
git add apps/api/src/app/database apps/api/src/modules/api/api.module.ts
git commit -m "feat(#206): create a PostgreSQL database in an environment

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `delete-database`

**Files:**

- Create: `apps/api/src/app/database/use-cases/delete-database/delete-database.{controller,repository,use-case,module}.ts`
- Modify: `apps/api/src/app/database/database.module.ts`
- Test: `apps/api/src/app/database/use-cases/delete-database/tests/delete-database.use-case.unit.test.ts`
- Test: `apps/api/src/app/database/use-cases/delete-database/tests/delete-database.e2e.test.ts`

**Interfaces:**

- Consumes: `selectDatabasePlacement`, `databaseRefOf` (Task 7); `DatabaseRuntime`.
- Produces: `DeleteDatabaseUseCase.execute(slug: string): Promise<void>`, `DeleteDatabaseRepository.findBySlug(tx, slug)` / `.delete(tx, uuid)`.

- [ ] **Step 1: Write the failing unit test**

`tests/delete-database.use-case.unit.test.ts` — same shape as `delete-app.use-case.unit.test.ts`:

```ts
import { before, describe, it } from 'node:test'
import { BadGatewayException, NotFoundException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance, match } from 'sinon'
import { DatabaseBuilder } from '#src/app/database/entities/database.builder.js'
import { DeleteDatabaseRepository } from '#src/app/database/use-cases/delete-database/delete-database.repository.js'
import { DeleteDatabaseUseCase } from '#src/app/database/use-cases/delete-database/delete-database.use-case.js'
import { EnvironmentBuilder } from '#src/app/environment/entities/environment.builder.js'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'
import { MockDatabaseRuntime } from '#src/modules/runtime/adapters/mock/mock-database-runtime.js'
import { stubDatabase } from '#src/test/setup/stub-database.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const project = new ProjectBuilder().build()
const environment = new EnvironmentBuilder().withProject(project).build()
const placement = {
  database: new DatabaseBuilder().withEnvironmentUuid(environment.uuid).withSlug('orders').build(),
  environment,
  project,
}

function build() {
  const repository = createStubInstance(DeleteDatabaseRepository)
  repository.findBySlug.resolves(placement)
  repository.delete.resolves()
  const runtime = createStubInstance(MockDatabaseRuntime)
  runtime.destroy.resolves()
  const usecase = new DeleteDatabaseUseCase(stubDatabase(), repository, runtime)
  return { repository, runtime, usecase }
}

describe('DeleteDatabaseUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('deletes the row, then destroys the runtime resources', async () => {
    const { repository, runtime, usecase } = build()

    await usecase.execute('orders')

    expect(repository.delete.calledOnceWithExactly(match.any, placement.database.uuid)).toBe(true)
    expect(repository.delete.getCall(0).calledBefore(runtime.destroy.getCall(0))).toBe(true)
    expect(runtime.destroy.firstCall.args[0]).toMatchObject({ database: { slug: 'orders' } })
  })

  it('throws 404 for an unknown slug and touches neither the runtime nor the rows', async () => {
    const { repository, runtime, usecase } = build()
    repository.findBySlug.resolves(undefined)

    await expect(usecase.execute('ghost')).rejects.toThrow(NotFoundException)

    expect(repository.delete.called).toBe(false)
    expect(runtime.destroy.called).toBe(false)
  })

  it('maps a runtime failure to 502 so the row rolls back and the retry is clean', async () => {
    const { runtime, usecase } = build()
    runtime.destroy.rejects(new Error('cluster down'))

    await expect(usecase.execute('orders')).rejects.toThrow(BadGatewayException)
  })
})
```

- [ ] **Step 2: Run it and verify it fails**

Run: `cd apps/api && pnpm build`
Expected: FAIL — the `delete-database` files do not exist.

- [ ] **Step 3: Write the repository and use-case**

`delete-database.repository.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { databaseTable } from '#src/app/database/entities/database.table.js'
import type { DatabaseUuid } from '#src/app/database/entities/database.uuid.js'
import {
  type DatabasePlacement,
  selectDatabasePlacement,
} from '#src/app/database/queries/database-placement.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

@Injectable()
export class DeleteDatabaseRepository {
  async findBySlug(tx: Executor, slug: string): Promise<DatabasePlacement | undefined> {
    const [placement] = await selectDatabasePlacement(tx)
      .where(eq(databaseTable.slug, slug))
      .limit(1)
      .for('update', { of: databaseTable })
    return placement
  }

  async delete(tx: Executor, uuid: DatabaseUuid): Promise<void> {
    await tx.delete(databaseTable).where(eq(databaseTable.uuid, uuid))
  }
}
```

`delete-database.use-case.ts` mirrors `DeleteAppUseCase` exactly: one `db.transaction`, `findBySlug` → 404, `delete`, then `runtime.destroy(databaseRefOf(placement))` wrapped so a failure becomes `BadGatewayException("Could not remove '<slug>' from the cluster. Please try again.")`.

`delete-database.controller.ts` mirrors `DeleteAppController` with `@Controller({ path: 'databases/:slug', version: '1' })`, `@HttpCode(204)` and the same decorator set, its `@ApiNoContentResponse` description naming the data loss: `'The database, its Kubernetes resources and its data were removed.'`

Wire `DeleteDatabaseModule` into `database.module.ts`.

- [ ] **Step 4: Write the e2e test**

`tests/delete-database.e2e.test.ts` mirrors `delete-app.e2e.test.ts`: seed a row directly with `DatabaseBuilder`, `DELETE /api/v1/databases/:slug` → 204 and no row; unknown slug → 404; unauthenticated → 401; `failNext('destroy', …)` → 502 with the row still present.

- [ ] **Step 5: Run the tests and verify they pass**

Run: `cd apps/api && pnpm test 2>&1 | tail -20`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npx prettier --write apps/api/src/app/database
git add apps/api/src/app/database
git commit -m "feat(#206): delete a database and its data

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: `view-database-index`

**Files:**

- Create: `apps/api/src/app/database/use-cases/view-database-index/{view-database-index.controller,view-database-index.repository,view-database-index.response,view-database-index.use-case,view-database-index.module}.ts`
- Create: `apps/api/src/app/database/use-cases/view-database-index/query/view-database-index.query.ts` + `.query.builder.ts`
- Modify: `apps/api/src/app/database/database.module.ts`
- Test: `apps/api/src/app/database/use-cases/view-database-index/tests/view-database-index.e2e.test.ts`

**Interfaces:**

- Consumes: `PaginatedKeysetQuery`, `PaginatedKeysetSearchQuery`, `PaginatedKeysetResponse`, `PaginatedKeysetResponseMeta`, `keysetLimit`; `selectDatabasePlacement`, `databaseRefOf`; `DatabaseRuntime.readStatus`.
- Produces: `DatabaseSummary`, `ViewDatabaseIndexResponse`, `ViewDatabaseIndexQueryKey`, `ViewDatabaseIndexQuery`.

- [ ] **Step 1: Write the query classes**

Copy `view-app-index/query/view-app-index.query.ts` and its builder verbatim, renaming `App` → `DatabaseRow`, `AppUuid` → `DatabaseUuid`, and the three classes to `ViewDatabaseIndexQueryKey` / `ViewDatabaseIndexPaginationQuery` / `ViewDatabaseIndexQuery`. The key stays `{ uuid }` — `uuidv7()` is time-ordered, which is what makes the primary key a valid cursor.

- [ ] **Step 2: Write the failing e2e test**

`tests/view-database-index.e2e.test.ts`:

```ts
import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { DatabaseBuilder } from '#src/app/database/entities/database.builder.js'
import { databaseTable } from '#src/app/database/entities/database.table.js'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('GET /api/v1/databases (e2e)', () => {
  let setup: TestSetup
  let environment: Environment
  let sessionCookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    sessionCookie = await setup.authenticate()
    environment = (await setup.seedEnvironment()).environment
  })

  after(async () => {
    await setup.teardown()
  })

  it('lists databases with their live status and never a password', async () => {
    await setup.db
      .insert(databaseTable)
      .values(
        new DatabaseBuilder().withEnvironmentUuid(environment.uuid).withSlug('orders').build(),
      )

    const response = await request(setup.httpServer)
      .get('/api/v1/databases')
      .set('Cookie', sessionCookie)
      .expect(200)

    expect(response.body.items).toHaveLength(1)
    expect(response.body.items[0]).toMatchObject({
      slug: 'orders',
      engine: 'postgres',
      version: '17',
      status: 'not_found',
    })
    expect(JSON.stringify(response.body)).not.toContain('PGPASSWORD')
    expect(JSON.stringify(response.body)).not.toContain('credentialsEnc')
  })

  it('rejects an unauthenticated request with 401', async () => {
    await request(setup.httpServer).get('/api/v1/databases').expect(401)
  })
})
```

> `not_found` is correct here: nothing was provisioned through the runtime, so the mock has no status for this slug.

- [ ] **Step 3: Run it and verify it fails**

Run: `cd apps/api && pnpm build`
Expected: FAIL — the `view-database-index` files do not exist.

- [ ] **Step 4: Write the response, repository, use-case, controller and module**

`view-database-index.response.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger'
import type { DatabasePlacement } from '#src/app/database/queries/database-placement.js'
import {
  DatabaseEngine,
  DatabaseEngineApiProperty,
} from '#src/app/database/enums/database-engine.enum.js'
import {
  DatabaseEnvironmentRef,
  DatabaseProjectRef,
  DatabaseStatusApiProperty,
} from '#src/app/database/responses/database-refs.response.js'
import { ViewDatabaseIndexQueryKey } from '#src/app/database/use-cases/view-database-index/query/view-database-index.query.js'
import type { DatabaseStatus } from '#src/modules/runtime/runtime.types.js'
import {
  PaginatedKeysetResponse,
  PaginatedKeysetResponseMeta,
} from '#src/utils/pagination/keyset/paginated-keyset.response.js'

export class DatabaseSummary {
  @ApiProperty({ type: String, example: 'orders' })
  readonly slug: string

  @DatabaseEngineApiProperty({ example: DatabaseEngine.Postgres })
  readonly engine: DatabaseEngine

  @ApiProperty({ type: String, example: '17' })
  readonly version: string

  @DatabaseStatusApiProperty()
  readonly status: DatabaseStatus

  @ApiProperty({ type: DatabaseProjectRef })
  readonly project: DatabaseProjectRef

  @ApiProperty({ type: DatabaseEnvironmentRef })
  readonly environment: DatabaseEnvironmentRef

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: string

  @ApiProperty({ type: String, format: 'date-time' })
  readonly updatedAt: string

  constructor({ database, project, environment }: DatabasePlacement, status: DatabaseStatus) {
    this.slug = database.slug
    this.engine = database.engine
    this.version = database.version
    this.status = status
    this.project = new DatabaseProjectRef(project)
    this.environment = new DatabaseEnvironmentRef(environment)
    this.createdAt = database.createdAt.toISOString()
    this.updatedAt = database.updatedAt.toISOString()
  }
}

export class ViewDatabaseIndexResponseMeta extends PaginatedKeysetResponseMeta {
  @ApiProperty({ type: ViewDatabaseIndexQueryKey, nullable: true })
  declare readonly next: ViewDatabaseIndexQueryKey | null

  constructor(placements: DatabasePlacement[]) {
    super(ViewDatabaseIndexQueryKey.nextKey(placements.map((placement) => placement.database)))
  }
}

export class ViewDatabaseIndexResponse extends PaginatedKeysetResponse<DatabaseSummary> {
  @ApiProperty({ type: [DatabaseSummary] })
  declare readonly items: DatabaseSummary[]

  @ApiProperty({ type: ViewDatabaseIndexResponseMeta })
  declare readonly meta: ViewDatabaseIndexResponseMeta

  constructor(summaries: DatabaseSummary[], placements: DatabasePlacement[]) {
    super(summaries, new ViewDatabaseIndexResponseMeta(placements))
  }
}
```

The repository mirrors `ViewAppIndexRepository` (`desc(databaseTable.uuid)`, `lt(databaseTable.uuid, after)`, `limit`). The use-case reads the page, then maps each placement through `this.runtime.readStatus(databaseRefOf(placement))`:

```ts
  async execute(query: ViewDatabaseIndexQuery): Promise<ViewDatabaseIndexResponse> {
    const placements = await this.repository.listDatabases(
      keysetLimit(query.pagination),
      query.pagination?.key?.uuid,
    )
    const statuses = await Promise.all(
      placements.map((placement) => this.runtime.readStatus(databaseRefOf(placement))),
    )
    const summaries = placements.map(
      (placement, index) => new DatabaseSummary(placement, statuses[index]!),
    )
    return new ViewDatabaseIndexResponse(summaries, placements)
  }
```

Controller mirrors `ViewAppIndexController` under `@ApiTags('databases')` / `path: 'databases'`.

- [ ] **Step 5: Run the tests and verify they pass**

Run: `cd apps/api && pnpm test 2>&1 | tail -20`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npx prettier --write apps/api/src/app/database
git add apps/api/src/app/database
git commit -m "feat(#206): list databases with live status

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: `view-database-detail`

**Files:**

- Create: `apps/api/src/app/database/use-cases/view-database-detail/{view-database-detail.controller,…repository,…response,…use-case,…module}.ts`
- Modify: `apps/api/src/app/database/database.module.ts`
- Test: `apps/api/src/app/database/use-cases/view-database-detail/tests/view-database-detail.e2e.test.ts`

**Interfaces:**

- Produces: `ViewDatabaseDetailResponse` with `slug`, `engine`, `version`, `image`, `storageGib`, `status`, `nodePin`, `connection: DatabaseConnectionInfo { host, port, user, database }`, `createdAt`, `updatedAt`. **No password** (#233).

- [ ] **Step 1: Write the failing e2e test**

`tests/view-database-detail.e2e.test.ts` seeds a row (`DatabaseBuilder` with `withCredentialsEnc(cipher.seal(...))` is unnecessary — the detail view reads only the user and database name, so seed the sealed token produced by a real `DatabaseCredentialsCipher` from the booted module, or assert on a row whose credentials the use-case opens) and asserts:

```ts
it('returns connection details without the password', async () => {
  const response = await request(setup.httpServer)
    .get('/api/v1/databases/orders')
    .set('Cookie', sessionCookie)
    .expect(200)

  expect(response.body).toMatchObject({
    slug: 'orders',
    engine: 'postgres',
    version: '17',
    image: 'postgres:17.11',
    storageGib: 10,
    status: 'not_found',
    connection: { host: 'orders', port: 5432, user: 'postgres', database: 'orders' },
  })
  expect(JSON.stringify(response.body)).not.toContain('password')
})

it('returns 404 for a slug that does not exist', async () => {
  await request(setup.httpServer)
    .get('/api/v1/databases/no-such-db')
    .set('Cookie', sessionCookie)
    .expect(404)
})
```

Seed the row with a real sealed token:

```ts
const cipher = setup.testModule.get(DatabaseCredentialsCipher)
const database = new DatabaseBuilder()
  .withEnvironmentUuid(environment.uuid)
  .withSlug('orders')
  .withCredentialsEnc(cipher.seal({ user: 'postgres', password: 'secret', database: 'orders' }))
  .build()
await setup.db.insert(databaseTable).values(database)
```

- [ ] **Step 2: Run it and verify it fails**

Run: `cd apps/api && pnpm build`
Expected: FAIL — the `view-database-detail` files do not exist.

- [ ] **Step 3: Write the slice**

The repository selects one placement by slug (no lock — it is a read). The use-case opens the sealed credentials via `DatabaseCredentialsCipher.openForDatabase`, reads the catalogue entry for the port, calls `readStatus`, and constructs the response, which copies **only** `user` and `database` out of the credentials. The controller mirrors `ViewAppDetailController` (`path: 'databases/:slug'`, `@ApiOkResponse({ type: ViewDatabaseDetailResponse })`, `@ApiNotFoundResponse({ description: 'No database with that slug.' })`).

`DatabaseConnectionInfo` is its own decorated class in `view-database-detail.response.ts`:

```ts
export class DatabaseConnectionInfo {
  @ApiProperty({ type: String, example: 'orders', description: 'In-cluster hostname.' })
  readonly host: string

  @ApiProperty({ type: 'integer', example: 5432 })
  readonly port: number

  @ApiProperty({ type: String, example: 'postgres' })
  readonly user: string

  @ApiProperty({ type: String, example: 'orders' })
  readonly database: string

  constructor(host: string, port: number, credentials: DatabaseCredentials) {
    this.host = host
    this.port = port
    this.user = credentials.user
    this.database = credentials.database
  }
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd apps/api && pnpm test 2>&1 | tail -20`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/api/src/app/database
git add apps/api/src/app/database
git commit -m "feat(#206): show a database's connection details

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Regenerate the contract

**Files:**

- Generated: `apps/api/openapi.json`, `apps/web/app/api/{types.gen.ts,zod.gen.ts,index.ts}`

- [ ] **Step 1: Regenerate both sides**

```bash
cd apps/api && pnpm generate:openapi
cd ../.. && pnpm --filter web generate:api
```

- [ ] **Step 2: Verify the contract carries the new surface**

Run:

```bash
node -e "const d=require('./apps/api/openapi.json');console.log(Object.keys(d.paths).filter(p=>p.includes('databases')));console.log(Object.keys(d.components.schemas).filter(s=>s.includes('Database')))"
```

Expected: the paths `/api/v1/databases` and `/api/v1/databases/{slug}`, and schemas including `CreateDatabaseCommand`, `CreateDatabaseResponse`, `DatabaseSummary`, `ViewDatabaseIndexResponse`, `ViewDatabaseDetailResponse`, `DatabaseEngine`, `DatabaseStatus`. If `DatabaseEngine` / `DatabaseStatus` appear inline instead of as named schemas, the `enumName` is missing from a decorator — fix it and regenerate.

- [ ] **Step 3: Commit**

```bash
npx prettier --write apps/api/openapi.json apps/web/app/api
git add apps/api/openapi.json apps/web/app/api
git commit -m "chore(#206): regenerate the OpenAPI contract and web client

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Web composables

**Files:**

- Create: `apps/web/app/composables/useDatabaseList.ts`, `useCreateDatabase.ts`, `useDeleteDatabase.ts`, `useDatabaseDetail.ts`
- Test: `apps/web/app/composables/__tests__/useDatabaseList.nuxt.spec.ts`

**Interfaces:**

- Consumes: `useKeysetList`, `$api`, generated `~/api/types.gen` + `~/api/zod.gen`.
- Produces: `useDatabaseList()` (keyset list of `DatabaseSummary`), `useCreateDatabase().create(command)`, `useDeleteDatabase().remove(slug)`, `useDatabaseDetail(slug)`.

- [ ] **Step 1: Write the composables**

```ts
// app/composables/useDatabaseList.ts
import type { DatabaseSummary, ViewDatabaseIndexQueryKey } from '~/api/types.gen'
import { zViewDatabaseIndexResponse } from '~/api/zod.gen'

export function useDatabaseList() {
  return useKeysetList<DatabaseSummary, ViewDatabaseIndexQueryKey>('/v1/databases', (raw) =>
    zViewDatabaseIndexResponse.parse(raw),
  )
}
```

```ts
// app/composables/useCreateDatabase.ts
import type { CreateDatabaseCommand, CreateDatabaseResponse } from '~/api/types.gen'
import { zCreateDatabaseResponse } from '~/api/zod.gen'

export function useCreateDatabase() {
  const { $api } = useNuxtApp()

  async function create(command: CreateDatabaseCommand): Promise<CreateDatabaseResponse> {
    return zCreateDatabaseResponse.parse(
      await $api('/v1/databases', { method: 'POST', body: command }),
    )
  }

  return { create }
}
```

```ts
// app/composables/useDeleteDatabase.ts
export function useDeleteDatabase() {
  const { $api } = useNuxtApp()

  async function remove(slug: string): Promise<void> {
    await $api(`/v1/databases/${encodeURIComponent(slug)}`, { method: 'DELETE' })
  }

  return { remove }
}
```

```ts
// app/composables/useDatabaseDetail.ts
import type { ViewDatabaseDetailResponse } from '~/api/types.gen'
import { zViewDatabaseDetailResponse } from '~/api/zod.gen'

export function useDatabaseDetail(slug: string) {
  const { $api } = useNuxtApp()
  return useAsyncData<ViewDatabaseDetailResponse>(
    `database-detail-${slug}`,
    () => $api(`/v1/databases/${encodeURIComponent(slug)}`),
    { transform: (raw): ViewDatabaseDetailResponse => zViewDatabaseDetailResponse.parse(raw) },
  )
}
```

- [ ] **Step 2: Write the test**

`apps/web/app/composables/__tests__/useDatabaseList.nuxt.spec.ts` mirrors the existing `useAppList` spec (read it first). It mocks `$api` via `mockNuxtImport('useNuxtApp', …)`, calls `reset()`, and asserts the accumulated `items` and that the request path is `/v1/databases`.

- [ ] **Step 3: Run the tests**

Run: `pnpm --filter web test 2>&1 | tail -20`
Expected: PASS, coverage floors still met.

- [ ] **Step 4: Commit**

```bash
npx prettier --write apps/web/app/composables
git add apps/web/app/composables
git commit -m "feat(#206): add database API composables

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: `/databases` index page and navigation

**Files:**

- Create: `apps/web/app/pages/databases/index.vue`
- Modify: `apps/web/app/layouts/default.vue`
- Test: `apps/web/app/pages/databases/__tests__/index.nuxt.spec.ts`

**Interfaces:**

- Consumes: `useDatabaseList()` (auto-import, left un-imported so `mockNuxtImport` works), `<InfiniteScrollFooter>`.

- [ ] **Step 1: Write the page**

Copy `app/pages/apps/index.vue` and adapt: title `Databases — Marsa`, empty state "Add your first database" with a `to="/databases/new"` button labelled "Add database", and rows rendering `db.slug`, `db.project.slug / db.environment.slug`, `db.engine db.version`, a status `UBadge` (`ready` → `success`, `provisioning` → `neutral`, `failed` → `error`, `not_found` → `warning`), and `formatTime(db.createdAt)`. Keep `UDashboardPanel`'s `#header` / `#body` slots — the default slot has no scroll wrapper.

- [ ] **Step 2: Add the sidebar entry**

In `apps/web/app/layouts/default.vue`, add after the Apps item:

```ts
  { label: 'Databases', icon: 'i-lucide-database', to: '/databases' },
```

- [ ] **Step 3: Write the page test**

`apps/web/app/pages/databases/__tests__/index.nuxt.spec.ts` mirrors `app/pages/apps/__tests__/index.nuxt.spec.ts`: `mockNuxtImport('useDatabaseList', …)` returning a fixed list, `mountSuspended(DatabasesIndex)`, then assert a row renders the slug and the status badge.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter web test 2>&1 | tail -20`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/web/app/pages/databases apps/web/app/layouts/default.vue
git add apps/web/app/pages/databases apps/web/app/layouts/default.vue
git commit -m "feat(#206): list databases in the web UI

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: `/databases/new`

**Files:**

- Create: `apps/web/app/pages/databases/new.vue`
- Test: `apps/web/app/pages/databases/__tests__/new.nuxt.spec.ts`

**Interfaces:**

- Consumes: `useCreateDatabase()`, `<ProjectEnvironmentPicker v-model="state.environmentUuid">`, `<NodePinPicker v-model="state.nodePin">`, `extractApiError`.

- [ ] **Step 1: Write the page**

Model it on `app/pages/apps/new.vue`. The Zod schema:

```ts
const schema = z.object({
  environmentUuid: z.string({ error: 'Pick an environment' }).min(1, 'Pick an environment'),
  slug: z
    .string()
    .min(1, 'Required')
    .max(63, 'Max 63 characters')
    .regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/, 'Lowercase letters, numbers and hyphens only'),
  version: z.enum(['16', '17', '18']),
  storageGib: z.number().int().min(1).max(1024),
})
```

State seeds `version: '18'` and `storageGib: 10`. Engine is a single fixed option (`PostgreSQL`) rendered as a disabled select, so a second engine later is a data change, not a layout change. Submit calls `create({ environmentUuid, slug, engine: 'postgres', version, storageGib, ...(nodePin ? { nodePin } : {}) })`, then `navigateTo('/databases/' + created.slug)`, surfacing a failure through `extractApiError` into the page-level alert.

Include two pieces of honest copy as help text:

- under storage: _"Recorded, but the default `local-path` storage ignores it and cannot resize later."_
- under the node pin: _"The data lives on the node it first lands on. This cannot be changed later."_

- [ ] **Step 2: Write the page test**

`__tests__/new.nuxt.spec.ts`: `mockNuxtImport('useCreateDatabase', …)` returning a `create` spy, mount, fill the slug, submit, and assert `create` was called with `engine: 'postgres'` and the defaulted `version` / `storageGib`.

- [ ] **Step 3: Run the tests**

Run: `pnpm --filter web test 2>&1 | tail -20`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
npx prettier --write apps/web/app/pages/databases
git add apps/web/app/pages/databases
git commit -m "feat(#206): add the database create flow

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: `/databases/[slug]` detail and typed-confirmation delete

**Files:**

- Create: `apps/web/app/pages/databases/[slug].vue`
- Test: `apps/web/app/pages/databases/__tests__/[slug].nuxt.spec.ts`

**Interfaces:**

- Consumes: `useDatabaseDetail(slug)`, `useDeleteDatabase()`.

- [ ] **Step 1: Write the page**

Sections: a header with the slug, engine + version and a status badge; a **Connection** card listing `host`, `port`, `user`, `database` as copyable read-only fields with the note _"Apps in this environment connect using these details. Attaching a database to an app is coming in a later release."_; a read-only node-pin line when one is set; and a **Danger zone** card whose delete button opens a `UModal` requiring the operator to type the database name:

```ts
const confirmation = ref('')
const canDelete = computed(() => confirmation.value === slug)
```

The modal copy must state the consequence: _"This deletes the database and its data. It cannot be undone."_ On confirm, call `remove(slug)` then `navigateTo('/databases')`, toasting `extractApiError(err)` on failure.

- [ ] **Step 2: Write the page test**

`__tests__/[slug].nuxt.spec.ts`: mock `useDatabaseDetail` with a fixed payload; assert the connection fields render and **no** password field appears; assert the delete button stays disabled until the typed name matches, then calls `remove`.

- [ ] **Step 3: Run the tests**

Run: `pnpm --filter web test 2>&1 | tail -20`
Expected: PASS, coverage floors met.

- [ ] **Step 4: Commit**

```bash
npx prettier --write apps/web/app/pages/databases
git add apps/web/app/pages/databases
git commit -m "feat(#206): add the database detail view with a typed-confirmation delete

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: k3d e2e stage and docs

**Files:**

- Modify: `scripts/e2e-test.sh`
- Modify: `docs/local-dev.md`
- Modify: `apps/api/.env.test` (already done in Task 3 — verify)

**Interfaces:**

- Consumes: the running Marsa install, the seeded session cookie and the `http` helper already defined in `scripts/e2e-test.sh`.

- [ ] **Step 1: Read the existing stages**

Run: `grep -n 'stage:' scripts/e2e-test.sh`
Expected: the stage list ending with `environment delete is blocked while it has an app` and `teardown`. The new stages go **before** teardown and reuse `PROJECT_SLUG` / `ENV_SLUG` / `APPS_NS` and the `$cookie` variable.

- [ ] **Step 2: Add the database stages**

Insert before `== stage: teardown ==`:

```bash
echo "== stage: create a database via API =="
DB_SLUG="e2e-db"
http -X POST "https://${BASE_DOMAIN}${PORT_SUFFIX}/api/v1/databases" \
  -H 'Content-Type: application/json' -H "Cookie: $cookie" \
  -d "{\"environmentUuid\":\"${env_uuid}\",\"slug\":\"${DB_SLUG}\",\"engine\":\"postgres\",\"version\":\"17\",\"storageGib\":1}"
[ "$HTTP_STATUS" = 201 ] || fail database "create returned $HTTP_STATUS: $HTTP_BODY"

echo "== stage: StatefulSet, Service, Secret and PVC exist =="
kubectl -n "$APPS_NS" rollout status "statefulset/${DB_SLUG}" --timeout=180s \
  || fail database "statefulset did not become ready"
kubectl -n "$APPS_NS" get "service/${DB_SLUG}" >/dev/null || fail database "service missing"
kubectl -n "$APPS_NS" get "secret/${DB_SLUG}-credentials" >/dev/null || fail database "secret missing"
kubectl -n "$APPS_NS" get "pvc/data-${DB_SLUG}-0" >/dev/null || fail database "pvc missing"

echo "== stage: no IngressRoute or HTTPScaledObject for a database =="
kubectl -n "$APPS_NS" get ingressroute "$DB_SLUG" >/dev/null 2>&1 \
  && fail database "a database must not get an IngressRoute"
kubectl -n "$APPS_NS" get httpscaledobject "$DB_SLUG" >/dev/null 2>&1 \
  && fail database "a database must not get an HTTPScaledObject"

echo "== stage: data survives a pod restart =="
kubectl -n "$APPS_NS" exec "${DB_SLUG}-0" -- \
  psql -U postgres -d e2e_db -c 'create table survivors(id int); insert into survivors values (1);' \
  >/dev/null || fail database "seed insert failed"
kubectl -n "$APPS_NS" delete pod "${DB_SLUG}-0" >/dev/null
kubectl -n "$APPS_NS" rollout status "statefulset/${DB_SLUG}" --timeout=180s \
  || fail database "statefulset did not recover"
rows="$(kubectl -n "$APPS_NS" exec "${DB_SLUG}-0" -- \
  psql -U postgres -d e2e_db -tAc 'select count(*) from survivors')"
[ "$rows" = 1 ] || fail database "expected the row to survive the restart, got '$rows'"

echo "== stage: deleting the database removes its resources =="
http -X DELETE "https://${BASE_DOMAIN}${PORT_SUFFIX}/api/v1/databases/${DB_SLUG}" -H "Cookie: $cookie"
[ "$HTTP_STATUS" = 204 ] || fail database "delete returned $HTTP_STATUS: $HTTP_BODY"
for _ in $(seq 1 30); do
  kubectl -n "$APPS_NS" get "pvc/data-${DB_SLUG}-0" >/dev/null 2>&1 || break
  sleep 2
done
kubectl -n "$APPS_NS" get "pvc/data-${DB_SLUG}-0" >/dev/null 2>&1 \
  && fail database "pvc outlived the database"
```

> `env_uuid` must be the variable the earlier "create project + environment" stage captured — read that stage and reuse its name rather than re-deriving it. The `psql` database name is the slug with hyphens replaced (`e2e_db`).

- [ ] **Step 3: Verify the script parses**

Run: `bash -n scripts/e2e-test.sh`
Expected: no output (exit 0).

- [ ] **Step 4: Run the full cluster e2e**

Run:

```bash
MARSA_E2E_HTTP_PORT=8080 pnpm e2e:up   # or against an already-installed cluster
pnpm e2e:test
```

Expected: every stage prints and the script exits 0. If the api image predates this branch, the database stages 404 — publish a `preview` image for the branch first (root `CLAUDE.md` § "Clicking through a branch on a real cluster").

- [ ] **Step 5: Document the local database path**

In `docs/local-dev.md`, add a short subsection under the k3d tier:

````markdown
### Reaching a database

A database is in-cluster only (#233 adds external access). To open a psql shell on a k3d
install:

```bash
kubectl -n <project>-<env> exec -it <slug>-0 -- psql -U postgres -d <slug_with_underscores>
```
````

The requested size is recorded but not enforced — `local-path` ignores capacity and cannot
resize, and the data lives on whichever node the pod first landed on (#209).

````

Also note the new `MARSA_DATABASE_STORAGE_CLASS` variable (default `local-path`) wherever the file lists api env vars.

- [ ] **Step 6: Commit**

```bash
npx prettier --write docs/local-dev.md
git add scripts/e2e-test.sh docs/local-dev.md
git commit -m "test(#206): cover database provisioning, persistence and teardown on k3d

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
````

---

### Task 17: Open the PR

**Files:** none (repository state only).

- [ ] **Step 1: Run the full local gate**

Run:

```bash
pnpm format:check && pnpm lint && pnpm --filter api typecheck && pnpm --filter web typecheck \
  && pnpm --filter api test && pnpm --filter web test && pnpm build:web
```

Expected: every command exits 0. Fix anything red before pushing — do not push a red branch.

- [ ] **Step 2: Confirm the generated artifacts are committed and current**

Run: `git status --short` after re-running `pnpm --filter api generate:openapi && pnpm --filter web generate:api`
Expected: clean tree. A dirty `openapi.json` or `app/api/*` means the contract drifted; commit the regenerated files.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feature/206-database-resource
gh pr create --repo marsa-cloud/marsa \
  --title 'feat(#206): PostgreSQL as a first-class resource' \
  --body-file <(cat <<'BODY'
## Summary
- **PostgreSQL is now a Marsa resource** — an operator adds a database to an environment and it
  runs as a StatefulSet with its own PVC and a TCP Service, reachable in-cluster at `<slug>`.
- **Absorbs #205** — the persistent-workload shape ships as an adapter-internal renderer driven by
  a new `DatabaseRuntime` port, so no `App.volumes[]` column and no branch in the app deploy path.
- **No releases, no persisted status** — status is read live from the cluster, which keeps the
  reconcile-on-read machinery apps need (#198/#213) out of this path.
- **Names are reserved per environment across apps and databases**, because both land in one
  namespace; `create-app` gained the mirror check.
- **Credentials never leave the cluster** — generated by Marsa, sealed on the row, rendered into a
  Secret whose six published variables are fully composed for #207's `secretKeyRef` injection.

## Testing
1. `pnpm --filter api test && pnpm --filter web test`
2. `pnpm e2e:up --image-tag sha-<short> && pnpm e2e:test` — the database stages provision Postgres,
   insert a row, delete the pod, prove the row survived, then delete the database and prove the PVC
   is gone.

Refs #206, #205

## Glossary
| Term | Definition |
|------|------------|
| StatefulSet | Kubernetes workload that gives each replica a stable name and its own volume, and never runs two pods on the same volume during an update |
| `volumeClaimTemplates` | The StatefulSet field that creates a PVC per replica |
| `persistentVolumeClaimRetentionPolicy` | Controls whether those PVCs are deleted with the StatefulSet (GA in Kubernetes 1.32) |
| `local-path` | K3s's bundled storage class — a directory on one node; ignores the requested size and cannot resize |
| `PGDATA` | Where the Postgres server keeps its data directory; version-specific from Postgres 18 |
| Published variables | The connection variables a database exposes (`DATABASE_URL`, `PG*`), stored in its Secret |

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)
```

- [ ] **Step 4: Hand back for review**

Report the PR URL and stop. **Do not merge**: the merge needs an explicit per-PR approval, and a Rex review must run first.

---

## Self-Review

**Spec coverage** — every spec section maps to a task: renderer → 1; port + mock → 2; Kubernetes adapter, teardown order, storage-class config → 3; table, catalogue, migration, per-major data path → 4; credentials + cipher → 5; cross-kind naming → 6; create/delete/index/detail flows → 7–10; contract → 11; UI → 12–15; k3d e2e + docs → 16.

**Deliberate gaps** (all deferred in the spec, none silently dropped): attachments (#207), backups (#208), rotation and minor bump (#234), external access and reveal (#233), major upgrades (#209).

**Type consistency** — the Drizzle row type is `DatabaseRow` everywhere (never `Database`, which is the Drizzle client). `credentialEnv` keeps the same name in `EngineCatalogueEntry`, `DatabaseDeploySpec` and the adapter. `renderPersistentWorkload` takes `secretEnv` (resolved `{name, secret, key}`), which is the adapter's job to build from `credentialEnv`. `DatabaseStatus` is declared once, in `runtime.types.ts`.

**Known small risks the implementer should check rather than assume:** whether `Project` / `Environment` rows expose `name` (Task 7's refs), the exact variable the e2e script uses for the environment uuid (Task 16), and whether `CreateAppCommandBuilder` exists (Task 6).
