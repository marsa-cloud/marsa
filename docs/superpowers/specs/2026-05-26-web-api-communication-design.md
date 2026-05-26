# Web ↔ API Communication Method — Design

**Issue:** #11 — Decide on a communication method between WEB/API
**Date:** 2026-05-26
**Status:** Approved (design); implementation pending

## Decision

Communication between `apps/web` and `apps/api` is **REST over HTTP**, with an
**OpenAPI document as the single source of truth** for the contract. The web
side consumes the contract through **generated TypeScript types + generated Zod
schemas**, called via **Nuxt's native data layer** (a documented custom `$fetch`
instance / `useAPI` composable), with **Zod validation at the response boundary**.

- **Transport:** REST (the API is already REST: NestJS controllers, `@Get()`,
  typed response DTOs, URI versioning under `/api/v1/...`).
- **Contract:** an OpenAPI 3 document generated from the API via
  `@nestjs/swagger`, committed to the repo.
- **Codegen:** `@hey-api/openapi-ts` with the **typescript + zod plugins, SDK
  plugin disabled** — emits `types.gen.ts` and `zod.gen.ts`, no runtime client.
- **Calls:** a Nuxt plugin provides a custom `$fetch` instance (`$api`) with
  `baseURL` from runtime config and interceptors; calls go through it (directly
  or via a `useAPI` composable). Responses are validated with the generated Zod
  schemas in the `transform` hook.

## Rationale

### Why REST (not GraphQL or tRPC)

- **Keeps the public-API door open at zero present cost.** Whether Marsa exposes
  a documented public API (CLI, Terraform provider, CI integrations, user
  scripts) is undecided. REST + OpenAPI is the only option that requires nothing
  extra today *and* yields a language-agnostic, documentable contract later — the
  shape a self-hostable PaaS in the Heroku/Railway mold typically grows into.
- **Idiomatic in both stacks.** The API is already REST; NestJS has first-class
  OpenAPI support via `@nestjs/swagger`. Nuxt's batteries-included
  `$fetch`/`useFetch` are built for REST.
- **tRPC is the anti-pattern here.** It is TS-only RPC, so any non-TS consumer
  (a Go CLI, a curl script) gets nothing — closing the public-API door. It is
  also non-idiomatic in NestJS, requiring a community adapter and a parallel
  router definition alongside the existing controllers.
- **GraphQL is over-engineered for this surface.** The API is command/resource
  oriented (deploy, scale, logs, status), not an arbitrary graph clients need to
  shape. GraphQL would add a schema layer, server runtime, and N+1/caching
  concerns with no current payoff.

### Why generated types + Zod, consumed Nuxt-natively

This was the most-debated axis. It was settled by weighing a full generated
client (SDK) against the lighter `openapi-typescript` option, guided by the
official Nuxt 4 documentation.

- **Single source of truth, no drift.** Types and Zod schemas are generated
  *from* the API's own DTOs/decorators (via the OpenAPI doc). A hand-maintained
  shared type package drifts silently from what the server returns.
- **Runtime validation is worth keeping.** Pure `openapi-typescript` (types only)
  has the same hole as hand-written types: nothing checks the response at
  runtime, so API drift or a mangling proxy flows on as mistyped data. Generated
  Zod closes this at the network boundary.
- **Nuxt has no first-party codegen for an external API — and that's expected.**
  Nuxt auto-generates types only for its own Nitro server routes. Marsa is
  `ssr: false` with **no Nitro server** (all calls go to `apps/api`), so the
  response type must be supplied via the `$fetch`/`useFetch` generic — which is
  exactly what generated types provide. Generating from the API is the correct,
  framework-agnostic approach here.
- **The SDK plugin earns nothing for us.** `@hey-api`'s `sdk.gen` functions ship
  their own fetch layer that would bypass the Nuxt `$api` instance and the
  `transform` validation hook. An SDK pays off when paired with a separate query
  layer (e.g. TanStack Query) on a stack with no built-in data layer. Marsa is
  Nuxt and *does* have one (`useFetch`/`useAsyncData`/`$fetch`), so the SDK is
  redundant here. Types + Zod only.

## Architecture & Data Flow

```
NestJS controllers + @nestjs/swagger decorators
        │  (generate-open-api entrypoint boots ApiModule, writes the document)
        ▼
apps/api/openapi.json   ← committed; single source of truth
        │  (@hey-api/openapi-ts: typescript + zod plugins, no SDK)
        ▼
apps/web: types.gen.ts + zod.gen.ts   ← committed; generated
        │  (types feed the generic; zod validates in transform)
        ▼
$api ($fetch.create, baseURL from runtimeConfig) / useAPI composable
        │
        ▼
   HTTP  ──►  /api/v1/...
```

## Components

### API side (`apps/api`)

- Add `@nestjs/swagger`; annotate controllers/DTOs (`@ApiProperty`, etc.) enough
  to produce an accurate OpenAPI 3 document.
- Add a dedicated **generate entrypoint** (e.g. `src/entrypoints/generate-open-api.ts`)
  that boots `ApiModule` via `NestFactory.create(ApiModule, { preview: true })`,
  **re-applies the global prefix and URI versioning** (so the emitted paths match
  the real server — mirror `entrypoints/api.ts`, the same way the test bench
  mirrors the adapter config), builds the document with
  `SwaggerModule.createDocument(...)`, writes JSON to `apps/api/openapi.json`,
  and closes the app. Pass a custom **`operationIdFactory`** (drives clean
  generated names) and **`extraModels`** for shared error types.
- A `pnpm` script (e.g. `generate:openapi`) runs the entrypoint against compiled
  output, consistent with the existing build-then-run pipeline.
- `apps/api/openapi.json` is **committed** — diffable in review, and removes any
  need to boot the API during the web build.

### Web side (`apps/web`)

- Add dev dep `@hey-api/openapi-ts` and runtime dep `zod` (via the pnpm catalog).
- `openapi.config.ts` configured with the **typescript + zod plugins, SDK plugin
  disabled**, `input: ../../apps/api/openapi.json`. A `pnpm` script
  (e.g. `generate:api-types`) runs it, emitting `types.gen.ts` + `zod.gen.ts`
  into a dedicated folder (e.g. `app/api/`). Both are **committed** and added to
  ESLint/format ignores (generated, never hand-edited).
- **Consumption uses Nuxt's documented primitives, not a bespoke wrapper:**
  - A Nuxt **plugin** provides `$api` — a `$fetch.create({ baseURL, onRequest,
    onResponseError })` instance, `baseURL` from `runtimeConfig.public.apiBase`.
    This is the official external-API recipe.
  - Calls go through `$api` directly or via `useAsyncData(key, () => $api(...))`;
    optionally a `useAPI` composable via `createUseFetch`.
  - **Zod validation** runs in the `transform` hook (Nuxt's documented slot for
    reshaping/parsing a response — its own docs use `transform` to run
    `superjson.parse`), or equivalently in the `$api` instance's `onResponse`.
- Base URL comes from Nuxt **runtime config**; never a Nuxt server route (the app
  is `ssr: false`, no BFF). The placeholder `useExample` composable is unrelated
  to this contract and is left as-is.

### Contract location

- Producer artifact: `apps/api/openapi.json` (committed).
- Consumer artifacts: `apps/web/app/api/types.gen.ts` + `zod.gen.ts` (committed,
  generated).

## CI / Sync Strategy

Generated artifacts are committed, and CI **verifies they are in sync** rather
than regenerating into the build output:

1. Regenerate `apps/api/openapi.json` (run the API generate entrypoint).
2. Regenerate the web `types.gen.ts` + `zod.gen.ts`.
3. `git diff --exit-code` over those paths. A non-empty diff fails CI with a
   message telling the contributor to run the generate steps and commit the
   result.

This keeps the committed contract honest (always matches the controllers)
without booting the API during the normal web build. The check slots into the
existing `.github/workflows/ci.yml` pipeline alongside `format:check`, `lint`,
and typecheck. (An alternative is wiring generation into a build task graph
that regenerates on every build; Marsa's simpler pipeline favours a commit +
drift-check.)

## Error Handling

- The API returns standard HTTP status codes; error response shapes are part of
  the OpenAPI document (via `extraModels`) so they are typed on the web side too.
- The `$api` instance centralises cross-cutting failures via `onResponseError`
  (e.g. 401 handling); non-2xx responses surface as ofetch `FetchError`s.
- A consistent error envelope across endpoints is desirable but **out of scope
  for this decision** — a follow-up for when real resource endpoints exist.

## Testing

- **API:** existing e2e tests already exercise endpoints over HTTP; add a
  smoke-level check that the generate entrypoint produces a valid OpenAPI doc.
- **Web:** generated types are checked by `nuxt typecheck` in CI; the `$api`
  plugin / `useAPI` composable and the Zod `transform` can be unit-tested with a
  mocked fetch (assert that a malformed payload is rejected). Existing test
  layers (unit/component/e2e via Vitest + `@nuxt/test-utils`) are unchanged.

## Scope

**In scope:** choosing the method (REST + OpenAPI + generated types + Zod,
consumed Nuxt-natively), and the wiring that makes it real — `@nestjs/swagger`
document generation with `operationIdFactory`/`extraModels`, committed
`openapi.json`, `@hey-api/openapi-ts` (types + zod, no SDK), the `$api` plugin /
`useAPI` composable, Zod-in-`transform` validation, runtime base URL, and the CI
drift check.

**Out of scope (follow-ups), revisitable on Nuxt merits:** the hey-api SDK plugin, a query layer (`@tanstack/vue-query`),
`neverthrow` Result types, DTO→domain transformers, a standardized error
envelope, and authentication on the wire. None are locked out — the OpenAPI doc
remains the source of truth, so the SDK or a query layer can be added later
without rework.

## Open Questions

None blocking. The SDK-vs-no-SDK and error-envelope choices are explicitly
deferred and reversible.
