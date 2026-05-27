# Web ↔ API Communication: REST + OpenAPI with generated types + Zod

> In the context of choosing how `apps/web` talks to `apps/api`, facing the need for a type-safe contract that doesn't foreclose a future public API, I decided to use **REST over HTTP with a committed OpenAPI document as the single source of truth** — consumed on the web side via generated TypeScript types + generated Zod schemas through Nuxt's native `$fetch`, validated at the response boundary — to achieve drift-free, framework-idiomatic, language-agnostic communication, accepting a codegen + drift-check build step and deferring a full generated SDK.

## Context

`apps/web` (Nuxt 4, `ssr: false`, no Nitro server) and `apps/api` (NestJS 11, REST controllers, URI versioning under `/api/v1/...`) need a defined communication contract (issue #11). Whether Marsa will later expose a documented public API (CLI, Terraform provider, CI integrations) is undecided, so the choice must not foreclose that option. Both stacks already lean REST: the API is built on NestJS controllers; Nuxt ships `$fetch`/`useFetch` for REST.

This AgDR is back-filled from the design spec authored during PR #33 (`docs/superpowers/specs/2026-05-26-web-api-communication-design.md`) to record the decision in the canonical AgDR location for portfolio-wide `/agdr search`.

## Options Considered

| Option                                             | Pros                                                                                                                                                                                                                   | Cons                                                                                                                                                                                  |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **REST + OpenAPI + generated types/Zod** (chosen)  | Idiomatic in both NestJS and Nuxt; language-agnostic contract keeps the public-API door open at zero present cost; generated types + Zod give compile-time _and_ runtime safety; OpenAPI doc is committed and diffable | Adds a codegen step + CI drift gate; two generated artifacts to keep in sync                                                                                                          |
| **tRPC**                                           | End-to-end TS type inference with no codegen                                                                                                                                                                           | TS-only RPC — closes the public-API door for any non-TS consumer (Go CLI, curl); non-idiomatic in NestJS (needs a community adapter + parallel router alongside existing controllers) |
| **GraphQL**                                        | Flexible client-shaped queries; strong tooling                                                                                                                                                                         | Over-engineered for a command/resource-oriented surface (deploy, scale, logs, status); adds schema layer, server runtime, N+1/caching concerns with no current payoff                 |
| **REST + `openapi-typescript` (types only)**       | Lighter; types from the contract                                                                                                                                                                                       | No runtime validation — same hole as hand-written types: API drift or a mangling proxy flows on as mistyped data                                                                      |
| **REST + full generated SDK (`@hey-api` sdk.gen)** | Ready-made client functions                                                                                                                                                                                            | SDK ships its own fetch layer that bypasses the Nuxt `$api` instance + `transform` validation; redundant on a stack that already has `useFetch`/`useAsyncData`                        |

## Decision

Chosen: **REST + committed OpenAPI document + generated TypeScript types and Zod schemas, consumed Nuxt-natively**, because it is the only option that requires nothing extra today _and_ yields a language-agnostic, documentable contract later — the shape a self-hostable PaaS in the Heroku/Railway mold typically grows into — while closing the runtime-drift hole that a types-only approach leaves open.

Concretely:

- **API**: `@nestjs/swagger` annotations on controllers/DTOs; a dedicated `generate-open-api` entrypoint boots `ApiModule` (re-applying global prefix + URI versioning so emitted paths match the real server), writes `apps/api/openapi.json` (committed).
- **Web**: `@hey-api/openapi-ts` with the **typescript + zod plugins, SDK plugin disabled** emits `types.gen.ts` + `zod.gen.ts` (committed, lint/format-ignored). A Nuxt plugin provides `$api` (`$fetch.create`, `baseURL` from runtime config); composables validate responses with the generated Zod schema in the `useAsyncData` `transform`.
- **Contract honesty**: a CI step regenerates both artifacts and fails on drift (`git diff --exit-code`).

Explicitly deferred (all reversible — the OpenAPI doc remains the source of truth): a full generated SDK, TanStack Query, `neverthrow`, response transformers.

## Consequences

- Compile-time _and_ runtime type safety across the web↔api boundary; contract drift fails CI rather than reaching production.
- A codegen + drift-check step is now part of the build; generated files must be regenerated and committed when the API contract changes (`pnpm --filter api generate:openapi && pnpm --filter web generate:api`).
- The public-API option stays open at zero added cost — OpenAPI is consumable by any language.
- If a richer client layer is ever needed, enabling the SDK plugin / adding TanStack Query is an additive, reversible change.

## Artifacts

- PR: marsa-cloud/marsa#33 — `feat: typed REST communication layer between web and api (#11)`
- Issue: marsa-cloud/marsa#11
- Design spec: `docs/superpowers/specs/2026-05-26-web-api-communication-design.md`
- Implementation plan: `docs/superpowers/plans/2026-05-26-web-api-communication.md`
- Key files: `apps/api/src/entrypoints/generate-open-api.ts`, `apps/web/openapi-ts.config.ts`, `apps/web/app/plugins/api.ts`, `apps/web/app/composables/useApiStatus.ts`, `.github/workflows/ci.yml` (drift gate)
