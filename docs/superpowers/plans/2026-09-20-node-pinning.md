# Node Pinning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator pin an app to a set of nodes via `nodeAffinity`, choosing those nodes from a live cluster node list in the web UI.

**Architecture:** A nullable `node_pin` jsonb column on `app` (never snapshotted onto `release`, because placement is location rather than config) feeds a shared `buildNodeAffinity` helper that `renderManifests` emits into the Deployment. Changing the pin re-applies the live release immediately instead of waiting for a deploy. A new `GET /v1/nodes` endpoint reads nodes live from the cluster through a `NodeBackend` seam mirroring the existing `NamespaceBackend` split.

**Tech Stack:** NestJS 11 on Fastify (ESM, Node 24), Drizzle ORM, `@kubernetes/client-node`, `node:test` + `expect` + `sinon`, Nuxt 4 + Nuxt UI + Vitest.

Spec: `docs/superpowers/specs/2026-09-20-node-pinning-design.md`. Ticket: marsa-cloud/marsa#143.

## Global Constraints

- Branch is `feature/143-node-pinning`, based on `feature/142-project-environment` (#218). Do **not** rebase onto `main`.
- Never hand-edit generated SQL under `apps/api/src/sql/drizzle/`. Generate with `pnpm --filter api db:generate`.
- Every new table/enum must be re-exported from `apps/api/src/sql/schema.ts` or drizzle-kit silently emits no migration.
- Multi-word Drizzle columns must be named explicitly: `jsonb('node_pin')`, never `nodePin: jsonb()`.
- One controller per use-case, one route per controller. Never hand-write an `operationId`.
- Every route declares `@Roles(...)` plus `@ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)`, `@ApiForbiddenResponse`, `@ApiUnauthorizedResponse`.
- After any controller/DTO change: `pnpm --filter api generate:openapi` then `pnpm --filter web generate:api`, and commit both. CI drift-checks them.
- Comments: absolute minimum, single line, why-not-what. No JSDoc on new code. See `.claude/rules/comments.md`.
- Format before every commit. The worktree has no `node_modules`; use the main checkout's binary: `/home/gomaa-zorin/Github/marsa-workspace/apexyard/workspace/marsa/node_modules/.bin/prettier --write <files>`. Never run repo-wide `pnpm format`.
- Never `git add -A` or `git add .`. Stage named files only.
- Coverage floors: api lines 80 / branches 75 / functions 75; web lines+statements 88 / branches 85 / functions 60. Never lower them.
- **Focused api test runs fail the coverage gate by design** (the gate rides `test:run`). Read the test result lines, not the exit code, and run the full `pnpm --filter api test` before committing.

## Flagged decision — read before Task 6

Apply-immediately requires `app-management/use-cases/update-app` to call `ApplyReleaseService`, which lives in `release/services/`. Today the two features cross only at `entities/`, the seam sanctioned by `apps/api/.claude/CLAUDE.md` § "Feature module boundaries". Importing a **service** across features is new.

This plan takes the smaller option: import `ApplyReleaseService` directly. The alternative is promoting it to `src/modules/deploy/apply-release.service.ts` as shared support. If review prefers the promotion, only Task 6's import path and `UpdateAppModule`'s import change — no logic moves.

---

### Task 1: AgDR for the placement model

**Files:**

- Create: `docs/agdr/AgDR-0045-node-pin-placement-model.md`

**Interfaces:**

- Consumes: nothing.
- Produces: nothing in code. Later tasks reference this AgDR number in the PR body.

- [ ] **Step 1: Write the AgDR**

Match the house format exactly — frontmatter, then the one-sentence decision summary, then sections.

```markdown
---
id: AgDR-0045
timestamp: 2026-09-20T00:00:00Z
agent: claude
model: claude-opus-5
trigger: user-prompt
status: accepted
ticket: marsa-cloud/marsa#143
---

# Node pin lives on the App, applied immediately, with node inventory read live

> In the context of node pinning (#143), facing a choice between snapshotting placement onto the immutable Release and resolving it live from the App, I decided to **store the pin on `app.node_pin` only, re-apply manifests immediately when it changes, and read cluster nodes live rather than persisting them**, to achieve placement that always reflects the operator's current intent, accepting that a rollback does not restore a previous pin and that `update-app` gains its first cluster call.

## Context

#179 made `Release` an immutable config snapshot that rollback restores. #142 established that an
app's namespace is derived at apply time from the app's _current_ environment — `ApplyReleaseService.apply()`
takes an `AppPlacement` alongside the release. Node pinning had to choose a side of that line.

Nodes join the cluster by a k3s command run on the VPS; nothing informs Marsa.

## Options Considered

| Option                        | Pros                                                          | Cons                                                                                       |
| ----------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Pin on App + Release snapshot | Rollback reproduces the pin exactly                           | Rollback onto a drained node deepens an outage; contradicts how namespace already resolves |
| Pin on App only               | Matches namespace resolution; rollback uses today's placement | `hasUndeployedChanges` cannot see the pin, so it must apply immediately                    |
| Pin on Release only           | Simplest schema                                               | Operator re-pins on every deploy                                                           |
| Persist node inventory        | Node metadata Marsa owns                                      | Stale the moment a node joins or is drained; dropdown offers dead nodes                    |
| Read nodes live               | Cannot drift                                                  | Needs cluster-scoped RBAC; a cluster read per picker load                                  |

## Decision

Chosen: **pin on App only, applied immediately, node inventory read live**, because placement is
location rather than config, and the codebase already resolves location at apply time. Applying
immediately is what keeps the app row and the cluster from diverging behind a change-detection
check that structurally cannot see the pin.

## Consequences

- A rollback restores the old image and env, not the old pin. Documented in the spec and the ticket.
- `UpdateAppUseCase` gains a cluster call — its first. It stays outside any DB transaction (#214).
- The api ServiceAccount needs `nodes: [get, list]`, a marsa-charts change.
- Node pools (`marsa.cc/pool`) need no schema change later; the key is already free-form.

## Artifacts

- Spec: `docs/superpowers/specs/2026-09-20-node-pinning-design.md`
- Plan: `docs/superpowers/plans/2026-09-20-node-pinning.md`
```

- [ ] **Step 2: Format and commit**

```bash
/home/gomaa-zorin/Github/marsa-workspace/apexyard/workspace/marsa/node_modules/.bin/prettier --write docs/agdr/AgDR-0045-node-pin-placement-model.md
git add docs/agdr/AgDR-0045-node-pin-placement-model.md
git commit -m "docs: AgDR-0045 node pin placement model (#143)"
```

---

### Task 2: `PinStrategy` enum and `NodePin` entity with validation

**Files:**

- Create: `apps/api/src/app/app-management/enums/pin-strategy.enum.ts`
- Create: `apps/api/src/app/app-management/entities/node-pin.constants.ts`
- Create: `apps/api/src/app/app-management/entities/node-pin.ts`
- Test: `apps/api/src/app/app-management/entities/tests/node-pin.unit.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `enum PinStrategy { Required = 'required', Preferred = 'preferred' }`
  - `PinStrategyApiProperty(options?: ApiPropertyOptions): PropertyDecorator`
  - `class NodePin { key: string; values: string[]; strategy: PinStrategy }` — a decorated class usable both as the stored jsonb type and as a nested command DTO.
  - `NODE_LABEL_KEY_PATTERN`, `NODE_LABEL_VALUE_PATTERN`, `MAX_NODE_PIN_VALUES`, `HOSTNAME_LABEL_KEY`.

- [ ] **Step 1: Write the failing test**

`apps/api/src/app/app-management/entities/tests/node-pin.unit.test.ts`:

```ts
import { describe, it } from 'node:test'
import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { expect } from 'expect'
import { NodePin } from '#src/app/app-management/entities/node-pin.js'
import { PinStrategy } from '#src/app/app-management/enums/pin-strategy.enum.js'

const validate = (value: unknown) =>
  validateSync(plainToInstance(NodePin, value)).flatMap((error) =>
    Object.keys(error.constraints ?? {}).map((key) => `${error.property}:${key}`),
  )

describe('NodePin', () => {
  it('accepts a hostname pin', () => {
    expect(
      validate({
        key: 'kubernetes.io/hostname',
        values: ['node-a', 'node-b'],
        strategy: PinStrategy.Required,
      }),
    ).toEqual([])
  })

  it('accepts a prefixed pool label', () => {
    expect(
      validate({ key: 'marsa.cc/pool', values: ['gpu'], strategy: PinStrategy.Preferred }),
    ).toEqual([])
  })

  it('rejects a malformed key', () => {
    expect(validate({ key: 'not a key', values: ['a'], strategy: PinStrategy.Required })).toContain(
      'key:matches',
    )
  })

  it('rejects an empty values list', () => {
    expect(
      validate({ key: 'kubernetes.io/hostname', values: [], strategy: PinStrategy.Required }),
    ).toContain('values:arrayMinSize')
  })

  it('rejects duplicate values', () => {
    expect(
      validate({
        key: 'kubernetes.io/hostname',
        values: ['node-a', 'node-a'],
        strategy: PinStrategy.Required,
      }),
    ).toContain('values:arrayUnique')
  })

  it('rejects an unknown strategy', () => {
    expect(
      validate({ key: 'kubernetes.io/hostname', values: ['node-a'], strategy: 'maybe' }),
    ).toContain('strategy:isEnum')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd apps/api && pnpm build && node --experimental-default-config-file --env-file=.env.test --test "src/app/app-management/entities/tests/node-pin.unit.test.ts"
```

Expected: build fails — `Cannot find module '#src/app/app-management/entities/node-pin.js'`.

- [ ] **Step 3: Write `pin-strategy.enum.ts`**

```ts
import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger'

export enum PinStrategy {
  Required = 'required',
  Preferred = 'preferred',
}

export const PinStrategyApiProperty = (options?: ApiPropertyOptions): PropertyDecorator =>
  ApiProperty({ ...options, enum: PinStrategy, enumName: 'PinStrategy' })
```

There is no `pgEnum` here: the strategy lives inside the `node_pin` jsonb, not in its own column.

- [ ] **Step 4: Write `node-pin.constants.ts`**

```ts
export const HOSTNAME_LABEL_KEY = 'kubernetes.io/hostname'

export const MAX_NODE_PIN_VALUES = 32

// K8s label key: optional DNS-subdomain prefix, then a <=63-char name.
export const NODE_LABEL_KEY_PATTERN =
  /^([a-z0-9]([-a-z0-9.]*[a-z0-9])?\/)?[A-Za-z0-9]([-A-Za-z0-9_.]{0,61}[A-Za-z0-9])?$/

export const NODE_LABEL_VALUE_PATTERN = /^[A-Za-z0-9]([-A-Za-z0-9_.]{0,61}[A-Za-z0-9])?$/
```

- [ ] **Step 5: Write `node-pin.ts`**

```ts
import { ApiProperty } from '@nestjs/swagger'
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsString,
  Matches,
} from 'class-validator'
import {
  MAX_NODE_PIN_VALUES,
  NODE_LABEL_KEY_PATTERN,
  NODE_LABEL_VALUE_PATTERN,
} from '#src/app/app-management/entities/node-pin.constants.js'
import {
  PinStrategy,
  PinStrategyApiProperty,
} from '#src/app/app-management/enums/pin-strategy.enum.js'

export class NodePin {
  @ApiProperty({
    type: String,
    example: 'kubernetes.io/hostname',
    description: 'Node label key the pin matches on.',
  })
  @IsString()
  @Matches(NODE_LABEL_KEY_PATTERN, { message: 'key must be a valid Kubernetes label key' })
  key!: string

  @ApiProperty({
    type: [String],
    example: ['node-a', 'node-b'],
    description: 'Accepted label values; the pod may run on any node matching one of them.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_NODE_PIN_VALUES)
  @ArrayUnique()
  @Matches(NODE_LABEL_VALUE_PATTERN, {
    each: true,
    message: 'each value must be a valid Kubernetes label value',
  })
  values!: string[]

  @PinStrategyApiProperty({
    example: PinStrategy.Required,
    description: 'required keeps the pod Pending when no node matches; preferred places it anyway.',
  })
  @IsEnum(PinStrategy)
  strategy!: PinStrategy
}
```

- [ ] **Step 6: Run the test and confirm it passes**

```bash
cd apps/api && pnpm build && node --experimental-default-config-file --env-file=.env.test --test "src/app/app-management/entities/tests/node-pin.unit.test.ts"
```

Expected: 6 passing. Ignore the coverage-threshold failure on a focused run.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app/app-management/enums/pin-strategy.enum.ts apps/api/src/app/app-management/entities/node-pin.constants.ts apps/api/src/app/app-management/entities/node-pin.ts apps/api/src/app/app-management/entities/tests/node-pin.unit.test.ts
git commit -m "feat(#143): add NodePin entity and PinStrategy enum"
```

---

### Task 3: `node_pin` column, builder support, migration

**Files:**

- Modify: `apps/api/src/app/app-management/entities/app.table.ts`
- Modify: `apps/api/src/app/app-management/entities/app.builder.ts`
- Create (generated): `apps/api/src/sql/drizzle/<nnnn>_<name>.sql` + snapshot

**Interfaces:**

- Consumes: `NodePin` from Task 2.
- Produces: `App.nodePin: NodePin | null` on the inferred row type; `AppBuilder.withNodePin(nodePin: NodePin | null): this`.

- [ ] **Step 1: Add the column**

In `app.table.ts`, add the import and the column after `env`:

```ts
import type { NodePin } from '#src/app/app-management/entities/node-pin.js'
```

```ts
  env: jsonb().$type<Record<string, string>>().notNull().default({}),
  nodePin: jsonb('node_pin').$type<NodePin>(),
  imagePullCredentialsEnc: text('image_pull_credentials_enc'),
```

Nullable by omission — `null` means "schedule anywhere", which is the correct default for every existing row.

- [ ] **Step 2: Add the builder method**

In `app.builder.ts`, seed the default in the constructor object after `env: {},`:

```ts
      nodePin: null,
```

and add the method after `withEnv`:

```ts
  withNodePin(nodePin: NodePin | null): this {
    this.app.nodePin = nodePin
    return this
  }
```

with the type import:

```ts
import type { NodePin } from '#src/app/app-management/entities/node-pin.js'
```

- [ ] **Step 3: Generate the migration**

`app.table.ts` is already exported from `src/sql/schema.ts`, so no barrel change is needed.

```bash
pnpm --filter api db:generate
```

Expected: a new file under `apps/api/src/sql/drizzle/` containing `ALTER TABLE "app" ADD COLUMN "node_pin" jsonb;`. Read it to confirm — do not edit it.

- [ ] **Step 4: Verify the suite still passes**

```bash
pnpm --filter api test
```

Expected: all green. The new nullable column breaks nothing; `AppBuilder` now emits `nodePin: null`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app/app-management/entities/app.table.ts apps/api/src/app/app-management/entities/app.builder.ts apps/api/src/sql/drizzle/
git commit -m "feat(#143): add app.node_pin column"
```

---

### Task 4: `buildNodeAffinity` helper

**Files:**

- Create: `apps/api/src/app/release/render/node-affinity.ts`
- Test: `apps/api/src/app/release/render/tests/node-affinity.unit.test.ts`

**Interfaces:**

- Consumes: `NodePin`, `PinStrategy` from Task 2.
- Produces: `buildNodeAffinity(nodePin: NodePin | null): V1Affinity | undefined`. Task 5 calls it; #205's StatefulSet path is expected to call the same helper.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it } from 'node:test'
import { expect } from 'expect'
import { buildNodeAffinity } from '#src/app/release/render/node-affinity.js'
import { PinStrategy } from '#src/app/app-management/enums/pin-strategy.enum.js'

const pin = (strategy: PinStrategy) => ({
  key: 'kubernetes.io/hostname',
  values: ['node-a', 'node-b'],
  strategy,
})

describe('buildNodeAffinity', () => {
  it('returns undefined when unpinned', () => {
    expect(buildNodeAffinity(null)).toBeUndefined()
  })

  it('renders a required pin as a nodeSelectorTerm', () => {
    expect(buildNodeAffinity(pin(PinStrategy.Required))).toEqual({
      nodeAffinity: {
        requiredDuringSchedulingIgnoredDuringExecution: {
          nodeSelectorTerms: [
            {
              matchExpressions: [
                { key: 'kubernetes.io/hostname', operator: 'In', values: ['node-a', 'node-b'] },
              ],
            },
          ],
        },
      },
    })
  })

  it('renders a preferred pin as a weighted preference', () => {
    expect(buildNodeAffinity(pin(PinStrategy.Preferred))).toEqual({
      nodeAffinity: {
        preferredDuringSchedulingIgnoredDuringExecution: [
          {
            weight: 100,
            preference: {
              matchExpressions: [
                { key: 'kubernetes.io/hostname', operator: 'In', values: ['node-a', 'node-b'] },
              ],
            },
          },
        ],
      },
    })
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd apps/api && pnpm build && node --experimental-default-config-file --env-file=.env.test --test "src/app/release/render/tests/node-affinity.unit.test.ts"
```

Expected: build error — module not found.

- [ ] **Step 3: Write the helper**

```ts
import type { V1Affinity, V1NodeSelectorRequirement } from '@kubernetes/client-node'
import type { NodePin } from '#src/app/app-management/entities/node-pin.js'
import { PinStrategy } from '#src/app/app-management/enums/pin-strategy.enum.js'

// Single term, so the weight only has to be a legal 1-100 value.
const PREFERRED_WEIGHT = 100

export function buildNodeAffinity(nodePin: NodePin | null): V1Affinity | undefined {
  if (!nodePin) {
    return undefined
  }

  const matchExpressions: V1NodeSelectorRequirement[] = [
    { key: nodePin.key, operator: 'In', values: nodePin.values },
  ]

  if (nodePin.strategy === PinStrategy.Required) {
    return {
      nodeAffinity: {
        requiredDuringSchedulingIgnoredDuringExecution: {
          nodeSelectorTerms: [{ matchExpressions }],
        },
      },
    }
  }

  return {
    nodeAffinity: {
      preferredDuringSchedulingIgnoredDuringExecution: [
        { weight: PREFERRED_WEIGHT, preference: { matchExpressions } },
      ],
    },
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Same command as Step 2. Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app/release/render/node-affinity.ts apps/api/src/app/release/render/tests/node-affinity.unit.test.ts
git commit -m "feat(#143): render nodeAffinity from a NodePin"
```

---

### Task 5: `renderManifests` takes options and emits affinity

**Files:**

- Modify: `apps/api/src/app/release/render/render-manifests.ts`
- Modify: `apps/api/src/app/release/services/apply-release/apply-release.service.ts`
- Test: `apps/api/src/app/release/render/tests/render-manifests.unit.test.ts` (extend if it exists; create otherwise)

**Interfaces:**

- Consumes: `buildNodeAffinity` from Task 4.
- Produces: `renderManifests(options: RenderManifestsOptions): RenderedManifests` where

```ts
export interface RenderManifestsOptions {
  slug: string
  release: Release
  baseDomain: string
  credentials?: RegistryCredentials
  nodePin: NodePin | null
}
```

Every later caller uses this object form. The old positional signature is gone.

- [ ] **Step 1: Find every caller**

```bash
grep -rn "renderManifests(" apps/api/src --include="*.ts"
```

Expected: the definition, `apply-release.service.ts`, and any existing render tests. Note them — all must move to the object form in this task.

- [ ] **Step 2: Write the failing test**

Add to the render-manifests unit test file (create it with this content if absent):

```ts
import { describe, it } from 'node:test'
import { expect } from 'expect'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { PinStrategy } from '#src/app/app-management/enums/pin-strategy.enum.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import { renderManifests } from '#src/app/release/render/render-manifests.js'

const release = () => new ReleaseBuilder().withApp(new AppBuilder().build()).build()

describe('renderManifests node pinning', () => {
  it('omits affinity entirely when unpinned', () => {
    const { deployment } = renderManifests({
      slug: 'my-app',
      release: release(),
      baseDomain: 'example.com',
      nodePin: null,
    })

    expect(deployment.spec?.template.spec).not.toHaveProperty('affinity')
  })

  it('emits nodeAffinity when pinned', () => {
    const { deployment } = renderManifests({
      slug: 'my-app',
      release: release(),
      baseDomain: 'example.com',
      nodePin: {
        key: 'kubernetes.io/hostname',
        values: ['node-a'],
        strategy: PinStrategy.Required,
      },
    })

    expect(
      deployment.spec?.template.spec?.affinity?.nodeAffinity
        ?.requiredDuringSchedulingIgnoredDuringExecution?.nodeSelectorTerms[0]?.matchExpressions,
    ).toEqual([{ key: 'kubernetes.io/hostname', operator: 'In', values: ['node-a'] }])
  })
})
```

- [ ] **Step 3: Run it and confirm it fails**

```bash
cd apps/api && pnpm build && node --experimental-default-config-file --env-file=.env.test --test "src/app/release/render/tests/render-manifests.unit.test.ts"
```

Expected: a TypeScript error on the object argument — the function still takes positional params.

- [ ] **Step 4: Convert the signature**

In `render-manifests.ts`, add imports:

```ts
import type { NodePin } from '#src/app/app-management/entities/node-pin.js'
import { buildNodeAffinity } from '#src/app/release/render/node-affinity.js'
```

Replace the function head:

```ts
export interface RenderManifestsOptions {
  slug: string
  release: Release
  baseDomain: string
  credentials?: RegistryCredentials
  nodePin: NodePin | null
}

export function renderManifests({
  slug,
  release,
  baseDomain,
  credentials,
  nodePin,
}: RenderManifestsOptions): RenderedManifests {
  const name = slug
  const host = `${slug}.${baseDomain}`
  const labels = { app: name }
  const env = Object.entries(release.env).map(([key, value]) => ({ name: key, value }))
  const affinity = buildNodeAffinity(nodePin)
```

The rest of the body is unchanged except the pod spec, which gains the affinity spread alongside the existing `imagePullSecrets` spread:

```ts
        spec: {
          ...(affinity ? { affinity } : {}),
          ...(imagePullSecret?.metadata?.name
            ? { imagePullSecrets: [{ name: imagePullSecret.metadata.name }] }
            : {}),
```

A conditional spread rather than `affinity,` — emitting `affinity: undefined` would serialise a key that churns the server-side-apply field manager on every deploy.

- [ ] **Step 5: Update the caller**

In `apply-release.service.ts`, replace the render call:

```ts
const manifests = renderManifests({
  slug: app.slug,
  release,
  baseDomain: this.baseDomain,
  credentials,
  nodePin: app.nodePin,
})
```

`app` is already destructured from `AppPlacement` in `apply()`, so nothing else changes.

- [ ] **Step 6: Run the full api suite**

```bash
pnpm --filter api test
```

Expected: all green, including the two new render tests. Any other caller found in Step 1 must already be converted.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app/release/render/render-manifests.ts apps/api/src/app/release/render/tests/render-manifests.unit.test.ts apps/api/src/app/release/services/apply-release/apply-release.service.ts
git commit -m "feat(#143): emit nodeAffinity from renderManifests"
```

---

### Task 6: `create-app` accepts a pin

**Files:**

- Modify: `apps/api/src/app/app-management/use-cases/create-app/create-app.command.ts`
- Modify: `apps/api/src/app/app-management/use-cases/create-app/create-app.command.builder.ts`
- Modify: `apps/api/src/app/app-management/use-cases/create-app/create-app.use-case.ts`
- Modify: `apps/api/src/app/app-management/use-cases/create-app/create-app.response.ts`
- Test: `apps/api/src/app/app-management/use-cases/create-app/tests/create-app.e2e.test.ts`

**Interfaces:**

- Consumes: `NodePin` (Task 2), `AppBuilder.withNodePin` (Task 3).
- Produces: `CreateAppCommand.nodePin?: NodePin`, `CreateAppResponse.nodePin: NodePin | null`.

- [ ] **Step 1: Write the failing e2e assertion**

Add to `create-app.e2e.test.ts`:

```ts
it('stores a node pin', async () => {
  const response = await request(setup.httpServer)
    .post('/api/v1/apps')
    .set('Cookie', cookie)
    .send({
      environmentUuid: environment.uuid,
      slug: 'pinned-app',
      image: 'nginx:1.27',
      containerPort: 80,
      nodePin: {
        key: 'kubernetes.io/hostname',
        values: ['node-a'],
        strategy: 'required',
      },
    })
    .expect(201)

  expect(response.body.nodePin).toEqual({
    key: 'kubernetes.io/hostname',
    values: ['node-a'],
    strategy: 'required',
  })
})

it('rejects a malformed node pin', async () => {
  await request(setup.httpServer)
    .post('/api/v1/apps')
    .set('Cookie', cookie)
    .send({
      environmentUuid: environment.uuid,
      slug: 'bad-pin-app',
      image: 'nginx:1.27',
      containerPort: 80,
      nodePin: { key: 'not a key', values: [], strategy: 'required' },
    })
    .expect(400)
})
```

Match the existing file's `expect(201)` / status convention — read the neighbouring tests first and follow whatever status the create endpoint actually returns.

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd apps/api && pnpm build && node --experimental-default-config-file --env-file=.env.test --test "src/app/app-management/use-cases/create-app/tests/create-app.e2e.test.ts"
```

Expected: the first new test fails — `response.body.nodePin` is `undefined` (the field is stripped by the ValidationPipe's whitelist and never persisted).

- [ ] **Step 3: Add the command field**

In `create-app.command.ts`, add imports and the property at the end of the class:

```ts
import { NodePin } from '#src/app/app-management/entities/node-pin.js'
```

```ts
  @ApiPropertyOptional({
    type: NodePin,
    description: 'Restrict scheduling to nodes matching this label. Omit to schedule anywhere.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => NodePin)
  nodePin?: NodePin
```

`@ValidateNested()` + `@Type()` mirror the existing `imagePullCredentials` field — without both, the nested object passes validation unchecked.

- [ ] **Step 4: Add the builder method**

In `create-app.command.builder.ts`, follow the file's existing shape and add:

```ts
  withNodePin(nodePin: NodePin): this {
    this.command.nodePin = nodePin
    return this
  }
```

with the matching import.

- [ ] **Step 5: Persist it in the use-case**

In `create-app.use-case.ts`, add `.withNodePin(command.nodePin ?? null)` to the builder chain, after `.withEnv(...)`:

```ts
      .withEnv(command.env ?? {})
      .withNodePin(command.nodePin ?? null)
      .withImagePullCredentialsEnc(credentials ? this.credentialsCipher.seal(credentials) : null)
```

- [ ] **Step 6: Expose it on the response**

In `create-app.response.ts`, add the property and assignment, following the file's existing style:

```ts
  @ApiProperty({ type: NodePin, nullable: true })
  readonly nodePin: NodePin | null
```

```ts
this.nodePin = app.nodePin
```

`nullable: true` matters — without it the generated web Zod schema rejects `null` and the frontend throws at the boundary for every unpinned app.

- [ ] **Step 7: Run the test and confirm it passes**

Same command as Step 2. Expected: both new tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/app/app-management/use-cases/create-app/
git commit -m "feat(#143): accept a node pin on create-app"
```

---

### Task 7: `update-app` accepts a pin and applies it immediately

**Files:**

- Modify: `apps/api/src/app/app-management/use-cases/update-app/update-app.command.ts`
- Modify: `apps/api/src/app/app-management/use-cases/update-app/update-app.repository.ts`
- Modify: `apps/api/src/app/app-management/use-cases/update-app/update-app.use-case.ts`
- Modify: `apps/api/src/app/app-management/use-cases/update-app/update-app.response.ts`
- Modify: `apps/api/src/app/app-management/use-cases/update-app/update-app.module.ts`
- Test: `apps/api/src/app/app-management/use-cases/update-app/tests/update-app.use-case.unit.test.ts`
- Test: `apps/api/src/app/app-management/use-cases/update-app/tests/update-app.e2e.test.ts`

**Interfaces:**

- Consumes: `NodePin`, `ApplyReleaseService`, `selectAppPlacement`, `DeployBackend`, `namespaceOf`.
- Produces: `UpdateAppCommand.nodePin?: NodePin | null`, `UpdateAppResponse.nodePin: NodePin | null`, `UpdateAppRepository.findPlacementBySlug(slug)`, `UpdateAppRepository.findRelease(uuid, appUuid)`.

Read the **Flagged decision** section at the top of this plan before starting.

- [ ] **Step 1: Write the failing unit tests**

Append to `update-app.use-case.unit.test.ts`, following the file's existing stub setup:

```ts
it('re-applies the live release when the pin changes', async () => {
  const app = new AppBuilder().withSlug(SLUG).withNodePin(PIN).build()
  repository.updateBySlug.resolves(app)
  repository.findPlacementBySlug.resolves(placement)
  deployBackend.readLiveReleaseUuid.resolves(release.uuid)
  repository.findRelease.resolves(release)

  await usecase.execute(SLUG, { nodePin: PIN })

  expect(applyRelease.apply.calledOnceWith(placement, release)).toBe(true)
})

it('makes no cluster call when the pin is absent from the command', async () => {
  repository.updateBySlug.resolves(new AppBuilder().withSlug(SLUG).build())

  await usecase.execute(SLUG, { image: 'nginx:1.28' })

  expect(deployBackend.readLiveReleaseUuid.called).toBe(false)
  expect(applyRelease.apply.called).toBe(false)
})

it('stores the pin without applying when nothing is deployed', async () => {
  repository.updateBySlug.resolves(new AppBuilder().withSlug(SLUG).withNodePin(PIN).build())
  repository.findPlacementBySlug.resolves(placement)
  deployBackend.readLiveReleaseUuid.resolves(null)

  await usecase.execute(SLUG, { nodePin: PIN })

  expect(applyRelease.apply.called).toBe(false)
})

it('keeps the stored pin when the apply fails', async () => {
  const app = new AppBuilder().withSlug(SLUG).withNodePin(PIN).build()
  repository.updateBySlug.resolves(app)
  repository.findPlacementBySlug.resolves(placement)
  deployBackend.readLiveReleaseUuid.resolves(release.uuid)
  repository.findRelease.resolves(release)
  applyRelease.apply.rejects(new Error('cluster unreachable'))

  const response = await usecase.execute(SLUG, { nodePin: PIN })

  expect(response.nodePin).toEqual(PIN)
})
```

Declare the shared fixtures near the top of the describe block:

```ts
const PIN = {
  key: 'kubernetes.io/hostname',
  values: ['node-a'],
  strategy: PinStrategy.Required,
}
```

and build `placement` / `release` with the existing builders, stubbing `ApplyReleaseService` and `DeployBackend` via `createStubInstance`.

- [ ] **Step 2: Run them and confirm they fail**

```bash
cd apps/api && pnpm build && node --experimental-default-config-file --env-file=.env.test --test "src/app/app-management/use-cases/update-app/tests/update-app.use-case.unit.test.ts"
```

Expected: compile error — the use-case constructor takes two arguments and the repository has no `findPlacementBySlug`.

- [ ] **Step 3: Add the command field**

In `update-app.command.ts`:

```ts
import { NodePin } from '#src/app/app-management/entities/node-pin.js'
```

```ts
  @ApiPropertyOptional({
    type: NodePin,
    nullable: true,
    description: 'Send null to clear the pin; omit to leave it unchanged.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => NodePin)
  nodePin?: NodePin | null
```

`@IsOptional()` treats an explicit `null` as absent for validation purposes while still delivering it to the use-case — which is exactly the clear-the-pin semantics, and mirrors how `imagePullCredentials` already distinguishes omitted from cleared.

- [ ] **Step 4: Extend the repository**

In `update-app.repository.ts`, add `nodePin` to the patch interface:

```ts
export interface AppConfigPatch {
  image?: string
  containerPort?: number
  minReplicas?: number
  maxReplicas?: number
  env?: Record<string, string>
  nodePin?: NodePin | null
  imagePullCredentialsEnc?: string | null
}
```

and add the two reads the re-apply needs:

```ts
  async findPlacementBySlug(slug: string): Promise<AppPlacement | undefined> {
    const [placement] = await selectAppPlacement(this.db).where(eq(appTable.slug, slug)).limit(1)
    return placement
  }

  async findRelease(uuid: ReleaseUuid, appUuid: AppUuid): Promise<Release | undefined> {
    const [release] = await this.db
      .select()
      .from(releaseTable)
      .where(and(eq(releaseTable.uuid, uuid), eq(releaseTable.appUuid, appUuid)))
      .limit(1)
    return release
  }
```

with imports for `and`, `selectAppPlacement`, `AppPlacement`, `releaseTable`, `Release`, `ReleaseUuid`, `AppUuid`. Scoping `findRelease` by `appUuid` as well as `uuid` is deliberate — it makes a release uuid read off the cluster unable to address another app's release.

- [ ] **Step 5: Rewrite the use-case**

```ts
import { Injectable, NotFoundException } from '@nestjs/common'
import type { App } from '#src/app/app-management/entities/app.table.js'
import { UpdateAppCommand } from '#src/app/app-management/use-cases/update-app/update-app.command.js'
import { UpdateAppRepository } from '#src/app/app-management/use-cases/update-app/update-app.repository.js'
import { UpdateAppResponse } from '#src/app/app-management/use-cases/update-app/update-app.response.js'
import { namespaceOf } from '#src/app/environment/entities/namespace.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import { ApplyReleaseService } from '#src/app/release/services/apply-release/apply-release.service.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'

// Writes App, then re-applies only when placement changed: the pin is location, not config, so it
// never reaches a Release and hasUndeployedChanges structurally cannot see it.
@Injectable()
export class UpdateAppUseCase {
  constructor(
    private readonly repository: UpdateAppRepository,
    private readonly credentialsCipher: ImagePullCredentialsCipher,
    private readonly deployBackend: DeployBackend,
    private readonly applyRelease: ApplyReleaseService,
  ) {}

  async execute(slug: string, command: UpdateAppCommand): Promise<UpdateAppResponse> {
    const updated = await this.repository.updateBySlug(slug, {
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

    if (command.nodePin !== undefined) {
      await this.reapply(updated)
    }

    return new UpdateAppResponse(updated)
  }

  private async reapply(app: App): Promise<void> {
    const placement = await this.repository.findPlacementBySlug(app.slug)
    if (!placement) {
      return
    }

    const liveUuid = await this.deployBackend.readLiveReleaseUuid(
      namespaceOf(placement.project, placement.environment),
      app.slug,
    )
    if (!liveUuid) {
      return
    }

    const release = await this.repository.findRelease(liveUuid as ReleaseUuid, app.uuid)
    if (release) {
      await this.applyRelease.apply(placement, release)
    }
  }

  private credentialsEnc(command: UpdateAppCommand): string | null | undefined {
    const credentials = command.imagePullCredentials
    return credentials ? this.credentialsCipher.seal(credentials) : credentials
  }
}
```

Note what is deliberately absent: no try/catch around `reapply`. The last unit test asserts the pin is still stored when the apply throws — and with the write already committed, letting the error surface as a 500 is the honest signal. If review wants a 200 with a warning field instead, that is a response-shape change, not a logic change.

- [ ] **Step 6: Expose it on the response**

In `update-app.response.ts`, add exactly as in Task 6 Step 6:

```ts
  @ApiProperty({ type: NodePin, nullable: true })
  readonly nodePin: NodePin | null
```

```ts
this.nodePin = app.nodePin
```

- [ ] **Step 7: Wire the module**

`update-app.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { UpdateAppController } from '#src/app/app-management/use-cases/update-app/update-app.controller.js'
import { UpdateAppRepository } from '#src/app/app-management/use-cases/update-app/update-app.repository.js'
import { UpdateAppUseCase } from '#src/app/app-management/use-cases/update-app/update-app.use-case.js'
import { ApplyReleaseModule } from '#src/app/release/services/apply-release/apply-release.module.js'
import { KubernetesModule } from '#src/modules/kubernetes/kubernetes.module.js'

@Module({
  imports: [ApplyReleaseModule, KubernetesModule],
  controllers: [UpdateAppController],
  providers: [UpdateAppUseCase, UpdateAppRepository],
})
export class UpdateAppModule {}
```

First check how `ApplyReleaseService` is currently provided:

```bash
grep -rn "ApplyReleaseService" apps/api/src --include="*.module.ts"
```

If it has no exporting module of its own, create `apply-release.module.ts` beside it that provides and exports it, and update the existing consumers to import that module rather than re-listing the provider — a re-listed provider gives each importer its own instance.

- [ ] **Step 8: Run the unit tests and confirm they pass**

Same command as Step 2. Expected: 4 new tests pass alongside the existing ones.

- [ ] **Step 9: Add the e2e coverage**

Append to `update-app.e2e.test.ts`:

```ts
it('sets and then clears the node pin', async () => {
  const set = await request(setup.httpServer)
    .patch(`/api/v1/apps/${SLUG}`)
    .set('Cookie', cookie)
    .send({
      nodePin: { key: 'kubernetes.io/hostname', values: ['node-a'], strategy: 'required' },
    })
    .expect(200)

  expect(set.body.nodePin).toEqual({
    key: 'kubernetes.io/hostname',
    values: ['node-a'],
    strategy: 'required',
  })

  const cleared = await request(setup.httpServer)
    .patch(`/api/v1/apps/${SLUG}`)
    .set('Cookie', cookie)
    .send({ nodePin: null })
    .expect(200)

  expect(cleared.body.nodePin).toBeNull()
})
```

The existing `patches only the sent fields` test asserts an exact response body with `toEqual`, so it will now fail on the added `nodePin` key — update its expected object to include `nodePin: null`.

- [ ] **Step 10: Run the full api suite**

```bash
pnpm --filter api test
```

Expected: all green.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/app/app-management/use-cases/update-app/ apps/api/src/app/release/services/apply-release/
git commit -m "feat(#143): apply a node pin change immediately"
```

---

### Task 8: expose the pin on the app detail read

**Files:**

- Modify: `apps/api/src/app/app-management/use-cases/view-app-detail/view-app-detail.response.ts`
- Test: `apps/api/src/app/app-management/use-cases/view-app-detail/tests/view-app-detail.e2e.test.ts`

**Interfaces:**

- Consumes: `NodePin`.
- Produces: `ViewAppDetailResponse.nodePin: NodePin | null` — the field the web form seeds from.

- [ ] **Step 1: Write the failing assertion**

In the e2e test, seed the app with `.withNodePin({ key: 'kubernetes.io/hostname', values: ['node-a'], strategy: PinStrategy.Required })` and assert the response carries it back. The existing exact-body assertions in this file must gain `nodePin` too.

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd apps/api && pnpm build && node --experimental-default-config-file --env-file=.env.test --test "src/app/app-management/use-cases/view-app-detail/tests/view-app-detail.e2e.test.ts"
```

Expected: `nodePin` is `undefined` in the body.

- [ ] **Step 3: Add the field**

Exactly as Task 6 Step 6 — `@ApiProperty({ type: NodePin, nullable: true })` plus `this.nodePin = app.nodePin` in the constructor. `ViewAppDetailResponse` already takes an `AppPlacement`, so read it off `placement.app`.

- [ ] **Step 4: Run and confirm it passes**

Same command. Expected: green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app/app-management/use-cases/view-app-detail/
git commit -m "feat(#143): return the node pin on app detail"
```

---

### Task 9: `NodeBackend` seam

**Files:**

- Create: `apps/api/src/modules/kubernetes/node-backend.ts`
- Create: `apps/api/src/modules/kubernetes/direct-node-backend.ts`
- Create: `apps/api/src/modules/kubernetes/mock-node-backend.ts`
- Modify: `apps/api/src/modules/kubernetes/kubernetes.module.ts`
- Test: `apps/api/src/modules/kubernetes/tests/direct-node-backend.unit.test.ts`

**Interfaces:**

- Consumes: `CoreV1Api`, `KubeConfig` from `@kubernetes/client-node`.
- Produces:
  - `interface ClusterNode { name: string; labels: Record<string, string>; ready: boolean }`
  - `abstract class NodeBackend { abstract listNodes(): Promise<ClusterNode[]> }`
  - `DirectNodeBackend`, `MockNodeBackend`, and a `NodeBackend` provider exported from `KubernetesModule`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it } from 'node:test'
import { expect } from 'expect'
import { toClusterNodes } from '#src/modules/kubernetes/direct-node-backend.js'

describe('toClusterNodes', () => {
  it('maps name, labels and readiness', () => {
    expect(
      toClusterNodes([
        {
          metadata: { name: 'node-a', labels: { 'kubernetes.io/hostname': 'node-a' } },
          status: { conditions: [{ type: 'Ready', status: 'True' }] },
        },
      ]),
    ).toEqual([{ name: 'node-a', labels: { 'kubernetes.io/hostname': 'node-a' }, ready: true }])
  })

  it('reports a node whose Ready condition is False as not ready', () => {
    expect(
      toClusterNodes([
        {
          metadata: { name: 'node-b' },
          status: { conditions: [{ type: 'Ready', status: 'False' }] },
        },
      ]),
    ).toEqual([{ name: 'node-b', labels: {}, ready: false }])
  })

  it('drops a node with no name', () => {
    expect(toClusterNodes([{ metadata: {}, status: {} }])).toEqual([])
  })
})
```

Mapping is exported as a pure function precisely so it is testable without a cluster or a mocked client.

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd apps/api && pnpm build && node --experimental-default-config-file --env-file=.env.test --test "src/modules/kubernetes/tests/direct-node-backend.unit.test.ts"
```

Expected: module not found.

- [ ] **Step 3: Write the abstract seam**

`node-backend.ts`:

```ts
export interface ClusterNode {
  name: string
  labels: Record<string, string>
  ready: boolean
}

export abstract class NodeBackend {
  abstract listNodes(): Promise<ClusterNode[]>
}
```

- [ ] **Step 4: Write the direct backend**

`direct-node-backend.ts`:

```ts
import { CoreV1Api, KubeConfig, type V1Node } from '@kubernetes/client-node'
import { Injectable } from '@nestjs/common'
import { type ClusterNode, NodeBackend } from '#src/modules/kubernetes/node-backend.js'

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
export class DirectNodeBackend extends NodeBackend {
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

- [ ] **Step 5: Write the mock backend**

`mock-node-backend.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { type ClusterNode, NodeBackend } from '#src/modules/kubernetes/node-backend.js'

// Fixed inventory so the cluster-free local loop (seed-dev) can render the node picker.
const NODES: ClusterNode[] = [
  { name: 'mock-node-a', labels: { 'kubernetes.io/hostname': 'mock-node-a' }, ready: true },
  { name: 'mock-node-b', labels: { 'kubernetes.io/hostname': 'mock-node-b' }, ready: false },
]

@Injectable()
export class MockNodeBackend extends NodeBackend {
  listNodes(): Promise<ClusterNode[]> {
    return Promise.resolve(NODES)
  }
}
```

One ready and one not-ready node is deliberate — the web picker's annotated state then has something to render locally. The label key is inlined rather than imported from `app-management/entities/node-pin.constants.js`: `src/modules/` is support infrastructure and must not depend on a feature slice.

- [ ] **Step 6: Wire the module**

In `kubernetes.module.ts`, add the provider beside the existing two and extend `exports`:

```ts
    {
      provide: NodeBackend,
      useFactory: (config: ConfigService) =>
        isMock(config) ? new MockNodeBackend() : new DirectNodeBackend(),
      inject: [ConfigService],
    },
```

```ts
  exports: [DeployBackend, NamespaceBackend, NodeBackend],
```

with the three new imports.

- [ ] **Step 7: Run the test and confirm it passes**

Same command as Step 2. Expected: 3 passing.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/kubernetes/node-backend.ts apps/api/src/modules/kubernetes/direct-node-backend.ts apps/api/src/modules/kubernetes/mock-node-backend.ts apps/api/src/modules/kubernetes/kubernetes.module.ts apps/api/src/modules/kubernetes/tests/direct-node-backend.unit.test.ts
git commit -m "feat(#143): add a NodeBackend seam for live cluster node reads"
```

---

### Task 10: `GET /v1/nodes`

**Files:**

- Create: `apps/api/src/app/cluster/cluster.module.ts`
- Create: `apps/api/src/app/cluster/use-cases/view-node-index/view-node-index.module.ts`
- Create: `apps/api/src/app/cluster/use-cases/view-node-index/view-node-index.controller.ts`
- Create: `apps/api/src/app/cluster/use-cases/view-node-index/view-node-index.use-case.ts`
- Create: `apps/api/src/app/cluster/use-cases/view-node-index/view-node-index.response.ts`
- Create: `apps/api/src/app/cluster/use-cases/view-node-index/tests/view-node-index.e2e.test.ts`
- Modify: `apps/api/src/modules/api/api.module.ts`

**Interfaces:**

- Consumes: `NodeBackend`, `ClusterNode` (Task 9).
- Produces: `GET /api/v1/nodes` → `{ items: NodeSummary[] }`, `operationId: viewNodeIndexV1`. The web's `useNodeList` (Task 13) consumes it.

A new feature folder is justified: a node is a cluster-level live read owned by no existing aggregate. There is no repository — the cluster, not Postgres, is the source.

- [ ] **Step 1: Write the failing e2e test**

```ts
import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('GET /api/v1/nodes (e2e)', () => {
  let setup: TestSetup
  let cookie: string

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    cookie = await setup.authenticate()
  })

  after(async () => {
    await setup.teardown()
  })

  it('lists the cluster nodes', async () => {
    const response = await request(setup.httpServer)
      .get('/api/v1/nodes')
      .set('Cookie', cookie)
      .expect(200)

    expect(response.body.items).toEqual([
      { name: 'mock-node-a', labels: { 'kubernetes.io/hostname': 'mock-node-a' }, ready: true },
      { name: 'mock-node-b', labels: { 'kubernetes.io/hostname': 'mock-node-b' }, ready: false },
    ])
  })

  it('rejects an unauthenticated request', async () => {
    await request(setup.httpServer).get('/api/v1/nodes').expect(401)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd apps/api && pnpm build && node --experimental-default-config-file --env-file=.env.test --test "src/app/cluster/use-cases/view-node-index/tests/view-node-index.e2e.test.ts"
```

Expected: 404 — the route does not exist.

- [ ] **Step 3: Write the response DTO**

```ts
import { ApiProperty } from '@nestjs/swagger'
import type { ClusterNode } from '#src/modules/kubernetes/node-backend.js'

export class NodeSummary {
  @ApiProperty({ type: String, example: 'node-a' })
  readonly name: string

  @ApiProperty({
    type: Object,
    additionalProperties: { type: 'string' },
    example: { 'kubernetes.io/hostname': 'node-a' },
  })
  readonly labels: Record<string, string>

  @ApiProperty({ type: Boolean, example: true })
  readonly ready: boolean

  constructor(node: ClusterNode) {
    this.name = node.name
    this.labels = node.labels
    this.ready = node.ready
  }
}

export class ViewNodeIndexResponse {
  @ApiProperty({ type: [NodeSummary] })
  readonly items: NodeSummary[]

  constructor(nodes: ClusterNode[]) {
    this.items = nodes.map((node) => new NodeSummary(node))
  }
}
```

Not paginated, and deliberately not extending `PaginatedKeysetResponse`: node counts are single-digit and there is no cursor to seek on.

- [ ] **Step 4: Write the use-case**

```ts
import { Injectable } from '@nestjs/common'
import { ViewNodeIndexResponse } from '#src/app/cluster/use-cases/view-node-index/view-node-index.response.js'
import { NodeBackend } from '#src/modules/kubernetes/node-backend.js'

@Injectable()
export class ViewNodeIndexUseCase {
  constructor(private readonly nodes: NodeBackend) {}

  async execute(): Promise<ViewNodeIndexResponse> {
    return new ViewNodeIndexResponse(await this.nodes.listNodes())
  }
}
```

- [ ] **Step 5: Write the controller**

```ts
import { Controller, Get } from '@nestjs/common'
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { ViewNodeIndexResponse } from '#src/app/cluster/use-cases/view-node-index/view-node-index.response.js'
import { ViewNodeIndexUseCase } from '#src/app/cluster/use-cases/view-node-index/view-node-index.use-case.js'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('cluster')
@Controller({ path: 'nodes', version: '1' })
export class ViewNodeIndexController {
  constructor(private readonly usecase: ViewNodeIndexUseCase) {}

  @Get()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiOkResponse({ type: ViewNodeIndexResponse })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(): Promise<ViewNodeIndexResponse> {
    return this.usecase.execute()
  }
}
```

- [ ] **Step 6: Write the two modules**

`view-node-index.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { ViewNodeIndexController } from '#src/app/cluster/use-cases/view-node-index/view-node-index.controller.js'
import { ViewNodeIndexUseCase } from '#src/app/cluster/use-cases/view-node-index/view-node-index.use-case.js'
import { KubernetesModule } from '#src/modules/kubernetes/kubernetes.module.js'

@Module({
  imports: [KubernetesModule],
  controllers: [ViewNodeIndexController],
  providers: [ViewNodeIndexUseCase],
})
export class ViewNodeIndexModule {}
```

`cluster.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { ViewNodeIndexModule } from '#src/app/cluster/use-cases/view-node-index/view-node-index.module.js'

@Module({
  imports: [ViewNodeIndexModule],
})
export class ClusterModule {}
```

- [ ] **Step 7: Register the feature**

In `api.module.ts`, add `ClusterModule` to the `AppModule.forRoot([...])` array and its import.

- [ ] **Step 8: Run the test and confirm it passes**

Same command as Step 2. Expected: both tests pass.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/app/cluster/ apps/api/src/modules/api/api.module.ts
git commit -m "feat(#143): add GET /v1/nodes"
```

---

### Task 11: regenerate the OpenAPI contract and the web client

**Files:**

- Modify: `apps/api/openapi.json`
- Modify: `apps/web/app/api/types.gen.ts`, `apps/web/app/api/zod.gen.ts` (and any sibling generated file)

**Interfaces:**

- Consumes: every DTO change from Tasks 6–10.
- Produces: `NodePin`, `PinStrategy`, `NodeSummary`, `ViewNodeIndexResponse` types plus `zViewNodeIndexResponse` for the web.

- [ ] **Step 1: Regenerate both**

```bash
pnpm --filter api generate:openapi
pnpm --filter web generate:api
```

- [ ] **Step 2: Verify the generated surface**

```bash
grep -n "NodePin\|PinStrategy\|viewNodeIndexV1" apps/api/openapi.json | head -20
grep -n "NodePin\|PinStrategy\|ViewNodeIndexResponse" apps/web/app/api/types.gen.ts | head -20
```

Expected: `PinStrategy` appears as a **named** schema, not an inline union — an anonymous union means `PinStrategyApiProperty` lost its `enumName`. `nodePin` must be nullable everywhere it appears.

- [ ] **Step 3: Commit**

```bash
git add apps/api/openapi.json apps/web/app/api/
git commit -m "chore(#143): regenerate the API contract and web client"
```

---

### Task 12: `useNodeList` composable

**Files:**

- Create: `apps/web/app/composables/useNodeList.ts`
- Test: `apps/web/app/composables/__tests__/useNodeList.nuxt.spec.ts`

**Interfaces:**

- Consumes: `zViewNodeIndexResponse` from Task 11.
- Produces: `useNodeList(): { list(): Promise<NodeSummary[]> }` — consumed by Task 13.

- [ ] **Step 1: Write the failing test**

`apps/web/app/composables/__tests__/useNodeList.nuxt.spec.ts` — the suffix must be `.nuxt.spec.ts`, which is what selects the Nuxt runtime environment:

```ts
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import { useNodeList } from '../useNodeList'

const node = {
  name: 'node-a',
  labels: { 'kubernetes.io/hostname': 'node-a' },
  ready: true,
}

registerEndpoint('/api/v1/nodes', {
  method: 'GET',
  handler: () => ({ items: [node] }),
})

describe('useNodeList.list', () => {
  it('returns the cluster nodes', async () => {
    expect(await useNodeList().list()).toEqual([node])
  })
})
```

This follows `useEnvironmentList.nuxt.spec.ts` exactly: `registerEndpoint` against the real `/api` path, then a direct call — no `$api` mocking.

- [ ] **Step 2: Run it and confirm it fails**

```bash
pnpm --filter web test -- useNodeList
```

Expected: module not found.

- [ ] **Step 3: Write the composable**

```ts
import type { NodeSummary } from '~/api/types.gen'
import { zViewNodeIndexResponse } from '~/api/zod.gen'

export function useNodeList() {
  const { $api } = useNuxtApp()

  async function list(): Promise<NodeSummary[]> {
    return zViewNodeIndexResponse.parse(await $api('/v1/nodes')).items
  }

  return { list }
}
```

- [ ] **Step 4: Run and confirm it passes**

Same command. Expected: green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/composables/useNodeList.ts apps/web/app/composables/__tests__/useNodeList.spec.ts
git commit -m "feat(#143): add useNodeList composable"
```

---

### Task 13: `NodePinPicker` component

**Files:**

- Create: `apps/web/app/components/NodePinPicker.vue`
- Test: `apps/web/app/components/__tests__/NodePinPicker.nuxt.spec.ts`

**Interfaces:**

- Consumes: `useNodeList` (Task 12), `NodePin` type (Task 11).
- Produces: a component with `defineModel<NodePin | null>()` and a `maxReplicas?: number` prop. Tasks 14 and 15 mount it.

- [ ] **Step 1: Write the failing component test**

`apps/web/app/components/__tests__/NodePinPicker.nuxt.spec.ts`:

```ts
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import NodePinPicker from '../NodePinPicker.vue'

const list = vi.hoisted(() => vi.fn())
mockNuxtImport('useNodeList', () => () => ({ list }))

const flush = () => new Promise((resolve) => setTimeout(resolve))

const mount = (props: { modelValue: unknown; maxReplicas?: number }) =>
  mountSuspended(NodePinPicker, { props })

beforeEach(() => {
  list.mockReset().mockResolvedValue([
    { name: 'node-a', labels: { 'kubernetes.io/hostname': 'node-a' }, ready: true },
    { name: 'node-b', labels: { 'kubernetes.io/hostname': 'node-b' }, ready: false },
  ])
})

describe('NodePinPicker', () => {
  it('hides the strategy choice while nothing is selected', async () => {
    const wrapper = await mount({ modelValue: null })
    await flush()

    expect(wrapper.text()).not.toContain('If no selected node is available')
  })

  it('seeds its selection from an existing pin', async () => {
    const wrapper = await mount({
      modelValue: { key: 'kubernetes.io/hostname', values: ['node-a'], strategy: 'required' },
    })
    await flush()

    expect(wrapper.text()).toContain('node-a')
    expect(wrapper.text()).toContain('If no selected node is available')
  })

  it('emits null once the last node is removed', async () => {
    const wrapper = await mount({
      modelValue: { key: 'kubernetes.io/hostname', values: ['node-a'], strategy: 'required' },
    })
    await flush()
    await wrapper.find('button[aria-label="Remove node-a"]').trigger('click')
    await flush()

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted?.at(-1)).toEqual([null])
  })

  it('warns that one hard-pinned node co-locates every replica', async () => {
    const wrapper = await mount({
      modelValue: { key: 'kubernetes.io/hostname', values: ['node-a'], strategy: 'required' },
      maxReplicas: 3,
    })
    await flush()

    expect(wrapper.text()).toContain('All replicas will run on that one node')
  })

  it('does not warn when only one replica is possible', async () => {
    const wrapper = await mount({
      modelValue: { key: 'kubernetes.io/hostname', values: ['node-a'], strategy: 'required' },
      maxReplicas: 1,
    })
    await flush()

    expect(wrapper.text()).not.toContain('All replicas will run on that one node')
  })
})
```

The `vi.hoisted` + `mockNuxtImport` pairing and the `flush()` helper come from `AppConfigForm.nuxt.spec.ts`; keep them identical so the two files stay readable side by side.

- [ ] **Step 2: Run it and confirm it fails**

```bash
pnpm --filter web test -- NodePinPicker
```

Expected: component not found.

- [ ] **Step 3: Write the component**

```vue
<script setup lang="ts">
// useNodeList / useToast / extractApiError are auto-imports, left un-imported so tests can mock
// them via mockNuxtImport.
import type { NodePin } from '~/api/types.gen'

const HOSTNAME_LABEL_KEY = 'kubernetes.io/hostname'

const props = defineProps<{ maxReplicas?: number }>()
const pin = defineModel<NodePin | null>({ required: true })

const { list } = useNodeList()
const toast = useToast()

const nodes = ref<{ name: string; ready: boolean }[]>([])
const selected = ref<string[]>(pin.value?.values ?? [])
const strategy = ref<NodePin['strategy']>(pin.value?.strategy ?? 'preferred')

onMounted(async () => {
  try {
    nodes.value = await list()
  } catch (err) {
    toast.add({
      title: "Couldn't load cluster nodes",
      description: extractApiError(err),
      color: 'error',
      icon: 'i-lucide-triangle-alert',
    })
  }
})

watch([selected, strategy], () => {
  pin.value = selected.value.length
    ? { key: HOSTNAME_LABEL_KEY, values: [...selected.value], strategy: strategy.value }
    : null
})

const coLocates = computed(
  () =>
    strategy.value === 'required' && selected.value.length === 1 && (props.maxReplicas ?? 1) > 1,
)

function remove(name: string) {
  selected.value = selected.value.filter((value) => value !== name)
}
</script>

<template>
  <div class="space-y-3">
    <UFormField
      label="Run on specific nodes"
      name="nodePin"
      description="Leave empty to let the scheduler choose"
    >
      <USelectMenu
        v-model="selected"
        multiple
        :items="nodes"
        value-key="name"
        label-key="name"
        placeholder="Any node"
        class="w-full"
      >
        <template #item-trailing="{ item }">
          <UBadge v-if="!item.ready" color="warning" variant="subtle" label="Not ready" size="xs" />
        </template>
      </USelectMenu>
    </UFormField>

    <div v-if="selected.length" class="flex flex-wrap gap-2">
      <UBadge v-for="name in selected" :key="name" color="neutral" variant="subtle">
        {{ name }}
        <UButton
          icon="i-lucide-x"
          variant="ghost"
          color="neutral"
          size="xs"
          :aria-label="`Remove ${name}`"
          @click="remove(name)"
        />
      </UBadge>
    </div>

    <UFormField v-if="selected.length" label="If no selected node is available">
      <URadioGroup
        v-model="strategy"
        :items="[
          { value: 'preferred', label: 'Run somewhere else' },
          { value: 'required', label: 'Wait for a selected node' },
        ]"
      />
    </UFormField>

    <UAlert
      v-if="coLocates"
      color="warning"
      icon="i-lucide-triangle-alert"
      title="All replicas will run on that one node"
      description="This adds throughput, not resilience — losing the node takes every replica with it."
    />
  </div>
</template>
```

The strategy is surfaced as plain consequences ("Wait for a selected node") rather than the Kubernetes words `required` / `preferred`, which mean nothing to an operator.

- [ ] **Step 4: Run and confirm it passes**

Same command. Expected: green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/components/NodePinPicker.vue apps/web/app/components/__tests__/NodePinPicker.nuxt.spec.ts
git commit -m "feat(#143): add NodePinPicker component"
```

---

### Task 14: wire the picker into the create form

**Files:**

- Modify: `apps/web/app/pages/apps/new.vue`
- Create: `apps/web/app/pages/__tests__/apps-new.nuxt.spec.ts`

**Interfaces:**

- Consumes: `NodePinPicker` (Task 13), `CreateAppCommand.nodePin` (Task 11).
- Produces: nothing downstream.

There is no existing test for this page — `apps/web/app/pages/__tests__/` holds only `index`, `login`, `pending` and `team`. This task creates the first one, so keep it narrow: the pin mapping, not the whole form.

- [ ] **Step 1: Write the failing test**

```ts
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import NewApp from '../apps/new.vue'

const create = vi.hoisted(() => vi.fn())
const ship = vi.hoisted(() => vi.fn())
const list = vi.hoisted(() => vi.fn())
mockNuxtImport('useCreateApp', () => () => ({ create }))
mockNuxtImport('useShipRelease', () => () => ({ ship }))
mockNuxtImport('useNodeList', () => () => ({ list }))

const flush = () => new Promise((resolve) => setTimeout(resolve))

beforeEach(() => {
  create.mockReset().mockResolvedValue({ slug: 'my-app' })
  ship.mockReset().mockResolvedValue({})
  list.mockReset().mockResolvedValue([{ name: 'node-a', labels: {}, ready: true }])
})

async function fillRequired(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  await wrapper.find('input#slug').setValue('my-app')
  await wrapper.find('input#image').setValue('nginx:1.27')
  await wrapper.find('input#containerPort').setValue('80')
}

describe('apps/new node pinning', () => {
  it('omits nodePin when no node is selected', async () => {
    const wrapper = await mountSuspended(NewApp)
    await flush()
    await fillRequired(wrapper)
    await wrapper.find('form').trigger('submit.prevent')
    await flush()

    expect(create).toHaveBeenCalled()
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('nodePin')
  })
})
```

The input ids must match what `new.vue` actually renders — read the template and correct them before running. The environment picker is required by the page's schema, so if submission never reaches `create`, mock `useProjectEnvironmentPicker` the same way and seed `state.environmentUuid`.

- [ ] **Step 2: Run it and confirm it fails**

```bash
pnpm --filter web test -- apps-new
```

- [ ] **Step 3: Add the state, the component, and the command mapping**

Add to the `state` reactive and its type: `nodePin: NodePin | null` initialised to `null`. Place the picker in the template beside the replica fields:

```vue
<NodePinPicker v-model="state.nodePin" :max-replicas="state.maxReplicas" />
```

and extend `toCommand`:

```ts
    ...(data.nodePin ? { nodePin: data.nodePin } : {}),
```

`nodePin` is not added to the Zod schema — the picker can only emit a valid pin or `null`, and a schema entry would duplicate the api's validation for no gain.

- [ ] **Step 4: Run and confirm it passes**

Same command. Expected: green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/pages/apps/new.vue apps/web/app/pages/__tests__/
git commit -m "feat(#143): pin an app at creation time"
```

---

### Task 15: wire the picker into the edit form

**Files:**

- Modify: `apps/web/app/components/AppConfigForm.vue`
- Test: `apps/web/app/components/__tests__/AppConfigForm.nuxt.spec.ts`

**Interfaces:**

- Consumes: `NodePinPicker` (Task 13), `ViewAppDetailResponse.nodePin` (Task 8), `UpdateAppCommand.nodePin` (Task 11).
- Produces: nothing downstream.

- [ ] **Step 1: Update the existing assertion, then write the failing test**

`AppConfigForm.nuxt.spec.ts` already asserts an exact payload in `saves the whole config and emits saved`. Sending `nodePin` unconditionally breaks it, so extend that expectation first:

```ts
expect(update).toHaveBeenCalledWith('my-app', {
  image: 'nginx:1.28',
  containerPort: 80,
  minReplicas: 1,
  maxReplicas: 2,
  env: { LOG_LEVEL: 'debug' },
  nodePin: null,
})
```

Then add the new cases, mocking `useNodeList` the same way `useUpdateApp` is already mocked in that file:

```ts
const list = vi.hoisted(() => vi.fn())
mockNuxtImport('useNodeList', () => () => ({ list }))
```

with `list.mockReset().mockResolvedValue([{ name: 'node-a', labels: {}, ready: true }])` in the existing `beforeEach`, and:

```ts
it('seeds the picker from the saved pin', async () => {
  const wrapper = await mount({
    ...config,
    nodePin: { key: 'kubernetes.io/hostname', values: ['node-a'], strategy: 'required' },
  })
  await flush()

  expect(wrapper.text()).toContain('node-a')
})

it('clears the pin with an explicit null rather than omitting it', async () => {
  const wrapper = await mount({
    ...config,
    nodePin: { key: 'kubernetes.io/hostname', values: ['node-a'], strategy: 'required' },
  })
  await flush()
  await wrapper.find('button[aria-label="Remove node-a"]').trigger('click')
  await wrapper.find('form').trigger('submit.prevent')
  await flush()

  expect(update).toHaveBeenCalledWith('my-app', expect.objectContaining({ nodePin: null }))
})
```

The existing `mount()` helper takes no argument, so widen it to `(over = config) => mountSuspended(AppConfigForm, { props: { slug: 'my-app', config: over } })` and leave every current call site untouched.

The second test is the load-bearing one: an omitted `nodePin` means "leave unchanged" in the PATCH contract, so a cleared pin that sends nothing would silently stay pinned.

- [ ] **Step 2: Run it and confirm it fails**

```bash
pnpm --filter web test -- AppConfigForm
```

- [ ] **Step 3: Wire it in**

Add `nodePin: NodePin | null` to the `state` reactive and its type literal, seed it in `seed()` with `state.nodePin = config.nodePin`, and render the picker in the template beside the replica fields as in Task 14.

`formSnapshot()` already serialises the whole `state` object, so the dirty-check and the reseed guard pick up `nodePin` with no change.

In the submit handler, always send the key:

```ts
    nodePin: state.nodePin,
```

- [ ] **Step 4: Run and confirm it passes**

Same command. Expected: green.

- [ ] **Step 5: Run the whole web suite for coverage**

```bash
pnpm --filter web test
```

Expected: green, with coverage at or above lines 88 / branches 85 / functions 60.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/components/AppConfigForm.vue apps/web/app/components/__tests__/AppConfigForm.nuxt.spec.ts
git commit -m "feat(#143): edit an app's node pin"
```

---

### Task 16: cluster e2e assertions

**Files:**

- Modify: `scripts/e2e-test.sh`

**Interfaces:**

- Consumes: the endpoints from Tasks 6–10.
- Produces: nothing downstream.

- [ ] **Step 1: Read the existing script**

```bash
sed -n 1,80p scripts/e2e-test.sh
```

Follow its existing helper functions and assertion style rather than inventing a new one.

- [ ] **Step 2: Add the assertions**

Three, in the script's own idiom:

1. `GET /api/v1/nodes` returns at least one node, and the k3d node's hostname is among the names.
2. Create (or patch) an app with a `required` pin on that hostname, deploy, and assert the pod reaches Running.
3. `kubectl -n <namespace> get deploy <slug> -o jsonpath=...` shows the `nodeAffinity` block with the expected key and value.

- [ ] **Step 3: Run it against a live cluster**

```bash
MARSA_E2E_HTTP_PORT=8080 bash scripts/e2e-up.sh --image-tag sha-<short>
export KUBECONFIG="$(k3d kubeconfig write marsa-e2e)"
pnpm e2e:test
```

Requires a `preview`-labelled PR and the `sha-…` tag read from the CD run — see the root `CLAUDE.md`. The published image must already contain this branch's api, so run this **after** the PR exists and CD has published.

Expected: all three assertions pass.

- [ ] **Step 4: Commit**

```bash
git add scripts/e2e-test.sh
git commit -m "test(#143): assert node pinning on a real cluster"
```

---

### Task 17: charts RBAC (separate repo, prerequisite for a real cluster)

**Files:**

- Modify (in `marsa-cloud/marsa-charts`): the template defining `DEPLOYER_CLUSTER_ROLE` (`marsa-deployer`)

**Interfaces:**

- Consumes: nothing in this repo.
- Produces: the cluster permission `DirectNodeBackend` needs. Without it, `GET /v1/nodes` returns 403 on a real cluster; mock and local paths are unaffected.

- [ ] **Step 1: Clone or worktree the charts repo**

Use a persistent clone, never `/tmp`, and guard the `cd`:

```bash
cd ~/repos/marsa-charts || exit 1
[ "$(git rev-parse --show-toplevel)" = "$HOME/repos/marsa-charts" ] || { echo "wrong repo"; exit 1; }
git checkout -b feature/143-node-read-rbac
```

- [ ] **Step 2: Find the ClusterRole**

```bash
grep -rn "marsa-deployer" --include="*.yaml" .
```

- [ ] **Step 3: Add the rule**

```yaml
- apiGroups: ['']
  resources: ['nodes']
  verbs: ['get', 'list']
```

Read-only and cluster-scoped by necessity — nodes are not namespaced, so there is no narrower grant available.

- [ ] **Step 4: Open the PR**

Title: `feat(#143): allow the api to read cluster nodes`. Body must state that marsa#143 depends on it and that the chart needs releasing before the endpoint works on a real cluster.

---

### Task 18: operator docs and ticket acceptance criteria

**Files:**

- Modify: `docs/local-dev.md` or a new `docs/placement.md` — pick by reading what exists
- Modify (on GitHub): marsa-cloud/marsa#143's acceptance criteria

**Interfaces:**

- Consumes: the "What pinning does and does not buy" table in the spec.
- Produces: nothing in code.

- [ ] **Step 1: Write the operator-facing docs**

Carry the spec's table across in operator language. It must say, plainly:

- Pinning restricts where pods may run; it does not spread them or keep them apart from anything else.
- A hard pin with more than one replica co-locates every replica — throughput, not resilience.
- A rollback restores the old image and config, **not** the old pin.
- An unpinned app may be scheduled anywhere, including onto a node holding a database.
- Guaranteed spreading and drain safety are #221.

- [ ] **Step 2: Update the ticket's acceptance criteria**

The shipped design differs from the issue body in three ways that the AC must reflect: one `nodePin` object instead of `nodeTarget` + `pinStrategy`; a set of values rather than a single node; and the rollback consequence.

- [ ] **Step 3: Format and commit**

```bash
/home/gomaa-zorin/Github/marsa-workspace/apexyard/workspace/marsa/node_modules/.bin/prettier --write docs/<file>.md
git add docs/<file>.md
git commit -m "docs(#143): what node pinning does and does not buy"
```

---

### Task 19: full verification and PR

**Files:** none.

- [ ] **Step 1: Run every gate the CI runs**

```bash
/home/gomaa-zorin/Github/marsa-workspace/apexyard/workspace/marsa/node_modules/.bin/prettier --check .
pnpm lint
pnpm --filter api typecheck
pnpm --filter web typecheck
pnpm build:web
pnpm --filter api test
pnpm --filter web test
```

Every one must pass before pushing. Do not push on a red result to "see what CI says".

- [ ] **Step 2: Confirm no contract drift**

```bash
pnpm --filter api generate:openapi
pnpm --filter web generate:api
git status --short
```

Expected: no modified files. Anything modified here means a commit was made without regenerating, and CI's drift check would fail.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feature/143-node-pinning
gh pr create --repo marsa-cloud/marsa --base feature/142-project-environment --title "feat(#143): pin apps to cluster nodes" --body-file <body>
```

Base is **#218's branch**, not `main`. The PR body needs: narrative Summary bullets (what changed AND why it matters), Testing steps, `Refs #143`, a Glossary covering nodeAffinity, required vs preferred, IgnoredDuringExecution, label key/value, ClusterRole — and an explicit note that the charts PR from Task 17 must merge and release first.

- [ ] **Step 4: Flag the known CI limitation**

The PR-triggered e2e runs the PR's `scripts/e2e-test.sh` against `main`'s image, so the new `GET /v1/nodes` assertions will fail there. Label the PR `preview`, read the `sha-…` tag from the CD run, and dispatch `e2e.yml` with `-f image_tag=sha-…`. Say so in the PR body so a reviewer doesn't read the red as a real failure.
