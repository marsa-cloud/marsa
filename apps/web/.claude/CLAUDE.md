# CLAUDE.md — apps/web

Frontend-specific guidance. The root `marsa/.claude/CLAUDE.md` covers monorepo-wide concerns; this file adds web-only detail.

## Stack

Nuxt 4 with `@nuxt/ui` (Tailwind 4). **SPA-only:** `ssr: false` in `nuxt.config.ts`. There is no Nitro server / BFF — all backend calls go to `apps/api`. Static builds (`nuxi generate`) are deployable to a CDN.

Always prefer Nuxt's first-party / batteries-included options when adding tooling (testing, state, fetching, etc.). The point of choosing Nuxt is to skip the wiring; symmetry with `apps/api`'s choices is not a tiebreaker.

## Testing

Three layers, all driven by Vitest + `@nuxt/test-utils`:

| Layer | Where | Environment | How |
|---|---|---|---|
| Unit | `app/<area>/__tests__/*.spec.ts` | `node` (default) | plain Vitest; import the function and assert |
| Component | `app/components/__tests__/*.spec.ts` | `nuxt` (per-file directive) | first line: `// @vitest-environment nuxt`, then `mountSuspended` from `@nuxt/test-utils/runtime` |
| E2E | `tests/e2e/*.spec.ts` | booted Nuxt + Chromium | `setup()` + `$fetch` (HTTP) or `createPage` (Playwright) from `@nuxt/test-utils/e2e` |

**The `// @vitest-environment nuxt` directive is the easy-to-forget gotcha.** It must be the first line of any file that uses `mountSuspended`, `mockNuxtImport`, or Nuxt auto-imports. Without it, Vitest runs the file in the plain Node environment and Nuxt helpers fail with confusing errors.

### Commands

```bash
pnpm --filter web test                 # unit + component (fast)
pnpm --filter web test:watch           # interactive
pnpm --filter web test:e2e             # boots Nuxt + Chromium (slow)
pnpm --filter web test:e2e:install     # one-time Playwright browser install
```

`pnpm test` at the root runs only the fast layer (it fans out to each workspace's `test` script). E2E stays per-package.

### Configs

- `vitest.config.ts` — uses `defineVitestConfig` from `@nuxt/test-utils/config`; happy-dom is the DOM env for the Nuxt environment; e2e is excluded.
- `vitest.e2e.config.ts` — plain Vitest config, longer timeouts, `pool: 'forks'` so each e2e file gets a fresh Nuxt instance.
- `playwright.config.ts` — minimal; Playwright is used as a library through `@nuxt/test-utils`, not as a standalone runner.

## File layout

```
apps/web/
  nuxt.config.ts                # ssr: false, modules, eslint stylistic
  vitest.config.ts
  vitest.e2e.config.ts
  playwright.config.ts
  app/
    components/                 # Vue SFCs; tests in __tests__/
    composables/                # auto-imported helpers; tests in __tests__/
    pages/                      # file-based routes
    assets/
    app.vue
    app.config.ts
  tests/
    e2e/                        # @nuxt/test-utils setup() + Playwright
```

## Backend coupling

Every backend call goes to `apps/api` (NestJS on Fastify, prefix `/api`, URI versioning). Base URL is `runtimeConfig.public.apiBase` (default `http://localhost:3000/api`, override at runtime with `NUXT_PUBLIC_API_BASE`) — it **includes** the `/api` prefix, so call sites use version-relative paths like `/v1/status`. Never put backend logic in a Nuxt server route (SPA, no BFF).

### Generated API client (types + Zod, no SDK)

Types and Zod schemas are generated from the api's `openapi.json` into `app/api/` via `@hey-api/openapi-ts` (config in `openapi-ts.config.ts`). The **SDK/client plugin is intentionally off** — we call the api through Nuxt's `$fetch`, not a generated client.

- Regenerate with `pnpm --filter web generate:api` (reads `../api/openapi.json`); the generated `app/api/*` is **committed** and lint/format-ignored. CI drift-checks it — never hand-edit it.
- **Calls go through the `$api` plugin** (`app/plugins/api.ts`, a `$fetch.create` instance with the base URL + interceptors), consumed via `useAsyncData(key, () => $api('/v1/...'))`. **Validate the response with the generated Zod schema in the `transform` hook** (`transform: (raw) => zSomething.parse(raw)`) — this is the boundary check; see `app/composables/useApiStatus.ts`.
- **Which generated type to use:** the FE uses the **schema body type** (e.g. `GetApiInfoResponse`) and its Zod schema (`zGetApiInfoResponse`). Ignore the operation wrappers the generator also emits — `…V1Responses` (status-code map), `…V1Response` (response union), and `…V1Data` (request shape). They're hey-api plumbing, not what you bind to in components.
