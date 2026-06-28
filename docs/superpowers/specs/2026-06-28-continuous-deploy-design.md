# Continuous Deploy Design (Track A)

**Date:** 2026-06-28
**Status:** Approved
**Builds on:** [2026-05-20-cd-pipeline-design.md](2026-05-20-cd-pipeline-design.md)
**Issue:** marsa-cloud/marsa#91

## Overview

The existing CD pipeline (`cd.yml`) builds and pushes the `marsa-api` and
`marsa-web` images to GHCR on every push to `main` — but nothing tells the
running K3s cluster to roll to the new image. This design adds the **deploy**
half: merge to `main` → the cluster automatically rolls to the new image, plus a
**manual path** to deploy any tag (rollback, or test a PR image before merge).

Build and deploy are kept as **two separate workflows**: `cd.yml` makes images,
`deploy.yml` puts an image on the cluster.

## Two tracks (why deploys don't touch the chart)

| Track                                | Trigger                          | What ships                                              | Path                                                |
| ------------------------------------ | -------------------------------- | ------------------------------------------------------- | --------------------------------------------------- |
| **A — continuous deploy** (this doc) | push to `main` / manual dispatch | a new app **image** onto the team's running cluster     | `deploy.yml` → SSH → `helm upgrade --set image.tag` |
| **B — versioned release** (existing) | `v*` tag                         | a versioned **chart + image** for external self-hosters | `marsa-charts/chart-release.yml` + `install.sh`     |

`install.sh` remains the production **bootstrap + upgrade** path. Because prod
upgrades happen in lockstep with chart bumps (Track B), pulling the chart +
appVersion image together is the intended behaviour there — no conflict with
Track A's image-only rolls.

## Decisions

| Decision        | Choice                                                                                                                  | Rationale                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Build vs deploy | Two workflows (`cd.yml`, `deploy.yml`)                                                                                  | Decouples "make image" from "deploy image"; deploy runs standalone                                               |
| Cluster access  | Hosted runner **SSHes into the VPS**                                                                                    | Keeps the K3s API (6443) private; avoids the public-repo self-hosted-runner risk; single secret                  |
| Roll mechanism  | `helm upgrade` with chart version **pinned to the currently-installed release**, `--reuse-values --set image.tag=<sha>` | App deploys never drag in chart changes; Helm stays source of truth; preserves tls/domain/email set at bootstrap |
| SSH key scoping | **Forced-command-restricted root key** (`PermitRootLogin forced-commands-only`)                                         | Canonical OpenSSH pattern; a leaked CI key can only ever roll Marsa to a `sha-` tag                              |
| PR test images  | **Label-gated** (`preview`) PR builds + manual dispatch deploy                                                          | Opt-in preview at this scale; no churn on routine PRs; first half of future preview environments                 |

## Flows

**Automatic (merge to main):**

```
push main → cd.yml builds sha-<short> image (both repos, same commit)
          → deploy.yml fires via workflow_run (filtered: CD success + head_branch=main)
          → derives sha-<short> from the commit → SSH → cd-deploy.sh → cluster rolls
```

**Manual (PR test / rollback):**

```
add `preview` label → cd.yml builds that PR commit's sha- image (stays in GHCR)
                    → run deploy.yml (workflow_dispatch, image_tag=sha-xxx)
                    → SSH → cd-deploy.sh → cluster rolls to that image
rollback: dispatch with an older main sha-; restore after a test: dispatch main's sha- (or merge)
```

**PR builds never auto-deploy** — a PR build also runs `cd.yml`, which _would_
trip `deploy.yml`'s `workflow_run`, but the `head_branch == 'main'` filter drops
PR-triggered events. The image waits in GHCR until a manual dispatch. This is the
property that keeps an unmerged PR from hijacking the shared cluster.

## Components

### `scripts/cd-deploy.sh` (forced-command target, lives on the VPS)

Reads the tag from `$SSH_ORIGINAL_COMMAND` (falls back to `$1` for local runs),
**validates it is `sha-<hex>`** (the guard that makes the key safe), then runs the
pinned roll. Reads the installed chart version with
`helm get metadata … -o yaml | awk` to avoid a `jq` dependency on the VPS:

```bash
ver=$(helm get metadata marsa -n marsa -o yaml | awk '/^version:/{print $2}')
helm upgrade --install marsa oci://ghcr.io/marsa-cloud/charts/marsa \
  --namespace marsa --version "$ver" --reuse-values \
  --set image.tag="$tag" --wait --timeout 10m --rollback-on-failure
```

The chart renders both containers from a single shared `.Values.image.tag`
(distinct repo names, shared tag), so one `--set image.tag=` covers `marsa-api`
and `marsa-web` — correct because both are built from the same commit and share
the `sha-<short>` tag.

### `.github/workflows/cd.yml` (modified)

Adds a `pull_request` trigger (`labeled`, `synchronize`) and a job-level `if` so
PR commits build only when the PR carries the `preview` label. Push-to-main and
tag behaviour is unchanged. Fork PRs can't push to GHCR (`packages: write` is
withheld from fork tokens), so this is effectively same-repo (team) PRs only —
the safe outcome.

### `.github/workflows/deploy.yml` (new)

`workflow_run` (auto, main only) + `workflow_dispatch` (manual, `image_tag`
input) → one `deploy` job that SSHes in and runs the deploy script. Secrets are
passed via `env` (not inlined) to avoid script injection; the host key is pinned
via `known_hosts`. `permissions: {}` (no GitHub API needed). `concurrency`
serialises deploys.

## One-time VPS setup (manual ops — NOT in the public installer)

The team's CI key must never ship in `install.sh` (the public self-hoster
installer). Set up once, by hand, on the cluster's server node:

1. **Generate the deploy key** (on a trusted machine, no passphrase):
   ```bash
   ssh-keygen -t ed25519 -C cd@marsa -f marsa-cd
   ```
2. **Install the deploy script** on the VPS:
   ```bash
   sudo install -m 0755 scripts/cd-deploy.sh /usr/local/bin/marsa-cd-deploy.sh
   ```
3. **Pin the key to the deploy command** in `/root/.ssh/authorized_keys`:
   ```
   command="/usr/local/bin/marsa-cd-deploy.sh",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 AAAA...cd@marsa
   ```
4. **Restrict root login to forced commands** in `/etc/ssh/sshd_config`:
   ```
   PermitRootLogin forced-commands-only
   ```
   then `sudo systemctl reload sshd`.
5. **Add GitHub repo secrets:**
   | Secret | Value |
   | ------ | ----- |
   | `CD_SSH_PRIVATE_KEY` | contents of `marsa-cd` (private half) |
   | `CD_SSH_USER` | `root` |
   | `CD_VPS_HOST` | the server's host/IP |
   | `CD_SSH_KNOWN_HOSTS` | `ssh-keyscan -H <host>` output, **verified out-of-band** |
6. **Create the `preview` label** in the repo (`gh label create preview`).

## Verification

- **Static:** `actionlint` on both workflows; `shellcheck scripts/cd-deploy.sh`.
- **Forced-command:** `ssh -i marsa-cd root@<host> "sha-deadbee"` runs the script;
  `ssh -i marsa-cd root@<host> "whoami"` is **refused** (proves the key can't run
  arbitrary commands).
- **Auto:** merge a no-op to `main`; `CD` → `Deploy`; `helm history marsa -n
marsa` shows a new revision on the new `sha-` tag.
- **PR test:** label a PR `preview` → image builds; dispatch `deploy.yml` with the
  sha → cluster rolls to it.
- **Rollback:** dispatch with a broken tag → `--wait` fails → `--rollback-on-failure`
  reverts → job red, cluster on last-good revision.

## Out of scope / follow-ups

- **PR preview _environments_** (per-PR isolated namespace + URL + auto-teardown) —
  the fully-idiomatic end-state; the label-gated build here is the first half.
- **GitHub `environment: production`** on the deploy job — enables protection rules
  / required reviewers; easy to add later.
- **`marsa-charts` `values.yaml` `tag: "latest"` → `""`** — not required (Track A
  always `--set` overrides it); separate chart chore.
- **GitOps (Argo/Flux)** pull-based deploy — bigger lift, deferred.
- **Per-image tags** — YAGNI; web + api release in lockstep from one commit.
