---
id: AgDR-0038
timestamp: 2026-07-14T00:00:00Z
agent: claude
model: claude-opus-4-8
trigger: user-prompt
status: accepted
ticket: marsa-cloud/marsa#150
supersedes: AgDR-0037
---

# GHCR cleanup: replace hand-rolled `gh api` script with pinned `dataaxiom/ghcr-cleanup-action`

> In the context of the hand-rolled `ghcr-cleanup.yml` ([AgDR-0037](AgDR-0037-ghcr-image-retention-cleanup.md)) leaking orphaned provenance attestations because it deliberately never deletes untagged versions, I decided to **replace the `gh api` script with `dataaxiom/ghcr-cleanup-action` pinned by commit SHA**, configured to keep `latest` + semver + the N most recent `sha-*` images and reap untagged/orphaned manifests while preserving live images' attestation children, to achieve correct manifest-graph-aware cleanup, accepting a SHA-pinned third-party action that needs the `packages: write` the workflow already grants.

## Context

AgDR-0037 chose a hand-rolled `gh api` script that, lacking manifest-graph awareness, skips **all** untagged versions (`select(($tags | length) > 0)`). Since it _does_ delete stale `sha-*` **tagged** images, every such deletion orphans that image's provenance attestation child — which the script can then never reap. Live GHCR state confirms the leak: **82 untagged vs 16 tagged** versions per package (`marsa-api`, `marsa-web`), of which ~66 per package are orphaned attestations. AgDR-0037 itself flagged this in its Consequences and deferred the fix.

The buildx attestation model makes "just tag them" impossible: an attestation is an **untagged child manifest** referenced by digest from the tagged image index (`vnd.docker.reference.type=attestation-manifest`). Distinguishing a live attestation (child of a kept image) from an orphan (child of a deleted image) requires resolving `tag → index → child digests` — manifest-graph awareness the `gh api` script does not have.

A grep confirms **nothing** in marsa currently consumes attestations (no cosign/scanner/admission policy), but they are retained deliberately for future supply-chain verification, so the fix must preserve _live_ attestations, not disable them.

AgDR-0037 rejected the off-the-shelf action on supply-chain grounds. That concern is now **neutralized**: the action is pinnable by commit SHA (as every action in `cd.yml` already is), and it needs only `packages: write`, which the workflow already grants — no new secret, no broader scope.

## Options Considered

| Option                                                  | Pros                                                                                                                                                                                                      | Cons                                                                                                     |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Pinned `dataaxiom/ghcr-cleanup-action`** (chosen)     | Manifest-graph-aware — deletes children with their parent and reaps orphans (`delete-orphaned-images`) while preserving kept images' attestations (`validate`); battle-tested; config-only; no new secret | Third-party action with delete rights — mitigated by SHA-pin + minimal `packages: write` already granted |
| Add manifest-graph walk to the existing `gh api` script | No new dependency; full control                                                                                                                                                                           | We own and test non-trivial index-traversal logic; reinvents a solved problem                            |
| Keep AgDR-0037 script as-is                             | Zero work                                                                                                                                                                                                 | Leaks orphans forever; registry only grows                                                               |
| `provenance: false` in `cd.yml` + delete untagged       | Removes untagged children at the source                                                                                                                                                                   | Discards provenance/SBOM attestations the team wants to keep for future verification                     |

## Decision

Chosen: **`dataaxiom/ghcr-cleanup-action` pinned to `v1.2.2` (`d52806a0dc70b430571a37da1fde39733ffd640f`).**

- **File:** `.github/workflows/ghcr-cleanup.yml` — the prune `run:` step is replaced by the action; the weekly cron, `marsa-api`/`marsa-web` matrix (`fail-fast: false`), `concurrency`, `permissions: packages: write`, and `workflow_dispatch` dry-run input are preserved.
- **Config:**
  - `exclude-tags: '^latest$,^\d+\.\d+.*$'` with `use-regex: true` — protects `latest` and numeric semver tags (`1.2`, `1.2.3`, incl. pre-release suffixes) from every rule. Note: `cd.yml` emits **`v`-less** semver image tags (`type=semver,pattern={{version}}` → `1.2.3`), so a `v*` glob would miss them — hence the numeric regex.
  - `keep-n-tagged: 10` — keeps the 10 most-recent `sha-*` images (rollback window), each with its attestation child intact.
  - `older-than: '14 days'` — preserves AgDR-0037's age intent; only images older than 14 days beyond the keep-N floor are eligible.
  - `delete-untagged: true` + `delete-orphaned-images: true` — reaps untagged versions and stranded `sha256-…` referrer/attestation artifacts.
  - `validate: true` — post-run assertion that every kept multi-arch image still has its children (guards against orphaning a live attestation).
- **Rollout safety:** the workflow keeps the `workflow_dispatch` `dry_run` input; the first run is executed as a dry-run on the PR branch to confirm the delete set (orphans in, live images/attestations out) before arming.

## Consequences

- Orphaned attestations (~66/package today) are reaped on the next armed run; future orphans never accumulate because children are deleted with their parent.
- Live images' attestation/multi-arch children are preserved (`validate`), so future `cosign verify` / SBOM scanning remains possible.
- Retention policy shifts from purely age-based to **age + keep-N-tagged floor** — a behaviour change from AgDR-0037, chosen so a burst of deploys can't age out every rollback target at once.
- A third-party action now runs with `packages: write`. Pinned by SHA; bumping the pin is a deliberate, reviewable change (Dependabot/Renovate can propose it). Verify the pinned SHA against the `v1.2.2` release tag on any bump.
- **Supply-chain risk is bounded.** The action authenticates with the ephemeral, repo-scoped `secrets.GITHUB_TOKEN` (not a long-lived PAT), so a compromised action's blast radius is limited to deleting _this repo's_ packages during the run. A SHA-pin defends against the tag _moving_, not against the pinned commit itself being malicious or a future bump regressing — mitigated by the bounded token scope + reviewable pin bumps.
- The `exclude-tags` regex is still coupled to `cd.yml`'s tag shapes; if the tag scheme changes, update the regex (same coupling AgDR-0037 had).
- **Observability gap (follow-up):** the weekly cron has no failure notification. A silent failure (action yanked, GHCR API change, `packages: write` regressed to 403) would quietly resume the orphan leak — the exact "nobody was watching" failure mode that let AgDR-0037's leak run for weeks. A step-failure signal someone actually watches is tracked as a separate ticket.
- **Decision rollback:** revert the workflow change (`git revert` of the PR merge) to restore AgDR-0037's hand-rolled script; re-run the reverted workflow with `dry_run: true` before arming. The AgDR record stays (superseded ≠ deleted).

## Artifacts

- Ticket: marsa-cloud/marsa#150
- Key file: `.github/workflows/ghcr-cleanup.yml`
- Supersedes: [AgDR-0037](AgDR-0037-ghcr-image-retention-cleanup.md)
- Related: [AgDR-0027](AgDR-0027-image-build-and-publish-pipeline.md) (image build & publish — the source of the `sha-*` tags + attestation children)
