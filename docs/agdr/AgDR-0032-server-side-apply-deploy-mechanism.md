---
id: AgDR-0032
timestamp: 2026-06-29T15:19:00Z
agent: claude
model: claude-opus-4-8
trigger: user-prompt
status: accepted
ticket: marsa-cloud/marsa#98
---

# DirectApply applies the manifest bundle via Kubernetes server-side apply

> In the context of implementing the `DirectApply` adapter that [AgDR-0029](AgDR-0029-gitops-argo-flux-for-operator-app-deploy.md) established for V0.1 operator-app deploy (#98), facing the choice — left open by 0029's "imperative kubectl/SSA step" — of _how_ the adapter writes the `Deployment` + `Service` + `IngressRoute` bundle, I decided to use **Kubernetes server-side apply (SSA)** with a fixed field manager rather than imperative create-or-replace, to achieve one idempotent code path for both first-deploy and re-deploy (so #100 becomes a re-apply, not bespoke patch logic), accepting slightly more setup now (apply-patch content type + force-conflicts) and a dependency on the cluster supporting SSA (Kubernetes ≥ 1.18, true on K3s).

## Context

This AgDR is **scoped narrowly to the apply mechanism inside the DirectApply adapter.** It does **not** re-decide the port, the direct-apply-vs-GitOps question, or the ArgoCD-vs-Flux-vs-own-operator fork — [AgDR-0029](AgDR-0029-gitops-argo-flux-for-operator-app-deploy.md) owns all of those and defers the GitOps fork to a V0.2 spike. 0029 referred to the V0.1 write step loosely as "the imperative kubectl/SSA step," treating imperative and SSA as interchangeable. They are not, and #98 must pick one.

The bundle is four objects derived (purely) from the `App`/`Release` model: a `Deployment`, a ClusterIP `Service`, and a Traefik `IngressRoute` CRD. The same bundle is written on the **first** deploy of an app and on **every re-deploy** (#100 — a new `Release` replacing the running container). The apply mechanism is what determines how painful that second case is.

`@kubernetes/client-node` ([AgDR-0031](AgDR-0031-kubernetes-client-library.md)) supports both styles: typed `create*/replace*/patch*` calls (imperative) and `KubernetesObjectApi.patch` with the apply-patch content type (SSA).

## Options Considered

| Option                         | Pros                                                                                                                                                                                                                                                                                                                               | Cons                                                                                                                                                                                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Server-side apply (chosen)** | One call shape for create **and** update — no exists-check, no verb branching; Kubernetes reconciles by field ownership, so re-deploy (#100) is the _same_ `apply()`; server-managed fields like `Service.clusterIP` are preserved automatically (SSA only writes the fields we own); conflicts resolved declaratively via `force` | Requires the apply-patch content type + a stable `fieldManager`; force-conflicts semantics must be understood; needs cluster SSA support (K8s ≥ 1.18 — satisfied on K3s)                                                                                             |
| Imperative create-or-replace   | Familiar; no SSA concepts                                                                                                                                                                                                                                                                                                          | Every object needs read → branch on exists → create or replace; `Service` replace must carry over live `clusterIP` + `resourceVersion` or the API 422s; #100 re-deploy becomes bespoke per-object patch logic to write and test — the retrofit cost 0029 warns about |
| Delete + recreate              | Simplest mental model                                                                                                                                                                                                                                                                                                              | Causes downtime (Service/Deployment churn), drops `clusterIP` (breaks in-flight routing), loses rollout continuity — unacceptable for a deploy primitive                                                                                                             |

## Decision

Chosen: **server-side apply**, because the operator-app bundle is written repeatedly (every deploy and re-deploy) and SSA collapses first-deploy and re-deploy into a single idempotent `apply()` call. We already construct the full desired object for rendering, so SSA reuses that object directly — the idempotency is essentially free relative to imperative create-or-replace, which would need per-object exists-checks and `Service` field salvage. This directly serves #100 (re-deploy = re-apply) and keeps `Release.status` derived from a post-apply rollout read (per AgDR-0029), not from the apply call's return.

Mechanics: `KubernetesObjectApi.patch(obj, …, fieldManager='marsa-deployer', force=true, { headers: { 'Content-Type': 'application/apply-patch+yaml' } })` for each of the three objects, into the derived namespace.

## Consequences

- #100 (re-deploy) is implemented by calling the same `DeployBackend.apply()` — no new create-vs-update branch, materially less code and test surface than imperative would need.
- A fixed field manager (`marsa-deployer`) owns the fields Marsa sets; `force: true` takes ownership on conflict, which is correct because Marsa is the sole controller of these objects in V0.1.
- `Service.clusterIP` and other server-populated fields are preserved across re-applies without salvage code.
- Couples the adapter to cluster SSA support — fine for K3s; noted as a constraint if a non-SSA target is ever introduced.
- Does **not** affect the V0.2 GitOps fork: if a GitOps controller is later adopted (the 0029 spike), this SSA adapter is simply one `DeployBackend` strategy that the swap replaces.

## Artifacts

- Ticket: marsa-cloud/marsa#98 — https://github.com/marsa-cloud/marsa/issues/98
- Builds on: [AgDR-0029](AgDR-0029-gitops-argo-flux-for-operator-app-deploy.md) (owns the port + direct-apply + GitOps-deferral decision — not re-decided here)
- Paired with: [AgDR-0031](AgDR-0031-kubernetes-client-library.md) (the client library SSA uses)
- Commit / PR: filled in as #98 ships
