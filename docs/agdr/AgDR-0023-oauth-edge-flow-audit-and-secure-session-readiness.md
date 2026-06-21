---
id: AgDR-0023
timestamp: 2026-06-19T19:00:00Z
agent: claude
model: claude-sonnet-4-6
trigger: pr-review
status: executed
ticket: marsa-cloud/marsa#62
---

# #62 edge-flow audit + `@fastify/secure-session` production-readiness check

> In the context of closing out PR review feedback on #62 (GitHub user-OAuth
> login), facing a reviewer ask to confirm which login edge cases the
> implementation actually handles and whether the session-cookie dependency is
> production-ready, we decided to audit the existing begin/complete-login code
> against five edge flows and to check `@fastify/secure-session`'s maintenance
> status, to achieve documented confidence in the v0.1 login surface without
> adding new code beyond what the audit found missing, accepting that
> frontend-side handling of GitHub's `error=access_denied` redirect is
> explicitly deferred to a follow-up ticket rather than fixed here.

## Context

PR #80 review raised two open questions: (1) what happens in less-common login
paths — first run, App deleted mid-flow, repeat login, expired/replayed state,
user denies consent — and (2) is `@fastify/secure-session` (the library backing
the whole session mechanism, per [AgDR-0016](AgDR-0016-oauth-seam-and-session-mechanism.md))
a maintained package suitable to depend on for v0.1.

## Edge-flow audit

| Scenario                                                                                      | Current behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Verdict                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **First run — no GitHub App provisioned**                                                     | `GET /api/v1/auth/github` → `BeginGithubLoginUseCase.execute()` calls `repository.loadProvisionedApp()`, gets `null`, throws `BadRequestException` → **400**. No state is issued.                                                                                                                                                                                                                                                                                             | Handled. Covered by `begin-github-login.e2e.test.ts` ("rejects with 400 when no GitHub App has been provisioned").                                                                                                                                                                                                     |
| **App deleted mid-flow** (state issued at begin-login, App row removed before complete-login) | `CompleteGithubLoginUseCase.execute()` checks the session/DB state pair _first_ (consuming the state), then calls `repository.loadProvisionedApp()` → `null` → **400**. The state token is spent even though the request ultimately fails — acceptable: the user must restart the flow regardless, and a spent token can't be replayed.                                                                                                                                       | Handled, by composition of existing checks — no new code needed.                                                                                                                                                                                                                                                       |
| **Repeat login** (same GitHub user authenticates again)                                       | `CompleteGithubLoginRepository.upsertByGithubUserId` is `em.upsert(user, undefined, { onConflictFields: ['githubUserId'] })` (WS7) — the second login updates the existing row (refreshing `githubLogin` if it changed) instead of erroring or duplicating.                                                                                                                                                                                                                   | Handled by design (WS7's upsert switch).                                                                                                                                                                                                                                                                               |
| **Expired or replayed state**                                                                 | `OAuthStateService.consume()` does an atomic conditional `nativeDelete` on `{ uuid, expiresAt: { $gt: now } }`; an expired row, an already-consumed row, or a state that doesn't match the session-bound value (checked one line earlier in the use-case, [AgDR-0022](AgDR-0022-oauth-state-session-binding.md)) all resolve to **400** with no distinguishing detail leaked to the client.                                                                                   | Handled. Covered by the three negative-path cases in `complete-github-login.e2e.test.ts`.                                                                                                                                                                                                                              |
| **User denies consent on GitHub's authorize screen**                                          | GitHub redirects to the configured callback URL with `error=access_denied` and no `code` query param — **on the frontend's redirect URL**, not as a call to this API. The backend only ever sees a request if and when the frontend POSTs `{ code, state }` to `/auth/github/session`; if the frontend forwards a denial without a `code`, `class-validator`'s `@IsNotEmpty()` on `CompleteGithubLoginCommand.code` already rejects it with **400** before the use-case runs. | Backend gap: none. **Frontend gap**: detecting `error=access_denied` (or any `error` param) on the callback page and showing a "you cancelled sign-in" message instead of attempting to POST an empty/missing code — this is `apps/web` work, out of scope for this API-side PR. Filed as a follow-up (see Artifacts). |

No backend code changes resulted from this audit — every backend-reachable edge
case was already covered by the WS1–WS7 implementation and its existing e2e
tests. The one real gap (frontend denial handling) is UI work, not an API
correctness issue, so it's filed rather than built here.

## `@fastify/secure-session` production-readiness check

- Declared range `^8.2.0` ([AgDR-0016](AgDR-0016-oauth-seam-and-session-mechanism.md)); resolves to **8.3.0** (released 2025-12-09) at install time — already on the newest version permitted by the declared range, no bump needed.
- Maintained under the official **`fastify` GitHub org** (`fastify/fastify-secure-session`), the same org as the framework itself — not a third-party/abandoned fork.
- 24 published versions over the package's lifetime, with a release as recent as four months before this audit (8.3.0, Dec 2025) and another (8.2.0) in between — active maintenance cadence, not stale.
- `pnpm audit` reports **zero known vulnerabilities** for the resolved version.
- Three runtime dependencies (`@fastify/cookie`, `fastify-plugin`, `sodium-native`) — `sodium-native` is a native binding (libsodium) for the actual encryption, which is the right primitive for an encrypted-cookie session (matches AgDR-0016's "stateless encrypted cookie" design) rather than a hand-rolled crypto scheme.

**Verdict**: suitable to depend on for v0.1. No replacement or pinning action needed.

## Artifacts

- Ticket: marsa-cloud/marsa#62 (GitHub user-OAuth login with session)
- Builds on: [AgDR-0016](AgDR-0016-oauth-seam-and-session-mechanism.md) (seam + session mechanism), [AgDR-0022](AgDR-0022-oauth-state-session-binding.md) (login-CSRF session binding)
- Follow-up filed: marsa-cloud/marsa#81 — frontend handling of GitHub's `error=access_denied` (and other `error` values) on the OAuth callback page (`apps/web`).
