---
id: AgDR-0022
timestamp: 2026-06-18T10:59:00Z
agent: claude
model: claude-sonnet-4-6
trigger: pr-review
status: executed
ticket: marsa-cloud/marsa#62
---

# Bind OAuth `state` to the session cookie, closing the login-CSRF gap

> In the context of PR #80's review (#62), facing the fact that `state`
> validation today is **DB-only** (`OAuthStateService.consume()` checks the
> token exists, is unexpired, and deletes it on use) with no binding to the
> browser session that initiated the flow, we decided to **also store the
> issued `state` in the requester's session cookie at begin-login and require
> the callback's `state` to match the session-stored value at complete-login**,
> to close the classic OAuth login-CSRF gap (an attacker completing their own
> OAuth flow then tricking a victim's browser into hitting the callback URL
> with the attacker's valid-but-foreign `state`/`code` pair), accepting one
> extra session write/read in the login flow and that the protection is moot
> for a same-origin attacker who can also forge the session cookie (out of
> scope — `@fastify/secure-session` already HMACs/encrypts the cookie against
> tampering).

## Context

- DB-only single-use state (the design from AgDR-0016/AgDR-0017) proves the
  callback request corresponds to _some_ state this server issued and that it
  hasn't been replayed — it does **not** prove the callback came from the
  _same browser_ that began the flow. That's the textbook login-CSRF vector:
  attacker starts their own legitimate OAuth flow, captures the valid
  `state`/authorization step, and gets a victim's browser to land on the
  callback URL (e.g. via an auto-submitting form or a crafted link), causing
  the victim's session to be set to the attacker's GitHub identity.
- `@fastify/secure-session` (already wired in `entrypoints/api.ts` and the test
  harness) issues a session cookie before the user is "logged in" in the
  application sense — Fastify creates the session object on first access, so
  writing a pre-auth `pendingOauthState` value into it at begin-login, before
  any `userUuid` is set, is a standard, supported usage of the plugin.
- This binding is **additive** to the existing DB-backed single-use check
  (AgDR-0017's `auth_oauth_state` table) — it does not replace it. Both checks
  must pass for `complete-github-login` to succeed.

## Options Considered

| Option                                                                                                                                      | Pros                                                                                                                                                                     | Cons                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **(a) Store `state` in the session at begin-login; require exact match at complete-login, in addition to the existing DB consume** (chosen) | Closes the login-CSRF gap with no new table/dependency — reuses the session mechanism already in place per AgDR-0016; one extra session write + one extra equality check | Couples `OAuthStateService` (currently DB-only, AgDR-0017) to a session read at the controller/use-case level — the service itself stays DB-only; the binding check lives in the use-case                                                                                                        |
| (b) Switch to the OAuth2 "PKCE"-style nonce purely in a signed cookie, drop the DB table entirely                                           | One less moving part (no DB table)                                                                                                                                       | Loses the DB-side audit trail and the existing single-use/expiry semantics AgDR-0017 already built and shipped; a bigger rewrite than the gap warrants                                                                                                                                           |
| (c) Do nothing — accept DB-only state as "good enough" for v0.1 throwaway auth (AgDR-0004)                                                  | Zero additional code                                                                                                                                                     | Login-CSRF is a known, named OWASP-class issue for OAuth callbacks; leaving it unaddressed when the fix is this cheap isn't justified by "v0.1 throwaway" scoping — throwaway scoping licenses skipping revocation/session-table complexity (AgDR-0016), not skipping a standard CSRF mitigation |

## Decision

Chosen: **(a)**.

- `begin-github-login.use-case`: after `oauthState.issue()` returns the new state token, also write it into the session (`request.session.set('pendingOauthState', state)`) before redirecting to GitHub's authorize URL.
- `complete-github-login.use-case`: before (or alongside) calling `oauthState.consume(callbackState)`, read `request.session.get('pendingOauthState')` and require it to **equal** the callback's `state` query param. Mismatch (including "session has no pending state") is rejected with 400, distinct from the existing "DB token not found/expired" rejection so the two failure modes can be told apart in logs.
- On successful completion, `pendingOauthState` is cleared from the session (it's single-use, mirroring the DB token's single-use semantics) before `userUuid` is set.
- `OAuthStateService` itself is unchanged (per the PR plan's decision to keep it standalone, mirroring `ManifestState*`) — the session-binding check is use-case-level, not pushed down into the service.

## Consequences

- Closes the login-CSRF gap: a callback request whose session doesn't carry the matching pending state is rejected even if the `state`/`code` pair is itself valid and unexpired in the DB.
- Two checks now gate a successful login: DB single-use/expiry (AgDR-0017) and session-match (this AgDR). Both must pass.
- The mitigation's strength is bounded by the session cookie's own integrity guarantee — `@fastify/secure-session`'s HMAC/encryption (already relied upon for `userUuid` itself) is the trust anchor; this AgDR does not introduce a new one.
- e2e tests for `complete-github-login` must round-trip through `begin-github-login` first (to get a session with `pendingOauthState` set) rather than constructing a bare DB row, or must explicitly set the session field to simulate the begin step.

## Artifacts

- Ticket: marsa-cloud/marsa#62 (PR #80 review response)
- Amends: [AgDR-0016](AgDR-0016-oauth-seam-and-session-mechanism.md) (session mechanism), [AgDR-0017](AgDR-0017-migration-operator-and-oauth-state-tables.md) (DB-backed state table — unchanged, now paired with this session check)
