---
id: AgDR-0029
timestamp: 2026-06-28T12:00:00Z
agent: claude
model: claude-opus-4-8
trigger: user-prompt
status: accepted
ticket: marsa-cloud/marsa#77
---

# GitOps for operator-app deploy: direct-apply in V0.1, defer the Argo-CD-vs-own-operator fork to a V0.2 spike

> In the context of choosing how Marsa reconciles operator-app workloads on the cluster (#77/#21), facing the pull between offloading the reconcile loop to a GitOps controller (Argo CD or Flux) and keeping a single source of truth in Marsa's own model, I decided to **ship V0.1 with the imperative `DeployApp` primitive plus a `DeployBackend` seam and a DB-as-desired-state data model**, and to **defer the "drive a GitOps controller vs. write our own domain operator" choice to an explicit V0.2 spike**, to achieve a shippable V0.1 push-to-deploy without standing up a second control plane prematurely, accepting that V0.1 has no drift-correction/self-heal (fine for a single-replica MVP) and that the deferral is only safe while #77 keeps manifest _rendering_ separable from _applying_.

## Context

"Deploy" in Marsa is two domains; this AgDR is scoped to **operator-app deploy** (#77 deploy-pre-built-image, #21 build-from-source) — Marsa deploying _customer_ apps. The separate **platform-deploy** domain (rolling Marsa itself, Track A / #91) already earmarked GitOps as a follow-up in [AgDR-0028](AgDR-0028-continuous-deploy-track-a.md) and is not re-decided here.

Key facts that shape the choice:

- Marsa **is** the control plane for operator apps: its source of truth is Postgres (`App`/`Release`), reached through the API. A GitOps controller (Argo CD, Flux) is _also_ a control plane whose source of truth is Git (or a Helm/OCI source). Using one under Marsa means materializing desired state into a source the controller can read and keeping it in sync with the DB — a second source of truth.
- The genuinely hard part Marsa must not hand-roll from primitives is the **controller loop** (`kubectl apply; return success` is a lie — it does not mean pods started, health passed, or traffic switched). But that loop comes from **`controller-runtime`** (Operator SDK / kubebuilder), which Argo _and_ a bespoke operator both sit on — so "don't hand-roll the loop" does not by itself imply "adopt Argo".
- Argo CD's value is its **generality** (arbitrary resources, multi-cluster, RBAC, a UI, a head-start on a paid "GitOps mode"); Marsa's operator-app need is a **fixed, narrow bundle** (`Deployment + Service + Traefik IngressRoute + Secret`) from a constrained model — almost none of Argo's generality is used.
- This is **not** a V0.1 blocker either way: #77 ships with direct apply regardless, and the seam keeps both V0.2 doors open.

## Options Considered

| Option                                                                                       | Pros                                                                                                                                                                                                                 | Cons                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — Adopt Argo CD / Flux in V0.1**                                                         | Reconcile loop, health, rollback, UI off-the-shelf                                                                                                                                                                   | Second control plane + a rendered-manifest Git/OCI source before #77 ships its first deploy; two sources of truth; an Argo `Application` (or Flux `Kustomization`) per operator app at PaaS cardinality; violates AgDR-0015's "defer infra weight until load-bearing" |
| **B — Direct-apply in V0.1; defer the GitOps-vs-own-operator fork to a V0.2 spike** (chosen) | V0.1 ships with the primitive that already works; `DeployBackend` seam + DB-as-desired-state keep both V0.2 paths open; the heavyweight choice is made when there is real drift/scale/paid-feature pressure to weigh | V0.1 has no drift-correction/self-heal (acceptable for single-replica MVP); the V0.2 swap is _contained_, not _free_                                                                                                                                                  |
| **C — Commit now to writing our own domain operator (no GitOps, ever)**                      | One source of truth; full abstraction control (K8s never leaks to users); no per-app Application sprawl; matches how Heroku/Railway/Render are built                                                                 | Over-commits on thin evidence; forecloses Argo/Flux's multi-cluster + UI + paid-GitOps-mode head-start before those requirements are real                                                                                                                             |

## Decision

Chosen: **(B) — direct-apply in V0.1; defer the GitOps-controller-vs-own-operator fork to a V0.2 spike.**

**V0.1 (decided now):**

- Ship #77/#21 with the imperative `DeployApp` primitive from [AgDR-0015](AgDR-0015-deployment-pipeline-v01-sequencing.md). No GitOps controller, no own-operator yet.
- **Seam to protect (a #77 PR review checkpoint):** keep manifest **rendering** (pure → manifest objects from the `App`/`Release` model) separate from **applying** (the imperative kubectl/SSA step), behind a `DeployBackend` port. A `DirectApply` adapter now; an `ArgoCD`/`Flux` adapter **or** an own-operator reconcile adapter later is then a strategy swap, not a rewrite. Derive `Release.status` from an injectable status source (direct rollout read now) rather than hardcoding it. Flattening either seam reopens the retrofit risk — same caution AgDR-0015 records for `triggeredBy` / `App.domain`.
- **Model desired state, not low-level handles:** store `App: { image, replicas, env, port, domain, … }`, not `deployment_id`. This is what makes the V0.2 swap contained.

**V0.2 (deferred to a `/spike`):** evaluate the fork below. Adoption of any GitOps controller crosses the architecture-review threshold (new tech stack + new external integration) → requires Head of Engineering sign-off.

| V0.2 fork             | Drive a GitOps controller (Argo CD or Flux)               | Write our own domain operator (`controller-runtime`) |
| --------------------- | --------------------------------------------------------- | ---------------------------------------------------- |
| Reconcile loop        | Free (controller)                                         | Free (controller-runtime)                            |
| Source of truth       | DB **+** rendered Git/OCI source — two, synced            | DB / CRD — one                                       |
| Components to operate | Controller + state source                                 | Just Marsa's controller                              |
| Per-app overhead      | One `Application` (Argo) / `Kustomization` (Flux) per app | One CRD/DB row per app                               |
| Abstraction           | Source is K8s-shaped YAML → can leak K8s to the model     | Full control → K8s never leaks to users              |
| Free bonuses          | UI, multi-cluster, RBAC, paid "GitOps mode" head-start    | None — build those yourself                          |

**Argo CD vs Flux**, _if_ the controller arm is chosen: lean **Argo CD** for this domain — first-class API + UI + the `ApplicationSet`/app-of-apps model map onto "one Application per operator app," and an API-driven PaaS benefits from Argo's programmatic surface and UI. **Flux** is the lighter, UI-less, GitOps-purist, controller-set alternative (better suited to the platform-deploy domain in AgDR-0028); it remains a valid choice and the spike should compare both rather than assume Argo. The own-operator arm (C above) is the standing alternative to _both_.

## Consequences

- V0.1's deployment milestone is unblocked — no controller and no state source to design before the first deploy increment ships.
- The deferral's safety is conditional: a #77 implementation that fuses rendering into an imperative apply (or hardcodes `Release.status`) turns the V0.2 swap into a rewrite. The seam is therefore a review gate on the #77 PR.
- The V0.2 swap is **contained, not free** — moving to a GitOps controller still requires building the DB→source materialization and per-app `Application`/`Kustomization` management, which is where the two-sources-of-truth tax reappears. The own-operator arm avoids that tax but writes the (modest) reconcile loop in-house.
- The Argo-CD-vs-Flux-vs-own-operator choice is deliberately left to the spike, with a recorded starting lean (Argo CD if the controller arm wins; Flux as the noted alternative) so the spike starts from a position, not a blank page.

## Artifacts

- Recording ticket: marsa-cloud/marsa#77 (the deploy primitive whose seam this decision constrains)
- Related tickets updated to reference this AgDR: marsa-cloud/marsa#77, marsa-cloud/marsa#21
- Builds on: [AgDR-0015](AgDR-0015-deployment-pipeline-v01-sequencing.md) (deploy feature sequencing — the `DeployApp` primitive), [AgDR-0028](AgDR-0028-continuous-deploy-track-a.md) (platform-deploy Track A — already earmarked GitOps as a follow-up), [AgDR-0027](AgDR-0027-image-build-and-publish-pipeline.md) (the images either path deploys)
- Follow-up: a V0.2 `/spike` ticket evaluating Argo CD vs Flux vs an own domain operator for operator-app reconciliation (to be filed when V0.2 planning opens)
