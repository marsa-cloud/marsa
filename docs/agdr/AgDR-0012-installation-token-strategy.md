---
id: AgDR-0012
timestamp: 2026-06-11T11:10:00Z
agent: claude
model: claude-opus-4-8
trigger: user-prompt
status: executed
ticket: marsa-cloud/marsa#59
---

# Mint installation access tokens via `@octokit/auth-app` (not hand-rolled JWT)

> In the context of turning a captured GitHub App installation into usable repo-access tokens (#59, [AgDR-0005](AgDR-0005-github-app-integration-model.md)), facing the need to sign an App JWT with the stored RSA private key, exchange it for a ~1h installation access token, and cache/refresh that token, I decided to adopt **`@octokit/auth-app`** (GitHub's first-party auth strategy) rather than hand-roll JWT signing + an HTTP exchange + a token cache, to achieve a correct, maintained implementation of the security-sensitive parts, accepting one new dependency in `apps/api`.

## Context

#58 stores the App's encrypted RSA private-key PEM. #59 must:

1. sign a short-lived App JWT (RS256) with that PEM,
2. `POST /app/installations/{id}/access_tokens` to exchange it for a ~1h installation token,
3. cache the token and refresh it before expiry.

Steps 1 and 3 are classic footguns: RS256 signing, the `iat`/`exp` clock-skew window GitHub enforces (≤10 min, and GitHub rejects future-dated `iat`), and a correct expiry-aware cache. GitHub publishes `@octokit/auth-app`, which implements exactly this strategy (App JWT + installation token + in-memory LRU cache with auto-refresh).

The CEO explicitly waived the `/decide` interview ("just utilize library") — this record exists to satisfy the arch-PR AgDR gate and to document the choice.

## Options Considered

| Option                                                              | Pros                                                                                                                                                            | Cons                                                                                                                                                  |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(a) `@octokit/auth-app`** (chosen)                                | First-party, maintained; signs the App JWT, exchanges the token, **and caches + auto-refreshes** — covers AC2/AC3/AC4 in one configure step; clock-skew handled | One new dependency                                                                                                                                    |
| (b) Hand-roll with `jsonwebtoken`/`jose` + `fetch` + a custom cache | No new "auth" dep (still needs a JWT lib)                                                                                                                       | Re-implements security-sensitive JWT signing, the clock-skew window, and an expiry cache — exactly the error-prone surface; more code to test and own |
| (c) Full `octokit` / `@octokit/core`                                | Same auth, plus a request client                                                                                                                                | Heavier than needed; #59 doesn't call arbitrary GitHub endpoints yet                                                                                  |

## Decision

Chosen: **(a)**. A `@Injectable() GitHubInstallationTokenService` (in `src/modules/github-client/`) wraps `createAppAuth({ appId, privateKey })` and calls `auth({ type: 'installation', installationId })`. The per-App `auth` instance is cached in a `Map` keyed by `githubAppId` so the library's internal token cache (AC4) survives across calls — the cache is per-auth-instance, so a fresh `createAppAuth` per call would defeat it. The PEM is decrypted via `SecretCipherService` ([AgDR-0006](AgDR-0006-github-app-credential-storage.md)) at the call site and passed in; the service never reads the DB itself.

Tokens are **not** persisted: they're short-lived and re-mintable from the PEM at any time, so storing them would add encrypted-secret surface for no durability benefit. The minted token has no consumer in #59 (the capture flow mints once to verify the installation is real and ours); #60 consumes it for cloning.

## Consequences

- AC2 (sign JWT), AC3 (exchange), AC4 (cache/refresh) are satisfied by configuring the library, not by hand-rolled crypto.
- The token service is unit-tested with `@octokit/auth-app` mocked (token returned, per-App auth instance reused, error path wrapped) — no live GitHub calls in tests.
- Establishes the Octokit ecosystem as the integration layer for #60 (clone) and informs #61 (`@octokit/webhooks` for signature verification) and #62 (user-OAuth).
- One new dependency added via the pnpm catalog.

## Artifacts

- Ticket: marsa-cloud/marsa#59
- Builds on: [AgDR-0005](AgDR-0005-github-app-integration-model.md), [AgDR-0006](AgDR-0006-github-app-credential-storage.md)
- PR: filled in as the feature ships
