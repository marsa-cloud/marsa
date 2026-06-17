---
id: AgDR-0016
timestamp: 2026-06-16T00:00:00Z
agent: claude
model: claude-sonnet-4-6
trigger: user-prompt
status: executed
ticket: marsa-cloud/marsa#62
---

# GitHub user-OAuth login (#62) — GithubClient seam over Passport, secure-session cookie over a DB session table

> In the context of implementing #62 (GitHub user-OAuth login + HttpOnly session, parent #22, per AgDR-0004's v0.1 direct-GitHub-login phase), facing the fact that the issue's AC names "Passport" while the provisioned App's `client_id`/`clientSecretEnc` actually live encrypted per-install in Postgres rather than static env config, we decided to implement the OAuth code exchange through the existing `GithubClient` seam (AgDR-0014) instead of Passport, and to back the session with a stateless encrypted `@fastify/secure-session` cookie instead of a DB-backed session table, to keep the throwaway v0.1 login (per AgDR-0004) consistent with the codebase's one established GitHub-access seam and minimal in size, accepting that we deviate from the AC's literal "(Passport)" wording and that sessions cannot be server-side revoked before expiry.

## Context

- #62's AC says the OAuth flow should use "Passport," but Marsa's GitHub App is provisioned per-install (#58) and its `client_id`/`clientSecretEnc` are rows in the `github_app` table, decrypted via `SecretCipherService` at request time — not static module-init config. `passport-github2` (and `@nestjs/passport` generally) is designed around credentials known at strategy-construction time; loading per-install DB creds per-request fights that model and would require a custom dynamic-strategy wrapper that duplicates what the existing seam already does.
- AgDR-0014 already established `GithubClient` as "the single seam for all GitHub API access" — `convertManifest()` (#58) and `getInstallationToken()` (#59) both go through it, with `OctokitGithubClient` (real) and `MockGithubClient` (test) as the two bindings. Adding OAuth methods here is additive to an existing, already-tested pattern rather than a new auth library.
- AgDR-0004 explicitly scopes v0.1 GitHub login as ~1 day of throwaway code, replaced by Zitadel in v0.2. No session library is installed yet. The forward-compat rule from that AgDR — key the operator record on the **stable GitHub numeric user id** — still applies regardless of session mechanism.

## Options Considered

| Option                                                                                                       | Pros                                                                                                                                                                                                                                            | Cons                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(a) `GithubClient` seam for OAuth exchange + `@fastify/secure-session` for the session** (chosen)          | Reuses the one established GitHub-access pattern; mockable for tests with zero network (existing `MockGithubClient` convention); session is a stateless encrypted cookie — no new entity/table, no cleanup job, matches "throwaway v0.1" sizing | Deviates from the AC's literal "(Passport)" wording; no server-side session revocation before cookie expiry                                                                                                          |
| (b) `@nestjs/passport` + `passport-github2`, with a custom strategy that loads creds from the DB per request | Matches the AC literally; familiar library to most Node devs                                                                                                                                                                                    | Passport's strategy lifecycle assumes static creds; the DB-lookup workaround is more code than the seam extension, for a library whose value (its strategy ecosystem) we're not using past `passport-github2` itself |
| (c) `GithubClient` seam + DB-backed session table (session entity, repository, cleanup)                      | Server-side revocation (logout-everywhere)                                                                                                                                                                                                      | A whole entity/migration/cleanup-job layer for a component AgDR-0004 says is discarded at the v0.2 Zitadel cutover; the revocation feature isn't required by #62's ACs                                               |

## Decision

Chosen: **(a)**.

- `GithubClient` (the abstract seam) gains `exchangeUserOAuthCode(code, creds)` and `getAuthenticatedUser(userToken)`, implemented in `OctokitGithubClient` against `https://github.com/login/oauth/access_token` and `GET /user`, with a deterministic `MockGithubClient` binding for tests (same shape as the existing `convertManifest`/`getInstallationToken` methods).
- Session state is a `@fastify/secure-session` HttpOnly, SameSite=Lax (Secure in prod) encrypted cookie holding only the operator's `uuid` + GitHub numeric id — no session table, no DB round-trip to check a session.
- The operator record (new `Operator` entity) is keyed on `githubUserId` (string, `@Unique`, the stable GitHub numeric id) per AgDR-0004's forward-compat rule — unaffected by this decision, carried forward unchanged.
- OAuth CSRF state reuses (or generalizes) the existing DB-backed single-use state pattern already built for the manifest flow (`app/github-app/manifest-state/`), rather than inventing a second token mechanism.

## Consequences

- The codebase has exactly one GitHub-access seam (`GithubClient`) instead of two parallel mechanisms (the seam + Passport) — easier to reason about and to swap at the v0.2 Zitadel cutover, since Zitadel federates GitHub itself and this whole module is discarded together.
- No new runtime dependency for session storage beyond `@fastify/secure-session` (no DB session table, no Redis). Logout is "let the cookie expire" / "overwrite it" — there is no "log out everywhere" until v0.2's Zitadel session model lands.
- A future reader comparing #62's AC text ("Passport") against the implementation will see a seam-based approach instead — this AgDR is the record of why.
- #62 alone (without #63's allowlist) lets any GitHub account complete login and get a session; that gate is explicitly #63's responsibility, not this decision's.

## Artifacts

- Ticket: marsa-cloud/marsa#62 (GitHub user-OAuth login with session)
- Builds on: [AgDR-0004](AgDR-0004-authentication-and-idp-strategy.md) (v0.1 direct-GitHub-login phase, numeric-id forward-compat rule), [AgDR-0014](AgDR-0014-github-client-consolidation.md) (the `GithubClient` seam this decision extends)
- Related: marsa-cloud/marsa#63 (operator allowlist + first-admin bootstrap — the authorization layer on top of this authentication layer)
