# CD Pipeline Design

**Date:** 2026-05-20
**Status:** Approved

## Overview

Continuous Deployment pipeline that builds and publishes two Docker images to GHCR on every push to `main` and on semver git tags. Separate from the existing CI workflow (`ci.yml`).

## Images

| Image      | Registry path                   |
| ---------- | ------------------------------- |
| NestJS API | `ghcr.io/marsa-cloud/marsa-api` |
| Nuxt SPA   | `ghcr.io/marsa-cloud/marsa-web` |

## Triggers & Tagging

| Event                            | Tags produced                      |
| -------------------------------- | ---------------------------------- |
| Push to `main`                   | `sha-<short-commit>`, `latest`     |
| Push of `v*` tag (e.g. `v1.2.0`) | `v1.2.0`, `1.2.0`, `1.2`, `latest` |

## Dockerfiles

### `apps/api/Dockerfile`

Multi-stage build:

- **Stage 1 (`builder`):** `node:22-alpine` + pnpm; installs all workspace deps from repo root, runs `pnpm build:api`, produces `dist/`.
- **Stage 2 (`runner`):** `node:22-alpine`; copies `dist/` and installs production-only deps; entrypoint `node dist/main`. Accepts `ARG VERSION` (default `0.0.0`) and `ARG COMMIT`, exposes them as `ENV VERSION` / `ENV COMMIT` so `GetApiInfoService` can read them via `process.env`.

### `apps/web/Dockerfile`

Multi-stage build:

- **Stage 1 (`builder`):** `node:22-alpine` + pnpm; installs all workspace deps. Accepts `ARG VERSION` (default `0.0.0`) and `ARG COMMIT`, exposes them as `ENV NUXT_PUBLIC_VERSION` / `ENV NUXT_PUBLIC_COMMIT` _before_ `pnpm build:web` so Nuxt bakes them into `runtimeConfig.public` in the static SPA bundle. Nuxt SPA (`ssr: false`) emits static files to `.output/public/`.
- **Stage 2 (`runner`):** `nginx:alpine`; copies `.output/public/` to `/usr/share/nginx/html`; no Node runtime at run time.

Both images have a corresponding `.dockerignore` excluding `node_modules/`, `.git/`, `dist/`, `*.test.*`, and test fixtures.

### Version & commit propagation

Both images receive the same build args from CD:

| Build arg | Source                                                                       | API runtime           | Web runtime                         |
| --------- | ---------------------------------------------------------------------------- | --------------------- | ----------------------------------- |
| `VERSION` | `steps.meta.outputs.version` (semver on tag pushes, `sha-<short>` on `main`) | `process.env.VERSION` | `useRuntimeConfig().public.version` |
| `COMMIT`  | `${{ github.sha }}` (full 40-char SHA)                                       | `process.env.COMMIT`  | `useRuntimeConfig().public.commit`  |

For the API the values are runtime env vars (changeable per pod). For the web SPA they are baked into the static bundle at build time — there is no runtime injection path for pure-SPA Nuxt without a Nitro server.

## CD Workflow (`.github/workflows/cd.yml`)

- Triggers on `push` to `main` and `push` of `v*` tags.
- Two **parallel jobs**: `publish-api` and `publish-web`.
- Each job:
  1. Checks out the repo (full history not needed, `fetch-depth: 1`).
  2. Sets up QEMU + Docker Buildx.
  3. Logs into GHCR using `GITHUB_TOKEN` — no extra secrets required.
  4. Runs `docker/metadata-action` to derive the tag list from the trigger.
  5. Runs `docker/build-push-action` with GitHub Actions layer cache (`type=gha, mode=max`).
  6. Pushes the built image to GHCR.

## Correctness Gate

The CD workflow does **not** call or wait for `ci.yml`. Correctness is enforced at the repo level: branch protection on `main` requires CI to pass before a PR can merge. Tag pushes are assumed to be cut from a commit that already passed CI.

## Helm Chart Integration

The separate Helm chart repo references image tags as values:

```yaml
api:
  image:
    repository: ghcr.io/marsa-cloud/marsa-api
    tag: sha-abc1234 # or a semver tag for releases

web:
  image:
    repository: ghcr.io/marsa-cloud/marsa-web
    tag: sha-abc1234
```

Pinning by `sha-<commit>` on staging and by semver on production gives traceability without manual ceremony during fast iteration.

## Out of Scope

- Automatic Helm chart value updates (e.g. opening a PR in the Helm repo with the new tag) — deferred.
- Multi-platform builds (`linux/arm64`) — add `platforms` to `build-push-action` when needed.
- Image vulnerability scanning — deferred.
