# Web ↔ API Communication Method — Design

**Issue:** #11 — Decide on a communication method between WEB/API
**Date:** 2026-05-26
**Status:** Approved (design); implementation pending

## Decision

Communication between `apps/web` and `apps/api` is **REST over HTTP**, with an
**OpenAPI document as the single source of truth** for the contract and
**generated TypeScript types** consumed on the web side through Nuxt's native
`$fetch` / `useFetch`.

- **Transport:** REST (the API is already REST: NestJS controllers, `@Get()`,
  typed response DTOs, URI versioning under `/api/v1/...`).
- **Contract:** an OpenAPI 3 document generated from the API via
  `@nestjs/swagger`.
- **Type sync:** `openapi-typescript` generates a single `.d.ts` of types from
  the OpenAPI document; the web imports those types. No runtime client SDK.
- **Calls:** Nuxt `$fetch` / `useFetch` with a runtime-config base URL.

## Rationale

### Why REST (not GraphQL or tRPC)

- **Keeps the public-API door open at zero present cost.** Whether Marsa exposes
  a documented public API (CLI, Terraform provider, CI integrations, user
  scripts) is undecided. REST + OpenAPI is the only option that requires nothing
  extra today *and* yields a language-agnostic, documentable contract later. A
  self-hostable PaaS in the Heroku/Railway mold typically grows exactly such an
  API.
- **Idiomatic in both stacks.** The API is already REST; NestJS has first-class
  OpenAPI support via `@nestjs/swagger`. Nuxt's batteries-included
  `$fetch`/`useFetch` are built for REST. This matches the standing preference to
  use Nuxt's first-party tooling.
- **tRPC is the anti-pattern here.** It is TS-only RPC, so any non-TS consumer
  (a Go CLI, a curl script) gets nothing — closing the public-API door. It is
  also non-idiomatic in NestJS, requiring a community adapter and a parallel
  router definition alongside the existing controllers.
- **GraphQL is over-engineered for this surface.** The API is command/resource
  oriented (deploy, scale, logs, status), not an arbitrary graph clients need to
  shape. GraphQL would add a schema layer, server runtime, and N+1/caching
  concerns with no current payoff.

### Why generated types (not a shared type package, hand-written types, or a full client)

- **Single source of truth, no drift.** Types are generated *from* the API's own
  DTOs/decorators (via the OpenAPI doc). A hand-maintained shared type package
  has no runtime guarantee and drifts silently from what the server returns.
- **Lightweight over a full generated client.** `openapi-typescript` emits a
  single declaration file with **zero runtime code**, so the web keeps using
  Nuxt's `$fetch`/`useFetch` — preserving caching, reactivity, interceptors, and
  runtime-config base URL. A full generated client ships its own fetch wrapper
  that would replace and fight Nuxt's. A full client only pays off with many
  endpoints; that decision can be revisited later since the OpenAPI doc remains
  the source of truth either way.
- **Hand-written types** are fine for today's single endpoint but don't satisfy
  the goal of deciding a durable method.

## Architecture & Data Flow

```
NestJS controllers + @nestjs/swagger decorators
        │  (generate script boots the app, writes the document)
        ▼
apps/api/openapi.json   ← committed; single source of truth
        │  (openapi-typescript)
        ▼
apps/web/app/types/api.d.ts   ← committed; generated types
        │  (import types)
        ▼
Nuxt $fetch / useFetch  ──HTTP──►  /api/v1/...  (base URL from runtime config)
```

## Components

### API side (`apps/api`)

- Add `@nestjs/swagger` and annotate controllers/DTOs enough to produce an
  accurate OpenAPI 3 document (operation per endpoint, response schemas).
- A **generate script** boots the Nest application context, builds the document
  with `SwaggerModule.createDocument(...)`, writes it to `apps/api/openapi.json`,
  and exits. (It writes the file; it does not need to serve a live Swagger UI,
  though serving one in dev is a cheap optional extra.)
- `openapi.json` is **committed** to the repo. Committing makes the contract
  diffable in review and removes any need to boot the API during the web build.

### Web side (`apps/web`)

- Add `openapi-typescript` as a dev dependency (via the pnpm catalog).
- A **generate script** runs `openapi-typescript apps/api/openapi.json` and
  writes `apps/web/app/types/api.d.ts`. This file is **committed**.
- A thin typed helper wraps Nuxt `$fetch` against those types (path +
  response typing). The existing placeholder `useExample` composable is not part
  of this contract and is left as-is.
- Base URL comes from Nuxt **runtime config** (e.g. `runtimeConfig.public.apiBase`),
  per the existing backend-coupling guidance — never a Nuxt server route (the app
  is `ssr: false`, no BFF).

### Contract location

- Producer artifact: `apps/api/openapi.json` (committed).
- Consumer artifact: `apps/web/app/types/api.d.ts` (committed, generated).

## CI / Sync Strategy

Both generated artifacts are committed, and CI **verifies they are in sync**
rather than regenerating into the build output:

1. Run the API generate script → regenerate `apps/api/openapi.json`.
2. Run the web generate script → regenerate `apps/web/app/types/api.d.ts`.
3. `git diff --exit-code` over both paths. A non-empty diff fails CI with a
   message telling the contributor to run the generate step and commit the
   result.

This keeps the committed contract honest (it always matches the controllers)
without requiring the API to boot during the normal web build. The check slots
into the existing `.github/workflows/ci.yml` pipeline alongside `format:check`,
`lint`, and typecheck.

## Error Handling

- The API returns standard HTTP status codes; error response shapes are part of
  the OpenAPI document so they are typed on the web side too.
- The web's typed `$fetch` helper surfaces non-2xx responses as thrown
  `FetchError`s (Nuxt/ofetch default), handled per-call.
- A consistent error DTO across endpoints is desirable but is **out of scope for
  this decision** — it is a follow-up for when real resource endpoints exist.

## Testing

- **API:** existing e2e tests already exercise endpoints over HTTP; add a check
  that the generate script produces a valid OpenAPI document (smoke-level).
- **Web:** the generated `.d.ts` is type-checked by `nuxt typecheck` in CI; the
  typed `$fetch` helper can be unit-tested with a mocked fetch. Existing test
  layers (unit/component/e2e via Vitest + `@nuxt/test-utils`) are unchanged.

## Scope

**In scope:** choosing the method (REST + OpenAPI + generated types), and the
wiring that makes it real — `@nestjs/swagger` document generation, committed
`openapi.json`, `openapi-typescript` generation, a typed `$fetch` helper, runtime
base URL, and the CI sync check.

**Out of scope (follow-ups):** a standardized error envelope, authentication on
the wire, a full generated client SDK, and any actual resource endpoints beyond
the existing status endpoint.

## Open Questions

None blocking. The full-client-vs-types-only choice and the error-envelope shape
are explicitly deferred and revisitable; the OpenAPI document remains the source
of truth, so neither choice is locked in by this decision.
