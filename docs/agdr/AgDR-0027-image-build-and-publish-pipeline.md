---
id: AgDR-0027
timestamp: 2026-05-20T00:00:00Z
agent: claude
model: claude-opus-4-8
trigger: user-prompt
status: accepted
ticket: marsa-cloud/marsa#94
---

# Image build & publish pipeline (`cd.yml`): multi-stage Dockerfiles → GHCR, sha + semver tags

> In the context of getting Marsa's two apps into runnable container images, facing the need to build and publish on every `main` push and on semver tags without coupling to the CI workflow, I decided to add a dedicated **`cd.yml`** that builds **multi-stage Dockerfiles** (Node-alpine API runner; nginx-served static Nuxt SPA) and pushes both to **GHCR** with a derived **`sha-<commit>` + semver/`latest`** tag set, in two parallel jobs authenticated by `GITHUB_TOKEN`, to achieve traceable, cache-fast image publishing, accepting that correctness is gated by branch protection on `main` rather than by `cd.yml` waiting on CI.

> **Scope note:** this AgDR records the **image build/publish mechanics** (Dockerfiles, registry, tagging, workflow shape). It is distinct from [AgDR-0015](AgDR-0015-deployment-pipeline-v01-sequencing.md), which records the **deploy feature sequencing/scope** (pull-image → build-from-source → self-hosted registry), and from [AgDR-0028](AgDR-0028-continuous-deploy-track-a.md), which records **rolling a published image onto the running cluster** (Track A).

## Context

The repo needed container images for `apps/api` (NestJS) and `apps/web` (Nuxt SPA, `ssr: false`). The build/publish step is separate from `ci.yml` (lint/typecheck/test). The web app is pure SPA with no Nitro server, so version/commit metadata can't be injected at runtime — it must be baked at build time. Images feed the Helm chart (`marsa-charts`), which references them by tag.

## Options Considered

| Option | Pros | Cons |
| ------ | ---- | ---- |
| **Dedicated `cd.yml`, multi-stage builds, GHCR, parallel api/web jobs** (chosen) | Decouples "make image" from "test code"; multi-stage keeps runtime images lean (api: node-alpine runner; web: nginx static, no Node at runtime); `GITHUB_TOKEN` needs no extra secrets; `docker/metadata-action` derives tags; gha layer cache (`mode=max`) makes rebuilds fast | `cd.yml` doesn't itself wait on CI — relies on branch protection for correctness |
| `cd.yml` gates on / waits for `ci.yml` to pass | Build can't run on un-tested code | Workflow-to-workflow waits are brittle; duplicates the guarantee branch protection already gives on PR merge |
| Single combined CI+build workflow | One file | Couples slow image builds to every CI run; muddies failure attribution |

## Decision

Chosen: **dedicated `cd.yml` with multi-stage Dockerfiles publishing to GHCR**.

- **Images:** `ghcr.io/marsa-cloud/marsa-api`, `ghcr.io/marsa-cloud/marsa-web`.
- **Triggers & tags:** push to `main` → `sha-<short>` + `latest`; push of `v*` → `v1.2.0`, `1.2.0`, `1.2`, `latest` (via `docker/metadata-action`).
- **API Dockerfile:** stage 1 `node:22-alpine` + pnpm builds `dist/`; stage 2 `node:22-alpine` prod-only deps, entrypoint `node dist/main`. `ARG VERSION/COMMIT` → `ENV` read at runtime by `GetApiInfoService`.
- **Web Dockerfile:** stage 1 builds the static SPA, with `ARG VERSION/COMMIT` exposed as `ENV NUXT_PUBLIC_*` **before** `pnpm build:web` so Nuxt bakes them into `runtimeConfig.public`; stage 2 `nginx:alpine` serves `.output/public/` — no Node at runtime.
- **Workflow:** two parallel jobs (`publish-api`, `publish-web`); QEMU + Buildx; GHCR login via `GITHUB_TOKEN`; `docker/build-push-action` with `type=gha, mode=max` cache.
- **Correctness gate:** branch protection on `main` requires CI green before merge; tag pushes are cut from already-passed commits. `cd.yml` does not call/await `ci.yml`.

Out of scope: auto-bumping Helm chart values (deferred — see AgDR-0028 Track A `--set image.tag` instead), `linux/arm64` multi-platform builds, image vulnerability scanning.

## Consequences

- Every `main` commit yields traceable `sha-<commit>`-tagged images; releases get semver tags. The Helm chart pins by sha (iteration) or semver (release).
- Web version/commit are immutable per build (baked into the static bundle); changing them means a rebuild, not a pod env change — an accepted SPA constraint.
- Correctness depends on branch protection being configured on `main`; if that protection is removed, an untested commit could publish.
- Lean runtime images (nginx for web, prod-only deps for api) keep pull/start fast on the cluster.

## Artifacts

- Recording ticket: marsa-cloud/marsa#94 (back-fill consolidation)
- Originating work: the `feat/cd-pipeline` PR (marsa-cloud/marsa#15).
- Back-filled from the design spec (`docs/superpowers/specs/2026-05-20-cd-pipeline-design.md`, removed in #94 once consolidated here).
- Key files: `.github/workflows/cd.yml`, `apps/api/Dockerfile`, `apps/web/Dockerfile`, `apps/web/nginx.conf`, both `.dockerignore` files
- Related: [AgDR-0015](AgDR-0015-deployment-pipeline-v01-sequencing.md) (deploy sequencing), [AgDR-0028](AgDR-0028-continuous-deploy-track-a.md) (rolling images onto the cluster)
