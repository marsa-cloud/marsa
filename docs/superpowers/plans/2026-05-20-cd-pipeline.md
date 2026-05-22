# CD Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and push two Docker images (`marsa-api`, `marsa-web`) to GHCR on every push to `main` (tagged `sha-<commit>` + `latest`) and on `v*` git tags (tagged with semver).

**Architecture:** Two separate multi-stage Dockerfiles — one for the NestJS API (Node runner) and one for the Nuxt SPA (nginx static server). A dedicated `cd.yml` GitHub Actions workflow runs two parallel publish jobs, one per image, triggered independently of `ci.yml`. Correctness is gated by branch protection on `main`, not workflow coordination.

**Tech Stack:** Docker multi-stage builds, GHCR (`ghcr.io`), `docker/metadata-action@v5`, `docker/build-push-action@v6`, GitHub Actions cache (`type=gha`), nginx:alpine, node:22-alpine, pnpm 9.15.0 via corepack.

---

## File Map

| File                       | Action | Purpose                                                                                              |
| -------------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| `.dockerignore`            | Create | Exclude noise from build context (root-level, used by both Dockerfiles)                              |
| `apps/api/Dockerfile`      | Create | Multi-stage: build NestJS → slim Node runner                                                         |
| `apps/web/nginx.conf`      | Create | nginx SPA config with `try_files` fallback to `index.html`                                           |
| `apps/web/Dockerfile`      | Create | Multi-stage: build Nuxt SPA → nginx:alpine static server                                             |
| `apps/web/nuxt.config.ts`  | Modify | Declare `runtimeConfig.public.{version,commit}` so `NUXT_PUBLIC_*` env vars bake into the SPA bundle |
| `.github/workflows/cd.yml` | Create | Two parallel jobs: push marsa-api and marsa-web to GHCR                                              |

---

## Task 1: Root `.dockerignore`

**Files:**

- Create: `.dockerignore`

Both Dockerfiles use `context: .` (repo root), so there is one shared `.dockerignore` at the root. Its job is to keep the build context lean and prevent secrets from leaking into image layers.

- [ ] **Step 1: Create `.dockerignore`**

```
# Dependencies — always reinstalled inside the image
**/node_modules

# Git history
.git

# Local build artifacts — rebuilt inside the image
**/dist
**/.nuxt
**/.output
**/.pnpm-store

# Test artifacts
**/coverage
**/__snapshots__

# Env files — secrets must be injected at runtime, not baked in
**/.env
**/.env.*

# CI/CD and docs — not needed at runtime
.github
docs

# Misc
**/*.log
**/.DS_Store
```

- [ ] **Step 2: Commit**

```bash
git add .dockerignore
git commit -m "chore: add root .dockerignore for docker builds"
```

---

## Task 2: API Dockerfile

**Files:**

- Create: `apps/api/Dockerfile`

Multi-stage build. The builder installs all deps and compiles TypeScript via `pnpm build:api` (which runs `nest build` via SWC). The runner reinstalls only production deps and copies the compiled `dist/`. The entrypoint is `dist/entrypoints/api.js` (derived from `nest-cli.json` → `entryFile: "entrypoints/api"`).

- [ ] **Step 1: Create `apps/api/Dockerfile`**

```dockerfile
FROM node:22-alpine AS builder
RUN corepack enable

WORKDIR /app

# Copy workspace manifest first for better layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile

# Copy source (after install so the install layer is cached on source-only changes)
COPY . .

RUN pnpm build:api

# ---------------------------------------------------------------

FROM node:22-alpine AS runner
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/apps/api/dist apps/api/dist

WORKDIR /app/apps/api

ARG VERSION=0.0.0
ARG COMMIT
ENV NODE_ENV=production
ENV VERSION=$VERSION
ENV COMMIT=$COMMIT
EXPOSE 3000

CMD ["node", "dist/entrypoints/api.js"]
```

- [ ] **Step 2: Build the image locally**

Run from the repo root:

```bash
docker build -f apps/api/Dockerfile -t marsa-api:test .
```

Expected: build completes successfully, no errors. The builder stage runs `pnpm build:api` and produces `apps/api/dist/`. The runner stage copies `dist/` and installs prod deps.

- [ ] **Step 3: Verify the entrypoint file is present in the image**

```bash
docker run --rm marsa-api:test ls dist/entrypoints/api.js
```

Expected output:

```
dist/entrypoints/api.js
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/Dockerfile
git commit -m "feat: add multi-stage Dockerfile for API"
```

---

## Task 3: Web nginx config + Dockerfile

**Files:**

- Create: `apps/web/nginx.conf`
- Create: `apps/web/Dockerfile`

The Nuxt SPA (`ssr: false`) build outputs static files to `.output/public/`. nginx serves them. The `try_files` directive sends all unknown paths to `index.html` so Vue Router handles client-side navigation.

- [ ] **Step 1: Create `apps/web/nginx.conf`**

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;
}
```

- [ ] **Step 2: Create `apps/web/Dockerfile`**

```dockerfile
FROM node:22-alpine AS builder
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile

COPY . .

ARG VERSION=0.0.0
ARG COMMIT
ENV NUXT_PUBLIC_VERSION=$VERSION
ENV NUXT_PUBLIC_COMMIT=$COMMIT

RUN pnpm build:web

# ---------------------------------------------------------------

FROM nginx:alpine AS runner

COPY --from=builder /app/apps/web/.output/public /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
```

- [ ] **Step 3: Build the image locally**

```bash
docker build -f apps/web/Dockerfile -t marsa-web:test .
```

Expected: build completes successfully. The builder stage runs `pnpm build:web` and produces `.output/public/`. The runner stage copies static files into nginx.

- [ ] **Step 4: Verify the container serves the app**

```bash
docker run -d --rm -p 8080:80 --name test-web marsa-web:test
sleep 1
curl -s http://localhost:8080/ | grep -q '<html' && echo "PASS: index.html served" || echo "FAIL"
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/some/deep/route
docker stop test-web
```

Expected:

- First curl: prints `PASS: index.html served`
- Second curl: prints `200` (nginx falls back to `index.html` for unknown routes, not 404)

- [ ] **Step 5: Commit**

```bash
git add apps/web/nginx.conf apps/web/Dockerfile
git commit -m "feat: add multi-stage Dockerfile and nginx config for web"
```

---

## Task 4: CD workflow

**Files:**

- Create: `.github/workflows/cd.yml`

Two parallel jobs share the same structure — the only difference is image name, Dockerfile path, and GHA cache scope. Tags are computed by `docker/metadata-action`:

| Trigger              | Tags                               |
| -------------------- | ---------------------------------- |
| Push to `main`       | `sha-<7-char-commit>`, `latest`    |
| Push of `v1.2.3` tag | `v1.2.3`, `1.2.3`, `1.2`, `latest` |

`GITHUB_TOKEN` is sufficient for GHCR on a public repo — no extra secrets needed. The `packages: write` permission is required explicitly because GitHub Actions restricts it by default.

`cancel-in-progress: false` — never cancel an in-flight deploy.

- [ ] **Step 1: Create `.github/workflows/cd.yml`**

```yaml
name: CD

on:
  push:
    branches: [main]
    tags: ['v*']

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: false

jobs:
  publish-api:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/marsa-cloud/marsa-api
          tags: |
            type=sha,prefix=sha-,format=short
            type=raw,value=latest,enable={{is_default_branch}}
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/api/Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          build-args: |
            VERSION=${{ steps.meta.outputs.version }}
            COMMIT=${{ github.sha }}
          cache-from: type=gha,scope=api
          cache-to: type=gha,mode=max,scope=api

  publish-web:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/marsa-cloud/marsa-web
          tags: |
            type=sha,prefix=sha-,format=short
            type=raw,value=latest,enable={{is_default_branch}}
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/web/Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          build-args: |
            VERSION=${{ steps.meta.outputs.version }}
            COMMIT=${{ github.sha }}
          cache-from: type=gha,scope=web
          cache-to: type=gha,mode=max,scope=web
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/cd.yml
git commit -m "feat: add CD workflow to publish images to GHCR"
```

---

## Task 5: Push branch and open PR

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/cd-pipeline
```

- [ ] **Step 2: Open a PR**

```bash
gh pr create \
  --title "feat: CD pipeline — build and push Docker images to GHCR" \
  --body "Adds two multi-stage Dockerfiles (API + Web) and a CD workflow that publishes \`marsa-api\` and \`marsa-web\` images to GHCR on every push to \`main\` and on \`v*\` tags.

## What's included
- \`.dockerignore\` at repo root (shared context for both builds)
- \`apps/api/Dockerfile\` — NestJS → node:22-alpine runner
- \`apps/web/Dockerfile\` + \`apps/web/nginx.conf\` — Nuxt SPA → nginx:alpine
- \`.github/workflows/cd.yml\` — two parallel publish jobs

## Testing
Both images were built locally and verified:
- API: \`docker run --rm marsa-api:test ls dist/entrypoints/api.js\` ✓
- Web: nginx serves \`index.html\` and returns 200 for unknown routes ✓

## After merge
The CD workflow triggers on push to \`main\`, publishing:
- \`ghcr.io/marsa-cloud/marsa-api:sha-<commit>\` + \`latest\`
- \`ghcr.io/marsa-cloud/marsa-web:sha-<commit>\` + \`latest\`"
```

- [ ] **Step 3: After the PR merges, verify the workflow ran**

Go to `https://github.com/marsa-cloud/marsa/actions` and confirm both `publish-api` and `publish-web` jobs completed successfully. Check `https://github.com/orgs/marsa-cloud/packages` to see the published images.
