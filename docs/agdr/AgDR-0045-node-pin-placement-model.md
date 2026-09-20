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

#179 made `Release` an immutable config snapshot that rollback restores: `imageRef`, `env`,
`containerPort`, `minReplicas`, `maxReplicas`, `imagePullCredentialsEnc`. #142 established the
other half of the picture — an app's Kubernetes namespace is derived at apply time from the app's
_current_ environment. `ApplyReleaseService.apply()` takes an `AppPlacement` (app + project +
environment) alongside the release and calls `namespaceOf(project, environment)`; the namespace is
never stored on the release and never restored by a rollback.

Node pinning had to pick a side of that line: is a pin config (snapshot it) or location (resolve it
live)?

A second, independent question came with it. Nodes join a Marsa cluster by running a k3s command on
the new VPS. Nothing informs Marsa that this happened, and nothing informs it when a node is
drained or removed.

## Options Considered

| Option                                   | Pros                                                          | Cons                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Pin on App **and** snapshot onto Release | Rollback reproduces the exact pin; consistent with `env`      | Rolling back onto a since-drained node leaves the pod `Pending`; contradicts how the namespace resolves   |
| **Pin on App only**                      | Matches namespace resolution; rollback uses today's placement | `hasUndeployedChanges` compares release-to-app and structurally cannot see the pin                        |
| Pin on Release only                      | Simplest schema                                               | No app-level default, so an operator re-states the pin on every deploy                                    |
| Persist node inventory in Postgres       | Marsa could own node metadata (friendly names, notes)         | Stale the moment a node joins or drains; the picker offers dead nodes and a hard pin then hangs `Pending` |
| **Read nodes live from the cluster**     | Cannot drift; no reconcile job                                | Needs cluster-scoped RBAC (a marsa-charts change); one cluster read per picker load                       |

## Decision

Chosen: **pin on App only, applied immediately, node inventory read live**, because placement is
location rather than config, and this codebase already resolves location at apply time rather than
from the snapshot.

The operational argument settles it independently of the symmetry argument. If `node-a` fails and
the operator re-pins to `node-b`, then rolls back a bad release, snapshot semantics would restore
the pin to the dead node — a rollback that deepens the outage it was meant to end. App-only gives
yesterday's image with today's placement, which is what a rollback is for.

Applying immediately follows from the same choice rather than being a separate decision. Because
the pin never reaches a `Release`, the existing `isSnapshotOf` comparison behind
`hasUndeployedChanges` cannot see it — so a stored-but-unapplied pin would leave the app row and
the cluster silently divergent behind a check that reports "no undeployed changes". Applying on
write is what closes that gap; the alternative was a second cluster read on every detail load,
which is what #198 and #213 exist to remove.

## Consequences

- A rollback restores the old image and env, **not** the old pin. Stated in the spec, the operator
  docs, and the ticket's acceptance criteria.
- `UpdateAppUseCase` gains a cluster call — its first. It sits outside any DB transaction (#214)
  and runs **before** the row is written: if the apply fails nothing is stored, so an identical
  retry still sees a changed pin and applies again. Writing first was tried and reverted in review
  — it made the retry a no-op, because the row already matched, leaving the cluster on the old
  affinity with nothing able to surface the drift (`hasUndeployedChanges` cannot see a pin).
  The cost is that a pin cannot be recorded while the cluster is unreachable, which is the right
  trade for an operation rather than a config edit.
- `app-management` must reach `ApplyReleaseService` in `release/services/`. Today those features
  cross only at `entities/`, the seam sanctioned by `apps/api/.claude/CLAUDE.md`. If review objects,
  the service promotes to `src/modules/deploy/` with no logic change.
- The api ServiceAccount needs `nodes: [get, list]` on the `marsa-deployer` ClusterRole — a
  marsa-charts PR that must release before `GET /v1/nodes` works on a real cluster.
- Node pools (`marsa.cc/pool`) need no schema change later: the pin's `key` is already free-form,
  which is what #143's fourth acceptance criterion reserves.
- Pinning restricts where pods _may_ run; it neither spreads them nor keeps them away from other
  workloads. Guaranteed spreading and drain safety are #221.

## Artifacts

- Spec: `docs/superpowers/specs/2026-09-20-node-pinning-design.md`
- Plan: `docs/superpowers/plans/2026-09-20-node-pinning.md`
- Ticket: [marsa-cloud/marsa#143](https://github.com/marsa-cloud/marsa/issues/143)
- Sibling: [marsa-cloud/marsa#221](https://github.com/marsa-cloud/marsa/issues/221)
