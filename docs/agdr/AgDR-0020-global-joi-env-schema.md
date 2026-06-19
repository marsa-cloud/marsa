---
id: AgDR-0020
timestamp: 2026-06-18T10:57:00Z
agent: claude
model: claude-sonnet-4-6
trigger: pr-review
status: executed
ticket: marsa-cloud/marsa#62
---

# Single global Joi env schema, replacing per-feature config + ad-hoc `process.env` reads

> In the context of PR #80's review (#62), facing AgDR-0008's explicitly deferred
> follow-up — a per-feature Joi schema for `github-app` only, with six other
> `process.env` reads left ad-hoc across `mikro-orm.config`, `secret-cipher`,
> `status`, and the api entrypoint, now joined by a seventh ad-hoc read
> (`AUTH_SESSION_SECRET_KEY` in `auth.config.ts`) and an eighth (`PORT` read
> directly in `entrypoints/api.ts`) — we decided to close that deferral now by
> introducing **one global Joi schema validating every env var the api reads**,
> to achieve a single fail-fast boot-time check and remove the remaining
> ad-hoc `process.env` reads, accepting that this PR's blast radius grows beyond
> the auth feature to touch `github-app`, crypto, status, and the entrypoint.

## Context

- AgDR-0008 (2026-06-08, #58) deliberately scoped its Joi adoption to the
  `github-app` namespace only, explicitly naming the follow-up: "add a global
  Joi `validationSchema` at `forRoot` and migrate `SecretCipher`,
  `mikro-orm.config`, `status`, and the entrypoint reads onto namespaced
  config." That follow-up was never filed as its own ticket — #62's auth slice
  now adds a ninth/tenth ad-hoc read (`AUTH_SESSION_SECRET_KEY`, and the
  session cookie's `cookieName`/`secure` flags currently hardcoded in
  `entrypoints/api.ts` lines 24-33), which is the trigger to close the gap
  rather than add an eleventh.
- `@nestjs/config` is already a dependency (added in AgDR-0008) with
  `ConfigModule.forRoot({ isGlobal: true })` already wired at the composition
  root — the global registration point AgDR-0008 left for exactly this purpose.
  `joi` is already a dependency. No new runtime dependency is required for this
  decision itself.

## Options Considered

| Option                                                                                             | Pros                                                                                                                                                         | Cons                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **(a) One global Joi schema, validated via `ConfigModule.forRoot({ validationSchema })`** (chosen) | Single fail-fast boot check; every env var has one declared shape in one file; closes AgDR-0008's deferral; removes all remaining ad-hoc `process.env` reads | Touches files outside #62's feature folder (`github-app.config.ts`, `secret-cipher.service.ts`, `mikro-orm.config.ts`, `status/get-api-info.service.ts`, `entrypoints/api.ts`) |
| (b) Add a second feature-scoped schema for `auth` only, leave the rest deferred again              | Minimal blast radius for this PR                                                                                                                             | Defers the same follow-up a second time; the api would then have three different env-validation shapes (`github-app`, `auth`, ad-hoc) instead of converging                    |
| (c) Keep per-feature schemas but compose them into one `Joi.object` at `forRoot` via `.concat()`   | Preserves each feature's local schema ownership                                                                                                              | More indirection for the same end state as (a) with no clear benefit at the api's current size (a handful of features)                                                         |

## Decision

Chosen: **(a)**.

- New `apps/api/src/config/env.config.ts`: a single `Joi.object({...})` schema covering every env var the api reads — `NODE_ENV`, `PORT`, `DATABASE_URL`, `DB_NAME`, `APP_SECRETS_ENCRYPTION_KEY`, `AUTH_SESSION_SECRET_KEY`, `AUTH_COOKIE_NAME` (new, replaces the hardcoded `'marsa_session'`), `MARSA_WEB_URL`, `MARSA_API_PUBLIC_URL`, `VERSION`, `COMMIT` — registered once via `ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema })`.
- `github-app.config.ts` and `auth.config.ts` collapse into typed `registerAs()` slices that read already-validated `process.env` (validation now happens once, centrally, at `forRoot`; the per-feature `registerAs` factories keep their namespacing/DI-token convenience but drop their own Joi calls).
- `SecretCipherService.loadKey`, `mikro-orm.config.ts`, `status/get-api-info.service.ts`, and `entrypoints/api.ts` (`PORT`, cookie name, `secure` flag) are migrated off direct `process.env` reads onto the validated config.
- `auth.config.unit.test.ts` and (implicitly) any equivalent `github-app.config` test are replaced by one `env.unit.test.ts` asserting the schema accepts valid envs and rejects missing/malformed ones.

## Consequences

- Closes the explicit deferral recorded in AgDR-0008 — there is now exactly one place that declares "these are the api's env vars and their shapes."
- The PR's diff grows beyond the auth feature folder to touch `github-app`, `crypto`, `status`, and the entrypoint — an explicit, accepted scope increase per the user's "everything in this one PR" call (see the PR #80 review-response plan).
- A new env var (`AUTH_COOKIE_NAME`) is introduced to externalize what was previously a literal in `entrypoints/api.ts`; deployments must set it or rely on the schema's default.
- Future env vars added by any feature go into this one file — no feature should reintroduce a local Joi schema or a raw `process.env` read going forward.

## Artifacts

- Ticket: marsa-cloud/marsa#62 (PR #80 review response)
- Supersedes the deferred follow-up named in [AgDR-0008](AgDR-0008-nestjs-config-with-joi.md)
- Related: [AgDR-0006](AgDR-0006-github-app-credential-storage.md) (the encryption key this schema now validates)
