# Runtime Port Implementation Plan (#226)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Kubernetes-shaped `DeployBackend` / `NamespaceBackend` / `NodeBackend` seams with Marsa-owned runtime ports (`AppRuntime`, `EnvironmentRuntime`, `NodeRuntime`) implemented by a Kubernetes adapter and a Mock adapter, with rendering behind the port.

**Architecture:** Ports and adapters. `src/modules/runtime/` holds abstract classes and Marsa-vocabulary types; `adapters/kubernetes/` owns everything that imports `@kubernetes/client-node` (rendering included); `adapters/mock/` is the network-free adapter. A plain `RuntimeModule` in `AppModule` loads exactly one `@Global()` adapter module via `ConditionalModule.registerWhen` on `MARSA_RUNTIME`. Features pass `AppRef` / `EnvironmentRef` / `AppDeploySpec`; `ApplyReleaseService` is deleted. The new tree is built **alongside** the old `src/modules/kubernetes/` (copy, not move), consumers migrate feature by feature, and the old tree is deleted last — every task ends green.

**Tech Stack:** NestJS 11, `@nestjs/config` 4.0.4 (`ConditionalModule`), `@kubernetes/client-node`, Drizzle, Node test runner + `expect` + `sinon`, Nuxt 4 web, `@hey-api/openapi-ts`.

Spec: `docs/superpowers/specs/2026-09-22-runtime-port-and-transactions-design.md` (PR 1 section).

## Global Constraints

- Work in the worktree `.claude/worktrees/refactor+226-runtime-port` on branch `refactor/226-runtime-port`. Never `cd` to the main checkout.
- `src/modules/runtime/**` must not import from `src/app/**`.
- Only `src/modules/runtime/adapters/kubernetes/**` may import `@kubernetes/client-node`.
- `src/app/**` must never import `src/modules/runtime/adapters/**`.
- A feature may import another feature's `entities/`, `queries/`, `enums/`, `errors/`, `events/` — never its `services/`, use-cases, repositories, commands, responses.
- Env var: `MARSA_RUNTIME=kubernetes|mock`, default `kubernetes` (replaces `DEPLOY_BACKEND=direct|mock`).
- Imports are absolute (`#src/...`), sorted by `simple-import-sort`; no relative imports.
- Comments: minimum, single-line, the _why_ only, no JSDoc on new code (`.claude/rules/comments.md`). Existing comments carried by a copied file stay.
- Use-cases put every `await` on its own line (`.claude/rules/api/use-case.md`).
- Unimplemented params in mock overrides are omitted, not `_`-prefixed (the api lint config flags unused args).
- Format only the files you touched: `pnpm exec prettier --write <files>` from the repo root. **Never** run repo-wide `pnpm format` (a watcher rewrites `openapi.json` / web files).
- Commits: `type: subject`, bullet body, `Refs #226`, and the trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. Stage files by name — never `git add -A` / `git add .`.

### How to run things (all from the worktree root unless noted)

```bash
pnpm --filter api build        # compile to apps/api/dist (tests import #src → dist)
pnpm --filter api typecheck
pnpm --filter api lint
pnpm --filter api test         # full suite: clean → build → migrate → run, with coverage floors

# One test file (no coverage floors): build first, then from apps/api
cd apps/api || exit 1
node --env-file=.env.test --enable-source-maps --test src/path/to/x.unit.test.ts
```

---

### Task 0: Worktree bootstrap

**Files:** none

- [ ] **Step 1: Install and start Postgres**

```bash
pnpm install --frozen-lockfile
docker compose up -d
```

- [ ] **Step 2: Baseline**

Run: `pnpm --filter api test`
Expected: all tests pass, coverage floors met. If anything is red on a clean `main`, stop and report — do not start the refactor on a red baseline.

---

### Task 1: Runtime port + Mock adapter

**Files:**

- Create: `apps/api/src/modules/runtime/runtime.types.ts`
- Create: `apps/api/src/modules/runtime/runtime.errors.ts`
- Create: `apps/api/src/modules/runtime/app-runtime.ts`
- Create: `apps/api/src/modules/runtime/environment-runtime.ts`
- Create: `apps/api/src/modules/runtime/node-runtime.ts`
- Create: `apps/api/src/modules/runtime/adapters/mock/mock-app-runtime.ts`
- Create: `apps/api/src/modules/runtime/adapters/mock/mock-environment-runtime.ts`
- Create: `apps/api/src/modules/runtime/adapters/mock/mock-node-runtime.ts`
- Create: `apps/api/src/modules/runtime/adapters/mock/mock-runtime.module.ts`
- Test: `apps/api/src/modules/runtime/adapters/mock/tests/mock-app-runtime.unit.test.ts`
- Test: `apps/api/src/modules/runtime/adapters/mock/tests/mock-environment-runtime.unit.test.ts`

**Interfaces:**

- Produces: every type and abstract class below, exactly as named. Later tasks import them from `#src/modules/runtime/runtime.types.js`, `#src/modules/runtime/runtime.errors.js`, `#src/modules/runtime/app-runtime.js`, `#src/modules/runtime/environment-runtime.js`, `#src/modules/runtime/node-runtime.js`.
- Produces: `MockAppRuntime.setLiveRelease(slug: string, releaseUuid: Uuid<'Release'>): void`, `MockEnvironmentRuntime.failNextProvision(error: Error): void`, `MockRuntimeModule` (`@Global()`).

- [ ] **Step 1: Write the port types**

`apps/api/src/modules/runtime/runtime.types.ts`:

```ts
import type { Uuid } from '#src/utils/uuid.js'

export interface EnvironmentRef {
  uuid: Uuid<'Environment'>
  projectSlug: string
  environmentSlug: string
}

export interface AppRef {
  environment: EnvironmentRef
  slug: string
}

export type PinStrategySpec = 'required' | 'preferred'

export interface NodePinSpec {
  key: string
  values: string[]
  strategy: PinStrategySpec
}

// Decrypted, held in memory only for the length of a deploy (AgDR-0036).
export interface RegistryCredentials {
  registry: string
  username: string
  password: string
}

export interface AppDeploySpec {
  releaseUuid: Uuid<'Release'>
  image: string
  port: number
  env: Record<string, string>
  minReplicas: number
  maxReplicas: number
  host: string
  nodePin: NodePinSpec | null
  credentials?: RegistryCredentials
}

// NotFound is absence of observation, not a state — never persist a terminal outcome from it.
export enum RolloutStatus {
  Complete = 'complete',
  Failed = 'failed',
  Progressing = 'progressing',
  NotFound = 'not_found',
}

export interface AppHealth {
  found: boolean
  desiredReplicas: number
  availableReplicas: number
  updatedReplicas: number
}

export interface DeployFailure {
  reason: string
  message: string
}

export interface RunLogs {
  podName: string
  logs: string
}

export interface RunLogsOptions {
  tailLines: number
}

export interface ClusterNode {
  name: string
  labels: Record<string, string>
  ready: boolean
}
```

- [ ] **Step 2: Write the errors and the three ports**

`apps/api/src/modules/runtime/runtime.errors.ts`:

```ts
export class EnvironmentConflictError extends Error {}

// The runtime stamps the live release itself, so a malformed marker is a Marsa bug.
export class InvalidReleaseAnnotationError extends Error {}
```

`apps/api/src/modules/runtime/app-runtime.ts`:

```ts
import type {
  AppDeploySpec,
  AppHealth,
  AppRef,
  DeployFailure,
  RolloutStatus,
  RunLogs,
  RunLogsOptions,
} from '#src/modules/runtime/runtime.types.js'
import type { Uuid } from '#src/utils/uuid.js'

export abstract class AppRuntime {
  // Provisions the app's environment too, so a hand-deleted one is healed on the next deploy.
  abstract deploy(app: AppRef, spec: AppDeploySpec): Promise<void>

  // Idempotent: a retry after a partial teardown still completes.
  abstract destroy(app: AppRef): Promise<void>

  abstract readRolloutStatus(app: AppRef): Promise<RolloutStatus>

  // Null when nothing is deployed; InvalidReleaseAnnotationError when the marker is malformed.
  abstract readLiveReleaseUuid(app: AppRef): Promise<Uuid<'Release'> | null>

  abstract readHealth(app: AppRef): Promise<AppHealth>

  abstract readDeployFailure(app: AppRef): Promise<DeployFailure | null>

  abstract readRunLogs(app: AppRef, options: RunLogsOptions): Promise<RunLogs | null>
}
```

`apps/api/src/modules/runtime/environment-runtime.ts`:

```ts
import type { EnvironmentRef } from '#src/modules/runtime/runtime.types.js'

export abstract class EnvironmentRuntime {
  // Idempotent for the same environment uuid; EnvironmentConflictError otherwise.
  abstract provision(environment: EnvironmentRef): Promise<void>

  // Only removes what this environment owns; a missing or foreign one is left alone.
  abstract destroy(environment: EnvironmentRef): Promise<void>
}
```

`apps/api/src/modules/runtime/node-runtime.ts`:

```ts
import type { ClusterNode } from '#src/modules/runtime/runtime.types.js'

export abstract class NodeRuntime {
  // The runtime is the only source of truth for membership; nothing is stored.
  abstract listNodes(): Promise<ClusterNode[]>
}
```

- [ ] **Step 3: Write the failing Mock adapter tests**

`apps/api/src/modules/runtime/adapters/mock/tests/mock-app-runtime.unit.test.ts`:

```ts
import { describe, it } from 'node:test'
import { expect } from 'expect'
import { MockAppRuntime } from '#src/modules/runtime/adapters/mock/mock-app-runtime.js'
import type { AppDeploySpec, AppRef } from '#src/modules/runtime/runtime.types.js'
import { generateUuid, type Uuid } from '#src/utils/uuid.js'

const APP: AppRef = {
  environment: {
    uuid: generateUuid<Uuid<'Environment'>>(),
    projectSlug: 'demo',
    environmentSlug: 'dev',
  },
  slug: 'my-app',
}

const spec = (releaseUuid: Uuid<'Release'>): AppDeploySpec => ({
  releaseUuid,
  image: 'nginx:1.27',
  port: 80,
  env: {},
  minReplicas: 1,
  maxReplicas: 1,
  host: 'my-app.demo.marsa.cc',
  nodePin: null,
})

describe('MockAppRuntime.readLiveReleaseUuid', () => {
  it('reports the release it last deployed, like a real runtime would', async () => {
    const runtime = new MockAppRuntime()
    const first = generateUuid<Uuid<'Release'>>()
    const second = generateUuid<Uuid<'Release'>>()
    expect(await runtime.readLiveReleaseUuid(APP)).toBeNull()

    await runtime.deploy(APP, spec(first))
    await runtime.deploy(APP, spec(second))

    expect(await runtime.readLiveReleaseUuid(APP)).toBe(second)
  })

  it('forgets an app once it is destroyed', async () => {
    const runtime = new MockAppRuntime()
    await runtime.deploy(APP, spec(generateUuid<Uuid<'Release'>>()))

    await runtime.destroy(APP)

    expect(await runtime.readLiveReleaseUuid(APP)).toBeNull()
  })

  it('lets a test declare what is running without deploying anything', async () => {
    const runtime = new MockAppRuntime()
    const live = generateUuid<Uuid<'Release'>>()

    runtime.setLiveRelease('my-app', live)

    expect(await runtime.readLiveReleaseUuid(APP)).toBe(live)
  })
})
```

`apps/api/src/modules/runtime/adapters/mock/tests/mock-environment-runtime.unit.test.ts`:

```ts
import { describe, it } from 'node:test'
import { expect } from 'expect'
import { MockEnvironmentRuntime } from '#src/modules/runtime/adapters/mock/mock-environment-runtime.js'
import type { EnvironmentRef } from '#src/modules/runtime/runtime.types.js'
import { generateUuid, type Uuid } from '#src/utils/uuid.js'

const ENVIRONMENT: EnvironmentRef = {
  uuid: generateUuid<Uuid<'Environment'>>(),
  projectSlug: 'demo',
  environmentSlug: 'dev',
}

describe('MockEnvironmentRuntime.provision', () => {
  it('fails exactly once when armed, so one test cannot leak into the next suite', async () => {
    const runtime = new MockEnvironmentRuntime()
    runtime.failNextProvision(new Error('cluster down'))

    await expect(runtime.provision(ENVIRONMENT)).rejects.toThrow('cluster down')
    await expect(runtime.provision(ENVIRONMENT)).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 4: Run them to verify they fail**

Run: `pnpm --filter api build`
Expected: FAIL — `Cannot find module '#src/modules/runtime/adapters/mock/mock-app-runtime.js'` (TS2307).

- [ ] **Step 5: Implement the Mock adapter**

`apps/api/src/modules/runtime/adapters/mock/mock-app-runtime.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'
import {
  type AppDeploySpec,
  type AppHealth,
  type AppRef,
  type DeployFailure,
  RolloutStatus,
  type RunLogs,
} from '#src/modules/runtime/runtime.types.js'
import type { Uuid } from '#src/utils/uuid.js'

// Remembers what was deployed so the release-list reconcile guard sees what a runtime would.
@Injectable()
export class MockAppRuntime extends AppRuntime {
  private readonly liveReleases = new Map<string, Uuid<'Release'>>()

  setLiveRelease(slug: string, releaseUuid: Uuid<'Release'>): void {
    this.liveReleases.set(slug, releaseUuid)
  }

  deploy(app: AppRef, spec: AppDeploySpec): Promise<void> {
    this.liveReleases.set(app.slug, spec.releaseUuid)
    return Promise.resolve()
  }

  destroy(app: AppRef): Promise<void> {
    this.liveReleases.delete(app.slug)
    return Promise.resolve()
  }

  readRolloutStatus(): Promise<RolloutStatus> {
    return Promise.resolve(RolloutStatus.Complete)
  }

  readLiveReleaseUuid(app: AppRef): Promise<Uuid<'Release'> | null> {
    return Promise.resolve(this.liveReleases.get(app.slug) ?? null)
  }

  readHealth(): Promise<AppHealth> {
    return Promise.resolve({
      found: true,
      desiredReplicas: 1,
      availableReplicas: 1,
      updatedReplicas: 1,
    })
  }

  readDeployFailure(): Promise<DeployFailure | null> {
    return Promise.resolve(null)
  }

  readRunLogs(): Promise<RunLogs | null> {
    return Promise.resolve({
      podName: 'mock-pod-abc123',
      logs: 'mock log line 1\nmock log line 2\n',
    })
  }
}
```

`apps/api/src/modules/runtime/adapters/mock/mock-environment-runtime.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { EnvironmentRuntime } from '#src/modules/runtime/environment-runtime.js'

// Otherwise stateless: booted apps are cached across e2e suites, and truncation can't reset them.
@Injectable()
export class MockEnvironmentRuntime extends EnvironmentRuntime {
  private nextProvisionError?: Error

  failNextProvision(error: Error): void {
    this.nextProvisionError = error
  }

  provision(): Promise<void> {
    const error = this.nextProvisionError
    this.nextProvisionError = undefined
    return error ? Promise.reject(error) : Promise.resolve()
  }

  destroy(): Promise<void> {
    return Promise.resolve()
  }
}
```

`apps/api/src/modules/runtime/adapters/mock/mock-node-runtime.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { NodeRuntime } from '#src/modules/runtime/node-runtime.js'
import type { ClusterNode } from '#src/modules/runtime/runtime.types.js'

// Fixed inventory so the cluster-free local loop (seed-dev) can still render the node picker.
const NODES: ClusterNode[] = [
  { name: 'mock-node-a', labels: { 'kubernetes.io/hostname': 'mock-node-a' }, ready: true },
  { name: 'mock-node-b', labels: { 'kubernetes.io/hostname': 'mock-node-b' }, ready: false },
]

@Injectable()
export class MockNodeRuntime extends NodeRuntime {
  listNodes(): Promise<ClusterNode[]> {
    return Promise.resolve(NODES)
  }
}
```

`apps/api/src/modules/runtime/adapters/mock/mock-runtime.module.ts`:

```ts
import { Global, Module } from '@nestjs/common'
import { MockAppRuntime } from '#src/modules/runtime/adapters/mock/mock-app-runtime.js'
import { MockEnvironmentRuntime } from '#src/modules/runtime/adapters/mock/mock-environment-runtime.js'
import { MockNodeRuntime } from '#src/modules/runtime/adapters/mock/mock-node-runtime.js'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'
import { EnvironmentRuntime } from '#src/modules/runtime/environment-runtime.js'
import { NodeRuntime } from '#src/modules/runtime/node-runtime.js'

@Global()
@Module({
  providers: [
    { provide: AppRuntime, useClass: MockAppRuntime },
    { provide: EnvironmentRuntime, useClass: MockEnvironmentRuntime },
    { provide: NodeRuntime, useClass: MockNodeRuntime },
  ],
  exports: [AppRuntime, EnvironmentRuntime, NodeRuntime],
})
export class MockRuntimeModule {}
```

- [ ] **Step 6: Exclude the mock adapter from coverage, like the mock it replaces**

In `apps/api/node.config.json`, add to `testRunner.test-coverage-exclude` (keep the existing `mock-deploy-backend.ts` line until Task 7):

```json
      "src/modules/runtime/adapters/mock/**",
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
pnpm --filter api build
cd apps/api || exit 1
node --env-file=.env.test --enable-source-maps --test src/modules/runtime/adapters/mock/tests/*.unit.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 8: Lint, format, commit**

```bash
pnpm --filter api lint
pnpm exec prettier --write apps/api/src/modules/runtime apps/api/node.config.json
git add apps/api/src/modules/runtime apps/api/node.config.json
git commit -m "feat: add the runtime port and its mock adapter" -m "- AppRuntime, EnvironmentRuntime, NodeRuntime abstract classes in Marsa vocabulary
- Network-free mock adapter mirroring the existing mock backends

Refs #226

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Kubernetes adapter + adapter selection

Built by **copying** the existing Kubernetes code into the adapter and adapting it. The old `src/modules/kubernetes/` and `src/app/release/render/` stay untouched until later tasks delete them.

**Files:**

- Create (copied, then adapted) under `apps/api/src/modules/runtime/adapters/kubernetes/`:

| New path                                            | Copied from (`apps/api/src/…`)                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------- |
| `shared/conflict.ts`                                | `modules/kubernetes/conflict.ts`                                            |
| `shared/not-found.ts`                               | `modules/kubernetes/not-found.ts`                                           |
| `shared/tests/not-found.unit.test.ts`               | `modules/kubernetes/tests/not-found.unit.test.ts`                           |
| `app/app.constants.ts`                              | `modules/kubernetes/deploy-backend.constants.ts`                            |
| `app/kubernetes-objects.types.ts`                   | `modules/kubernetes/deploy-backend.types.ts` (Kubernetes object types only) |
| `app/release-annotation.ts`                         | `modules/kubernetes/release-annotation.ts`                                  |
| `app/tests/release-annotation.unit.test.ts`         | `modules/kubernetes/tests/release-annotation.unit.test.ts`                  |
| `app/rollout/newest-pod.ts`                         | `modules/kubernetes/newest-pod.ts`                                          |
| `app/rollout/map-rollout-status.ts`                 | `modules/kubernetes/map-rollout-status.ts`                                  |
| `app/rollout/extract-deploy-failure.ts`             | `modules/kubernetes/extract-deploy-failure.ts`                              |
| `app/rollout/tests/*.unit.test.ts`                  | the three matching tests in `modules/kubernetes/tests/`                     |
| `app/render/render-manifests.ts`                    | `app/release/render/render-manifests.ts`                                    |
| `app/render/node-affinity.ts`                       | `app/release/render/node-affinity.ts`                                       |
| `app/render/tests/*.unit.test.ts`                   | `app/release/render/tests/*.unit.test.ts`                                   |
| `environment/environment.constants.ts`              | `modules/kubernetes/namespace-backend.constants.ts`                         |
| `environment/namespace-name.ts`                     | `app/environment/entities/namespace.ts`                                     |
| `environment/tests/namespace-name.unit.test.ts`     | `app/environment/entities/tests/namespace.unit.test.ts`                     |
| `kubernetes-app-runtime.ts`                         | `modules/kubernetes/direct-apply-deploy-backend.ts`                         |
| `kubernetes-environment-runtime.ts`                 | `modules/kubernetes/direct-namespace-backend.ts`                            |
| `kubernetes-node-runtime.ts`                        | `modules/kubernetes/direct-node-backend.ts`                                 |
| `tests/kubernetes-app-runtime.unit.test.ts`         | `modules/kubernetes/tests/direct-apply-deploy-backend.unit.test.ts`         |
| `tests/kubernetes-environment-runtime.unit.test.ts` | `modules/kubernetes/tests/direct-namespace-backend.unit.test.ts`            |
| `tests/kubernetes-node-runtime.unit.test.ts`        | `modules/kubernetes/tests/direct-node-backend.unit.test.ts`                 |

- Create: `apps/api/src/modules/runtime/adapters/kubernetes/kubernetes-runtime.module.ts`
- Create: `apps/api/src/modules/runtime/runtime.module.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/config/env.config.ts`, `apps/api/.env.test`

**Interfaces:**

- Consumes: Task 1's port, types, errors, `MockEnvironmentRuntime`, `MockRuntimeModule`.
- Produces: `namespaceOf(environment: Pick<EnvironmentRef, 'projectSlug' | 'environmentSlug'>): string` (adapter-internal); `renderManifests(slug: string, spec: AppDeploySpec): RenderedManifests`; `buildNodeAffinity(nodePin: NodePinSpec | null): V1Affinity | undefined`; `KubernetesAppRuntime(environments: EnvironmentRuntime)`; `KubernetesEnvironmentRuntime(apiNamespace: string)`; `KubernetesNodeRuntime()`; `KubernetesRuntimeModule` (`@Global()`); `RuntimeModule`. After this task every booted Nest app has `AppRuntime` / `EnvironmentRuntime` / `NodeRuntime` injectable.

- [ ] **Step 1: Copy the files**

```bash
cd apps/api/src || exit 1
K=modules/runtime/adapters/kubernetes
mkdir -p $K/shared/tests $K/app/tests $K/app/rollout/tests $K/app/render/tests $K/environment/tests $K/tests
cp modules/kubernetes/conflict.ts $K/shared/conflict.ts
cp modules/kubernetes/not-found.ts $K/shared/not-found.ts
cp modules/kubernetes/tests/not-found.unit.test.ts $K/shared/tests/
cp modules/kubernetes/deploy-backend.constants.ts $K/app/app.constants.ts
cp modules/kubernetes/deploy-backend.types.ts $K/app/kubernetes-objects.types.ts
cp modules/kubernetes/release-annotation.ts $K/app/release-annotation.ts
cp modules/kubernetes/tests/release-annotation.unit.test.ts $K/app/tests/
cp modules/kubernetes/newest-pod.ts modules/kubernetes/map-rollout-status.ts modules/kubernetes/extract-deploy-failure.ts $K/app/rollout/
cp modules/kubernetes/tests/newest-pod.unit.test.ts modules/kubernetes/tests/map-rollout-status.unit.test.ts modules/kubernetes/tests/extract-deploy-failure.unit.test.ts $K/app/rollout/tests/
cp app/release/render/render-manifests.ts app/release/render/node-affinity.ts $K/app/render/
cp app/release/render/tests/*.unit.test.ts $K/app/render/tests/
cp modules/kubernetes/namespace-backend.constants.ts $K/environment/environment.constants.ts
cp app/environment/entities/namespace.ts $K/environment/namespace-name.ts
cp app/environment/entities/tests/namespace.unit.test.ts $K/environment/tests/namespace-name.unit.test.ts
cp modules/kubernetes/direct-apply-deploy-backend.ts $K/kubernetes-app-runtime.ts
cp modules/kubernetes/direct-namespace-backend.ts $K/kubernetes-environment-runtime.ts
cp modules/kubernetes/direct-node-backend.ts $K/kubernetes-node-runtime.ts
cp modules/kubernetes/tests/direct-apply-deploy-backend.unit.test.ts $K/tests/kubernetes-app-runtime.unit.test.ts
cp modules/kubernetes/tests/direct-namespace-backend.unit.test.ts $K/tests/kubernetes-environment-runtime.unit.test.ts
cp modules/kubernetes/tests/direct-node-backend.unit.test.ts $K/tests/kubernetes-node-runtime.unit.test.ts
```

- [ ] **Step 2: Rewrite the import paths inside the copies**

```bash
cd apps/api/src || exit 1
K=modules/runtime/adapters/kubernetes
N='#src/modules/runtime/adapters/kubernetes'
find $K -name '*.ts' -print0 | xargs -0 sed -i \
  -e "s|#src/modules/kubernetes/conflict.js|$N/shared/conflict.js|" \
  -e "s|#src/modules/kubernetes/not-found.js|$N/shared/not-found.js|" \
  -e "s|#src/modules/kubernetes/deploy-backend.constants.js|$N/app/app.constants.js|" \
  -e "s|#src/modules/kubernetes/release-annotation.js|$N/app/release-annotation.js|" \
  -e "s|#src/modules/kubernetes/newest-pod.js|$N/app/rollout/newest-pod.js|" \
  -e "s|#src/modules/kubernetes/map-rollout-status.js|$N/app/rollout/map-rollout-status.js|" \
  -e "s|#src/modules/kubernetes/extract-deploy-failure.js|$N/app/rollout/extract-deploy-failure.js|" \
  -e "s|#src/modules/kubernetes/namespace-backend.constants.js|$N/environment/environment.constants.js|" \
  -e "s|#src/modules/kubernetes/rollout-status.js|#src/modules/runtime/runtime.types.js|" \
  -e "s|#src/app/release/render/render-manifests.js|$N/app/render/render-manifests.js|" \
  -e "s|#src/app/release/render/node-affinity.js|$N/app/render/node-affinity.js|" \
  -e "s|#src/app/environment/entities/namespace.js|$N/environment/namespace-name.js|"
grep -rn "#src/modules/kubernetes\|#src/app/" $K
```

Expected: the final `grep` lists only the lines Steps 3–8 rewrite by hand (imports of `deploy-backend.js`, `deploy-backend.types.js`, `namespace-backend.js`, `node-backend.js`, `direct-*`, and `#src/app/...` types).

- [ ] **Step 3: Split the type files**

`app/kubernetes-objects.types.ts`: delete `RegistryCredentials`, `AppHealth`, `DeployFailure`, `RunLogs`, `RunLogsOptions` (now in `runtime.types.ts`). Keep `IngressRouteService`, `IngressRouteSpec`, `IngressRoute`, `HttpScaledObjectSpec`, `HttpScaledObject`, `RenderedManifests` with their comments.

In `app/rollout/extract-deploy-failure.ts` replace the `DeployFailure` import with:

```ts
import type { DeployFailure } from '#src/modules/runtime/runtime.types.js'
```

In `app/release-annotation.ts` replace the error import with:

```ts
import { InvalidReleaseAnnotationError } from '#src/modules/runtime/runtime.errors.js'
```

and in `app/tests/release-annotation.unit.test.ts` import `InvalidReleaseAnnotationError` from the same path.

Any other copied file still importing `#src/modules/kubernetes/deploy-backend.types.js` takes `DeployFailure` / `AppHealth` / `RunLogs` / `RunLogsOptions` / `RegistryCredentials` from `#src/modules/runtime/runtime.types.js` and `RenderedManifests` / `IngressRoute` / `HttpScaledObject` from `#src/modules/runtime/adapters/kubernetes/app/kubernetes-objects.types.js`.

- [ ] **Step 4: Make `namespaceOf` take an `EnvironmentRef`**

Replace `environment/namespace-name.ts` with:

```ts
import type { EnvironmentRef } from '#src/modules/runtime/runtime.types.js'

// Derived, never stored (AgDR-0029).
export function namespaceOf({
  projectSlug,
  environmentSlug,
}: Pick<EnvironmentRef, 'projectSlug' | 'environmentSlug'>): string {
  return `${projectSlug}-${environmentSlug}`
}
```

In `environment/tests/namespace-name.unit.test.ts` change every call from `namespaceOf(project, environment)` / `namespaceOf({ slug: … }, { slug: … })` to `namespaceOf({ projectSlug: …, environmentSlug: … })`, keeping each assertion's expected string.

- [ ] **Step 5: Render from an `AppDeploySpec`**

`app/render/node-affinity.ts` — replace the two `#src/app/app-management/...` imports and the signature:

```ts
import type { V1Affinity, V1NodeSelectorRequirement } from '@kubernetes/client-node'
import type { NodePinSpec } from '#src/modules/runtime/runtime.types.js'

// Single term, so the weight only has to be a legal 1-100 value.
const PREFERRED_WEIGHT = 100

export function buildNodeAffinity(nodePin: NodePinSpec | null): V1Affinity | undefined {
```

and change `if (nodePin.strategy === PinStrategy.Required) {` to `if (nodePin.strategy === 'required') {`. The body is otherwise unchanged.

`app/render/render-manifests.ts` — replace the imports, delete `RenderManifestsOptions`, and change the signature and the `Release`/`baseDomain` reads. The new head of the file:

```ts
import type { V1Deployment, V1Secret, V1Service } from '@kubernetes/client-node'
import {
  INTERCEPTOR_PORT,
  INTERCEPTOR_SERVICE_NAME,
  KEDA_HTTP_GROUP,
  KEDA_HTTP_VERSION,
  KEDA_NAMESPACE,
  REGISTRY_SECRET_SUFFIX,
  RELEASE_UUID_ANNOTATION,
  SCALEDOWN_PERIOD_SECONDS,
} from '#src/modules/runtime/adapters/kubernetes/app/app.constants.js'
import type {
  HttpScaledObject,
  IngressRoute,
  RenderedManifests,
} from '#src/modules/runtime/adapters/kubernetes/app/kubernetes-objects.types.js'
import { buildNodeAffinity } from '#src/modules/runtime/adapters/kubernetes/app/render/node-affinity.js'
import type { AppDeploySpec, RegistryCredentials } from '#src/modules/runtime/runtime.types.js'

// (buildDockerConfigJson unchanged)

export function renderManifests(slug: string, spec: AppDeploySpec): RenderedManifests {
  const name = slug
  const host = spec.host
  const labels = { app: name }
  const env = Object.entries(spec.env).map(([key, value]) => ({ name: key, value }))
  const affinity = buildNodeAffinity(spec.nodePin)
  const credentials = spec.credentials
```

Then in the body replace: `release.uuid` → `spec.releaseUuid`, `release.imageRef` → `spec.image`, every `release.containerPort` → `spec.port`, `release.minReplicas` → `spec.minReplicas`, `release.maxReplicas` → `spec.maxReplicas`. Nothing else changes.

- [ ] **Step 6: Rewrite the render tests against a spec**

In `app/render/tests/render-manifests.unit.test.ts` replace the imports and the `render` helper with:

```ts
import { describe, it } from 'node:test'
import { expect } from 'expect'
import { RELEASE_UUID_ANNOTATION } from '#src/modules/runtime/adapters/kubernetes/app/app.constants.js'
import { renderManifests } from '#src/modules/runtime/adapters/kubernetes/app/render/render-manifests.js'
import type {
  AppDeploySpec,
  NodePinSpec,
  RegistryCredentials,
} from '#src/modules/runtime/runtime.types.js'
import { generateUuid, type Uuid } from '#src/utils/uuid.js'

const RELEASE_UUID = generateUuid<Uuid<'Release'>>()

const specOf = (overrides: Partial<AppDeploySpec> = {}): AppDeploySpec => ({
  releaseUuid: RELEASE_UUID,
  image: 'nginx:1.27',
  port: 8080,
  env: { LOG_LEVEL: 'info' },
  minReplicas: 0,
  maxReplicas: 3,
  host: 'my-app.demo.marsa.cc',
  nodePin: null,
  ...overrides,
})

describe('renderManifests', () => {
  const render = (credentials?: RegistryCredentials) =>
    renderManifests('my-app', specOf(credentials ? { credentials } : {}))
```

Every existing assertion keeps its expected value; where a test built a `ReleaseBuilder`/`AppBuilder` to read `release.uuid` or set a `NodePin`, use `RELEASE_UUID` and `renderManifests('my-app', specOf({ nodePin }))` with `nodePin: NodePinSpec` and `strategy: 'required' | 'preferred'`. In `app/render/tests/node-affinity.unit.test.ts` replace `NodePin` / `PinStrategy` imports with `NodePinSpec` from `runtime.types.js` and the enum values with the string literals.

- [ ] **Step 7: `KubernetesEnvironmentRuntime`**

Replace `kubernetes-environment-runtime.ts` with (the logic is today's `DirectNamespaceBackend`, keyed by `EnvironmentRef`):

```ts
import {
  CoreV1Api,
  KubeConfig,
  RbacAuthorizationV1Api,
  type V1Namespace,
  type V1RoleBinding,
} from '@kubernetes/client-node'
import { Injectable } from '@nestjs/common'
import {
  API_SERVICE_ACCOUNT,
  DEPLOYER_CLUSTER_ROLE,
  DEPLOYER_ROLE_BINDING,
  ENVIRONMENT_UUID_LABEL,
  MANAGED_BY_LABEL,
  MANAGED_BY_VALUE,
} from '#src/modules/runtime/adapters/kubernetes/environment/environment.constants.js'
import { namespaceOf } from '#src/modules/runtime/adapters/kubernetes/environment/namespace-name.js'
import {
  ignoreConflict,
  isConflict,
} from '#src/modules/runtime/adapters/kubernetes/shared/conflict.js'
import {
  ignoreNotFound,
  isNotFound,
} from '#src/modules/runtime/adapters/kubernetes/shared/not-found.js'
import { EnvironmentRuntime } from '#src/modules/runtime/environment-runtime.js'
import { EnvironmentConflictError } from '#src/modules/runtime/runtime.errors.js'
import type { EnvironmentRef } from '#src/modules/runtime/runtime.types.js'

@Injectable()
export class KubernetesEnvironmentRuntime extends EnvironmentRuntime {
  private readonly core: CoreV1Api
  private readonly rbac: RbacAuthorizationV1Api

  constructor(private readonly apiNamespace: string) {
    super()
    const kc = new KubeConfig()
    kc.loadFromDefault()
    this.core = kc.makeApiClient(CoreV1Api)
    this.rbac = kc.makeApiClient(RbacAuthorizationV1Api)
  }

  async provision(environment: EnvironmentRef): Promise<void> {
    const namespace = namespaceOf(environment)
    await this.ensureNamespace(namespace, environment.uuid)
    await ignoreConflict(() =>
      this.rbac.createNamespacedRoleBinding({ namespace, body: this.deployerBinding(namespace) }),
    )
  }

  // Slugs may contain '-', so two environments can derive one name; never delete the other's.
  async destroy(environment: EnvironmentRef): Promise<void> {
    const namespace = namespaceOf(environment)
    let existing: V1Namespace
    try {
      existing = await this.core.readNamespace({ name: namespace })
    } catch (error) {
      if (isNotFound(error)) {
        return
      }
      throw error
    }
    if (existing.metadata?.labels?.[ENVIRONMENT_UUID_LABEL] !== environment.uuid) {
      return
    }
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
      throw new EnvironmentConflictError(
        `Namespace '${name}' is still being deleted. Retry shortly.`,
      )
    }
    if (existing.metadata?.labels?.[ENVIRONMENT_UUID_LABEL] !== environmentUuid) {
      throw new EnvironmentConflictError(
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

In `tests/kubernetes-environment-runtime.unit.test.ts`: import `KubernetesEnvironmentRuntime` and `EnvironmentConflictError` from the new paths; construct with `new KubernetesEnvironmentRuntime('marsa')` (same argument the old test passed); replace every `backend.provision(NAMESPACE, UUID)` / `backend.destroy(NAMESPACE, UUID)` with `runtime.provision(ENVIRONMENT)` / `runtime.destroy(ENVIRONMENT)` where

```ts
const ENVIRONMENT: EnvironmentRef = { uuid: UUID, projectSlug: 'demo', environmentSlug: 'dev' }
```

and `UUID` / `NAMESPACE` keep their existing values (`NAMESPACE` must equal `'demo-dev'`; if the old constant differs, change `projectSlug`/`environmentSlug` so `namespaceOf(ENVIRONMENT) === NAMESPACE`). `NamespaceConflictError` → `EnvironmentConflictError`. Assertions are unchanged.

- [ ] **Step 8: `KubernetesAppRuntime`**

In `kubernetes-app-runtime.ts`:

1. Replace the imports of `DeployBackend`, `deploy-backend.types.js` and `#src/utils/uuid.js` with:

```ts
import type { RenderedManifests } from '#src/modules/runtime/adapters/kubernetes/app/kubernetes-objects.types.js'
import { renderManifests } from '#src/modules/runtime/adapters/kubernetes/app/render/render-manifests.js'
import { namespaceOf } from '#src/modules/runtime/adapters/kubernetes/environment/namespace-name.js'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'
import { EnvironmentRuntime } from '#src/modules/runtime/environment-runtime.js'
import {
  type AppDeploySpec,
  type AppHealth,
  type AppRef,
  type DeployFailure,
  RolloutStatus,
  type RunLogs,
  type RunLogsOptions,
} from '#src/modules/runtime/runtime.types.js'
import type { Uuid } from '#src/utils/uuid.js'
```

(and drop the now-duplicate `RolloutStatus` import that Step 2's sed pointed at `runtime.types.js`).

2. Replace the class header, constructor and `apply` signature with:

```ts
@Injectable()
export class KubernetesAppRuntime extends AppRuntime {
  private readonly apps: AppsV1Api
  private readonly core: CoreV1Api
  private readonly custom: CustomObjectsApi

  constructor(private readonly environments: EnvironmentRuntime) {
    super()
    const kc = new KubeConfig()
    kc.loadFromDefault()
    this.apps = kc.makeApiClient(AppsV1Api)
    this.core = kc.makeApiClient(CoreV1Api)
    this.custom = kc.makeApiClient(CustomObjectsApi)
  }

  async deploy(app: AppRef, spec: AppDeploySpec): Promise<void> {
    await this.environments.provision(app.environment)
    await this.apply(namespaceOf(app.environment), renderManifests(app.slug, spec))
  }

  private async apply(namespace: string, manifests: RenderedManifests): Promise<void> {
```

The body of `apply` is unchanged.

3. Replace each remaining public method's signature and first line (bodies otherwise unchanged; `appName` / `deploymentName` become `slug`):

```ts
  async destroy(app: AppRef): Promise<void> {
    const namespace = namespaceOf(app.environment)
    const appName = app.slug

  async readRolloutStatus(app: AppRef): Promise<RolloutStatus> {
    const deployment = await this.readDeployment(namespaceOf(app.environment), app.slug)

  async readLiveReleaseUuid(app: AppRef): Promise<Uuid<'Release'> | null> {
    const deployment = await this.readDeployment(namespaceOf(app.environment), app.slug)
    const annotation = deployment?.spec?.template.metadata?.annotations?.[RELEASE_UUID_ANNOTATION]
    return parseReleaseAnnotation(annotation, app.slug)

  async readHealth(app: AppRef): Promise<AppHealth> {
    const deployment = await this.readDeployment(namespaceOf(app.environment), app.slug)

  async readDeployFailure(app: AppRef): Promise<DeployFailure | null> {
    const pods = await this.listAppPods(namespaceOf(app.environment), app.slug)

  async readRunLogs(app: AppRef, options: RunLogsOptions): Promise<RunLogs | null> {
    const namespace = namespaceOf(app.environment)
    const pods = await this.listAppPods(namespace, app.slug)
```

(`readAppHealth` is renamed `readHealth`.) `listAppPods` and `readDeployment` stay private and unchanged.

- [ ] **Step 9: Adapt the app-runtime tests**

In `tests/kubernetes-app-runtime.unit.test.ts`:

- Replace the `deploy-backend.*` / `direct-apply-deploy-backend` imports with `KubernetesAppRuntime`, `MockEnvironmentRuntime` (from `adapters/mock/mock-environment-runtime.js`), `InvalidReleaseAnnotationError` (from `runtime.errors.js`), `REGISTRY_SECRET_SUFFIX` / `RELEASE_UUID_ANNOTATION` (from `app/app.constants.js`) and `AppDeploySpec`, `AppRef` (from `runtime.types.js`).
- Replace the `manifests()` helper with:

```ts
const APP: AppRef = {
  environment: {
    uuid: generateUuid<Uuid<'Environment'>>(),
    projectSlug: 'demo',
    environmentSlug: 'dev',
  },
  slug: SLUG,
}

const spec = (overrides: Partial<AppDeploySpec> = {}): AppDeploySpec => ({
  releaseUuid: generateUuid<Uuid<'Release'>>(),
  image: 'nginx:1.27',
  port: 80,
  env: {},
  minReplicas: 1,
  maxReplicas: 1,
  host: `${SLUG}.demo.marsa.cc`,
  nodePin: null,
  ...overrides,
})

const CREDENTIALS = { registry: 'ghcr.io', username: 'org', password: 'pw' }
```

`NAMESPACE` stays `'demo-dev'`, which is what `APP` renders to.

- In each `beforeEach`, build the runtime with a stubbed environment runtime:

```ts
environments = createStubInstance(MockEnvironmentRuntime)
environments.provision.resolves()
runtime = new KubernetesAppRuntime(environments)
```

- Call-site rewrites: `backend.apply(NAMESPACE, manifests())` → `runtime.deploy(APP, spec())`; `manifests({ imagePullSecret: … })` → `spec({ credentials: CREDENTIALS })`; `backend.destroy(NAMESPACE, SLUG)` → `runtime.destroy(APP)`; `backend.readX(NAMESPACE, SLUG[, opts])` → `runtime.readX(APP[, opts])`, with `readAppHealth` → `readHealth`. Every assertion on namespaces, names, call order and 404/403 handling stays as written.
- Add one test to the `deploy` describe:

```ts
it('provisions the environment before applying anything into it', async () => {
  await runtime.deploy(APP, spec())

  expect(environments.provision.calledOnceWithExactly(APP.environment)).toBe(true)
  expect(environments.provision.calledBefore(apps.patchNamespacedDeployment)).toBe(true)
})
```

- [ ] **Step 10: `KubernetesNodeRuntime`**

Replace `kubernetes-node-runtime.ts` with:

```ts
import { CoreV1Api, KubeConfig, type V1Node } from '@kubernetes/client-node'
import { Injectable } from '@nestjs/common'
import { NodeRuntime } from '#src/modules/runtime/node-runtime.js'
import type { ClusterNode } from '#src/modules/runtime/runtime.types.js'

export function toClusterNodes(nodes: V1Node[]): ClusterNode[] {
  return nodes
    .filter((node) => node.metadata?.name)
    .map((node) => ({
      name: node.metadata?.name ?? '',
      labels: node.metadata?.labels ?? {},
      ready:
        node.status?.conditions?.some(
          (condition) => condition.type === 'Ready' && condition.status === 'True',
        ) ?? false,
    }))
}

@Injectable()
export class KubernetesNodeRuntime extends NodeRuntime {
  private readonly core: CoreV1Api

  constructor() {
    super()
    const kc = new KubeConfig()
    kc.loadFromDefault()
    this.core = kc.makeApiClient(CoreV1Api)
  }

  async listNodes(): Promise<ClusterNode[]> {
    const { items } = await this.core.listNode()
    return toClusterNodes(items)
  }
}
```

In `tests/kubernetes-node-runtime.unit.test.ts` rename `DirectNodeBackend` → `KubernetesNodeRuntime` and fix its import path.

- [ ] **Step 11: Adapter module, selection module, env var**

`apps/api/src/modules/runtime/adapters/kubernetes/kubernetes-runtime.module.ts`:

```ts
import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { KubernetesAppRuntime } from '#src/modules/runtime/adapters/kubernetes/kubernetes-app-runtime.js'
import { KubernetesEnvironmentRuntime } from '#src/modules/runtime/adapters/kubernetes/kubernetes-environment-runtime.js'
import { KubernetesNodeRuntime } from '#src/modules/runtime/adapters/kubernetes/kubernetes-node-runtime.js'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'
import { EnvironmentRuntime } from '#src/modules/runtime/environment-runtime.js'
import { NodeRuntime } from '#src/modules/runtime/node-runtime.js'

@Global()
@Module({
  providers: [
    {
      provide: EnvironmentRuntime,
      useFactory: (config: ConfigService) =>
        new KubernetesEnvironmentRuntime(config.getOrThrow<string>('MARSA_API_NAMESPACE')),
      inject: [ConfigService],
    },
    {
      provide: AppRuntime,
      useFactory: (environments: EnvironmentRuntime) => new KubernetesAppRuntime(environments),
      inject: [EnvironmentRuntime],
    },
    { provide: NodeRuntime, useClass: KubernetesNodeRuntime },
  ],
  exports: [AppRuntime, EnvironmentRuntime, NodeRuntime],
})
export class KubernetesRuntimeModule {}
```

`apps/api/src/modules/runtime/runtime.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { ConditionalModule } from '@nestjs/config'
import { KubernetesRuntimeModule } from '#src/modules/runtime/adapters/kubernetes/kubernetes-runtime.module.js'
import { MockRuntimeModule } from '#src/modules/runtime/adapters/mock/mock-runtime.module.js'

// Adapter modules are @Global, so whichever one loads is visible to every feature.
@Module({
  imports: [
    ConditionalModule.registerWhen(KubernetesRuntimeModule, (env) => env.MARSA_RUNTIME !== 'mock'),
    ConditionalModule.registerWhen(MockRuntimeModule, (env) => env.MARSA_RUNTIME === 'mock'),
  ],
})
export class RuntimeModule {}
```

`apps/api/src/app.module.ts`: add `import { RuntimeModule } from '#src/modules/runtime/runtime.module.js'` and put `RuntimeModule,` after `CryptoModule,` in `imports`.

`apps/api/src/config/env.config.ts`: below the `DEPLOY_BACKEND` line add

```ts
  MARSA_RUNTIME: Joi.string().valid('kubernetes', 'mock').default('kubernetes'),
```

`apps/api/.env.test`: below `DEPLOY_BACKEND=mock` add `MARSA_RUNTIME=mock`.

- [ ] **Step 12: Build, run the adapter tests, then the full suite**

```bash
pnpm --filter api build
cd apps/api || exit 1
node --env-file=.env.test --enable-source-maps --test $(find src/modules/runtime -name '*.unit.test.ts')
cd ../.. || exit 1
pnpm --filter api test
```

Expected: adapter tests pass; the full suite passes (features still use the old module; the new global providers load the mock adapter under `MARSA_RUNTIME=mock`).

- [ ] **Step 13: Lint, format, commit**

```bash
pnpm --filter api lint && pnpm --filter api typecheck
pnpm exec prettier --write apps/api/src/modules/runtime apps/api/src/app.module.ts apps/api/src/config/env.config.ts
git add apps/api/src/modules/runtime apps/api/src/app.module.ts apps/api/src/config/env.config.ts apps/api/.env.test
git commit -m "feat: add the kubernetes runtime adapter behind the port" -m "- Rendering, namespace naming and rollout reads move inside the adapter
- RuntimeModule loads one adapter on MARSA_RUNTIME via ConditionalModule

Refs #226

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Feature-side helpers — refs, deploy spec, credentials

**Files:**

- Create: `apps/api/src/app/environment/entities/environment-ref.ts`
- Modify: `apps/api/src/app/app-management/queries/app-placement.ts`
- Create: `apps/api/src/app/release/entities/release-deploy-spec.ts`
- Modify: `apps/api/src/modules/crypto/image-pull-credentials.cipher.ts`
- Test: `apps/api/src/app/release/entities/tests/release-deploy-spec.unit.test.ts`
- Test: `apps/api/src/modules/crypto/tests/image-pull-credentials.cipher.unit.test.ts` (create)

**Interfaces:**

- Consumes: `AppRef`, `EnvironmentRef`, `AppDeploySpec`, `NodePinSpec`, `RegistryCredentials` (Task 1).
- Produces:
  - `environmentRefOf(project: Pick<Project, 'slug'>, environment: Pick<Environment, 'uuid' | 'slug'>): EnvironmentRef`
  - `appRefOf(placement: AppPlacement): AppRef`
  - `deploySpecOf(placement: AppPlacement, release: Release, options: { baseDomain: string; credentials?: RegistryCredentials }): { app: AppRef; spec: AppDeploySpec }`
  - `ImagePullCredentialsCipher.openForApp(slug: string, token: string): RegistryCredentials` — throws `InternalServerErrorException` with today's message.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/app/release/entities/tests/release-deploy-spec.unit.test.ts`:

```ts
import { describe, it } from 'node:test'
import { expect } from 'expect'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { PinStrategy } from '#src/app/app-management/enums/pin-strategy.enum.js'
import { AppPlacementBuilder } from '#src/app/app-management/queries/app-placement.builder.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import { deploySpecOf } from '#src/app/release/entities/release-deploy-spec.js'

describe('deploySpecOf', () => {
  const pinned = new AppBuilder().withSlug('my-app').build()
  const placement = new AppPlacementBuilder()
    .withApp({
      ...pinned,
      nodePin: {
        key: 'kubernetes.io/hostname',
        values: ['node-a'],
        strategy: PinStrategy.Preferred,
      },
    })
    .build()
  const release = new ReleaseBuilder().withApp(placement.app).withImageRef('nginx:1.27').build()

  it('takes config from the release snapshot and placement from the app', () => {
    const { app, spec } = deploySpecOf(placement, release, { baseDomain: 'demo.marsa.cc' })

    expect(app).toEqual({
      slug: 'my-app',
      environment: {
        uuid: placement.environment.uuid,
        projectSlug: placement.project.slug,
        environmentSlug: placement.environment.slug,
      },
    })
    expect(spec).toEqual({
      releaseUuid: release.uuid,
      image: 'nginx:1.27',
      port: release.containerPort,
      env: release.env,
      minReplicas: release.minReplicas,
      maxReplicas: release.maxReplicas,
      host: 'my-app.demo.marsa.cc',
      nodePin: { key: 'kubernetes.io/hostname', values: ['node-a'], strategy: 'preferred' },
    })
  })

  it('carries credentials only when given', () => {
    const credentials = { registry: 'ghcr.io', username: 'org', password: 'pw' }

    const { spec } = deploySpecOf(placement, release, { baseDomain: 'x', credentials })

    expect(spec.credentials).toEqual(credentials)
    expect('credentials' in deploySpecOf(placement, release, { baseDomain: 'x' }).spec).toBe(false)
  })
})
```

Cipher test — create `apps/api/src/modules/crypto/tests/image-pull-credentials.cipher.unit.test.ts` (the folder already holds `secret-cipher.service.unit.test.ts`):

```ts
import { describe, it } from 'node:test'
import { InternalServerErrorException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'

describe('ImagePullCredentialsCipher.openForApp', () => {
  it('explains an undecryptable token instead of leaking the cipher error', () => {
    const secrets = createStubInstance(SecretCipherService)
    secrets.decrypt.throws(new Error('bad tag'))
    const cipher = new ImagePullCredentialsCipher(secrets)

    expect(() => cipher.openForApp('my-app', 'sealed')).toThrow(InternalServerErrorException)
    expect(() => cipher.openForApp('my-app', 'sealed')).toThrow(/could not be decrypted/)
  })

  it('opens a valid token', () => {
    const secrets = createStubInstance(SecretCipherService)
    secrets.decrypt.returns('{"registry":"ghcr.io","username":"org","password":"pw"}')

    const credentials = new ImagePullCredentialsCipher(secrets).openForApp('my-app', 'sealed')

    expect(credentials).toEqual({ registry: 'ghcr.io', username: 'org', password: 'pw' })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter api build`
Expected: FAIL — `Cannot find module '#src/app/release/entities/release-deploy-spec.js'` and `Property 'openForApp' does not exist`.

- [ ] **Step 3: Implement**

`apps/api/src/app/environment/entities/environment-ref.ts`:

```ts
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import type { Project } from '#src/app/project/entities/project.table.js'
import type { EnvironmentRef } from '#src/modules/runtime/runtime.types.js'

export function environmentRefOf(
  project: Pick<Project, 'slug'>,
  environment: Pick<Environment, 'uuid' | 'slug'>,
): EnvironmentRef {
  return { uuid: environment.uuid, projectSlug: project.slug, environmentSlug: environment.slug }
}
```

Append to `apps/api/src/app/app-management/queries/app-placement.ts` (and add the two imports):

```ts
import { environmentRefOf } from '#src/app/environment/entities/environment-ref.js'
import type { AppRef } from '#src/modules/runtime/runtime.types.js'

export function appRefOf({ app, project, environment }: AppPlacement): AppRef {
  return { slug: app.slug, environment: environmentRefOf(project, environment) }
}
```

`apps/api/src/app/release/entities/release-deploy-spec.ts`:

```ts
import type { NodePin } from '#src/app/app-management/entities/node-pin.js'
import { PinStrategy } from '#src/app/app-management/enums/pin-strategy.enum.js'
import { type AppPlacement, appRefOf } from '#src/app/app-management/queries/app-placement.js'
import type { Release } from '#src/app/release/entities/release.table.js'
import type {
  AppDeploySpec,
  AppRef,
  NodePinSpec,
  RegistryCredentials,
} from '#src/modules/runtime/runtime.types.js'

export interface DeploySpecOptions {
  baseDomain: string
  credentials?: RegistryCredentials
}

// The pin is placement, not config: it comes from the app today, never from the release.
export function deploySpecOf(
  placement: AppPlacement,
  release: Release,
  { baseDomain, credentials }: DeploySpecOptions,
): { app: AppRef; spec: AppDeploySpec } {
  const { app } = placement
  return {
    app: appRefOf(placement),
    spec: {
      releaseUuid: release.uuid,
      image: release.imageRef,
      port: release.containerPort,
      env: release.env,
      minReplicas: release.minReplicas,
      maxReplicas: release.maxReplicas,
      host: `${app.slug}.${baseDomain}`,
      nodePin: nodePinSpecOf(app.nodePin),
      ...(credentials ? { credentials } : {}),
    },
  }
}

function nodePinSpecOf(nodePin: NodePin | null): NodePinSpec | null {
  if (!nodePin) {
    return null
  }
  const strategy = nodePin.strategy === PinStrategy.Required ? 'required' : 'preferred'
  return { key: nodePin.key, values: nodePin.values, strategy }
}
```

`apps/api/src/modules/crypto/image-pull-credentials.cipher.ts` — change the `RegistryCredentials` import to `#src/modules/runtime/runtime.types.js`, add `InternalServerErrorException` to a `@nestjs/common` import, and add:

```ts
  openForApp(slug: string, token: string): RegistryCredentials {
    try {
      return this.open(token)
    } catch (error) {
      throw new InternalServerErrorException(
        `Stored image pull credentials for '${slug}' could not be decrypted. ` +
          'Re-enter the registry credentials and deploy again.',
        { cause: error },
      )
    }
  }
```

- [ ] **Step 4: Verify**

```bash
pnpm --filter api build
cd apps/api || exit 1
node --env-file=.env.test --enable-source-maps --test src/app/release/entities/tests/release-deploy-spec.unit.test.ts src/modules/crypto/tests/image-pull-credentials.cipher.unit.test.ts
```

Expected: all pass.

- [ ] **Step 5: Lint, format, commit**

```bash
pnpm --filter api lint
pnpm exec prettier --write apps/api/src/app/environment/entities/environment-ref.ts apps/api/src/app/app-management/queries/app-placement.ts apps/api/src/app/release/entities apps/api/src/modules/crypto
git add apps/api/src/app/environment/entities/environment-ref.ts apps/api/src/app/app-management/queries/app-placement.ts apps/api/src/app/release/entities/release-deploy-spec.ts apps/api/src/app/release/entities/tests/release-deploy-spec.unit.test.ts apps/api/src/modules/crypto/image-pull-credentials.cipher.ts apps/api/src/modules/crypto/tests/image-pull-credentials.cipher.unit.test.ts
git commit -m "feat: map releases and placements onto runtime specs" -m "- deploySpecOf, appRefOf and environmentRefOf build port inputs from feature data
- ImagePullCredentialsCipher.openForApp owns the undecryptable-credentials error

Refs #226

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Deploy through the port — `deploy-release`, `update-app`, delete `ApplyReleaseService`

**Files:**

- Modify: `apps/api/src/app/release/use-cases/deploy-release/deploy-release.use-case.ts`
- Modify: `apps/api/src/app/release/use-cases/deploy-release/deploy-release.module.ts`
- Modify: `apps/api/src/app/release/use-cases/deploy-release/tests/deploy-release.use-case.unit.test.ts`
- Modify: `apps/api/src/app/app-management/use-cases/update-app/update-app.use-case.ts`
- Modify: `apps/api/src/app/app-management/use-cases/update-app/update-app.module.ts`
- Modify: `apps/api/src/app/app-management/use-cases/update-app/tests/update-app.use-case.unit.test.ts`
- Delete: `apps/api/src/app/release/services/` (whole directory), `apps/api/src/app/release/render/` (whole directory, incl. tests)

**Interfaces:**

- Consumes: `AppRuntime`, `EnvironmentConflictError`, `deploySpecOf`, `appRefOf`, `ImagePullCredentialsCipher.openForApp`, `MockAppRuntime`.
- Produces: `DeployReleaseUseCase(repository, appRuntime: AppRuntime, cipher: ImagePullCredentialsCipher, config: ConfigService)`; `UpdateAppUseCase(repository, cipher: ImagePullCredentialsCipher, appRuntime: AppRuntime, config: ConfigService)`.

- [ ] **Step 1: Rewrite the deploy-release unit test first**

Replace the imports and `build()` in `deploy-release.use-case.unit.test.ts` with:

```ts
import { before, describe, it } from 'node:test'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { AppPlacementBuilder } from '#src/app/app-management/queries/app-placement.builder.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import { DeployReleaseRepository } from '#src/app/release/use-cases/deploy-release/deploy-release.repository.js'
import { DeployReleaseUseCase } from '#src/app/release/use-cases/deploy-release/deploy-release.use-case.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { MockAppRuntime } from '#src/modules/runtime/adapters/mock/mock-app-runtime.js'
import { EnvironmentConflictError } from '#src/modules/runtime/runtime.errors.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const placement = new AppPlacementBuilder()
  .withApp(new AppBuilder().withSlug('my-app').build())
  .build()
const app = placement.app

function build(release = new ReleaseBuilder().withApp(app).withImageRef('nginx:1.27').build()) {
  const repository = createStubInstance(DeployReleaseRepository)
  repository.findAppWithNewestRelease.resolves({ placement, release })
  repository.setDeployStatus.resolves()

  const appRuntime = createStubInstance(MockAppRuntime)
  appRuntime.deploy.resolves()
  const config = createStubInstance(ConfigService)
  config.getOrThrow.returns('demo.marsa.cc')
  const cipher = createStubInstance(ImagePullCredentialsCipher)
  cipher.openForApp.returns({ registry: 'ghcr.io', username: 'org', password: 'pw' })

  return {
    usecase: new DeployReleaseUseCase(repository, appRuntime, cipher, config),
    repository,
    appRuntime,
    cipher,
    release,
  }
}
```

Then rewrite the tests that inspected rendered manifests or the namespace backend:

```ts
it('rolls out the newest release: pending, then deploys its snapshot', async () => {
  const { usecase, repository, appRuntime, release } = build()

  const result = await usecase.execute('my-app')

  expect(repository.findAppWithNewestRelease.calledOnceWithExactly('my-app')).toBe(true)
  expect(repository.setDeployStatus.calledOnceWithExactly(release.uuid, DeployStatus.Pending)).toBe(
    true,
  )
  const [appRef, spec] = appRuntime.deploy.firstCall.args
  expect(appRef.slug).toBe('my-app')
  expect(spec).toMatchObject({ releaseUuid: release.uuid, image: 'nginx:1.27' })
  expect(result).toEqual({
    releaseUuid: release.uuid,
    appSlug: 'my-app',
    url: 'https://my-app.demo.marsa.cc',
    deployStatus: 'pending',
  })
})

it('opens the snapshot’s pull credentials into the spec', async () => {
  const release = new ReleaseBuilder()
    .withApp({ ...app, imagePullCredentialsEnc: 'sealed' })
    .build()
  const { usecase, appRuntime, cipher } = build(release)

  await usecase.execute('my-app')

  expect(cipher.openForApp.calledOnceWithExactly('my-app', 'sealed')).toBe(true)
  expect(appRuntime.deploy.firstCall.args[1].credentials?.registry).toBe('ghcr.io')
})

it('marks the rollout failed when the credentials cannot be decrypted', async () => {
  const release = new ReleaseBuilder().withApp({ ...app, imagePullCredentialsEnc: 'bad' }).build()
  const { usecase, repository, cipher } = build(release)
  cipher.openForApp.throws(new Error('could not be decrypted'))

  await expect(usecase.execute('my-app')).rejects.toThrow(/could not be decrypted/)
  expect(repository.setDeployStatus.lastCall.args).toEqual([release.uuid, DeployStatus.Failed])
})

it('reports an environment taken by something else as 409 and marks the release failed', async () => {
  const { usecase, appRuntime, repository, release } = build()
  appRuntime.deploy.rejects(new EnvironmentConflictError('taken'))

  await expect(usecase.execute('my-app')).rejects.toThrow(ConflictException)
  expect(repository.setDeployStatus.calledWith(release.uuid, DeployStatus.Failed)).toBe(true)
})
```

Delete the old "provisions the environment namespace, then applies into it" test (that ordering is now `KubernetesAppRuntime`'s, tested in Task 2). In the remaining tests rename `deployBackend.apply` → `appRuntime.deploy`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter api build`
Expected: FAIL — `DeployReleaseUseCase` constructor arity / `Expected 2 arguments, but got 4`.

- [ ] **Step 3: Implement `DeployReleaseUseCase`**

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AppPlacement } from '#src/app/app-management/queries/app-placement.js'
import type { Release } from '#src/app/release/entities/release.table.js'
import { deploySpecOf } from '#src/app/release/entities/release-deploy-spec.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import { DeployReleaseRepository } from '#src/app/release/use-cases/deploy-release/deploy-release.repository.js'
import { DeployReleaseResponse } from '#src/app/release/use-cases/deploy-release/deploy-release.response.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'
import { EnvironmentConflictError } from '#src/modules/runtime/runtime.errors.js'

// Deploys the app's newest release: releases are append-only, so the newest is what should run.
@Injectable()
export class DeployReleaseUseCase {
  private readonly baseDomain: string

  constructor(
    private readonly repository: DeployReleaseRepository,
    private readonly appRuntime: AppRuntime,
    private readonly cipher: ImagePullCredentialsCipher,
    config: ConfigService,
  ) {
    this.baseDomain = config.getOrThrow<string>('MARSA_BASE_DOMAIN')
  }

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
      this.baseDomain,
    )
  }

  // Already live, so the deploy is a runtime no-op; a failed retry must not mark it failed.
  private async reapplyRunning(placement: AppPlacement, release: Release): Promise<DeployStatus> {
    await this.deploy(placement, release)
    return release.deployStatus
  }

  private async rollOut(placement: AppPlacement, release: Release): Promise<DeployStatus> {
    await this.repository.setDeployStatus(release.uuid, DeployStatus.Pending)
    try {
      await this.deploy(placement, release)
    } catch (error) {
      await this.repository.setDeployStatus(release.uuid, DeployStatus.Failed)
      throw error
    }
    return DeployStatus.Pending
  }

  private async deploy(placement: AppPlacement, release: Release): Promise<void> {
    const sealed = release.imagePullCredentialsEnc
    const credentials = sealed ? this.cipher.openForApp(placement.app.slug, sealed) : undefined
    const { app, spec } = deploySpecOf(placement, release, {
      baseDomain: this.baseDomain,
      credentials,
    })
    try {
      await this.appRuntime.deploy(app, spec)
    } catch (error) {
      if (error instanceof EnvironmentConflictError) {
        throw new ConflictException(error.message)
      }
      throw error
    }
  }
}
```

`deploy-release.module.ts`: remove the `ApplyReleaseModule` import (and from `imports: [...]`). `AppRuntime` is global, and `ImagePullCredentialsCipher` is exported by the global `CryptoModule`, so the module needs no new imports.

- [ ] **Step 4: Rewrite the update-app unit test's wiring**

In `update-app.use-case.unit.test.ts` replace the `ApplyReleaseService` / `MockDeployBackend` imports with `MockAppRuntime` and `ConfigService`, and `build()` with:

```ts
function build() {
  const repository = createStubInstance(UpdateAppRepository)
  repository.updateBySlug.resolves(saved)
  const cipher = createStubInstance(ImagePullCredentialsCipher)
  cipher.seal.returns('new-sealed')
  const appRuntime = createStubInstance(MockAppRuntime)
  appRuntime.deploy.resolves()
  const config = createStubInstance(ConfigService)
  config.getOrThrow.returns('demo.marsa.cc')
  return {
    usecase: new UpdateAppUseCase(repository, cipher, appRuntime, config),
    repository,
    cipher,
    appRuntime,
  }
}
```

and in `buildPinned()` replace `context.deployBackend.readLiveReleaseUuid.resolves(...)` with `context.appRuntime.readLiveReleaseUuid.resolves(liveRelease.uuid)`. In every test: `applyRelease.apply` → `appRuntime.deploy`; an assertion that inspected `applyRelease.apply.firstCall.args[0].app.nodePin` becomes `appRuntime.deploy.firstCall.args[1].nodePin` compared against the port shape `{ key: 'kubernetes.io/hostname', values: ['node-a'], strategy: 'required' }`; `deployBackend.readLiveReleaseUuid` → `appRuntime.readLiveReleaseUuid`.

- [ ] **Step 5: Implement `UpdateAppUseCase`**

Constructor and `reapply` become (the rest of the file, including `execute`, `applyPin` and its comments, is unchanged):

```ts
import { ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { nodePinEquals } from '#src/app/app-management/entities/node-pin.js'
import { type AppPlacement, appRefOf } from '#src/app/app-management/queries/app-placement.js'
import { UpdateAppCommand } from '#src/app/app-management/use-cases/update-app/update-app.command.js'
import { UpdateAppRepository } from '#src/app/app-management/use-cases/update-app/update-app.repository.js'
import { UpdateAppResponse } from '#src/app/app-management/use-cases/update-app/update-app.response.js'
import { deploySpecOf } from '#src/app/release/entities/release-deploy-spec.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'
import { EnvironmentConflictError } from '#src/modules/runtime/runtime.errors.js'

@Injectable()
export class UpdateAppUseCase {
  private readonly baseDomain: string

  constructor(
    private readonly repository: UpdateAppRepository,
    private readonly credentialsCipher: ImagePullCredentialsCipher,
    private readonly appRuntime: AppRuntime,
    config: ConfigService,
  ) {
    this.baseDomain = config.getOrThrow<string>('MARSA_BASE_DOMAIN')
  }

  // execute / applyPin / credentialsEnc unchanged

  private async reapply(placement: AppPlacement): Promise<void> {
    const liveUuid = await this.appRuntime.readLiveReleaseUuid(appRefOf(placement))
    if (!liveUuid) {
      return
    }

    const release = await this.repository.findRelease(liveUuid, placement.app.uuid)
    if (!release) {
      // The runtime runs a release Marsa has no record of for this app: state is already wrong.
      throw new InternalServerErrorException(
        `App '${placement.app.slug}' is running release ${liveUuid}, which is not a release of this app.`,
      )
    }

    const sealed = release.imagePullCredentialsEnc
    const credentials = sealed
      ? this.credentialsCipher.openForApp(placement.app.slug, sealed)
      : undefined
    const { app, spec } = deploySpecOf(placement, release, {
      baseDomain: this.baseDomain,
      credentials,
    })
    try {
      await this.appRuntime.deploy(app, spec)
    } catch (error) {
      if (error instanceof EnvironmentConflictError) {
        throw new ConflictException(error.message)
      }
      throw error
    }
  }
```

Keep the existing class-level comment above `@Injectable()`. `update-app.module.ts`: drop the `ApplyReleaseModule` and `KubernetesModule` imports.

- [ ] **Step 6: Delete the service and the old renderer**

```bash
git rm -r apps/api/src/app/release/services apps/api/src/app/release/render
grep -rn "apply-release\|release/render" apps/api/src
```

Expected: `grep` prints nothing.

- [ ] **Step 7: Verify**

Run: `pnpm --filter api typecheck && pnpm --filter api lint && pnpm --filter api test`
Expected: all green. The deploy-release and update-app e2e tests pass unchanged (they go through the mock adapter now).

- [ ] **Step 8: Format, commit**

```bash
pnpm exec prettier --write apps/api/src/app/release/use-cases/deploy-release apps/api/src/app/app-management/use-cases/update-app
git add apps/api/src/app/release/use-cases/deploy-release apps/api/src/app/app-management/use-cases/update-app
git commit -m "refactor: deploy through the runtime port and drop ApplyReleaseService" -m "- deploy-release and update-app build a spec and call AppRuntime.deploy
- No feature imports another feature's service any more

Refs #226

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

(`git rm` already staged the deletions.)

---

### Task 5: Read-side and teardown consumers use the port

**Files (modify each use-case, its module, its response if listed, and its tests):**

- `apps/api/src/app/app-management/use-cases/view-app-detail/` — `view-app-detail.use-case.ts`, `view-app-detail.module.ts`, `tests/view-app-detail.use-case.unit.test.ts`, `tests/view-app-detail.e2e.test.ts`
- `apps/api/src/app/app-management/use-cases/view-app-health/` — use-case, module, `view-app-health.response.ts`, unit test
- `apps/api/src/app/app-management/use-cases/view-app-logs/` — use-case, module, `view-app-logs.response.ts`, unit test
- `apps/api/src/app/app-management/use-cases/delete-app/` — use-case, module, unit test
- `apps/api/src/app/release/use-cases/view-release-index/` — use-case, module, `view-release-index.response.ts`, unit test, e2e test
- `apps/api/src/app/cluster/use-cases/view-node-index/` — use-case, module, `view-node-index.response.ts`

**Interfaces:**

- Consumes: `AppRuntime`, `NodeRuntime`, `appRefOf`, `InvalidReleaseAnnotationError`, `RolloutStatus`, `AppHealth`, `RunLogs`, `DeployFailure`, `ClusterNode`, `MockAppRuntime`, `MockNodeRuntime`.
- Produces: no new names. After this task no file under `src/app/**` imports `#src/modules/kubernetes/**` except the environment feature (Task 6).

The change is the same in every file; do them one use-case at a time and run that use-case's tests after each.

- [ ] **Step 1: Update each use-case**

For each use-case, replace the injected `deployBackend: DeployBackend` with `appRuntime: AppRuntime` (or `nodes: NodeBackend` → `nodes: NodeRuntime`), drop `namespaceOf`, and call the port with `appRefOf(placement)`:

| Old call                                                                              | New call                                                   |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `this.deployBackend.readLiveReleaseUuid(namespaceOf(project, environment), app.slug)` | `this.appRuntime.readLiveReleaseUuid(appRefOf(placement))` |
| `this.deployBackend.readAppHealth(namespace, slug)`                                   | `this.appRuntime.readHealth(appRefOf(placement))`          |
| `this.deployBackend.readRunLogs(namespaceOf(...), slug, opts)`                        | `this.appRuntime.readRunLogs(appRefOf(placement), opts)`   |
| `this.deployBackend.destroy(namespaceOf(...), slug)`                                  | `this.appRuntime.destroy(appRefOf(placement))`             |
| `this.deployBackend.readDeployFailure(namespace, slug)`                               | `this.appRuntime.readDeployFailure(app)`                   |
| `this.deployBackend.readRolloutStatus(namespace, slug)`                               | `this.appRuntime.readRolloutStatus(app)`                   |

Import replacements:

```ts
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'
import { NodeRuntime } from '#src/modules/runtime/node-runtime.js'
import { InvalidReleaseAnnotationError } from '#src/modules/runtime/runtime.errors.js'
import {
  type AppHealth,
  type ClusterNode,
  type DeployFailure,
  RolloutStatus,
  type RunLogs,
} from '#src/modules/runtime/runtime.types.js'
import { appRefOf } from '#src/app/app-management/queries/app-placement.js'
```

(import only what each file uses). Specific shapes:

`view-app-detail.use-case.ts` `hasUndeployedChanges` takes the whole placement:

```ts
  private async hasUndeployedChanges(placement: AppPlacement): Promise<boolean> {
    let liveUuid: ReleaseUuid | null
    try {
      liveUuid = await this.appRuntime.readLiveReleaseUuid(appRefOf(placement))
    } catch (error) {
      // A malformed annotation is a Marsa bug, not an unreachable cluster, so it must not be hidden.
      if (error instanceof InvalidReleaseAnnotationError) throw error
      // Unknown is not "changed"; the health card is where an unreachable cluster shows up.
      return false
    }
    if (!liveUuid) {
      return true
    }

    const live = await this.repository.findRelease(liveUuid, placement.app.uuid)
    return !live || !isSnapshotOf(live, placement.app)
  }
```

and `execute` names the awaited value on its own line before building the response:

```ts
const hasUndeployedChanges = await this.hasUndeployedChanges(placement)
return new ViewAppDetailResponse(
  placement,
  this.config.getOrThrow<string>('MARSA_BASE_DOMAIN'),
  hasUndeployedChanges,
)
```

`view-release-index.use-case.ts`: in `refreshHead` replace `const namespace = namespaceOf(...)` with `const app = appRefOf(placement)`; `reconcile(release, app: AppRef)` drops its `slug` parameter; `import type { AppRef } from '#src/modules/runtime/runtime.types.js'`.

`view-node-index.use-case.ts`: `constructor(private readonly nodes: NodeRuntime) {}`; response imports `ClusterNode` from `runtime.types.js`.

Each module file drops `KubernetesModule` from its imports (the runtime is global).

- [ ] **Step 2: Update each test**

- Unit tests: `createStubInstance(MockDeployBackend)` → `createStubInstance(MockAppRuntime)`; `deployBackend.<method>` → `appRuntime.<method>` with `readAppHealth` → `readHealth`; assertions that checked `(namespace, slug)` arguments now check `calledOnceWithExactly(appRefOf(placement))` (import `appRefOf`) or `firstCall.args[0].slug`. `InvalidReleaseAnnotationError` imports from `runtime.errors.js`. Use-case constructors take `appRuntime` where they took `deployBackend`.
- e2e tests (`view-app-detail.e2e.test.ts`, `view-release-index.e2e.test.ts`):

```ts
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'
import type { MockAppRuntime } from '#src/modules/runtime/adapters/mock/mock-app-runtime.js'

const mockRuntime = () => setup.testModule.get<AppRuntime, MockAppRuntime>(AppRuntime)
```

and `mockBackend().setLiveRelease(...)` → `mockRuntime().setLiveRelease(...)` (arguments unchanged).

- [ ] **Step 3: Verify**

Run: `pnpm --filter api typecheck && pnpm --filter api lint && pnpm --filter api test`
Then: `grep -rln "modules/kubernetes" apps/api/src/app` — Expected: only files under `apps/api/src/app/environment/`.

- [ ] **Step 4: Format, commit**

```bash
pnpm exec prettier --write apps/api/src/app/app-management/use-cases apps/api/src/app/release/use-cases/view-release-index apps/api/src/app/cluster
git add apps/api/src/app/app-management/use-cases apps/api/src/app/release/use-cases/view-release-index apps/api/src/app/cluster
git commit -m "refactor: read app state through the runtime port" -m "- Detail, health, logs, release index, delete and node index use AppRuntime/NodeRuntime
- Features stop deriving Kubernetes namespaces

Refs #226

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Environment feature on the port + remove `namespace` from the API

**Files:**

- Modify: `apps/api/src/app/environment/use-cases/create-environment/create-environment.use-case.ts`, `.module.ts`, `.response.ts`, `.controller.ts`, `tests/create-environment.use-case.unit.test.ts`, `tests/create-environment.e2e.test.ts`
- Modify: `apps/api/src/app/environment/use-cases/delete-environment/delete-environment.use-case.ts`, `.module.ts`, `.controller.ts`, `tests/delete-environment.use-case.unit.test.ts`
- Modify: `apps/api/src/app/environment/use-cases/view-environment-index/view-environment-index.response.ts`, `tests/view-environment-index.e2e.test.ts`
- Delete: `apps/api/src/app/environment/entities/namespace.ts`, `apps/api/src/app/environment/entities/tests/namespace.unit.test.ts`
- Regenerate: `apps/api/openapi.json`, `apps/web/app/api/*`
- Modify: `apps/web/app/components/ProjectEnvironmentPicker.vue:118`, `apps/web/app/composables/__tests__/useCreateEnvironment.nuxt.spec.ts`, `useEnvironmentList.nuxt.spec.ts`, `useProjectEnvironmentPicker.nuxt.spec.ts`
- Modify: `apps/api/.claude/CLAUDE.md` Placement line (the one naming `namespaceOf`)

**Interfaces:**

- Consumes: `EnvironmentRuntime`, `EnvironmentConflictError`, `environmentRefOf`, `MockEnvironmentRuntime`.
- Produces: `CreateEnvironmentResponse` / `EnvironmentSummary` without `namespace`. The web's generated types lose `namespace`.

- [ ] **Step 1: Update the e2e expectations first**

`create-environment.e2e.test.ts`:

```ts
import { EnvironmentRuntime } from '#src/modules/runtime/environment-runtime.js'
import type { MockEnvironmentRuntime } from '#src/modules/runtime/adapters/mock/mock-environment-runtime.js'
```

- rename the test `'creates the environment and reports its namespace'` → `'creates the environment'` and change its assertion to `expect(response.body).toMatchObject({ slug: 'dev', projectSlug: 'demo' })` plus `expect(response.body).not.toHaveProperty('namespace')`;
- the rollback test arms `setup.testModule.get<EnvironmentRuntime, MockEnvironmentRuntime>(EnvironmentRuntime).failNextProvision(new Error('cluster down'))`.

`view-environment-index.e2e.test.ts`: rename `"lists only that project's environments with their namespaces"` → `"lists only that project's environments"`; assertion `expect(response.body.items[0]).toMatchObject({ slug: 'dev' })` and `expect(response.body.items[0]).not.toHaveProperty('namespace')`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter api test`
Expected: FAIL — the two `not.toHaveProperty('namespace')` assertions.

- [ ] **Step 3: Implement**

Responses: delete the `namespace` property, its `@ApiProperty`, the constructor assignment and the `namespaceOf` import from both `create-environment.response.ts` and `view-environment-index.response.ts`. `CreateEnvironmentResponse(project, environment)` keeps its signature.

`create-environment.use-case.ts` (behaviour unchanged — the transaction shape is PR 2's job):

```ts
import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { EnvironmentBuilder } from '#src/app/environment/entities/environment.builder.js'
import { environmentRefOf } from '#src/app/environment/entities/environment-ref.js'
import { CreateEnvironmentCommand } from '#src/app/environment/use-cases/create-environment/create-environment.command.js'
import { CreateEnvironmentRepository } from '#src/app/environment/use-cases/create-environment/create-environment.repository.js'
import { CreateEnvironmentResponse } from '#src/app/environment/use-cases/create-environment/create-environment.response.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { EnvironmentRuntime } from '#src/modules/runtime/environment-runtime.js'
import { EnvironmentConflictError } from '#src/modules/runtime/runtime.errors.js'
import type { EnvironmentRef } from '#src/modules/runtime/runtime.types.js'

@Injectable()
export class CreateEnvironmentUseCase {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: CreateEnvironmentRepository,
    private readonly environments: EnvironmentRuntime,
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
    const ref = environmentRefOf(project, environment)

    // Provisioning runs inside the transaction so a runtime failure rolls the row back with it.
    const created = await this.db.transaction(async (tx) => {
      const inserted = await this.repository.insert(tx, environment)
      if (!inserted) {
        return false
      }
      await this.provision(ref)
      return true
    })
    if (!created) {
      throw new ConflictException(
        `Project '${projectSlug}' already has an environment '${command.slug}'.`,
      )
    }

    return new CreateEnvironmentResponse(project, environment)
  }

  private async provision(ref: EnvironmentRef): Promise<void> {
    try {
      await this.environments.provision(ref)
    } catch (error) {
      if (error instanceof EnvironmentConflictError) {
        throw new ConflictException(error.message)
      }
      // The row rolls back, so a half-provisioned environment labelled with this uuid would block retries.
      await this.environments.destroy(ref).catch(() => undefined)
      throw new BadGatewayException(
        `Could not provision environment '${ref.projectSlug}/${ref.environmentSlug}'. Please try again.`,
        { cause: error },
      )
    }
  }
}
```

`delete-environment.use-case.ts`: inject `environments: EnvironmentRuntime`; `const ref = environmentRefOf(found.project, found.environment)` replaces `namespace`; `destroy(ref)` calls `this.environments.destroy(ref)`; its 502 message becomes `` `Could not remove environment '${ref.projectSlug}/${ref.environmentSlug}'. Please try again.` ``. The transaction, the FK→409 mapping and their comments are unchanged, with "cluster" kept in the comment wording.

Controllers: in `create-environment.controller.ts` change the 409 description to `'The slug is taken in this project, or the environment is taken or still being removed.'` and the 502 to `'The environment could not be provisioned.'`; in `delete-environment.controller.ts` change 204 to `'The environment was deleted.'` and 502 to `'The environment could not be removed; nothing changed.'`.

Modules: drop `KubernetesModule` from both.

Unit tests: `createStubInstance(MockNamespaceBackend)` → `createStubInstance(MockEnvironmentRuntime)`; `NamespaceConflictError` → `EnvironmentConflictError`; assertions on `provision('demo-dev', uuid)` become `provision.calledOnceWithExactly(environmentRefOf(project, environment))` (or compare `firstCall.args[0]` to `{ uuid, projectSlug: 'demo', environmentSlug: 'dev' }`); assertions on the 502 message text use the new wording.

Delete the old helper: `git rm apps/api/src/app/environment/entities/namespace.ts apps/api/src/app/environment/entities/tests/namespace.unit.test.ts`.

- [ ] **Step 4: Regenerate the contract and the web types**

```bash
cp apps/api/.env.test apps/api/.env   # generate:openapi reads .env; skip if one already exists
pnpm --filter api generate:openapi
pnpm --filter web generate:api
git diff --stat apps/api/openapi.json apps/web/app/api
```

Expected: only `namespace` removals in `openapi.json` and the generated web files. Do **not** commit `apps/api/.env`.

- [ ] **Step 5: Web**

- `ProjectEnvironmentPicker.vue:118`: `description="Each environment is its own Kubernetes namespace"` → `description="Each environment is isolated from the others"`.
- The three composable specs: delete every `namespace: '…'` property from their fixtures (`useCreateEnvironment.nuxt.spec.ts:10`, `useEnvironmentList.nuxt.spec.ts:10`, `useProjectEnvironmentPicker.nuxt.spec.ts:26` and `:115`).

Run: `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test`
Expected: green. If a component test asserts the old picker description, update its expected string.

- [ ] **Step 6: Point the api guide at the new home of `namespaceOf`**

In `apps/api/.claude/CLAUDE.md`, replace the `**Placement**` bullet with:

```markdown
- **Placement**: `project/ ← environment/ ← app-management/ ← release/`. Features describe where an app runs with `AppRef` / `EnvironmentRef` (`appRefOf(placement)` in `app-management/queries/app-placement.ts`, `environmentRefOf` in `environment/entities/`); how that maps to a Kubernetes namespace is private to the runtime adapter (`src/modules/runtime/adapters/kubernetes/environment/namespace-name.ts`). `EnvironmentRuntime` provisions an environment on create and on every deploy, and removes it with the environment.
```

- [ ] **Step 7: Verify everything**

Run: `pnpm --filter api typecheck && pnpm --filter api lint && pnpm --filter api test && pnpm --filter web test`
Then: `grep -rn "modules/kubernetes\|namespaceOf" apps/api/src/app` — Expected: nothing.

- [ ] **Step 8: Format, commit**

```bash
pnpm exec prettier --write apps/api/src/app/environment apps/api/.claude/CLAUDE.md apps/web/app/components/ProjectEnvironmentPicker.vue apps/web/app/composables/__tests__
git add apps/api/src/app/environment apps/api/openapi.json apps/web/app/api apps/web/app/components/ProjectEnvironmentPicker.vue apps/web/app/composables/__tests__/useCreateEnvironment.nuxt.spec.ts apps/web/app/composables/__tests__/useEnvironmentList.nuxt.spec.ts apps/web/app/composables/__tests__/useProjectEnvironmentPicker.nuxt.spec.ts apps/api/.claude/CLAUDE.md
git commit -m "refactor!: provision environments through the runtime port" -m "- create/delete-environment use EnvironmentRuntime and EnvironmentRef
- The namespace field leaves the environment responses; web and contract regenerated

Refs #226

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Delete the old Kubernetes module, retire `DEPLOY_BACKEND`, add the import guardrails

**Files:**

- Delete: `apps/api/src/modules/kubernetes/` (whole directory)
- Modify: `apps/api/src/config/env.config.ts`, `apps/api/.env.test`, `apps/api/node.config.json`
- Modify: `apps/api/eslint.config.mjs`

**Interfaces:**

- Consumes: everything above.
- Produces: the lint rules later code must satisfy.

- [ ] **Step 1: Delete the old tree and prove nothing uses it**

```bash
git rm -r apps/api/src/modules/kubernetes
grep -rn "modules/kubernetes\|DeployBackend\|NamespaceBackend\|NodeBackend\|KubernetesModule\b" apps/api/src
```

Expected: `grep` prints nothing.

- [ ] **Step 2: Retire the old env var**

- `env.config.ts`: delete the `DEPLOY_BACKEND: …` line.
- `.env.test`: delete `DEPLOY_BACKEND=mock` (keep `MARSA_RUNTIME=mock`).
- `node.config.json`: delete the `"src/modules/kubernetes/mock-deploy-backend.ts"` exclusion.

- [ ] **Step 3: Add the guardrails**

In `apps/api/eslint.config.mjs`, extend the existing `no-restricted-imports` rule:

```js
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@kubernetes/client-node',
              message: 'Only the Kubernetes runtime adapter may talk to Kubernetes.',
            },
          ],
          patterns: [
            {
              group: ['./*', '../*'],
              message: 'Use absolute path imports (#src/* or #test/*) instead of relative paths.',
            },
          ],
        },
      ],
```

and add two config blocks after the rules block:

```js
  {
    files: ['src/modules/runtime/adapters/kubernetes/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['./*', '../*'],
              message: 'Use absolute path imports (#src/* or #test/*) instead of relative paths.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/app/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@kubernetes/client-node',
              message: 'Only the Kubernetes runtime adapter may talk to Kubernetes.',
            },
          ],
          patterns: [
            {
              group: ['./*', '../*'],
              message: 'Use absolute path imports (#src/* or #test/*) instead of relative paths.',
            },
            {
              group: ['#src/modules/runtime/adapters/*', '#src/modules/runtime/adapters/**'],
              message: 'Features depend on runtime ports, never on an adapter.',
            },
          ],
        },
      ],
    },
  },
```

Tests under `src/app/**` legitimately import `MockAppRuntime` / `MockEnvironmentRuntime` for stubs, so exempt test files from the adapter pattern by appending to the existing test-files block (`files: ['**/*.spec.ts', …, '**/*.test.ts', …]`):

```js
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['./*', '../*'],
              message: 'Use absolute path imports (#src/* or #test/*) instead of relative paths.',
            },
          ],
        },
      ],
```

Place that test-files block **after** the `src/app/**` block so it wins for `*.test.ts` (flat config: later blocks override).

- [ ] **Step 4: Prove the guardrails bite**

```bash
printf "import { KubernetesAppRuntime } from '#src/modules/runtime/adapters/kubernetes/kubernetes-app-runtime.js'\nexport const probe = KubernetesAppRuntime\n" > apps/api/src/app/cluster/probe.ts
pnpm --filter api lint; echo "exit=$?"
rm apps/api/src/app/cluster/probe.ts
```

Expected: lint fails on `probe.ts` with "Features depend on runtime ports, never on an adapter." and `exit=1`. The probe file is removed afterwards.

- [ ] **Step 5: Full verification**

Run: `pnpm --filter api typecheck && pnpm --filter api lint && pnpm --filter api test && pnpm --filter web test && pnpm format:check`
Expected: all green, api coverage floors met.

- [ ] **Step 6: Commit**

```bash
pnpm exec prettier --write apps/api/eslint.config.mjs apps/api/src/config/env.config.ts apps/api/node.config.json
git add apps/api/eslint.config.mjs apps/api/src/config/env.config.ts apps/api/.env.test apps/api/node.config.json
git commit -m "refactor: remove the kubernetes module and guard the runtime boundary" -m "- Old DeployBackend/NamespaceBackend/NodeBackend seams deleted; MARSA_RUNTIME replaces DEPLOY_BACKEND
- Lint: only the kubernetes adapter imports the client, features never import adapters

Refs #226

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Rules, docs, AgDR

**Files:**

- Create: `.claude/rules/api/runtime.md`
- Modify: `.claude/rules/api/module-wiring.md` (the "Share a support service through its own exporting module" example), `.claude/rules/api/service.md`
- Modify: `apps/api/.claude/CLAUDE.md` (feature-boundary bullet; source-layout line for `src/modules/`)
- Modify: `.claude/CLAUDE.md` (the "Running the FE locally" paragraph), `docs/local-dev.md` (lines 8–21)
- Create: `docs/agdr/AgDR-0046-runtime-port-and-adapters.md`
- Modify: `docs/agdr/AgDR-0045-node-pin-placement-model.md` (§ Consequences pointer)

**Interfaces:** none (docs only).

- [ ] **Step 1: `runtime.md`**

````markdown
---
paths:
  - 'apps/api/src/modules/runtime/**'
---

# Runtime ports and adapters

`src/modules/runtime/` is where Marsa meets whatever runs its apps. The abstract classes
(`AppRuntime`, `EnvironmentRuntime`, `NodeRuntime`) are **ports**; `adapters/<tech>/` are
**adapters**. AgDR-0046.

## Ports speak Marsa, not the runtime

```ts
// WRONG — the port leaks Kubernetes
abstract apply(namespace: string, manifests: RenderedManifests): Promise<void>

// RIGHT — the adapter decides what an environment and a deploy become
abstract deploy(app: AppRef, spec: AppDeploySpec): Promise<void>
```
````

Why: a port shaped like one technology can only ever have that technology behind it.

## Only an adapter imports its client library

`@kubernetes/client-node` is imported under `adapters/kubernetes/**` and nowhere else; lint
enforces it. Rendering, namespace naming and rollout parsing live in the adapter.

## Features never import an adapter

`src/app/**` imports `#src/modules/runtime/*` only. Lint enforces it; tests may import the mock
adapter to stub it.

## Adding an adapter

One folder under `adapters/`, one `@Global()` module binding all three ports, one
`ConditionalModule.registerWhen` line in `runtime.module.ts`, one value in the
`MARSA_RUNTIME` validation in `src/config/env.config.ts`.

## A capability the runtime lacks throws

An adapter that cannot do something (scale-to-zero, node pinning) throws a clear error. Do not
remove the capability from the port to fit the weakest adapter.

`````

- [ ] **Step 2: `module-wiring.md`, `service.md`, api `CLAUDE.md`**

`module-wiring.md` — replace the `KubernetesModule` example under "Share a support service through its own exporting module" with:

````markdown
```ts
// WRONG — the provider re-listed in every use-case module that needs it
@Module({ providers: [ViewAppHealthUseCase, AppRuntime] })

// RIGHT — one @Global adapter module binds the port; RuntimeModule picks it on MARSA_RUNTIME
@Global()
@Module({
  providers: [{ provide: AppRuntime, useClass: MockAppRuntime }],
  exports: [AppRuntime],
})
export class MockRuntimeModule {}

// then, in the use-case module: nothing to import — inject AppRuntime
@Module({ controllers: [/* … */], providers: [ViewAppHealthUseCase] })
`````

````

and change the "Why" sentence's example to "(here: the Kubernetes adapter vs the mock adapter under `MARSA_RUNTIME=mock`)".

`service.md` — add a section before "Known deviations":

```markdown
## A service never crosses features

Another feature may import your `entities/`, `queries/`, `enums/`, `errors/` and `events/` —
never your `services/`. If two features need the same behaviour, it is either a pure function
in a building-block folder (e.g. `release/entities/release-deploy-spec.ts`) or support code in
`src/modules/`.
```

api `CLAUDE.md` — replace the "**Shared building blocks are the only cross-feature seam.**" bullet with:

```markdown
- **Shared building blocks are the only cross-feature seam.** A feature may import another feature's `entities/` (tables included), `queries/`, `enums/`, `errors/` and `events/` — in either direction. Never its `services/`, repositories, use-cases, commands or responses. Behaviour two features need is a pure function in a building-block folder or support code in `src/modules/`.
```

and extend the `src/modules/` source-layout bullet with: "`src/modules/runtime/` holds the runtime ports and their adapters (`.claude/rules/api/runtime.md`)."

- [ ] **Step 3: Local-dev docs**

In `docs/local-dev.md` and `.claude/CLAUDE.md`, replace `MockDeployBackend` with "the mock runtime adapter" and `DEPLOY_BACKEND=mock` with `MARSA_RUNTIME=mock`. Leave the commands unchanged.

- [ ] **Step 4: AgDR-0046**

`docs/agdr/AgDR-0046-runtime-port-and-adapters.md`:

```markdown
# Runtime port and adapters

> In the context of Marsa's Kubernetes-shaped deploy seam, facing a support module fed feature-built Kubernetes objects and a service imported across features, I decided to model the runtime as Marsa-owned ports with per-technology adapters to achieve a seam another runtime could implement, accepting that only the Kubernetes and mock adapters exist.

## Context

`DeployBackend` was abstract but took rendered Kubernetes objects; rendering lived in `release/render/`, `namespaceOf` in `environment/entities/`, and `app-management/update-app` imported `release/services/ApplyReleaseService`. #226 asked for a structural review; #229 asked whether a non-Kubernetes backend could fit.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| Ports and adapters, rendering behind the port | Features speak Marsa; one folder per technology; answers #229 | Largest diff; every consumer changes |
| Move files, keep the Kubernetes-shaped seam | Smaller diff | The port still speaks Kubernetes; #229 stays hard |
| Folder reorganisation only | Cheapest | Keeps the support-module-imports-feature smell |
| Allow cross-feature service imports | No code change | Normalises coupling the boundary rule exists to stop |
| Also build a Docker adapter | Proves the port | YAGNI; no one needs it |

## Decision

Chosen: **ports and adapters** — `AppRuntime`, `EnvironmentRuntime`, `NodeRuntime` in `src/modules/runtime/`, adapters under `adapters/kubernetes/` and `adapters/mock/`, one loaded by `RuntimeModule` via `ConditionalModule` on `MARSA_RUNTIME`. `ApplyReleaseService` is replaced by the pure `deploySpecOf()`; features may import each other's building blocks in either direction, never services.

## Consequences

- Only `adapters/kubernetes/**` imports `@kubernetes/client-node`; features never import adapters (lint-enforced).
- `namespace` left the environment API responses.
- `DEPLOY_BACKEND=direct|mock` became `MARSA_RUNTIME=kubernetes|mock`.
- An adapter lacking a capability throws; the port is not shrunk.
- #229 closes: the architecture exists; fitting Docker (scale-to-zero, socket security) is unproven by design.

## Artifacts

- Spec: `docs/superpowers/specs/2026-09-22-runtime-port-and-transactions-design.md`
- #226, #229
```

In `AgDR-0045-node-pin-placement-model.md` § Consequences, append one bullet: `- Where the re-apply service lives was settled by AgDR-0046: it no longer exists; update-app calls AppRuntime.deploy with deploySpecOf.`

- [ ] **Step 5: Verify and commit**

```bash
pnpm exec prettier --write .claude/rules/api/runtime.md .claude/rules/api/module-wiring.md .claude/rules/api/service.md apps/api/.claude/CLAUDE.md .claude/CLAUDE.md docs/local-dev.md docs/agdr/AgDR-0046-runtime-port-and-adapters.md docs/agdr/AgDR-0045-node-pin-placement-model.md
pnpm format:check
git add .claude/rules/api/runtime.md .claude/rules/api/module-wiring.md .claude/rules/api/service.md apps/api/.claude/CLAUDE.md .claude/CLAUDE.md docs/local-dev.md docs/agdr/AgDR-0046-runtime-port-and-adapters.md docs/agdr/AgDR-0045-node-pin-placement-model.md
git commit -m "docs: record the runtime port and the cross-feature import rule" -m "- AgDR-0046, a path-scoped runtime rule, and updated boundary/service/module-wiring rules
- Local-dev docs name MARSA_RUNTIME and the mock runtime adapter

Refs #226

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## After the tasks (orchestrator, not a build agent)

1. Full local CI: `pnpm format:check && pnpm lint && pnpm --filter api typecheck && pnpm --filter web typecheck && pnpm build:web && pnpm --filter api test && pnpm --filter web test`.
2. Push, open the PR `refactor(#226): runtime port and adapters`, body with narrative Summary, Testing, the API-contract note (`namespace` removed), `Closes #226`, and a Glossary.
3. Label `preview`, read the image tag from the CD run, dispatch E2E on it (`scripts/e2e-test.sh` derives `APPS_NS` itself, so it needs no change).
4. Rex review → per-PR CEO approval → merge. Then close #229 with a link to AgDR-0046.
````
