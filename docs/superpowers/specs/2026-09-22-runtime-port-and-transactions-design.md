# Runtime port & transaction rule — design (#226, #214)

Status: approved in conversation 2026-09-22. Two marsa PRs, in order: PR 1 closes #226 (and
answers #229), PR 2 closes #214. One AgDR each.

## Problem

Three problems share one seam.

- **Kubernetes leaks through the seam.** `DeployBackend` is abstract, but it receives rendered
  Kubernetes objects: `ApplyReleaseService` (in the `release` feature) renders a `Release` into
  `V1Deployment` / `IngressRoute` / `HTTPScaledObject`, then hands them over. Rendering lives in
  `release/render/`, `namespaceOf` in `environment/entities/`, and `src/modules/kubernetes/` is a
  flat directory of 20 files. A non-Kubernetes backend (#229) would be handed Kubernetes objects.
- **A service crosses features.** `app-management/update-app` imports
  `release/services/ApplyReleaseService` to re-apply the live release when a node pin changes. The
  api `CLAUDE.md` forbids importing another feature's services, and also claims feature imports are
  one-directional, which they are not: `app-management` repositories import `releaseTable` and
  `release` imports `App` / `AppPlacement` / `NodePin`.
- **Cluster calls and DB writes are ordered two ways.** `create-environment` / `delete-environment`
  call the cluster inside a transaction; `update-app` calls the cluster first and writes after, with
  no transaction; `create-release`, `deploy-release`, `delete-app` read then write with no
  transaction (#214).

## Decisions

| Decision                 | Choice                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pattern                  | Ports and adapters. Marsa-owned abstract classes (ports) under `src/modules/runtime/`; one module per technology (adapter) implements them                                                                                                                                                                                                                                                   |
| Name                     | `runtime` — `AppRuntime`, `EnvironmentRuntime`, `NodeRuntime`                                                                                                                                                                                                                                                                                                                                |
| Ports vs interfaces      | Abstract classes, as today: an interface has no runtime token for Nest DI                                                                                                                                                                                                                                                                                                                    |
| Seam vocabulary          | Marsa terms only. No `namespace` / `deploymentName` parameters; features pass `AppRef` / `EnvironmentRef` and an `AppDeploySpec`                                                                                                                                                                                                                                                             |
| Rendering                | Behind the port, private to the Kubernetes adapter                                                                                                                                                                                                                                                                                                                                           |
| Adapters shipped         | Kubernetes and Mock only. No Docker/bash adapter; #229 is closed by this design (the architecture exists, fitting Docker is not proven)                                                                                                                                                                                                                                                      |
| Adapter selection        | One global `RuntimeModule`, imported by both composition roots (`AppModule` and `TestModule`), loads exactly one adapter module via `ConditionalModule.registerWhen` on `MARSA_RUNTIME=kubernetes\|mock` (renamed from `DEPLOY_BACKEND=direct\|mock`, default `kubernetes`). Config-driven because `pnpm dev:api` boots the production module with `.env.test` and must get the mock adapter |
| Unsupported capability   | An adapter throws; the port is not shrunk to the lowest common denominator                                                                                                                                                                                                                                                                                                                   |
| `namespace` in responses | Removed from `CreateEnvironmentResponse` and the environment-index response. Web + fixtures refactored                                                                                                                                                                                                                                                                                       |
| Cross-feature imports    | `entities/` (incl. tables), `queries/`, `enums/`, `errors/`, `events/` — either direction. Never `services/`, use-cases, repositories, commands, responses                                                                                                                                                                                                                                   |
| `ApplyReleaseService`    | Deleted. Replaced by a pure `deploySpecOf()` in `release/entities/` plus a direct `AppRuntime.deploy()` call                                                                                                                                                                                                                                                                                 |
| Transactions             | One `db.transaction` per writing use-case: deciding reads → DB writes → runtime call last. Runtime failure rolls back                                                                                                                                                                                                                                                                        |
| Transaction owner        | The use-case. It may inject `Database` **only** for `db.transaction`; repositories take the `tx` as `Executor`. #171 (ambient/ALS) stays out                                                                                                                                                                                                                                                 |
| Deciding reads           | Take `tx` and lock with `.for('update')`; one job per repository method                                                                                                                                                                                                                                                                                                                      |

## PR 1 — runtime port (#226)

### Layout

```text
src/modules/runtime/
  app-runtime.ts              abstract AppRuntime
  environment-runtime.ts      abstract EnvironmentRuntime
  node-runtime.ts             abstract NodeRuntime
  runtime.types.ts            AppRef, EnvironmentRef, AppDeploySpec, NodePinSpec, RegistryCredentials,
                              AppHealth, RunLogs, RunLogsOptions, DeployFailure, RolloutStatus, ClusterNode
  runtime.errors.ts           EnvironmentConflictError, InvalidReleaseAnnotationError
  runtime.module.ts           @Global(); ConditionalModule picks one adapter module on MARSA_RUNTIME
  adapters/
    kubernetes/
      kubernetes-runtime.module.ts
      kubernetes-app-runtime.ts           (was direct-apply-deploy-backend.ts)
      kubernetes-environment-runtime.ts   (was direct-namespace-backend.ts)
      kubernetes-node-runtime.ts          (was direct-node-backend.ts)
      app/
        render/               render-manifests.ts, node-affinity.ts, render constants
        rollout/              map-rollout-status.ts, extract-deploy-failure.ts, newest-pod.ts
        release-annotation.ts
        kubernetes-objects.types.ts       IngressRoute, HttpScaledObject, RenderedManifests
      environment/
        namespace-name.ts     namespaceOf(EnvironmentRef)
        environment.constants.ts          labels, RBAC names
      shared/                 conflict.ts, not-found.ts
    mock/
      mock-runtime.module.ts
      mock-app-runtime.ts, mock-environment-runtime.ts, mock-node-runtime.ts
```

Tests move with their files (`tests/` beside each), re-imported, not rewritten. Mock-backend tests
become mock-adapter tests.

### Ports

```ts
interface EnvironmentRef {
  uuid: EnvironmentUuid
  projectSlug: string
  environmentSlug: string
}
interface AppRef {
  environment: EnvironmentRef
  slug: string
}

interface AppDeploySpec {
  releaseUuid: ReleaseUuid
  image: string
  port: number
  env: Record<string, string>
  minReplicas: number
  maxReplicas: number
  host: string
  nodePin: NodePinSpec | null // { key, values, strategy: 'required' | 'preferred' }
  credentials?: RegistryCredentials
}

abstract class EnvironmentRuntime {
  abstract provision(env: EnvironmentRef): Promise<void> // idempotent for the same uuid; EnvironmentConflictError otherwise
  abstract destroy(env: EnvironmentRef): Promise<void> // only removes what this environment owns
}

abstract class AppRuntime {
  abstract deploy(app: AppRef, spec: AppDeploySpec): Promise<void> // provisions the environment too
  abstract destroy(app: AppRef): Promise<void>
  abstract readRolloutStatus(app: AppRef): Promise<RolloutStatus>
  abstract readLiveReleaseUuid(app: AppRef): Promise<ReleaseUuid | null>
  abstract readHealth(app: AppRef): Promise<AppHealth>
  abstract readDeployFailure(app: AppRef): Promise<DeployFailure | null>
  abstract readRunLogs(app: AppRef, options: RunLogsOptions): Promise<RunLogs | null>
}

abstract class NodeRuntime {
  abstract listNodes(): Promise<ClusterNode[]>
}
```

`KubernetesAppRuntime.deploy` = `namespaceOf` → provision (heals a hand-deleted namespace, as
`ApplyReleaseService` does today) → render → server-side apply. `NodePinSpec` is the port's own
type; `app-management`'s `NodePin` maps onto it in `deploySpecOf`.

`runtime/` must not import from `src/app/**`. Ids cross the port as the branded `Uuid<'Release'>` /
`Uuid<'Environment'>` from `src/utils/uuid` — the same types `ReleaseUuid` / `EnvironmentUuid`
alias — so features pass their ids unchanged and the port never imports a feature.

### Feature side

- `release/entities/release-deploy-spec.ts`:
  `deploySpecOf(placement, release, { baseDomain, credentials }) → { app: AppRef; spec: AppDeploySpec }`.
  Pure, next to `snapshotOf` / `appConfigOf`.
- `ImagePullCredentialsCipher` (`modules/crypto`) gains a method that opens sealed credentials or
  throws the existing 500 ("could not be decrypted, re-enter the registry credentials…"), so its two
  callers don't duplicate the handling.
- `deploy-release` and `update-app` call `appRuntime.deploy(...)` directly. `ApplyReleaseModule` /
  `ApplyReleaseService` are deleted.
- Every other `DeployBackend` / `NamespaceBackend` / `NodeBackend` consumer switches to the port and
  passes an `AppRef` / `EnvironmentRef` built from its placement. `namespaceOf` leaves
  `environment/entities/`.
- Feature modules stop importing `KubernetesModule` (`RuntimeModule` is global).

### API contract change

`namespace` is removed from `CreateEnvironmentResponse` and the environment-index item. Regenerate
`apps/api/openapi.json` and `apps/web/app/api/*`; drop the field from the three web composable test
fixtures; `ProjectEnvironmentPicker` helper text becomes "Each environment is isolated from the
others". `scripts/e2e-test.sh` already derives `APPS_NS` itself and needs no change. PR 1 is
therefore not behaviour-neutral; the PR description says so.

### Guardrails

- `apps/api/eslint.config.mjs` `no-restricted-imports`: `@kubernetes/client-node` is allowed only
  under `src/modules/runtime/adapters/kubernetes/**`; `src/app/**` may not import
  `**/runtime/adapters/**`.
- New `.claude/rules/api/runtime.md` (path-scoped to `apps/api/src/modules/runtime/**`): ports speak
  Marsa vocabulary; only the Kubernetes adapter touches the client library; features never import
  adapters; a new adapter is one folder plus one `registerWhen` line in `runtime.module.ts`; unsupported
  capabilities throw.
- `apps/api/.claude/CLAUDE.md`: rewrite the boundary rule (building blocks both ways, never
  services), update the Placement line (`namespaceOf` is adapter-internal), add `src/modules/runtime/`.
- `.claude/rules/api/service.md`: a service is feature-internal and never imported by another feature.
- Rename `DEPLOY_BACKEND=direct|mock` → `MARSA_RUNTIME=kubernetes|mock` in `env.config.ts`,
  `apps/api/.env.test`, `docs/local-dev.md` and `.claude/rules/api/module-wiring.md` (whose
  `DeployBackend` example is rewritten to the runtime module). Historical AgDRs, specs and plans
  are left as written.
- Adding an adapter = one folder under `adapters/`, one `ConditionalModule.registerWhen` line in
  `runtime.module.ts`, one value in the `MARSA_RUNTIME` validation.

### AgDR-0046 — Runtime port and adapters

Records: ports and adapters under `runtime`; rendering behind the port; config-driven selection of
exactly one adapter module; the cross-feature import rule. Rejected: keeping the Kubernetes-shaped seam and
only moving files; folder reorganisation alone; allowing cross-feature service imports; shipping a
second real adapter. AgDR-0045 § Consequences gets a one-line pointer to it.

### Closing

PR 1 closes #226. #229 is closed with a comment linking AgDR-0046.

## PR 2 — transaction rule (#214)

### The rule

> A writing use-case opens **one** `db.transaction`. Inside it, in order: the reads that decide the
> write, the DB writes, then the runtime call **last**. A runtime failure throws and rolls the
> transaction back. Runtime calls must be idempotent so a retry converges. A use-case may inject
> `Database` only to call `db.transaction`; all other data access goes through its repository,
> which takes the `tx` as an `Executor`.

DB-first ordering means constraint failures (unique slug, RESTRICT FK) surface before any side
effect. Reads that decide a write take `tx` and `.for('update')`. Each repository method does one job.

### Call sites

| Use-case             | Inside the transaction                                                                | After a rollback                                         |
| -------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `create-environment` | insert (conflict → 409) → `EnvironmentRuntime.provision`                              | — The compensating `destroy` is removed                  |
| `delete-environment` | delete row (FK → 409 "still has apps") → `EnvironmentRuntime.destroy`                 | —                                                        |
| `update-app`         | lock app → update row → if the pin changed and a release is live, `AppRuntime.deploy` | — The cluster-first ordering and its comment are removed |
| `deploy-release`     | lock app + newest release → set `Pending` → `AppRuntime.deploy`                       | Write `Failed` in its own statement, then rethrow        |
| `delete-app`         | lock app → delete releases + app → `AppRuntime.destroy`                               | —                                                        |
| `create-release`     | lock app (+ read source release) → insert release (+ restore config on rollback)      | — No runtime call                                        |

`DeployReleaseRepository.findAppWithNewestRelease` splits into `findPlacement(tx, slug)` and
`findNewestRelease(tx, appUuid)`; the #171 comment's reason for keeping it fused no longer holds.

### Accepted gap

If the runtime call succeeds and the commit then fails, the cluster keeps the change and the DB
does not. `update-app`, `deploy-release`, `delete-app` converge on retry (idempotent calls).
`create-environment` does not: the retry mints a new environment uuid and hits a permanent 409
against the orphaned namespace; the fix is `kubectl delete ns <name>`. Accepted for simplicity and
documented in the AgDR and `docs/local-dev.md` troubleshooting.

### Rules

- `.claude/rules/api/use-case.md`: `Database` allowed only for `db.transaction`; the ordering rule.
- `.claude/rules/api/repository.md`: one job per method; deciding reads take `tx` and lock.
- Comment on #171: explicit `tx`-threading is the sanctioned shape until #171 lands.

### AgDR-0047 — Transactions wrap runtime calls

Records the rule, the idempotency requirement, the `Failed`-outside exception and the accepted
gap. Rejected: #214's original "no cluster call inside a transaction"; a `transaction(fn)` method
on every repository; pulling in #171.

### Testing

- Each call site: an e2e test that a runtime failure leaves the DB unchanged, using a
  fail-next-call switch on the Mock adapter.
- `create-release`: a `.db.test.ts` for its lock (an invariant the endpoint cannot reach, per
  `repository.md`).

### Closing

PR 2 closes #214.

## Out of scope

- A Docker / bash adapter and #229's scale-to-zero and Docker-socket questions.
- #171 (ambient transactions).
- Renaming Kubernetes concepts in user-facing copy beyond the one picker string.
- Orphan-namespace adoption for `create-environment`.
