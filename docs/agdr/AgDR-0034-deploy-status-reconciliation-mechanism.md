---
id: AgDR-0034
timestamp: 2026-07-05T07:23:17Z
agent: claude
model: claude-opus-4-8
trigger: user-prompt
status: accepted
ticket: marsa-cloud/marsa#100
---

# Deploy status is reconciled refresh-on-read, with Deployment-condition-only failure detection

> In the context of [#100](https://github.com/marsa-cloud/marsa/issues/100) defining how `Release.deployStatus` reaches a truthful terminal value — [#98](https://github.com/marsa-cloud/marsa/issues/98) shipped the deploy path but deliberately does **not** read rollout status ([AgDR-0032](AgDR-0032-server-side-apply-deploy-mechanism.md): `apply()` returns `void`, Release stays `Pending`) — facing two independent choices (the reconciliation **mechanism**, and the **depth** of failure detection), I decided to use **refresh-on-read** as the mechanism and the **simplest Deployment-`.status.conditions`-only** failure detection at the default progress deadline, to achieve truthful status reporting with **zero background infrastructure** for V0.1, accepting that (a) a release nobody ever views never reconciles, and (b) a broken deploy takes up to `progressDeadlineSeconds` (~10 min default) to report `Failed`, with `ImagePullBackOff`/`CrashLoopBackOff` caught only via that deadline rather than fast.

## Context

A deploy's stages split across two entities (per the #100 design):

| Stage            | Entity  | Nature            | Store or read                        |
| ---------------- | ------- | ----------------- | ------------------------------------ |
| Build (#21)      | Release | bounded, terminal | store `buildStatus`                  |
| Deploy (rollout) | Release | bounded, terminal | **store `deployStatus`** — this AgDR |
| Run (app health) | App     | unbounded, live   | read on request (never stored)       |

The set needing observation is only releases still in a non-terminal (`Deploying`) state — small and self-limiting. There is **no push channel out of Kubernetes**: no outbound webhook fires on rollout completion (admission webhooks fire on API _writes_, not rollout outcome). Every option therefore reads the same authoritative signal — the Deployment's `Progressing` / `Available` conditions — differing only in _when_ and _how often_ it reads. This AgDR settles two orthogonal questions:

1. **Mechanism** — what triggers the read + write-back.
2. **Failure-detection depth** — how deep we look, which sets time-to-`Failed`.

## Options Considered

### Decision 1 — reconciliation mechanism

| Option                           | Pros                                                                                                                                                                                                                                                                                                                                                    | Cons                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Refresh-on-read (chosen)**     | The status/list endpoint reads live rollout state for any non-terminal release it touches and writes back on terminal — the status API _is_ the reconciler. Zero background infra. The read endpoint is being built here anyway (no release read endpoint exists on main today), so reconciliation is essentially free. Truthful whenever anyone looks. | A deploy nobody ever views stays non-terminal in the DB — fine for _reporting_ (nobody is misled at read time), not for _alerting_ or history completeness. |
| Refresh-on-read + coarse sweeper | Closes the unobserved-deploy hole by failing abandoned deploys past a deadline.                                                                                                                                                                                                                                                                         | Adds a scheduled process to run + monitor — more than V0.1 needs; alerting is a V0.2 non-goal.                                                              |
| Bounded background watch         | Correct-while-unobserved; on-ramp to the V0.2 operator. Push-ish (K8s streams changes over a connection we hold).                                                                                                                                                                                                                                       | A long-lived process to run + monitor now — effectively a mini reconcile loop. Most operational weight for V0.1.                                            |

Cron rejected outright — both laggy _and_ the most operational weight.

### Decision 2 — failure-detection depth

| Option                                                   | Time-to-`Failed`                                  | Complexity                                            | False-fail risk                                         |
| -------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------- |
| **Deployment condition only, default deadline (chosen)** | up to `progressDeadlineSeconds` (~10 min default) | lowest — one `readNamespacedDeployment`, no Pod reads | none                                                    |
| Deployment condition, lowered `progressDeadlineSeconds`  | ~2 min                                            | low                                                   | genuinely slow-starting apps mis-reported `Failed`      |
| + Pod waiting-reason inspection (fail-fast)              | seconds                                           | higher — extra Pod list + a restart/grace guard       | transient backoff mis-reported `Failed` without a guard |

## Decision

**Mechanism: refresh-on-read.** The read path is new work regardless (only `POST deployments/deploy` exists today), the terminal enum values already exist in the DB (`succeeded`/`failed`), and the persist pattern is in place (`releases.nativeUpdate({ uuid }, …)`). This banks truthful reporting for the near-zero marginal cost of doing the write-back inside the read use-case. Alerting — the one thing this mechanism can't do — is an explicit V0.2 non-goal ([AgDR-0029](AgDR-0029-gitops-argo-flux-for-operator-app-deploy.md): operator / GitOps).

**Failure detection: Deployment `.status.conditions` only, at the default deadline.** Success = `Progressing` reason `NewReplicaSetAvailable` (with updated/available replicas meeting desired); failure = `Progressing = False, reason = ProgressDeadlineExceeded`; otherwise still in-progress. No Pod-level inspection. This is the simplest correct reader — authoritative, zero false-fails — deferring the responsiveness improvements (fail-fast / lowered deadline) rather than paying their complexity + false-fail risk in the first slice.

## Consequences

**Accepted limitations — carried forward as known holes, not oversights:**

- **Unobserved deploys never reconcile.** A release that nobody views stays non-terminal in the DB indefinitely. Acceptable because at _read_ time the answer is always truthful; only unattended alerting/history is affected. Closed later by the V0.2 observer (sweeper or operator).
- **Slow time-to-`Failed`.** A broken deploy (e.g. typo'd image tag) reports non-terminal for up to `progressDeadlineSeconds` (~10 min default) before flipping to `Failed`. With refresh-on-read this means repeated status reads keep showing "deploying…" for that window on an already-doomed deploy.
- **`ImagePullBackOff` / `CrashLoopBackOff` are not fast-detected.** These are _Pod-level_ container states; the Deployment-condition-only reader does not read Pods, so they surface only indirectly, as the generic `ProgressDeadlineExceeded → Failed` after the deadline. **This relaxes #100 AC bullet 3 as written** (which names those two reasons): for V0.1 they _do_ reach `Failed`, but via the deadline, not fast and without the specific reason. Fast-fail is a documented follow-up.

**Follow-ups this consciously defers** (candidates for a V0.2 ticket): fail-fast via Pod `waiting.reason` inspection with a restart/grace guard; and/or lowering `progressDeadlineSeconds` in the rendered Deployment to shorten the lag.

**Positive consequences:**

- No background process, scheduler, or watch connection to run or monitor in V0.1.
- The status source is a new method on the existing `DeployBackend` seam (real reads via `AppsV1Api`, `MockDeployBackend` for tests) — no new client, consistent with [AgDR-0031](AgDR-0031-kubernetes-client-library.md).
- The rename `Release.status → Release.deployStatus` lands with this work (+ migration), per #100.

## Artifacts

- Ticket: marsa-cloud/marsa#100 — https://github.com/marsa-cloud/marsa/issues/100
- Supersedes the scrapped synchronous "status from rollout" read (#98 / PR #103 threads `r3503890216`, `r3493223302`)
- Builds on: [AgDR-0029](AgDR-0029-gitops-argo-flux-for-operator-app-deploy.md) (defers alerting/operator to V0.2), [AgDR-0032](AgDR-0032-server-side-apply-deploy-mechanism.md) (why Release stays `Pending` after apply)
- Commit / PR: filled in as #100 ships
