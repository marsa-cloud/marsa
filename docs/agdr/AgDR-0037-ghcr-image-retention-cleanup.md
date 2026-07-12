---
id: AgDR-0037
timestamp: 2026-07-12T00:00:00Z
agent: claude
model: claude-opus-4-8
trigger: user-prompt
status: accepted
ticket: marsa-cloud/marsa#101
---

# GHCR image retention: scheduled `gh api` cleanup, keep latest + semver

> In the context of `cd.yml` publishing a `sha-<commit>` image to GHCR on every `main` push (see [AgDR-0027](AgDR-0027-image-build-and-publish-pipeline.md)), facing unbounded growth of stale per-commit images, I decided to add a **weekly scheduled workflow (`ghcr-cleanup.yml`) that calls the GHCR REST API via `gh` to delete versions older than 14 days that carry no `latest` or semver tag**, authenticated by `GITHUB_TOKEN`, to achieve automatic package cleanup, accepting that GHCR has no native retention policy and that `GITHUB_TOKEN` may need replacing with a `delete:packages` PAT if org-owned-package permissions block deletion.

## Context

`cd.yml` tags every `main` build `sha-<short>` + `latest`, and `v*` tags get semver (`1.2.3`, `1.2`). The `sha-*` images accumulate indefinitely; issue #101 asks to "delete everything older than 14 days, keep versioned ones." GHCR (unlike some registries) exposes **no native age-based retention policy** — GitHub only offers manual per-version deletion in the UI or programmatic deletion via the REST (`DELETE .../packages/container/<name>/versions/<id>`) and GraphQL (`deletePackageVersion`) APIs. Images are single-arch (arm64 is out of scope per AgDR-0027), so there are no multi-arch manifest-list children whose deletion could break a tagged image.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| **Scheduled `gh api` script, keep latest+semver** (chosen) | No third-party action / supply-chain surface; full control over keep-logic; `GITHUB_TOKEN` needs no extra secret; readable and testable via a `workflow_dispatch` dry-run | We own the tag-matching + safety logic; a future multi-arch move would need manifest-child handling added |
| `dataaxiom/ghcr-cleanup-action` | Purpose-built; handles multi-arch manifests; age + keep-tags filters out of the box | Adds a third-party action requiring a token with delete rights; less transparent than a few lines of `gh` |
| `snok/container-retention-policy` | Fast; `--cut-off` age + tag selection | Same third-party-dependency trade-off; more config for tag filtering |
| Native GHCR retention policy | Zero code | Does not exist for container packages |

## Decision

Chosen: **a hand-rolled scheduled workflow calling the GHCR REST API.**

- **File:** `.github/workflows/ghcr-cleanup.yml`.
- **Schedule:** weekly cron `0 3 * * 0` (Sundays 03:00 UTC); armed on every scheduled run.
- **Packages:** matrix over `marsa-api`, `marsa-web` (`fail-fast: false`).
- **Keep rule:** a version is deleted only if `created_at` is older than **14 days** AND it carries no tag matching `^(latest|v?[0-9]+(\.[0-9]+){1,2})$`. Semver-tagged images and the current `latest` are kept regardless of age; stale `sha-*`-only and untagged versions are reaped.
- **Auth:** `GITHUB_TOKEN` with `permissions: packages: write`.
- **Safety:** a `workflow_dispatch` `dry_run` input logs candidates without deleting; a failed DELETE surfaces a `::error::` hinting at the PAT fallback and fails the job.

## Consequences

- Stale per-commit images are pruned weekly with no manual intervention; released (semver) images and `latest` are never touched.
- If `GITHUB_TOKEN` cannot delete these **org-owned** packages (403 on DELETE), the fallback is a classic/fine-grained **PAT with `delete:packages`** stored as a repo secret (e.g. `GHCR_CLEANUP_TOKEN`), swapped into the `GH_TOKEN` env. The first manual dry-run (or first scheduled run) will reveal whether this is needed.
- The keep-regex is coupled to the tag shapes `cd.yml` produces (`docker/metadata-action`); if the tag scheme changes, this regex must change with it.
- A future move to multi-arch (`linux/arm64`) would introduce untagged manifest children — the delete-untagged behaviour would then need manifest-list awareness (or a switch to `dataaxiom/ghcr-cleanup-action`).

## Artifacts

- Ticket: marsa-cloud/marsa#101
- Key file: `.github/workflows/ghcr-cleanup.yml`
- Related: [AgDR-0027](AgDR-0027-image-build-and-publish-pipeline.md) (image build & publish — the source of the `sha-*` tags this reaps)
