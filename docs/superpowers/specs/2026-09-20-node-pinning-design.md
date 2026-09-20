# Node pinning — design (#143)

Status: approved in conversation 2026-09-20. One marsa PR (branched off #142's branch, since it
touches `app.table.ts` and `create-app.*`) plus one marsa-charts PR for cluster-scoped node reads.

## Problem

An operator with a box that holds their data — or a node with a GPU, or more RAM — has no way to
say "run this app there". Placement is currently whatever the scheduler picks. #104 Thread 2 wants
pinning as a pure scheduling concern: zero routing impact, zero domain impact.

`local-path` makes this more than a nice-to-have. A volume binds to the node its pod first lands
on, so #205's persistent apps need an explicit pinning mechanism rather than an implicit one.

## Decisions

| Decision            | Choice                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| Where the pin lives | `app.node_pin` only. **Not** snapshotted onto `release`                                            |
| Field shape         | One nullable jsonb object `{ key, values[], strategy }`; `null` = schedule anywhere                |
| Cardinality         | A set of nodes, via `operator: In` over `values[]`. One node is the degenerate case                |
| Input               | Raw label key + values. No node-name translation layer; a pool label is the same path              |
| Strategy            | `required` → `requiredDuringScheduling…`; `preferred` → `preferredDuringScheduling…` at weight 100 |
| Apply semantics     | Changing the pin re-applies manifests **immediately**; it does not create a release                |
| Node inventory      | Read live from the cluster. Nothing persisted in Marsa                                             |
| Existence check     | None. Pinning ahead of a node joining is legal                                                     |
| Web                 | `NodePinPicker.vue` on both the create form and the edit form                                      |
| Spreading / HA      | Out of scope — #221                                                                                |

### Why the pin is not on the release

#179 established that a release is an immutable snapshot of config, and rollback restores it. Node
pinning is deliberately excluded because **placement is not config, it is location** — and this
codebase already draws that line. `ApplyReleaseService.apply()` takes an `AppPlacement` (app +
project + environment) alongside the release and derives the namespace from the app's _current_
environment, never from the snapshot. The pin follows the namespace, not the env vars.

The operational argument is the stronger one. If `node-a` dies and the operator re-pins to
`node-b`, then rolls back a bad release, snapshot semantics would restore the pin to the dead node
and leave the pod `Pending` — rollback would deepen the outage. App-only gives today's placement
with yesterday's image, which is what a rollback is for.

**Accepted consequence:** a rollback does not restore the old pin. This is surprising enough to
belong in the docs and in the ticket's acceptance criteria, not just here.

## Data model

```ts
// app.table.ts
nodePin: jsonb('node_pin').$type<NodePin>(),   // nullable

// app-management/entities/node-pin.ts
export interface NodePin {
  key: string                            // any node label key
  values: string[]                       // >= 1, OR-ed via operator: In
  strategy: 'required' | 'preferred'
}
```

One nullable column rather than `node_target` + `pin_strategy` as two fields: a strategy without a
target is then unrepresentable rather than validated-away, and clearing a pin is a single `null`.
This deviates from #143's literal wording; the acceptance criteria are updated to match.

`release` is untouched. No migration on `release`, no change to `ReleaseSnapshot`, `snapshotOf`,
`appConfigOf`, or `isSnapshotOf`.

## Rendering

`renderManifests` grows a fifth parameter, so it converts to a single options object:

```ts
renderManifests({ slug, release, baseDomain, credentials, nodePin })
```

The affinity block lands in `deployment.spec.template.spec.affinity`, built from one shared
expression `{ key, operator: 'In', values }`:

| `strategy`  | Rendered as                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------ |
| `required`  | `nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[0].matchExpressions[0]` |
| `preferred` | `nodeAffinity.preferredDuringSchedulingIgnoredDuringExecution[0]`, `weight: 100`                       |

A `null` pin emits no `affinity` key at all — not an empty object, which would churn the
server-side-apply field manager on every deploy.

Both K8s variants are `IgnoredDuringExecution`: affinity is evaluated only at scheduling time, so
relabelling a node never evicts a running pod. The pin binds each pod at birth.

## Apply semantics

`UpdateAppUseCase` today carries the comment _"Writes App only: the running app keeps its config
until the operator deploys a new release."_ The pin is the first deliberate exception, because
placement is an operation (like scaling a dyno) rather than config awaiting a deploy.

1. Write the app row.
2. If `nodePin` was present in the command **and** differs from the stored value: resolve the
   namespace, read the live release uuid, re-render that release with the new pin, apply.
3. No live release → store only; the next deploy picks it up.
4. Apply fails → the write already succeeded, so return 200 with the pin stored and surface the
   apply failure. Failing the whole `PATCH` would leave an operator unable to record intent while
   the cluster is unreachable.

`UpdateAppUseCase` gains `DeployBackend` and a placement read (it currently fetches neither). Per
#214, the cluster call stays outside any DB transaction.

`PATCH` follows the existing `imagePullCredentials` precedent: omitted leaves the pin alone, an
explicit `null` clears it.

Because the pin never reaches `release`, `hasUndeployedChanges` is untouched — and must stay that
way. Applying immediately is precisely what keeps the app row and the cluster from diverging
silently behind a check that cannot see the pin.

## Node API

```
src/app/cluster/use-cases/view-node-index/    GET /v1/nodes
src/modules/kubernetes/node-backend.ts        abstract
                       direct-node-backend.ts CoreV1Api.listNode()
                       mock-node-backend.ts   fixed fake nodes
```

Response per node: `{ name, labels, ready }`. Labels ship so the same endpoint feeds a pool picker
later without a second API.

**No pagination.** Node counts are single-digit, and a paginated contract here is ceremony — #200
is actively removing the one we have.

**Why live rather than stored.** Nodes join via a k3s command run on the VPS; nothing informs
Marsa. A `node` table would be stale from the moment it is written, and the failure mode lands
exactly here: a dropdown offers a node drained last week, the operator hard-pins to it, and the pod
sits `Pending` with no visible cause. The cluster is the only source of truth that can be correct.

**Prerequisite, separate repo:** the api ServiceAccount needs `nodes: [get, list]` on the existing
`DEPLOYER_CLUSTER_ROLE`. A marsa-charts PR must land and be released first, or `GET /v1/nodes`
returns 403 on a real cluster. Mock and local paths are unaffected.

`MockNodeBackend` is load-bearing, not test scaffolding: `NODE_ENV=test` boots without a cluster,
so the `seed-dev` loop in `CLAUDE.md` cannot render the picker without it.

## Web

`NodePinPicker.vue`, modelled on `ProjectEnvironmentPicker.vue`, used by `apps/new.vue` and
`AppConfigForm.vue`:

- `USelectMenu` over `GET /v1/nodes`, multi-select.
- Selections render as chips with an `×` to remove.
- `required` / `preferred` toggle, shown only once at least one node is selected.
- Empty selection = unpinned; clearing the last chip sends `nodePin: null`.

**Inline warning** when `strategy: required` and `maxReplicas > 1`: all replicas co-locate, which
is throughput headroom, not node-failure resilience. The warning belongs next to the replica fields
because that is where the mistake is made. Fuller treatment in #221.

## Validation

A shared `NodePin` class used by both commands:

| Rule                                                                               | Why                                                                                                                                                  |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key` matches the K8s label-key grammar (optional DNS-subdomain prefix, name ≤ 63) | Reject garbage before the API server does                                                                                                            |
| `values`: 1–32 entries, each ≤ 63 chars, label-value grammar                       | Same; the cap keeps the jsonb bounded                                                                                                                |
| No duplicates in `values`                                                          | K8s accepts `In [node-a, node-a]`; it is still a user error                                                                                          |
| No cluster existence check                                                         | Pin ahead of a node joining. A write-path cluster call is what #198 is removing. `required` with no match = `Pending`, which is documented behaviour |

## Testing

- **Unit — `renderManifests`**: unpinned emits no `affinity`; `required` and `preferred` each emit
  the right block; multi-value renders one `In` expression.
- **Unit — `NodePin` validator**: key/value grammar, duplicates, bounds.
- **Unit — `UpdateAppUseCase`**: pin changed with a live release applies; pin unchanged makes no
  cluster call; no live release stores only; a failing apply still persists the app.
- **e2e**: create with a pin, read back, `PATCH` to change, `PATCH null` to clear, `GET /v1/nodes`
  against the mock backend.
- **Web component**: select, remove chip, clear-to-null, and the co-location warning appearing only
  on `required` + `maxReplicas > 1`.
- **Cluster e2e** (`scripts/e2e-test.sh`): pin to the k3d node's hostname with `required`, assert
  the pod schedules and the rendered Deployment carries the affinity block.

Coverage floors unchanged: api 80/75/75, web 88/85/60.

## Out of scope

| Deferred                                    | Where                                                        |
| ------------------------------------------- | ------------------------------------------------------------ |
| Replica spreading + PodDisruptionBudget     | #221                                                         |
| Node pools Marsa _writes_ (`marsa.cc/pool`) | v0.3; the schema already accommodates it                     |
| Persisting nodes + reconcile                | Not filed; only earns its keep once Marsa owns node metadata |
| SSH-based node onboarding from the UI       | Own epic — secret storage, pod egress, idempotent join       |

## Risks

- **Two-repo ordering.** The charts RBAC PR must merge and release before the endpoint works on a
  real cluster.
- **Stacked on #142.** Review changes to `app.table.ts` or `create-app.*` cost a rebase here.
- **PR-triggered e2e cannot test a new endpoint** — it runs the PR's script against `main`'s image.
  Use the `preview` label, read the `sha-…` tag from the CD run, and dispatch `e2e.yml` with it.
