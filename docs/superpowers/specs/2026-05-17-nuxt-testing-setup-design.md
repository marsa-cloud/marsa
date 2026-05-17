# Design: Nuxt testing framework for `apps/web`

**Date:** 2026-05-17
**Status:** Approved (brainstorming)
**Scope:** Add a working three-layer test setup to the SPA-only Nuxt app (`apps/web`). NestJS in `apps/api` is unaffected.

## Goal

Stand up unit, component, and end-to-end testing for `apps/web` using Nuxt's first-party tooling, so feature work can land with tests from day one. SPA-only (SSR disabled); the backend is always `apps/api`, never a Nuxt server route.

## Non-goals

- Replacing or touching the api test setup.
- Visual regression / snapshot infrastructure beyond Vitest's built-in snapshot support.
- Building a Nuxt server (Nitro) layer or BFF — explicitly out of scope.
- Picking a specific component testing style guide (Testing Library vs. direct `@vue/test-utils` API). Tests can use either; this spec only wires up the runtime.

## Stack

| Concern | Tool | Why |
|---|---|---|
| Test runner | **Vitest** | First-party Vite/Nuxt integration; standard in the Vue/Nuxt ecosystem. |
| Nuxt integration | **`@nuxt/test-utils`** | Provides `mountSuspended`, `mockNuxtImport`, `setup()`, `$fetch`, `createPage`. The only sanctioned way to test Nuxt apps. |
| Component mount | `@vue/test-utils` | Peer dep of `@nuxt/test-utils`; lower-level mount helpers. |
| DOM environment | **happy-dom** | Nuxt/Vitest default; ~3× faster than jsdom and spec-complete enough for component tests. |
| Browser E2E | **Playwright** (Chromium) | Driven through `setup({ browser: true })` + `createPage`, not as a standalone runner. |
| Coverage | `@vitest/coverage-v8` | Cheap to add; opt-in via `--coverage`. |

Versions are pinned in the root `pnpm-workspace.yaml` catalog; `apps/web/package.json` references them as `"catalog:"`.

## SPA-only config

`apps/web/nuxt.config.ts` gets:

```ts
ssr: false,
```

Consequences:
- No server-side rendering; `nuxi build` still produces a client bundle, `nuxi generate` produces a fully static site for CDN deployment.
- `@nuxt/test-utils`'s `setup()` still works — it boots the Nuxt dev/preview server, just without SSR. `$fetch('/')` returns the SPA shell HTML; meaningful page assertions go through `createPage` (Playwright).

## Test layer matrix

| Layer | Runs in | Environment | Helpers | Typical assertions |
|---|---|---|---|---|
| **Unit** | `vitest run` | `node` (default) | none | pure functions, composables that don't touch Nuxt internals |
| **Component** | `vitest run` | `nuxt` (per-file directive) | `mountSuspended` from `@nuxt/test-utils/runtime` | render an SFC, query DOM, fire events, assert on emitted events / DOM state |
| **E2E** | `vitest run --config vitest.e2e.config.ts` | `node` + booted Nuxt | `setup()` + `$fetch` + `createPage` | HTTP status, fetched markup, real-browser interactions |

Component vs. unit is **not** a separate command or folder — it's just whether the file opts into the Nuxt environment via the directive:

```ts
// @vitest-environment nuxt
```

Files without the directive run in `node` (fast). Files with it boot a Nuxt runtime so `mountSuspended`, Nuxt auto-imports, and `<NuxtLink>` work.

## File layout

```
apps/web/
  vitest.config.ts                  # fast layer: unit + component
  vitest.e2e.config.ts              # slow layer: e2e only
  playwright.config.ts              # consumed via @nuxt/test-utils, not standalone
  app/
    components/
      AppLogo.vue
      __tests__/
        AppLogo.spec.ts             # // @vitest-environment nuxt
    composables/
      useExample.ts
      __tests__/
        useExample.spec.ts          # node env
    pages/
      index.vue
  tests/
    e2e/
      home.spec.ts                  # setup() + $fetch / createPage
```

Conventions:
- Co-located `__tests__/` folders for unit and component tests. Vue/Nuxt community standard.
- File suffix is **`.spec.ts`** (matches Vitest defaults and Vue ecosystem). No `.unit.test.ts` / `.component.test.ts` split — the environment directive does the work.
- E2E tests live at the package root under `tests/e2e/` because they aren't tied to a single source file.

## Config files

### `apps/web/vitest.config.ts`

```ts
import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['app/**/__tests__/**/*.spec.ts'],
    exclude: ['tests/e2e/**', 'node_modules', '.nuxt', '.output'],
    environmentOptions: {
      nuxt: {
        domEnvironment: 'happy-dom',
      },
    },
  },
})
```

Files that need the Nuxt runtime declare it inline:

```ts
// @vitest-environment nuxt
import { mountSuspended } from '@nuxt/test-utils/runtime'
```

### `apps/web/vitest.e2e.config.ts`

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.spec.ts'],
    testTimeout: 60_000,        // browser boot is slow
    hookTimeout: 120_000,       // setup() builds and boots Nuxt
    pool: 'forks',              // each e2e file gets its own Nuxt instance
  },
})
```

### `apps/web/playwright.config.ts`

Minimal — Playwright is only used as a library driven by `@nuxt/test-utils`, not as a standalone runner. Defaults to Chromium; other browsers added later if needed.

## Scripts

`apps/web/package.json`:

```jsonc
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "vitest run --config vitest.e2e.config.ts",
    "test:e2e:install": "playwright install --with-deps chromium"
  }
}
```

Root `pnpm test` already fans out via `pnpm -r --parallel run test`, so the fast layer wires in automatically. E2E stays per-package (`pnpm --filter web test:e2e`).

## CI

Add to `.github/workflows/ci.yml`, after the existing api test step:

```yaml
- run: pnpm --filter web test
- run: pnpm --filter web exec playwright install --with-deps chromium
- run: pnpm --filter web test:e2e
```

Playwright's browser binaries are cached by GitHub Actions' default caching of `~/.cache/ms-playwright` when keyed on the Playwright version (already-standard pattern; we'll use `actions/cache` keyed on `playwright` version from the lockfile).

Both steps are required checks initially. Splitting them lets us downgrade `test:e2e` to "warn only" later without restructuring the pipeline if it becomes flaky.

## Seed tests

Three minimal tests prove every layer works:

1. **Unit** — create a trivial `app/composables/useExample.ts` and `app/composables/__tests__/useExample.spec.ts` that exercises it in the `node` env. (Composable + seed test get deleted together once a real composable shows up.)
2. **Component** — `app/components/__tests__/AppLogo.spec.ts`. Uses `mountSuspended(AppLogo)`, asserts the rendered DOM contains the logo's expected text/element.
3. **E2E** — `tests/e2e/home.spec.ts`. Two cases:
   - `$fetch('/')` returns 200 and includes the SPA shell.
   - `createPage('/')` loads the page; the test asserts on a rendered element after client-side hydration.

These are placeholders, deletable when real tests arrive — but they fail loudly if the runtime is broken, which is the whole point of seeds.

## Docs

Create `apps/web/.claude/CLAUDE.md` (analogous to `apps/api/.claude/CLAUDE.md`) covering:
- Stack overview (Nuxt 4, SPA-only, Nuxt UI, Tailwind 4).
- Testing: layer matrix, file layout, the `// @vitest-environment nuxt` directive (it's an easy-to-forget gotcha), command map.
- That all backend calls go to `apps/api` (no Nitro server routes / BFF).
- The "Nuxt batteries-included" preference.

Update root `marsa/.claude/CLAUDE.md` to point at the new `apps/web/.claude/CLAUDE.md`.

## Risks / gotchas

- **`// @vitest-environment nuxt` is per-file, not per-block.** If someone forgets it, `mountSuspended` will fail with a confusing error about missing Nuxt context. Docs call this out; CI will catch it.
- **Playwright browser install time.** First CI run downloads Chromium (~150MB). Subsequent runs hit the cache. Keep the cache key tied to the Playwright version, not the lockfile hash, to avoid spurious cache misses.
- **SSR off ≠ no Nuxt at test time.** Component tests still need the Nuxt environment to wire up auto-imports and `<NuxtLink>` — `ssr: false` only affects production rendering, not the test runtime.
- **`pool: 'forks'` in e2e** is intentional: `setup()` mutates global state per Nuxt instance, and shared workers cause cross-test pollution.
- **Catalog drift.** Versions of `vitest`, `@nuxt/test-utils`, `@vue/test-utils`, `happy-dom`, and `playwright` must be added to the catalog in one PR — pnpm refuses to install `"catalog:"` references that aren't defined.

## Open questions

None blocking. Future work that this spec deliberately doesn't decide:
- Testing-Library style vs. direct `@vue/test-utils` API — let's see how real tests feel before legislating.
- Coverage thresholds in CI — add later once we have real coverage to look at.
- Visual regression tooling — wait until there's a UI worth regressing against.
