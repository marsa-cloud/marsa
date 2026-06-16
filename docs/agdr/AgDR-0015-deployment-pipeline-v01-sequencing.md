---
id: AgDR-0015
timestamp: 2026-06-16T00:00:00Z
agent: claude
model: claude-sonnet-4-6
trigger: user-prompt
status: draft
ticket: marsa-cloud/marsa#77
---

# Deployment pipeline v0.1 — pull-image first, build-from-source second, self-hosted registry deferred

> In the context of scoping the deployment pipeline (#21, originally an unscoped placeholder) for Marsa V0.1, facing the tension between shipping something usable quickly and shipping the actual "push to deploy" automation that makes Marsa a PaaS rather than a thin Kubernetes wrapper, we decided to split the pipeline into three additive increments — **deploy a pre-built image** (#77), then **build from source on push, pushing to an external registry** (#21), then **self-host the image registry** (#78, deferred to V0.2) — designed around one reusable deploy primitive so later increments add new producers rather than rewriting earlier ones, accepting that the "real PaaS" push-to-deploy experience doesn't land until the second increment.

## Context

#21 ("Deployment Pipeline") was an unscoped placeholder issue covering everything from cloning source to running self-hosted image storage — exactly the anti-pattern marsa's own `.claude/project-management.md` scoping rule warns against ("BAD: Deployment System" / "GOOD: split into separate features"). Two sub-issues (#60 clone-via-installation-token, #61 push-webhook-receiver) were already filed as Tasks but mis-parented under #23 (GitHub repo access) rather than under the deployment pipeline itself — #23's own decision note (AgDR-0005) scopes it as "get a token for this repo," not "do something with that token."

Separately, the product question: building an image from source (Kaniko/BuildKit job, triggered by a push webhook) is what makes the experience "I pushed code and it's live" — the actual PaaS differentiator, distinct from a generic Kubernetes wrapper that just runs whatever image you hand it. Self-hosting an image registry (storage, garbage collection — flagged in prior SPIKE notes as "the Disk Space Trap") is real operational weight that doesn't change the user-facing experience at all; an external registry (GHCR/Docker Hub) is functionally invisible to the operator.

## Options Considered

| Option | Pros | Cons |
|---|---|---|
| **(a) Pull pre-built image → build-from-source+external-registry → self-hosted-registry, as three additive increments** (chosen) | Ships something deployable in ~3–5 days; the "real PaaS" automation lands in the second increment (~12–18 days) without redoing the first; registry self-hosting (~18–28 days total) deferred until it's actually load-bearing | Three Feature issues/PRs instead of one big one; v0.1's first slice alone isn't yet "real Marsa" |
| (b) Full self-hosted build+registry in one go | Matches the original SPIKE flow exactly; zero third-party dependency from day one | ~18–28 days before anything ships; registry GC is exactly the kind of infra-heavy work that benefits from being deferred until proven necessary |
| (c) Pull pre-built image only, defer build-from-source past v0.1 | Fastest to ship (~3–5 days) | Guts the actual differentiator — #60/#61 (clone, webhook) become pointless without a build step; v0.1 ships something closer to "K8s wrapper" than "PaaS" |

## Decision

Chosen: **(a)**, sequenced as three Feature issues against one reusable deploy primitive.

- **#77 — Deploy pre-built images** (Marsa V0.1, build first). Introduces the `App` / `Release` data model: an `App` has a slug/domain/credentials/port; a `Release` is one row per deploy event (`imageRef`, `triggeredBy`, `status`). `triggeredBy` starts with only the `'manual'` value populated — the field exists specifically so #21's build step is a **new value, not a new column or new code path**. Domain is modeled as `{ type: 'subdomain' }` now with `{ type: 'custom', host }` reserved on the same field, so custom-domain support (if ever) doesn't force a schema rework. TLS/routing reuses the exact Traefik `IngressRoute` + `certResolver: le` pattern `marsa-charts` already runs for Marsa itself.
- **#21 — Git-based build & deploy** (Marsa V0.1, build second; already holds sub-issues #60 clone, #61 webhook receiver, re-parented off #23 by this same decision). Adds a Kaniko/BuildKit job triggered by the push webhook, producing an `imageRef` that is pushed to an **external** registry (operator-configured) and handed to the **same** `DeployApp` use-case #77 introduces — a new `Release` producer, not a new deploy path.
- **#78 — Self-hosted image registry** (Marsa V0.2, deferred). Same external-vs-internal registry choice is just a configuration value to the existing build/deploy flow; GC and storage management are self-contained and don't touch #77/#21's code.

#23 (GitHub Auth — repo access) is corrected back to its original scope: #58 (App provisioning) and #59 (installation tokens) only. It is functionally done (both merged, ACs verified by code inspection) but stays open pending the operator's own group-level QA pass before #22/#23 close — no QA-Engineer-agent sign-off requested per-ticket for this group.

## Consequences

- #21 retitled "Git-based build & deploy" (was "Deployment Pipeline"), Milestone Marsa V0.1, sub-issues #60/#61 moved from #23.
- Two new Feature issues filed: #77 (Marsa V0.1) and #78 (Marsa V0.2).
- The `Release.triggeredBy` field and the `App.domain` discriminated shape are the two concrete schema decisions that keep #21 and #78 additive on top of #77 — any implementation of #77 that flattens either of these back into a single non-extensible field reopens the retrofit risk this AgDR exists to avoid.
- v0.1's first shippable increment is not yet "real Marsa" (no push-to-deploy automation) — acceptable because #21 lands inside the same milestone, not a future one.

## Artifacts

- Tickets: marsa-cloud/marsa#77 (Deploy pre-built images), marsa-cloud/marsa#21 (Git-based build & deploy), marsa-cloud/marsa#78 (Self-hosted image registry, V0.2)
- Builds on: [AgDR-0005](AgDR-0005-github-app-integration-model.md) (GitHub App integration — #23's scope), [AgDR-0012](AgDR-0012-installation-token-strategy.md) (installation tokens consumed by #21's clone step)
- Reference implementation for domain/TLS: `marsa-charts/charts/marsa/templates/ingress-route.yml`
