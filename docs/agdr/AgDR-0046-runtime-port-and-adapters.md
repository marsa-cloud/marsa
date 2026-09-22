---
id: AgDR-0046
timestamp: 2026-09-22T00:00:00Z
agent: claude
model: claude-opus-5
trigger: user-prompt
status: accepted
ticket: marsa-cloud/marsa#226
---

# Runtime port and adapters

> In the context of Marsa's Kubernetes-shaped deploy seam (#226), facing a support module fed feature-built Kubernetes objects and a service imported across features, I decided to **model the runtime as Marsa-owned ports (`AppRuntime`, `EnvironmentRuntime`, `NodeRuntime`) implemented by per-technology adapters, with rendering behind the port**, to achieve a seam another runtime could implement without touching features, accepting that only the Kubernetes and mock adapters exist.

## Context

`DeployBackend` was abstract but took rendered Kubernetes objects: `ApplyReleaseService` in
`release/services/` rendered a `Release` into `V1Deployment` / `IngressRoute` /
`HTTPScaledObject` and handed them over. `renderManifests` lived in `release/render/`,
`namespaceOf` in `environment/entities/`, and `src/modules/kubernetes/` was a flat directory of
twenty files. #222 then made `app-management/update-app` import `ApplyReleaseService`, a service
from another feature, which the api boundary rule forbids. #229 asked whether a non-Kubernetes
backend (plain Docker, bash) could fit; the answer was "not without Kubernetes objects crossing
the seam".

## Options Considered

| Option                                        | Pros                                                          | Cons                                                        |
| --------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| Ports and adapters, rendering behind the port | Features speak Marsa; one folder per technology; answers #229 | Largest diff; every consumer changes                        |
| Move files, keep the Kubernetes-shaped seam   | Smaller diff                                                  | The port still speaks Kubernetes; #229 stays hard           |
| Folder reorganisation only                    | Cheapest                                                      | Keeps a support module fed feature-built Kubernetes objects |
| Allow cross-feature service imports           | No code change                                                | Normalises the coupling the boundary rule exists to stop    |
| Also build a Docker adapter                   | Proves the port                                               | Nobody needs it; YAGNI                                      |

## Decision

Chosen: **ports and adapters**.

- `src/modules/runtime/` holds the three abstract classes and Marsa-vocabulary types:
  `AppRef`, `EnvironmentRef`, `AppDeploySpec`. No port parameter names a namespace or a
  Deployment.
- `adapters/kubernetes/` owns rendering, namespace naming, rollout parsing and every import of
  `@kubernetes/client-node`. `adapters/mock/` is the network-free adapter.
- A plain `RuntimeModule` loads exactly one `@Global()` adapter module through
  `ConditionalModule.registerWhen` on `MARSA_RUNTIME=kubernetes|mock` (default `kubernetes`).
  It stays config-driven because `pnpm dev:api` boots the production module and must get the mock.
- `ApplyReleaseService` is deleted. `deploySpecOf()` in `release/entities/` builds the spec,
  and `deploy-release` / `update-app` call `AppRuntime.deploy` themselves.
- Features may import each other's `entities/`, `queries/`, `enums/`, `errors/` and `events/`
  in either direction, and never another feature's `services/`.

## Consequences

- The boundary is a convention (`.claude/rules/api/runtime.md`), not lint: only
  `adapters/kubernetes/**` imports `@kubernetes/client-node`, and `src/app/**` never imports
  `#src/modules/runtime/adapters/**` (tests excepted).
- `AppRef` / `EnvironmentRef` are structural, so a feature's `AppPlacement` fits the port with no
  mapper; `RuntimeErrorFilter` maps `EnvironmentConflictError` to 409 once for every use-case.
- The environment API responses lose their `namespace` field; the web no longer shows it.
- `DEPLOY_BACKEND=direct|mock` became `MARSA_RUNTIME=kubernetes|mock`.
- An adapter lacking a capability throws; the port is not shrunk to the weakest adapter.
- #229 closes on this record: the architecture exists. Whether Docker can do scale-to-zero, and
  what the Docker socket does to the security model, stay unanswered by design.

## Artifacts

- Spec: `docs/superpowers/specs/2026-09-22-runtime-port-and-transactions-design.md`
- Plan: `docs/superpowers/plans/2026-09-22-runtime-port.md`
- Ticket: [marsa-cloud/marsa#226](https://github.com/marsa-cloud/marsa/issues/226)
- Answers: [marsa-cloud/marsa#229](https://github.com/marsa-cloud/marsa/issues/229)
