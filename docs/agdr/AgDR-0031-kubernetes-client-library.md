---
id: AgDR-0031
timestamp: 2026-06-29T15:18:38Z
agent: claude
model: claude-opus-4-8
trigger: user-prompt
status: accepted
ticket: marsa-cloud/marsa#98
---

# Kubernetes client for the DirectApply deploy adapter: `@kubernetes/client-node`

> In the context of implementing the V0.1 `DirectApply` deploy adapter that [AgDR-0029](AgDR-0029-gitops-argo-flux-for-operator-app-deploy.md) established (#98), facing the choice of how `apps/api` talks to the K3s API to apply an operator app's manifest bundle, I decided to adopt the official **`@kubernetes/client-node`** library (added via the pnpm catalog), to achieve typed, in-process cluster access without shelling out to an external binary, accepting a non-trivial transitive dependency surface and that we are now coupled to that client's API shape behind the `DeployBackend` seam.

## Context

[AgDR-0029](AgDR-0029-gitops-argo-flux-for-operator-app-deploy.md) decided the _shape_ of V0.1 operator-app deploy — an imperative `DeployApp` primitive behind a `DeployBackend` port with a `DirectApply` adapter, DB-as-desired-state, GitOps deferred to a V0.2 spike. It did **not** pick the concrete library the adapter uses to reach the cluster. #98 (the first end-to-end deploy slice) forces that choice.

Constraints that shape it:

- The adapter runs **in-cluster** in prod (the api pod on K3s) and **locally** against a dev kubeconfig. Whatever we pick must resolve both without branching auth code.
- The bundle is fixed and small: `Deployment` + ClusterIP `Service` + Traefik `IngressRoute` (a CRD). We need typed core objects **and** a path to apply an arbitrary CRD.
- The api is ESM (`"type": "module"`), Node ≥ 22, NestJS 11 on Fastify. The client must work under NodeNext ESM.
- Per the seam (AgDR-0029 / AgDR-0014), the library is an implementation detail **behind** `DeployBackend` — only the real adapter imports it; the `NODE_ENV=test` fake never does, so CI needs no cluster.

## Options Considered

| Option                                           | Pros                                                                                                                                                                                                                              | Cons                                                                                                                                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`@kubernetes/client-node` (official, chosen)** | Official SDK; typed core models; `loadFromDefault()` resolves in-cluster SA **and** local kubeconfig with no branching; `KubernetesObjectApi` applies arbitrary objects incl. CRDs and supports server-side apply; ESM-compatible | Heavy transitive dependency surface (request stack, ws); generated typings are verbose; we couple to its API shape (mitigated by the seam)                                       |
| Shell out to `kubectl apply`                     | Trivial to reason about; CRD-agnostic                                                                                                                                                                                             | Adds a runtime **binary** dependency to the api image; stringly-typed; error handling is exit-code + stderr parsing; no typed status reads for `Release.status`                  |
| `helm upgrade --install` per app                 | We already maintain `marsa-charts`; templating exists                                                                                                                                                                             | Re-introduces a binary dep + imperative upgrade semantics; a release-per-app is heavier than rendering four objects; couples app deploy to chart packaging                       |
| Hand-rolled REST via `fetch`                     | Zero dependency; full control                                                                                                                                                                                                     | Re-implements auth (in-cluster token + CA, kubeconfig exec plugins), ret/watch, and SSA content negotiation — exactly the undifferentiated work the official client already does |

## Decision

Chosen: **`@kubernetes/client-node`**, because it is the only option that gives typed in-process access, resolves both auth contexts through `loadFromDefault()`, and exposes `KubernetesObjectApi` for applying the Traefik `IngressRoute` CRD and for server-side apply (the mechanism chosen in [AgDR-0032](AgDR-0032-server-side-apply-deploy-mechanism.md)) — all without adding a binary to the api image. The dependency weight is real but is isolated behind the `DeployBackend` seam, so a future swap (e.g. when the V0.2 GitOps spike lands) does not ripple into the use-case.

Added to the root pnpm **catalog** (`pnpm-workspace.yaml`) and referenced from `apps/api/package.json` as `"catalog:"`, per the monorepo dependency convention.

## Consequences

- `apps/api` gains `@kubernetes/client-node` as a production dependency; only `src/modules/kubernetes/direct-apply-deploy-backend.ts` imports it. The fake adapter and all CI paths stay cluster-free.
- Cluster auth is `loadFromDefault()` — in-cluster service account in prod, `KUBECONFIG`/`~/.kube/config` locally. No new secret env var for the public-image slice (private-registry creds are #99).
- We are coupled to the client's API surface behind the seam; a swap is a single-adapter change, not a use-case change.
- Enables [AgDR-0032](AgDR-0032-server-side-apply-deploy-mechanism.md) (server-side apply via `KubernetesObjectApi`).

## Artifacts

- Ticket: marsa-cloud/marsa#98 — https://github.com/marsa-cloud/marsa/issues/98
- Builds on: [AgDR-0029](AgDR-0029-gitops-argo-flux-for-operator-app-deploy.md) (DeployBackend port + DirectApply), [AgDR-0014] (external-client seam), [AgDR-0015](AgDR-0015-deployment-pipeline-v01-sequencing.md) (sequencing)
- Paired with: [AgDR-0032](AgDR-0032-server-side-apply-deploy-mechanism.md) (apply mechanism)
- Commit / PR: filled in as #98 ships
