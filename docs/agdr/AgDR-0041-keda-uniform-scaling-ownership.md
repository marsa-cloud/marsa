---
id: AgDR-0041
timestamp: 2026-08-08T00:00:00Z
agent: claude
model: claude-opus-5
trigger: user-prompt
status: accepted
ticket: marsa-cloud/marsa#119
---

# KEDA owns the replica count for every app, on one deploy path

> In the context of adding scale-to-zero (#119, promoted from the #120 spike), facing the
> issue's open question of whether to **fork a parallel serverless use-case or refactor the
> existing deploy path in place**, I decided to **refactor in place and give KEDA ownership of
> the replica count for _all_ apps** — replacing the fixed `Deployment.spec.replicas` with an
> `HTTPScaledObject` carrying a `minReplicas`/`maxReplicas` range — to achieve a single deploy
> path with no serverless/always-on fork anywhere in the codebase, accepting that the shared
> KEDA HTTP interceptor becomes a component on the request path of every tenant app, including
> ones that never asked for autoscaling.

## Context

- The #120 spike confirmed scale-to-zero works on Marsa's real ingress model (Traefik
  `IngressRoute` → KEDA HTTP add-on interceptor → pod), measured on k3d: idle is genuinely 0
  replicas, cold start ≈ 3.0s for a tiny cached image, warm ≈ 0.12s.
- #119 left the refactor-vs-fork question explicitly open for this record.
- Today an app is a `Deployment` with a fixed `spec.replicas`. There is **no autoscaler of any
  kind** in the cluster — so this is not swapping one scaler for another, it is adding
  autoscaling where none existed.
- The KEDA HTTP add-on's scaling metric _is_ the interceptor's pending-request count. There is
  no way to have KEDA scale on HTTP traffic without that traffic physically flowing through the
  interceptor. "KEDA for every app" therefore necessarily means "interceptor on every request
  path" — the two cannot be separated.

## Options Considered

| Option                                          | Pros                                                                                                                                                                                               | Cons                                                                                                                                                                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Uniform KEDA ownership (chosen)**             | One deploy path; no `if serverless` branch anywhere; the Deployment never declares `replicas`, so the SSA-ownership hazard is handled once rather than conditionally; autoscaling arrives for free | Shared interceptor becomes a hard availability dependency for 100% of tenant traffic; the scaling-metric target becomes a platform-wide policy applied to apps that never asked for it; contradicts #119's AC that the always-on path is unchanged |
| Hybrid — `HTTPScaledObject` only when `min = 0` | Blast radius on the always-on path is exactly zero; the interceptor stays opt-in, so scale-to-zero can fail without taking working apps down with it; satisfies the AC literally                   | Two render branches and two failure models to reason about forever; `min ≥ 1, max > min` has no coherent meaning without either a third path or a validation rule that reads like a bug                                                            |
| Fork a `deploy-serverless-app` use-case         | Strongest isolation of the new path                                                                                                                                                                | Duplicates the deploy pipeline (command, repository, response, apply) for a difference that is entirely in one render function; every future deploy change lands twice                                                                             |

## Decision

Chosen: **uniform KEDA ownership**, at the operator's explicit direction ("uniform KEDA until
something breaks"), because a single scaling model is simpler to hold in the head than two, and
the render logic genuinely collapses — no branch, no conditional `replicas`, one `HTTPScaledObject`
per app always.

The recommendation on the table was the hybrid, on the grounds that it lets scale-to-zero fail
without taking working apps down with it. That was a judgement call about how much to trust a
new component on the request path, not a correctness argument, and the operator has accepted
the trade knowingly.

Consequential sub-decisions taken with it:

- **`minReplicas` / `maxReplicas` as real columns**, replacing the single `replicas`. Existing
  apps backfill to `min = max = N`, so no app changes its replica count on upgrade.
- **Vocabulary stays "replicas"**, not "instances". Cloud Run and Render say "instances"
  because they hide Kubernetes; Marsa does not.
- **Traefik `allowCrossNamespace: true`**, not per-app `ExternalName`. Both need a flag k3s
  disables by default, so neither is free — but an `ExternalName` resolves to arbitrary DNS
  (in-cluster services, node metadata endpoints), which makes it an SSRF primitive the day
  tenants can supply their own manifests. Cross-namespace is the contained mistake.
- **Scaling knobs are platform-wide API constants** (`SCALEDOWN_PERIOD_SECONDS`, the metric
  target). Per-app configuration is acknowledged as the _correct_ model and deferred purely for
  scope.
- **`AppHealthStatus.Idle`** so a sleeping app does not read as `Unavailable`.

## Consequences

- The interceptor is a single point of failure for all tenant ingress. Mitigated in
  `marsa-charts` with `interceptor.replicas: 2` — which on single-node k3s buys rolling-upgrade
  and crash survival, but nothing against node loss (where every app is down regardless). No
  PodDisruptionBudget: on one node it protects nothing and hangs `kubectl drain`.
- **#119's acceptance criterion "the always-on (1+) path is unchanged for existing apps" is no
  longer true** and must be amended on the issue. Existing apps move onto the interceptor on
  their next deploy. This is a deliberate amendment, not drift.
- `Deployment.spec.replicas` must be **omitted, not zeroed**, from the applied config. KEDA's
  HPA owns that field via the scale subresource; a `marsa-deployer` field manager that keeps
  declaring it will fight KEDA on every redeploy.
- A redeploy of a sleeping app **cannot report failure** — a 0-replica Deployment satisfies
  `Available=True` trivially, so a broken image reports `Succeeded` until a request wakes it.
  Accepted: `Succeeded` means "applied and settled", and the failure surfaces within one
  request via health + run logs.
- A destructive migration (dropping `replicas`) is required, which pulls in the migration gate:
  a labelled ticket plus a migration AgDR.
- Revisit trigger for `allowCrossNamespace`: **if tenants ever gain the ability to supply their
  own manifests**, the flag lets one tenant route to another's Service, and a per-namespace
  interceptor becomes the migration target.

## Artifacts

- Ticket: marsa-cloud/marsa#119 (spike: marsa-cloud/marsa#120)
- Design: [`docs/superpowers/specs/2026-08-08-scale-to-zero-keda-design.md`](../superpowers/specs/2026-08-08-scale-to-zero-keda-design.md)
- Builds on: [AgDR-0029] (deploy seam), [AgDR-0031] (`@kubernetes/client-node`), [AgDR-0032] (server-side apply), [AgDR-0034] (deploy-status reconciliation)
- Charts PR: _(to be linked)_
- API PR: _(to be linked)_

[AgDR-0029]: AgDR-0029-gitops-argo-flux-for-operator-app-deploy.md
[AgDR-0031]: AgDR-0031-kubernetes-client-library.md
[AgDR-0032]: AgDR-0032-server-side-apply-deploy-mechanism.md
[AgDR-0034]: AgDR-0034-deploy-status-reconciliation-mechanism.md
