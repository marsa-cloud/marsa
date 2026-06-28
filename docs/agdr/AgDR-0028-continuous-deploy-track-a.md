---
id: AgDR-0028
timestamp: 2026-06-28T00:00:00Z
agent: claude
model: claude-opus-4-8
trigger: user-prompt
status: accepted
ticket: marsa-cloud/marsa#94
---

# Continuous deploy (Track A): runner SSHes the VPS, forced-command `helm upgrade --reuse-values --set image.tag`

> In the context of automatically rolling the team's running K3s cluster to a new image after merge to `main` (#91), facing the need to deploy without exposing the cluster API and without app deploys dragging in chart changes, I decided to add a separate **`deploy.yml`** in which a hosted runner **SSHes into the VPS** and runs a **forced-command-restricted** script doing a chart-pinned `helm upgrade --reuse-values --set image.tag=<sha>`, with a manual `workflow_dispatch` path for rollback / PR-preview, to achieve safe push-to-deploy on the shared cluster, accepting one-time manual VPS key setup kept out of the public installer.

## Context

`cd.yml` already builds and pushes `marsa-api`/`marsa-web` images to GHCR on every `main` push (see AgDR-0027), but nothing told the running K3s cluster to roll to the new image. This adds the **deploy half**. Two tracks are kept distinct: **Track A** (this AgDR) continuously deploys a new app _image_ onto the team's running cluster; **Track B** (existing) cuts versioned _chart + image_ releases for external self-hosters via `marsa-charts` + `install.sh`. `install.sh` stays the production bootstrap/upgrade path (chart + appVersion move in lockstep there), so there is no conflict with Track A's image-only rolls.

## Options Considered

| Decision axis   | Chosen                                                                                           | Rationale / rejected alternative                                                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build vs deploy | **Two workflows** (`cd.yml` makes images, `deploy.yml` deploys)                                  | Decouples "make image" from "deploy image"; deploy can run standalone (manual dispatch). Rejected: one combined workflow — couples concerns.                                                                                |
| Cluster access  | **Hosted runner SSHes into the VPS**                                                             | Keeps the K3s API (6443) private; avoids public-repo self-hosted-runner risk; single secret. Rejected: exposing the cluster API to the runner.                                                                              |
| Roll mechanism  | **`helm upgrade` chart-pinned to the installed release, `--reuse-values --set image.tag=<sha>`** | App deploys never drag in chart changes; Helm stays source of truth; preserves tls/domain/email set at bootstrap. One `--set image.tag` covers both containers (shared `.Values.image.tag`, same commit → same `sha-` tag). |
| SSH key scoping | **Forced-command-restricted root key** (`PermitRootLogin forced-commands-only`)                  | Canonical OpenSSH pattern; a leaked CI key can only ever roll Marsa to a validated `sha-` tag.                                                                                                                              |
| PR test images  | **Label-gated (`preview`) builds + manual-dispatch deploy**                                      | Opt-in preview at this scale; no churn on routine PRs; first half of future preview environments.                                                                                                                           |

## Decision

Chosen: **a standalone `deploy.yml` driving a forced-command SSH roll.**

- **`scripts/cd-deploy.sh`** (lives on the VPS, runs as the forced command): reads the tag from `$SSH_ORIGINAL_COMMAND`, **validates it is `^sha-[0-9a-f]+$`** (the guard that makes the key safe), reads the installed chart version (`helm get metadata … | awk`, no `jq` dependency), then `helm upgrade --install marsa … --version "$ver" --reuse-values --set image.tag="$tag" --wait --timeout 10m --rollback-on-failure`.
- **`deploy.yml`** (new): `workflow_run` (auto, **filtered to CD success + `head_branch == 'main'` + `event == 'push'`**, so a labeled PR build can't reach deploy) + `workflow_dispatch` (manual `image_tag` input for rollback / preview). Secrets passed via `env` (not inlined) to avoid injection; host key pinned via `known_hosts`; `permissions: {}`; `concurrency` serialises deploys.
- **`cd.yml`** (modified): `pull_request` (`labeled`/`synchronize`) trigger + job-level `if` so PR commits build only under the `preview` label. Fork PRs can't push to GHCR (`packages: write` withheld), so this is effectively team PRs only.
- **One-time VPS setup** (manual ops, **not** in the public `install.sh`): generate an ed25519 deploy key, install the script `0750 root:root`, pin it via `command="…",no-pty,…` in `authorized_keys`, set `PermitRootLogin forced-commands-only` (direct root only — interactive `sudo` access unaffected), add repo secrets (`CD_SSH_PRIVATE_KEY/USER`, `CD_VPS_HOST`, `CD_SSH_KNOWN_HOSTS`), create the `preview` label.

Out of scope / follow-ups: per-PR preview _environments_, GitHub `environment: production` protection on the deploy job, flipping `marsa-charts` `values.yaml` `tag` default to `""`, GitOps (Argo/Flux) pull-based deploy, per-image tags (web+api release in lockstep from one commit — YAGNI).

## Consequences

- Merge to `main` now auto-rolls the shared cluster to the new image; rollback and PR-image testing are a manual dispatch away.
- The forced-command + `sha-` regex means a leaked CI key cannot run arbitrary commands or deploy an arbitrary image — only roll Marsa to a validated sha tag.
- App deploys (Track A) never touch the chart; chart/values changes flow only through Track B / `install.sh`. The CD key and VPS setup are intentionally absent from the public installer.
- `--wait … --rollback-on-failure` means a bad image leaves the cluster on the last-good revision with a red CI job, rather than a half-rolled deploy.

## Artifacts

- Recording ticket: marsa-cloud/marsa#94 (back-fill consolidation)
- Originating work: marsa-cloud/marsa#92 (`feat(#91): continuous deploy to cluster (Track A)`), issue #91.
- Back-filled from the design spec (`docs/superpowers/specs/2026-06-28-continuous-deploy-design.md`, removed in #94 once consolidated here).
- Key files: `.github/workflows/deploy.yml`, `.github/workflows/cd.yml`, `scripts/cd-deploy.sh`
- Related: [AgDR-0027](AgDR-0027-image-build-and-publish-pipeline.md) (the images this deploys), [AgDR-0015](AgDR-0015-deployment-pipeline-v01-sequencing.md) (deploy feature sequencing)
