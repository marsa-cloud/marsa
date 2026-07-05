# SAST determinism + supply-chain hardening

> In the context of the `SAST (Semgrep)` gate flipping red on PR #103 without any related code change, facing non-deterministic CI caused by an unpinned scanner pulling live-updating registry rules, I decided to pin the Semgrep engine and remediate (not suppress) all surfaced findings — SHA-pinning every GitHub Action and adopting pnpm/renovate supply-chain settings — to achieve an honestly-green, drift-proof gate, accepting a one-time remediation cost and delegating pin-freshness to Renovate.

## Context

`security.yml` ran `image: semgrep/semgrep` (unpinned `:latest`) with `--config p/owasp-top-ten p/typescript p/nodejs` fetched **live from the registry** at scan time, under `--error` (fail on any finding). Between the June 29 `main` scan (115 rules → 0 findings) and the July 1 PR scan (124 rules → 28 findings) the registry rulesets grew, and the new supply-chain rules fired on pre-existing files (workflow YAMLs, `pnpm-workspace.yaml`, `renovate.json`) — none in the PR diff. The gate's pass/fail thus depended on _when_ it ran, not on the code under review (see #110).

The 28 findings:

| Rule                                                                                          | Count | Files                                            |
| --------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------ |
| `github-actions-mutable-action-tag`                                                           | ~21   | `cd.yml`, `ci.yml`, `claude.yml`, `security.yml` |
| `pnpm-trust-policy`, `pnpm-missing-minimum-release-age`, `pnpm-block-exotic-sub-dependencies` | 3     | `pnpm-workspace.yaml`                            |
| `renovate-missing-minimum-release-age`                                                        | 1     | `renovate.json`                                  |

## Options Considered

| Option                                 | Pros                                                                                                                                                                         | Cons                                                                                                                            |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **A — Remediate & adopt all (chosen)** | `main` goes honestly green (no rule hidden); adopts real supply-chain defenses appropriate for a self-hostable PaaS; Renovate manages SHA-pin freshness so churn is cosmetic | Largest one-time change (~21 SHA pins + config); pnpm cooldown only _enforced_ once pnpm ≥ 10 (declared now, active on upgrade) |
| B — Adopt cheap, defer action-pinning  | Fast; banks high-value pnpm/renovate defenses; deferral is explicit (`--exclude-rule` + follow-up ticket)                                                                    | Leaves mutable action tags (the largest attack surface) unaddressed; a suppressed rule in config                                |
| C — Pin & scope to app-security only   | Fastest to green; restores the OWASP/TS/Node-only baseline #43 intended; zero churn                                                                                          | Adopts none of the hardening; three rule families suppressed                                                                    |

## Decision

Chosen: **Option A**, because a PaaS that runs third-party workloads and installs untrusted dependencies should hold the higher supply-chain bar, and Renovate (`helpers:pinGitHubActionDigests`) neutralises the only real cost — keeping ~21 pinned digests current — by turning it into ordinary automated bump PRs with human-readable `# vX.Y.Z` comments.

Determinism (shared by all options, non-negotiable): pinning the `semgrep/semgrep` **image** fixes the engine but **not** the rules — `--config p/…` packs are fetched live from the registry at scan time, which is precisely the drift that broke this gate. So determinism is two parts: (1) pin the image to a version + digest, and (2) run PRs in **diff-aware mode** (`--baseline-commit <base>`) so a newly-added registry rule can only fail a PR on code that PR actually introduces — never retroactively on a pre-existing file. The push-to-`main` scan stays full (remediated to 0 findings), so main still catches genuinely new issues.

## Consequences

- Every `uses:` across the four workflows is pinned to an immutable commit SHA with a version comment; a compromised or force-moved action tag can no longer inject code into CI.
- `pnpm-workspace.yaml` declares `minimumReleaseAge`, `blockExoticSubdeps`, and a trust policy; the release-age cooldown becomes effective when the repo upgrades to pnpm ≥ 10 (pnpm 9.15 tolerates the keys). `renovate.json` gains a `minimumReleaseAge` cooldown that is effective immediately.
- The Semgrep image is pinned to a version + digest; bumping the engine is now a deliberate, reviewed change.
- PRs scan diff-aware against the base commit, so a future registry rule addition can no longer flip an unrelated PR red (the exact failure mode from #103). `main` still full-scans under `--error`: if the registry later surfaces a finding on existing `main` code, the push-to-`main` scan **turns the main build red on purpose** — this is the intended alarm, a deliberate "go look at this now" signal that a new supply-chain rule matched already-merged code. It is not a PR blocker (there is no PR to block on a post-merge push), but it is a real red build, by design. Remediate the finding (or consciously accept and pin the engine) to return main to green.
- Renovate is configured to keep both the action digests and the pinned Semgrep image fresh.
- Re-scanning `main` after this change yields 0 findings honestly (no `--exclude-rule` suppressions).

## Artifacts

- Ticket: marsa-cloud/marsa#110
- Predecessor incident: PR #103 red SAST (merged manually with SAST skipped)
