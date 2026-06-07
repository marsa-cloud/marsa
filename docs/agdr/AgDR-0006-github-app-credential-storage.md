---
id: AgDR-0006
timestamp: 2026-06-07T12:43:07Z
agent: claude
model: claude-opus-4-8
trigger: user-prompt
status: executed
---

# GitHub App provisioning — credential encryption at rest + Manifest-flow implementation choices

> In the context of implementing per-install GitHub App provisioning ([AgDR-0005](AgDR-0005-github-app-integration-model.md), #58), facing the need to persist GitHub-issued secrets (client secret, webhook secret, RSA private-key PEM) in Marsa's Postgres without leaking them and to drive the browser→GitHub→Marsa Manifest round-trip safely, we decided to **encrypt the secrets at rest with AES-256-GCM using Node's built-in `crypto` and a 32-byte key from `APP_SECRETS_ENCRYPTION_KEY`**, drive the flow **FE-first** (web renders the manifest form; API stays JSON-only), guard the callback with a **stateless HMAC-signed `state`**, and talk to GitHub via the **built-in `fetch`** behind an injectable client, accepting that key management is the operator's responsibility and that pre-auth signed-state is a weaker CSRF guard than a session until #22 lands.

## Context

- The GitHub App Manifest conversion (`POST https://api.github.com/app-manifests/{code}/conversions`) returns `id`, `slug`, `client_id`, `client_secret`, `webhook_secret`, and `pem` (RSA private key). Three of these are long-lived secrets that grant full control of the App (mint installation tokens, impersonate the App's OAuth) and **must not** sit in Postgres in plaintext.
- The private key is reused later by **#23** to mint installation access tokens (App JWT → installation token), so decryption must be available to other features — the cipher is cross-cutting infrastructure, not feature-local.
- The operator hits the **web** origin (`https://<domain>`), not the API subdomain (`api.<domain>`) — confirmed by the marsa-charts Traefik `IngressRoute`. The Manifest flow requires the manifest to be **POSTed via an HTML form** (it can't ride a 302), so a browser-side form is unavoidable.
- The conversion `code` is short-lived (~1 h) and the round-trip leaves and re-enters Marsa via GitHub, so the callback needs a CSRF guard. There is **no operator session yet** — login is #22.

## Options Considered

| Decision             | Options                                                                                              | Chosen                                                  | Why                                                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Encryption mechanism | (a) Node `crypto` AES-256-GCM; (b) libsodium sealed boxes; (c) DB/`pgcrypto`; (d) external KMS/Vault | **(a) AES-256-GCM**                                     | Authenticated encryption with **zero new dependencies**; GCM's auth tag detects tampering; KMS/Vault is operational weight a self-hosted box shouldn't require in v0.1 |
| Key source           | (a) env var; (b) file mount; (c) KMS                                                                 | **(a) `APP_SECRETS_ENCRYPTION_KEY` (base64, 32 bytes)** | Matches the existing env-driven config (`--env-file`); chart injects it via a Secret; rotatable later without code change                                              |
| Form rendering       | (a) API serves HTML; (b) **FE renders form**                                                         | **(b) FE (Nuxt page)**                                  | Operator's entry point is the web origin; keeps the API a pure JSON/OpenAPI contract ([AgDR-0001](AgDR-0001-web-api-communication.md))                                 |
| CSRF `state`         | (a) stateless HMAC(nonce+exp); (b) DB-stored nonce; (c) session-bound                                | **(a) HMAC-signed**                                     | No session or extra table needed; signature + ≤10-min expiry is adequate pre-auth; upgrade to session-bound when #22 lands                                             |
| GitHub HTTP          | (a) `fetch`; (b) `@octokit/*`                                                                        | **(a) built-in `fetch`**                                | One unauthenticated POST; no dependency justified yet. #23 may add Octokit for installation-token signing                                                              |

## Decision

- **Secrets at rest**: `client_secret`, `webhook_secret`, and `pem` are encrypted with **AES-256-GCM** via a cross-cutting `SecretCipher` (`src/modules/crypto/`). Stored column format is base64 of `iv(12) ‖ authTag(16) ‖ ciphertext`. `client_id`, `app id`, `slug`, `name`, `html_url`, `owner` are not secret and stored as-is.
- **Key**: `APP_SECRETS_ENCRYPTION_KEY` — base64-encoded 32 bytes. The service **fails fast at startup** if it is missing or not 32 bytes after decode.
- **Flow**: FE-first. `GET /api/v1/github-app/manifest` returns `{ manifest, formAction, state }`; the Nuxt page auto-submits the form to GitHub; GitHub redirects to `<web>/setup/github/callback`; the page POSTs `{ code, state }` to `POST /api/v1/github-app/conversions`, which verifies `state`, exchanges the code, encrypts, and persists.
- **`state`**: `base64url(payload).hmacSHA256`, payload = `{ nonce, exp }`, `exp` ≤ 10 min. Verified for signature + freshness on callback.
- **Manifest permissions** are a **tunable baseline** (`contents: read`, `metadata: read`, events `[push]`, `request_oauth_on_install: true`, `public: false`) — sized for #23 deploy + #22 login; revisit when those features land.

## Consequences

- **Operator owns the key.** Losing `APP_SECRETS_ENCRYPTION_KEY` makes stored secrets unrecoverable (must re-provision the App); leaking it exposes them. The chart must persist it in a Secret alongside the Postgres password (same model as AgDR-0004's password handling). Key rotation = decrypt-with-old/re-encrypt-with-new — **not implemented in v0.1**, noted for a future task.
- **GCM auth tag** means any tampering or wrong-key decrypt throws rather than returning garbage — surfaces corruption loudly.
- **Pre-auth `state`** is a weaker CSRF guard than a session-bound token: it proves the callback originated from a manifest _we_ issued and is fresh, but not that it's the _same browser/operator_. Acceptable for the one-time v0.1 first-run provisioning; **#22** should bind provisioning to the admin session.
- **No Octokit dependency** yet keeps the API lean; #23 will reassess for JWT signing / installation tokens.
- **Three new env vars** (`APP_SECRETS_ENCRYPTION_KEY`, `MARSA_WEB_URL`, `MARSA_API_PUBLIC_URL`) need chart wiring — a **marsa-charts follow-up** (separate repo).

## Artifacts

- Issue: marsa-cloud/marsa#58 (this feature)
- Builds on: [AgDR-0005](AgDR-0005-github-app-integration-model.md) (per-install App model), [AgDR-0004](AgDR-0004-authentication-and-idp-strategy.md) (auth strategy), [AgDR-0001](AgDR-0001-web-api-communication.md) (web↔api JSON contract)
- Enables: marsa-cloud/marsa#22 (login), #23 (deploy)
