# Security CI Pipeline: Semgrep + TruffleHog + pnpm audit (ratcheted)

> In the context of adding security scanning to marsa's CI, facing a young codebase with known transitive dependency vulnerabilities, I decided to run **Semgrep (SAST) and TruffleHog (secrets) as blocking gates and `pnpm audit` as an advisory step**, to achieve immediate coverage of code/secret risks without redding the build on pre-existing dependency CVEs, accepting that dependency-vuln enforcement is deferred until the backlog is triaged.

## Context

The handover assessment found marsa had no security-specific CI — only `ci.yml` (lint/typecheck/test) and `cd.yml`. ApexYard ships a golden-path `security.yml`, but it is npm-based and bundles five tools (Semgrep, npm audit, TruffleHog, CodeQL, eslint-security) plus a PR-comment job. marsa is a pnpm monorepo (Node pinned via `.nvmrc`).

Measured baseline before choosing the design:

- Semgrep (`p/owasp-top-ten` + `p/typescript` + `p/nodejs`): **0 findings** (92 files, 114 rules).
- TruffleHog (full history, `--only-verified`): **0 secrets**.
- `pnpm audit`: **8 advisories — 1 critical + 2 high + 2 moderate + 3 low**, the critical/high all from the dev-only `happy-dom` test environment.

## Options Considered

| Option                                                                       | Pros                                                                                                                                                | Cons                                                                                                                                                                     |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Semgrep + TruffleHog blocking, pnpm audit advisory** (chosen)              | Immediate enforcement where the baseline is clean; doesn't red the build on pre-existing dep CVEs; clean separation from the dependency-triage work | `pnpm audit` findings don't fail CI yet — a temporary gap until the flip                                                                                                 |
| All three blocking now                                                       | Maximal enforcement                                                                                                                                 | Reds the build on day one (1 critical + 2 high deps); blocks unrelated PRs until deps are bumped                                                                         |
| All three advisory                                                           | No day-one friction                                                                                                                                 | No teeth — secret/SAST regressions wouldn't fail CI, defeating the point                                                                                                 |
| Adopt the full template verbatim (incl. CodeQL, eslint-security, PR-comment) | Most coverage                                                                                                                                       | CodeQL needs repo setup (default-vs-advanced conflicts); eslint-security is ad-hoc warn-only noise; npm-based, wrong package manager; more surface to maintain on an MVP |

## Decision

Chosen: **Semgrep + TruffleHog blocking, `pnpm audit` advisory**, because the two code/secret scanners measure clean today (so blocking is free and catches regressions immediately), while the dependency audit is dirty for reasons orthogonal to this change. Making the audit blocking now would punish every PR for a pre-existing, mostly dev-only `happy-dom` issue. The advisory step still surfaces the findings in the job summary; flipping it to blocking (`--audit-level=high`, drop `|| true`) is deferred to the dependency-triage work (`/audit-deps`) and marked with a `TODO` in the workflow. This is the same ratchet pattern used for the test-coverage gate (AgDR-adjacent, issue #39).

Scope cuts from the golden-path template: dropped CodeQL (setup friction / default-vs-advanced conflicts), ad-hoc `eslint-security` (warn-only noise), and the PR-summary-comment job (maintenance cost) as out-of-scope for a first security pipeline. npm → pnpm; Node from `.nvmrc`.

## Consequences

- New code and committed secrets are gated on every PR from day one; the gates are green at introduction.
- Dependency vulnerabilities are visible (job summary) but not enforced until `/audit-deps` clears the high/critical backlog and the `TODO(#43 follow-up)` flip lands.
- No external accounts/tokens required — Semgrep runs config-based rulesets, TruffleHog runs `--only-verified` without auth.
- If CodeQL or SCA enforcement is wanted later, both are additive follow-ups.

## Artifacts

- Issue: marsa-cloud/marsa#43
- File: `.github/workflows/security.yml`
- Template source: ApexYard `golden-paths/pipelines/security.yml`
- Related: handover next-step #3 (`/audit-deps`) owns flipping the dependency-audit job to blocking.
