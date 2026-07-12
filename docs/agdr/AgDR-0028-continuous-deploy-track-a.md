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

## Amendment — 2026-07-12 (#139): Track A gains a chart-bump mode

> In the context of the team having released a new `marsa-charts` version and wanting to roll it onto the running cluster **without the manual on-VPS `install.sh` / interactive-SSH step**, facing the fact that the original Track A roll was deliberately chart-pinned and image-only, I decided to **widen the forced-command `cd-deploy.sh` grammar** to accept a second, prefix-disambiguated input — `chart:<semver>` — that runs `helm upgrade --install --version <v> --reset-then-reuse-values`, to achieve push-button chart rollout on the team cluster over the same SSH path, accepting that the CD key's authority grows from "image roll only" to "image roll **or** chart bump of the `marsa` release".

### What changed from the original decision

The original "Roll mechanism" row above committed to `helm upgrade` **chart-pinned**, `--reuse-values --set image.tag=<sha>`, with the explicit property _"app deploys never drag in chart changes."_ That property is **intentionally relaxed** for an explicit, operator-initiated chart bump. Image rolls are unchanged and still chart-pinned; the new behaviour is a separate, explicitly-requested mode.

### Options considered (this amendment)

| Decision axis                    | Chosen                                                                           | Rationale / rejected alternative                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where the chart-bump logic lives | **Extend `cd-deploy.sh` (same forced-command key)**                              | No second key / `authorized_keys` entry / forced-command to maintain; right-sized for a self-hosted MVP. Rejected: a separate `cd-chart-deploy.sh` + second key — more moving parts than the scale warrants.                                                                                                                                                                                                                                                                  |
| Mode disambiguation              | **Explicit input prefix — `sha-<hex>` vs `chart:<semver>`, each fully anchored** | Keeps the load-bearing safety property (input stays fully anchored, nothing leaks into `helm --set`); the two modes are explicit, not shape-sniffed. Rejected: sniffing "is this a sha or a semver" — implicit and fragile.                                                                                                                                                                                                                                                   |
| Values handling on chart bump    | **`--reset-then-reuse-values`** (Helm ≥3.14; install floor is 3.18)              | Across chart **versions**, `--reuse-values` reuses the prior release's computed values verbatim and **silently drops defaults newly introduced by the new chart**. `--reset-then-reuse-values` resets to the new chart's defaults then re-overlays the operator's prior `--set` values, so `image.tag` / `tls` / `domain` are preserved without losing new chart defaults. Rejected: `--reuse-values` (the image-roll flag) — correct for same-chart image rolls, wrong here. |
| Trigger surface                  | **New optional `chart_version` `workflow_dispatch` input on `deploy.yml`**       | An empty input preserves image-only behaviour; a set input SSHes `chart:<v>`. Deliberate, human-initiated — chart bumps do not auto-fire on push.                                                                                                                                                                                                                                                                                                                             |

### Security-boundary consequence

The CD key can now trigger a chart bump in addition to an image roll. This is a real widening, but bounded the same way the original was: the forced command still only ever runs `helm upgrade` on the `marsa` release, the chart comes from the same trusted OCI registry (`oci://ghcr.io/marsa-cloud/charts/marsa`), and both accepted input shapes are fully anchored so a leaked key still cannot run arbitrary commands. The `cd-deploy.sh` header comment is updated from "only ever trigger a Marsa image roll" to "an image roll **or** a chart bump".

### Naming note

This is **not** the "Track B" of the Context section above (that term is reserved for the `install.sh` / `marsa-charts` self-hoster release path). This amendment is a **chart-bump mode of Track A** — the team-cluster deploy path. `install.sh` remains the production bootstrap/upgrade path for external self-hosters.

## Artifacts

- Recording ticket: marsa-cloud/marsa#94 (back-fill consolidation)
- Amendment ticket: marsa-cloud/marsa#139 (Track A chart-bump mode)
- Originating work: marsa-cloud/marsa#92 (`feat(#91): continuous deploy to cluster (Track A)`), issue #91.
- Back-filled from the design spec (`docs/superpowers/specs/2026-06-28-continuous-deploy-design.md`, removed in #94 once consolidated here).
- Key files: `.github/workflows/deploy.yml`, `.github/workflows/cd.yml`, `scripts/cd-deploy.sh`
- Related: [AgDR-0027](AgDR-0027-image-build-and-publish-pipeline.md) (the images this deploys), [AgDR-0015](AgDR-0015-deployment-pipeline-v01-sequencing.md) (deploy feature sequencing)
