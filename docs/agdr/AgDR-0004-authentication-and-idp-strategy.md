---
id: AgDR-0004
timestamp: 2026-06-07T10:50:00Z
agent: claude
model: claude-opus-4-8
trigger: user-prompt
status: executed
---

# Authentication & identity-provider strategy (v0.1 GitHub login → v0.2 Zitadel IdP)

> In the context of authenticating Marsa operators to the dashboard (#22) and providing OIDC/SSO to future self-hosted Marsa services (monitoring/LGTM, object storage), facing the choice between running a heavyweight IdP, brokering with Dex, or building our own OIDC provider, we decided to adopt **Zitadel as the central IdP from v0.2** while shipping a **minimal direct-GitHub login in v0.1**, to deliver login now without committing to auth-protocol code we won't maintain, accepting that v0.1's GitHub login strategy is ~1 day of throwaway and that Zitadel adds operational weight per self-hosted install.

## Context

- **#22** needs operator → dashboard login in **v0.1**. A later milestone (**v0.2**, introducing the LGTM monitoring stack) needs **OIDC/SSO across multiple services** (Grafana first, object storage / others later).
- **Marsa is self-hosted.** Each install runs under a *different* GitHub context — an org for one operator, a **personal user account with no org** for another. So access control **cannot** rely on GitHub org/team gating (Dex's only native gate); the operator allowlist must live in **Marsa's own Postgres**, keyed on the stable GitHub numeric user id.
- The team **will not build or maintain a custom OIDC provider**. Minimising self-owned, security-critical auth-protocol code is a hard constraint.
- **Marsa's domain authorization** (which operator may deploy which app in which project) is domain logic that lives in Marsa's Postgres **regardless of IdP** — no IdP removes this.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| **Build Marsa-API as an OIDC provider** (`node-oidc-provider`) + Dex as upstream broker | Tiny footprint; full control of authz; Dex enables per-install "bring-your-own-IdP" | ~4–6 weeks build; own a security-critical OIDC provider **forever** — rejected by the team |
| **Dex** as the auth component | Lightweight; speaks OIDC from day 1 | No authz, no UI; org/team gating **breaks for self-hosted personal-account installs**; **redundant once Zitadel is chosen** (Zitadel federates GitHub itself) → would be stood up then deleted |
| **Zitadel** as central IdP | No auth-protocol code to own; UI-managed per-user grants; federates GitHub; standard JWTs; true cross-service SSO | Heavy **stateful** IdP + Postgres + TLS on **every** self-hosted box; spike (`idp/`) already hit operational friction |
| **v0.1 direct GitHub login in Marsa-API** (Passport `passport-github2` / GitHub App user-OAuth) | ~1 day; **zero new infra**; ships v0.1 login immediately | ~1 day of GitHub-strategy code is discarded when Zitadel lands |

## Decision

Chosen: a **phased approach**, because it ships v0.1 login fast with no wasted infra and defers the heavy IdP to the milestone that actually justifies it (multi-service SSO).

- **v0.1 — direct GitHub login** in Marsa-API (Passport / GitHub App user-OAuth) + **operator allowlist in Postgres**. First admin = whoever runs the installer; others invited by GitHub login.
- **v0.2+ end-state — Zitadel** as the central IdP/OIDC provider, federating to GitHub, issuing tokens to Marsa services (Grafana/LGTM, object storage, …).
- **Dex — rejected.** Choosing Zitadel retires it: Zitadel federates GitHub natively, so a Dex deployment now would only be deleted later.
- **Build-your-own OIDC provider — rejected.** The team will not own auth-protocol / token-signing code.

## Consequences

- v0.1 ships login with **no new runtime component**; only ~1 day of GitHub-strategy code is thrown away at the v0.2 cutover.
- **Forward-compat rule:** key v0.1 user records on the **stable GitHub numeric user id** (not username/email). Zitadel's federated GitHub subject exposes the same id, so existing operators map across the migration with **zero re-onboarding**.
- v0.2 introduces Zitadel's per-install cost — zero-touch provisioning automation, secrets/machine-keys, backup/restore, upgrades, TLS, resource sizing — tracked in its own feature ticket.
- Marsa **retains its own deploy-level authz in Postgres under both phases**. Zitadel handles *authentication* + coarse *service-access* grants, not deploy-level RBAC.
- SSO to monitoring / object-storage is **not** available until v0.2.

## Artifacts

- Issue: marsa-cloud/marsa#22 (Marsa Auth — login)
- Related: [AgDR-0005](AgDR-0005-github-app-integration-model.md) (GitHub App integration, serves both #22 login and #23 repo access)
- Follow-up: marsa-cloud/marsa#56 — v0.2 "Central IdP & OIDC/SSO via Zitadel" (blocked by #22)
