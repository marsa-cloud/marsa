---
id: AgDR-0021
timestamp: 2026-06-18T10:58:00Z
agent: claude
model: claude-sonnet-4-6
trigger: pr-review
status: executed
ticket: marsa-cloud/marsa#62
---

# All-Octokit `GithubClient` implementation, retiring hand-rolled `fetch`

> In the context of PR #80's review (#62 and CodeRabbit's "no request timeout"
> finding on the two new OAuth methods), facing `OctokitGithubClient` mixing
> Octokit (`@octokit/auth-app`, for JWT/installation-token signing) with three
> hand-rolled raw `fetch` calls (`convertManifest`, `exchangeUserOAuthCode`,
> `getAuthenticatedUser`) that duplicate what Octokit's request layer already
> provides — including the missing-timeout gap CodeRabbit flagged — we decided
> to go **all-in on Octokit's request layer** for every GitHub API call in this
> client, to remove the duplicated HTTP plumbing and get request timeouts for
> free, accepting the dependency on Octokit's request/retry conventions for
> calls that don't strictly need them (e.g. the OAuth token exchange, which
> isn't a REST API call in the usual sense).

## Context

- `OctokitGithubClient` (the sole binding of the `GithubClient` seam established
  in AgDR-0014) currently has two call styles side by side: `getInstallationToken`
  goes through `createAppAuth` (`@octokit/auth-app`); `convertManifest`,
  `exchangeUserOAuthCode`, and `getAuthenticatedUser` each hand-roll a raw
  `fetch()` with manual JSON parsing and no timeout.
- CodeRabbit's automated review flagged the missing timeout on the two new
  OAuth methods specifically — a hand-rolled fix would mean adding an
  `AbortController` + `setTimeout` to each of the three raw-`fetch` call sites
  individually.
- Octokit's `request()` (via `@octokit/core`, which `@octokit/auth-app` already
  pulls in transitively) accepts a `request: { timeout }` option per call and
  centralizes header/auth/error handling — adopting it for all three remaining
  raw calls fixes the CodeRabbit finding once, at the call layer, instead of
  three times.

## Options Considered

| Option                                                                                                                             | Pros                                                                                                                                                                                          | Cons                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(a) All-Octokit: replace all three raw `fetch` calls with Octokit `request()`/REST methods** (chosen)                            | One HTTP layer, one place to configure timeout/retry; closes CodeRabbit's finding without hand-rolled `AbortController` code; consistent with `getInstallationToken`'s existing Octokit usage | The OAuth code-exchange endpoint (`github.com/login/oauth/access_token`) isn't a versioned REST API call — using Octokit's generic `request()` for it is slightly less idiomatic than for `GET /user`, but still gets the timeout/header handling |
| (b) Add `AbortController`-based timeouts to the existing three raw `fetch` calls, keep Octokit only for installation-token signing | Smaller diff, fixes only the flagged finding                                                                                                                                                  | Leaves two HTTP client styles in one class permanently; the next new method has to choose which style to copy                                                                                                                                     |
| (c) Hand-roll a shared `fetchWithTimeout()` helper used by all three raw calls                                                     | Smaller diff than (a), fixes the finding                                                                                                                                                      | Still two HTTP layers in the same class; reinvents what Octokit's request layer already does well                                                                                                                                                 |

## Decision

Chosen: **(a)**.

- `convertManifest`, `exchangeUserOAuthCode`, and `getAuthenticatedUser` are rewritten on top of Octokit's `request()` (or the typed REST method where Octokit's `@octokit/rest`/`endpoint` definitions cover it, e.g. `GET /user`), each configured with an explicit request timeout.
- `@octokit/auth-app`'s `createAppAuth` remains for JWT/installation-token signing — unaffected, since that responsibility (App-level auth) is orthogonal to "which HTTP layer issues the request."
- `authFor` (the private per-app/key Octokit-instance cache) is the natural place to also construct a base Octokit instance for the unauthenticated/user-token calls, so request configuration (timeout) is set once per constructed instance rather than per call.

## Consequences

- One HTTP layer (Octokit) for every GitHub API interaction in `OctokitGithubClient` — closes the dual-style inconsistency and the CodeRabbit timeout finding in one change.
- `MockGithubClient` (the test binding, per AgDR-0014/AgDR-0016) is unaffected — it never made real HTTP calls, so this decision is invisible to existing unit/e2e tests that depend on the mock.
- Slightly increases reliance on Octokit's request/retry defaults for the OAuth code-exchange call, which is not a versioned REST endpoint; if Octokit's defaults (e.g. automatic retry-on-5xx) ever misbehave for that specific endpoint, override them per-call rather than reverting to raw `fetch`.

## Artifacts

- Ticket: marsa-cloud/marsa#62 (PR #80 review response; closes CodeRabbit's no-timeout finding)
- Related: [AgDR-0014](AgDR-0014-github-client-consolidation.md) (the `GithubClient` seam this extends), [AgDR-0016](AgDR-0016-oauth-seam-and-session-mechanism.md) (introduced the two OAuth methods now being migrated onto Octokit)
