# CLAUDE.md — apps/web

Frontend-specific guidance. The root `marsa/.claude/CLAUDE.md` covers monorepo-wide concerns; this file adds web-only detail.

## Stack

Nuxt 4 with `@nuxt/ui` (Tailwind 4). **SPA-only:** `ssr: false` in `nuxt.config.ts`. There is no Nitro server / BFF — all backend calls go to `apps/api`. Static builds (`nuxi generate`) are deployable to a CDN.

Always prefer Nuxt's first-party / batteries-included options when adding tooling (testing, state, fetching, etc.). The point of choosing Nuxt is to skip the wiring; symmetry with `apps/api`'s choices is not a tiebreaker.

## Conventions live in path-scoped rules

| Editing                                 | Rule                                  |
| --------------------------------------- | ------------------------------------- |
| `app/composables/**`, `app/plugins/**`  | `.claude/rules/web/composable.md`     |
| `app/**/*.vue`                          | `.claude/rules/web/component.md`      |
| `__tests__/**`, `tests/**`              | `.claude/rules/web/tests.md`          |

The shape in one line: reads go through a per-endpoint `useAsyncData` + `$api` composable, mutations use imperative `$api`, and both validate with the generated Zod at the boundary. Nuxt UI v4 has two dashboard gotchas that fail silently — see the component rule before building a page.

If a rule contradicts the code, the code wins and the rule is a bug — fix the rule.

## Testing

Three layers, all driven by Vitest + `@nuxt/test-utils`:

| Layer             | Where                                  | Environment          | How                                                          |
| ----------------- | -------------------------------------- | -------------------- | ------------------------------------------------------------ |
| Unit              | `app/<area>/__tests__/*.spec.ts`       | `node` (default)     | plain Vitest; import the function and assert                 |
| Component / Nuxt  | `app/**/__tests__/*.nuxt.spec.ts`      | `nuxt` (by filename) | `mountSuspended` / `mockNuxtImport` from `@nuxt/test-utils/runtime` |
| E2E               | `tests/e2e/*.spec.ts`                  | booted Nuxt + Chromium | `setup()` + `$fetch` or `createPage` from `@nuxt/test-utils/e2e` |

The `*.nuxt.spec.ts` filename is what selects the environment — see `.claude/rules/web/tests.md`.

### Commands

```bash
pnpm --filter web test                 # unit + component (fast)
pnpm --filter web test:watch           # interactive
pnpm --filter web test:e2e             # boots Nuxt + Chromium (slow)
pnpm --filter web test:e2e:install     # one-time Playwright browser install
```

`pnpm test` at the root runs only the fast layer. E2E stays per-package.

**E2E runs against the real API, not mocks**, so it needs the api running in test mode. Specs that exercise authenticated routes also need a session cookie in `E2E_SESSION_COOKIE`; unauthenticated ones (the `/login` redirect) run without it. Locally:

```bash
docker compose up -d                                   # Postgres (marsa_test)
cp apps/api/.env.test apps/api/.env
pnpm --filter api build
cd apps/api
export E2E_SESSION_COOKIE=$(node --env-file=.env dist/src/entrypoints/seed-dev.js | grep -o 'marsa_session=[^ ]*')
node --env-file=.env dist/src/entrypoints/api.js &     # API on :3000 (mock deploy backend, no cluster)
cd ../.. && pnpm --filter web test:e2e
```

CI does the same in its "Start seeded API" step. The real-cluster (k3d) path is separate — issue #122.

### Configs

- `vitest.config.ts` — `defineVitestConfig` from `@nuxt/test-utils/config`; happy-dom is the DOM env; e2e excluded; coverage thresholds live here.
- `vitest.e2e.config.ts` — plain Vitest, longer timeouts, `pool: 'forks'` so each e2e file gets a fresh Nuxt instance. `playwright.config.ts` is minimal: Playwright is used as a library through `@nuxt/test-utils`, not as a standalone runner.

### Visual / browser testing

To verify a UI change or reproduce a UI bug, drive the running dev server (`pnpm dev:web`) with the **Playwright or chrome-devtools MCP** — navigate, click, snapshot, measure layout (scroll height, element reachability). Requires system **Google Chrome**. Prefer the MCP over ad-hoc node/playwright scripts.

## File layout

```text
apps/web/
  nuxt.config.ts                # ssr: false, modules, eslint stylistic
  vitest.config.ts · vitest.e2e.config.ts · playwright.config.ts
  app/
    components/                 # Vue SFCs; tests in __tests__/
    composables/                # auto-imported helpers (top-level only)
    pages/                      # file-based routes
    layouts/ · middleware/ · plugins/ · assets/
    api/                        # generated types + Zod (committed, never hand-edited)
    app.vue · error.vue · app.config.ts
  tests/e2e/                    # @nuxt/test-utils setup() + Playwright
```

## Architecture & structure

**Verdict: idiomatic Nuxt 4 — no restructuring needed.** `app/` is the srcDir (the Nuxt 4 default) and every convention directory sits where Nuxt expects it. The only deliberate departures are SPA-only (`ssr: false`, so no `server/` dir) and the committed generated client under `app/api/` (a plain module dir imported via `~/api`, not convention-scanned).

### Shared state — `useState`, then Pinia

Nuxt's idiomatic shared-state primitive is **`useState()` wrapped in a composable**. Server data is already shared and cached by `useAsyncData` keys, so most state needs are covered by the API composables. Reach for **Pinia** only when a store outgrows `useState` (complex mutations, cross-store composition, devtools). The Nuxt **hooks** system (`useNuxtApp().hook()`) is for event signalling and lifecycle, **not** state — don't use it as a data store.

### Scaling to multiple domains — Nuxt Layers, not `modules/`

Today the frontend is one domain ("apps"), so the flat `components/` / `composables/` / `pages/` layout is correct — don't pre-abstract. When a **second real domain** appears (billing, teams, …), group it as a **Nuxt Layer**: `layers/<domain>/` with its own `nuxt.config.ts` + `app/`, auto-registered or listed in `extends`. Do **not** reach for `src/modules/<feature>/` — Nuxt only auto-scans the *top-level* `app/composables/`, so composables nested under a `modules/` dir silently fail to import. Adopt the heavier structure **lazily**: add an explicit model/transformer boundary only when an entity's API shape and UI shape genuinely diverge. Trigger + path tracked in **marsa#136**.

## Backend coupling

Every backend call goes to `apps/api` (NestJS on Fastify, prefix `/api`, URI versioning). Base URL is `runtimeConfig.public.apiBase` (default `http://localhost:3000/api`, override with `NUXT_PUBLIC_API_BASE`) — it **includes** the `/api` prefix, so call sites use version-relative paths like `/v1/status`. Never put backend logic in a Nuxt server route (SPA, no BFF).

Types and Zod schemas are generated from the api's `openapi.json` into `app/api/` by `@hey-api/openapi-ts` (config in `openapi-ts.config.ts`); the SDK/client plugin is intentionally off. Regenerate with `pnpm --filter web generate:api` and commit — CI drift-checks it. How to consume them: `.claude/rules/web/composable.md`.
