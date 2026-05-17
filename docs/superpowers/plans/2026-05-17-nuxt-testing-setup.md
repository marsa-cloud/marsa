# Nuxt Testing Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a three-layer test setup (unit / component / e2e) for `apps/web` using Vitest + `@nuxt/test-utils` + Playwright, with the app explicitly configured as a SPA (`ssr: false`).

**Architecture:** Single fast Vitest config drives unit + component tests, with the Nuxt runtime opted into per-file via `// @vitest-environment nuxt`. A separate Vitest config runs end-to-end tests through `@nuxt/test-utils`'s `setup()` — including Playwright-backed `createPage` for real browser interactions. Three minimal seed tests prove each layer works before CI is wired in.

**Tech Stack:** Nuxt 4 (SPA-only), Vitest 3, `@nuxt/test-utils`, `@vue/test-utils`, happy-dom, Playwright (Chromium), pnpm workspaces, pnpm catalog.

**Reference spec:** `docs/superpowers/specs/2026-05-17-nuxt-testing-setup-design.md`

---

### Task 1: Add test deps to the pnpm catalog

**Files:**

- Modify: `pnpm-workspace.yaml`

- [ ] **Step 1: Add catalog entries**

Edit `pnpm-workspace.yaml`. After the existing `# Nuxt (web)` block, add a new `# Test stack (web)` block:

```yaml
# Test stack (web)
vitest: ^3.0.0
'@vitest/coverage-v8': ^3.0.0
'@vue/test-utils': ^2.4.6
'@nuxt/test-utils': ^3.19.0
happy-dom: ^17.0.0
playwright: ^1.50.0
```

- [ ] **Step 2: Commit**

```bash
git add pnpm-workspace.yaml
git commit -m "chore: add web test stack to pnpm catalog"
```

---

### Task 2: Wire test deps into `apps/web` and install

**Files:**

- Modify: `apps/web/package.json`

- [ ] **Step 1: Add devDependencies referencing the catalog**

Edit `apps/web/package.json`. Add the following entries to `devDependencies` (keep alphabetical order with the existing entries):

```jsonc
{
  "devDependencies": {
    // ... existing entries ...
    "@nuxt/test-utils": "catalog:",
    "@vitest/coverage-v8": "catalog:",
    "@vue/test-utils": "catalog:",
    "happy-dom": "catalog:",
    "playwright": "catalog:",
    "vitest": "catalog:",
  },
}
```

- [ ] **Step 2: Install**

Run from repo root:

```bash
pnpm install
```

Expected: pnpm resolves all six packages and updates `pnpm-lock.yaml`. No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(web): install vitest + @nuxt/test-utils + playwright"
```

---

### Task 3: Install Playwright's Chromium browser locally

**Files:** none modified; this populates `~/.cache/ms-playwright`.

- [ ] **Step 1: Install Chromium**

Run from repo root:

```bash
pnpm --filter web exec playwright install chromium
```

Expected: Playwright downloads Chromium (~150MB on first run). Confirm with:

```bash
ls ~/.cache/ms-playwright | grep chromium
```

Expected output: a `chromium-<rev>` directory.

- [ ] **Step 2: No commit** — this is a local artifact, not a tracked file.

---

### Task 4: Disable SSR in `nuxt.config.ts`

**Files:**

- Modify: `apps/web/nuxt.config.ts`

- [ ] **Step 1: Add `ssr: false`**

Edit `apps/web/nuxt.config.ts`. Add `ssr: false` as the first option inside `defineNuxtConfig({...})`:

```ts
export default defineNuxtConfig({
  ssr: false,

  modules: ['@nuxt/eslint', '@nuxt/ui'],

  // ... rest unchanged ...
})
```

- [ ] **Step 2: Verify dev server boots in SPA mode**

```bash
pnpm --filter web build
```

Expected: build succeeds. In the build output, the line `Building client...` appears but `Building server...` does not (or runs much more briefly with only client-side outputs).

- [ ] **Step 3: Commit**

```bash
git add apps/web/nuxt.config.ts
git commit -m "feat(web): disable SSR (SPA-only mode)"
```

---

### Task 5: Create `vitest.config.ts` for unit + component tests

**Files:**

- Create: `apps/web/vitest.config.ts`

- [ ] **Step 1: Write the config**

```ts
// apps/web/vitest.config.ts
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

- [ ] **Step 2: Verify Vitest can read the config (no tests yet, expects zero-test exit)**

```bash
pnpm --filter web exec vitest run --reporter=verbose
```

Expected: Vitest starts, reports "No test files found" (exit code 0 or 1 depending on Vitest version — both acceptable here). No config-parsing errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/vitest.config.ts
git commit -m "feat(web): add vitest config for unit + component tests"
```

---

### Task 6: Create `vitest.e2e.config.ts` for end-to-end tests

**Files:**

- Create: `apps/web/vitest.e2e.config.ts`

- [ ] **Step 1: Write the config**

```ts
// apps/web/vitest.e2e.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.spec.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    pool: 'forks',
  },
})
```

- [ ] **Step 2: Verify Vitest can read the e2e config**

```bash
pnpm --filter web exec vitest run --config vitest.e2e.config.ts
```

Expected: Vitest starts, reports no test files found. No config-parsing errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/vitest.e2e.config.ts
git commit -m "feat(web): add vitest config for e2e tests"
```

---

### Task 7: Create minimal `playwright.config.ts`

**Files:**

- Create: `apps/web/playwright.config.ts`

Playwright is consumed as a library through `@nuxt/test-utils`'s `createPage`, not as a standalone runner — so this config isn't strictly required. We add a stub so that any tool (IDE plugins, ad-hoc `playwright` CLI invocations) that looks for one finds sensible defaults.

- [ ] **Step 1: Write the config**

```ts
// apps/web/playwright.config.ts
// Playwright is consumed via @nuxt/test-utils (createPage), not as a standalone
// runner. This config exists so IDE plugins and ad-hoc CLI runs find defaults.
export default {
  use: {
    headless: true,
  },
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/playwright.config.ts
git commit -m "feat(web): add minimal playwright config"
```

---

### Task 8: Add test scripts to `apps/web/package.json`

**Files:**

- Modify: `apps/web/package.json`

- [ ] **Step 1: Add scripts**

Edit `apps/web/package.json`. Add to the `scripts` block (preserve existing entries):

```jsonc
{
  "scripts": {
    // ... existing entries ...
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "vitest run --config vitest.e2e.config.ts",
    "test:e2e:install": "playwright install --with-deps chromium",
  },
}
```

- [ ] **Step 2: Verify scripts work end-to-end (still no tests)**

```bash
pnpm --filter web test
pnpm --filter web test:e2e
```

Expected: both commands run, report no test files, exit cleanly.

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json
git commit -m "feat(web): add test, test:watch, test:e2e scripts"
```

---

### Task 9: Seed unit test — `useExample` composable

**Files:**

- Create: `apps/web/app/composables/useExample.ts`
- Create: `apps/web/app/composables/__tests__/useExample.spec.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/app/composables/__tests__/useExample.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { useExample } from '../useExample'

describe('useExample', () => {
  it('returns the doubled value', () => {
    expect(useExample(2)).toBe(4)
  })

  it('returns 0 for 0', () => {
    expect(useExample(0)).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test, expect it to fail**

```bash
pnpm --filter web test
```

Expected: FAIL — `useExample` not found. The test runner discovers the file and fails on the import.

- [ ] **Step 3: Write the minimal composable**

`apps/web/app/composables/useExample.ts`:

```ts
export function useExample(value: number): number {
  return value * 2
}
```

- [ ] **Step 4: Run the test, expect it to pass**

```bash
pnpm --filter web test
```

Expected: PASS — both `useExample` tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/composables/useExample.ts apps/web/app/composables/__tests__/useExample.spec.ts
git commit -m "test(web): seed unit test for useExample composable"
```

---

### Task 10: Seed component test — `AppLogo`

**Files:**

- Create: `apps/web/app/components/__tests__/AppLogo.spec.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/app/components/__tests__/AppLogo.spec.ts`:

```ts
// @vitest-environment nuxt
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import AppLogo from '../AppLogo.vue'

describe('AppLogo', () => {
  it('renders an SVG element', async () => {
    const wrapper = await mountSuspended(AppLogo)
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('uses currentColor for the wordmark paths', async () => {
    const wrapper = await mountSuspended(AppLogo)
    const wordmark = wrapper.findAll('path').filter((p) => p.attributes('fill') === 'currentColor')
    expect(wordmark.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run the test, expect it to pass**

```bash
pnpm --filter web test
```

Expected: PASS — both `AppLogo` tests green, plus the existing `useExample` tests. The Nuxt environment boots (slower first run), `mountSuspended` returns a wrapper, DOM queries succeed.

If you see `Cannot read properties of undefined (reading 'app')` or similar, the `// @vitest-environment nuxt` directive is missing — verify it's the **first line** of the file.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/components/__tests__/AppLogo.spec.ts
git commit -m "test(web): seed component test for AppLogo"
```

---

### Task 11: Seed E2E test — home page

**Files:**

- Create: `apps/web/tests/e2e/home.spec.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/tests/e2e/home.spec.ts`:

```ts
import { fileURLToPath } from 'node:url'

import { $fetch, createPage, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

await setup({
  rootDir: fileURLToPath(new URL('../..', import.meta.url)),
  browser: true,
  server: true,
})

describe('home page (e2e)', () => {
  it('serves the SPA shell over HTTP', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('<div id="__nuxt">')
  })

  it('renders the home page in a real browser', async () => {
    const page = await createPage('/')
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
    await page.close()
  })
})
```

- [ ] **Step 2: Run the e2e test**

```bash
pnpm --filter web test:e2e
```

Expected: PASS — Nuxt builds (first run is slow, 30–90s), Playwright launches Chromium, both tests green.

Common failure modes:

- `Cannot find module 'playwright-core'` → `@nuxt/test-utils` couldn't resolve Playwright. Verify `pnpm --filter web list playwright` shows the install. If still failing, add `playwright-core` to the catalog and `apps/web/package.json` devDeps and re-install.
- `Failed to launch chromium` → Task 3 was skipped. Run `pnpm --filter web test:e2e:install`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/tests/e2e/home.spec.ts
git commit -m "test(web): seed e2e test for home page"
```

---

### Task 12: Create `apps/web/.claude/CLAUDE.md`

**Files:**

- Create: `apps/web/.claude/CLAUDE.md`

- [ ] **Step 1: Write the file**

````markdown
# CLAUDE.md — apps/web

Frontend-specific guidance. The root `marsa/.claude/CLAUDE.md` covers monorepo-wide concerns; this file adds web-only detail.

## Stack

Nuxt 4 with `@nuxt/ui` (Tailwind 4). **SPA-only:** `ssr: false` in `nuxt.config.ts`. There is no Nitro server / BFF — all backend calls go to `apps/api`. Static builds (`nuxi generate`) are deployable to a CDN.

Always prefer Nuxt's first-party / batteries-included options when adding tooling (testing, state, fetching, etc.). The point of choosing Nuxt is to skip the wiring; symmetry with `apps/api`'s choices is not a tiebreaker.

## Testing

Three layers, all driven by Vitest + `@nuxt/test-utils`:

| Layer     | Where                                | Environment                 | How                                                                                              |
| --------- | ------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------ |
| Unit      | `app/<area>/__tests__/*.spec.ts`     | `node` (default)            | plain Vitest; import the function and assert                                                     |
| Component | `app/components/__tests__/*.spec.ts` | `nuxt` (per-file directive) | first line: `// @vitest-environment nuxt`, then `mountSuspended` from `@nuxt/test-utils/runtime` |
| E2E       | `tests/e2e/*.spec.ts`                | booted Nuxt + Chromium      | `setup()` + `$fetch` (HTTP) or `createPage` (Playwright) from `@nuxt/test-utils/e2e`             |

**The `// @vitest-environment nuxt` directive is the easy-to-forget gotcha.** It must be the first line of any file that uses `mountSuspended`, `mockNuxtImport`, or Nuxt auto-imports. Without it, Vitest runs the file in the plain Node environment and Nuxt helpers fail with confusing errors.

### Commands

```bash
pnpm --filter web test                 # unit + component (fast)
pnpm --filter web test:watch           # interactive
pnpm --filter web test:e2e             # boots Nuxt + Chromium (slow)
pnpm --filter web test:e2e:install     # one-time Playwright browser install
```
````

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

Every backend call goes to `apps/api` (NestJS on Fastify, prefix `/api`, URI versioning). Configure the base URL via Nuxt runtime config; never put backend logic in a Nuxt server route.

````

- [ ] **Step 2: Commit**

```bash
git add apps/web/.claude/CLAUDE.md
git commit -m "docs(web): add apps/web CLAUDE.md"
````

---

### Task 13: Point the root CLAUDE.md at the new web doc

**Files:**

- Modify: `.claude/CLAUDE.md`

- [ ] **Step 1: Update the repo-layout bullet for `apps/web`**

In `.claude/CLAUDE.md`, find the bullet:

```markdown
- `apps/web` — Nuxt 4 + Nuxt UI + Tailwind 4 frontend (non-SSR, deployable to a CDN).
```

Replace with:

```markdown
- `apps/web` — Nuxt 4 + Nuxt UI + Tailwind 4 frontend, SPA-only (`ssr: false`). **See `apps/web/.claude/CLAUDE.md`** for frontend-specific testing setup and conventions.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/CLAUDE.md
git commit -m "docs: link root CLAUDE.md to apps/web CLAUDE.md"
```

---

### Task 14: Wire web tests into CI

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add web test steps + Playwright cache**

Edit `.github/workflows/ci.yml`. After the existing `- name: Test API` step, append:

```yaml
- name: Test Web (unit + component)
  run: pnpm --filter web test

- name: Get Playwright version
  id: playwright-version
  run: |
    echo "version=$(pnpm --filter web list playwright --depth=0 --json | jq -r '.[0].devDependencies.playwright.version')" >> "$GITHUB_OUTPUT"

- name: Cache Playwright browsers
  uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ runner.os }}-${{ steps.playwright-version.outputs.version }}

- name: Install Playwright browsers
  run: pnpm --filter web exec playwright install --with-deps chromium

- name: Test Web (e2e)
  run: pnpm --filter web test:e2e
```

- [ ] **Step 2: Verify the YAML is valid**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"
```

Expected: no output (exit 0).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run web unit/component/e2e tests"
```

---

### Task 15: Final verification

- [ ] **Step 1: Full clean install from the repo root**

```bash
pnpm install
```

Expected: lockfile is up to date, no errors.

- [ ] **Step 2: Run all checks locally**

```bash
pnpm format:check
pnpm lint
pnpm build
pnpm --filter api test
pnpm --filter web test
pnpm --filter web test:e2e
```

Expected: every command exits 0. If `format:check` fails, run `pnpm format` and re-commit.

- [ ] **Step 3: No commit** — this task is verification only.

---

## Self-review

**Spec coverage check:**

- SSR off → Task 4 ✓
- Deps + catalog → Tasks 1, 2 ✓
- `vitest.config.ts` → Task 5 ✓
- `vitest.e2e.config.ts` → Task 6 ✓
- `playwright.config.ts` → Task 7 ✓
- Scripts → Task 8 ✓
- Seed unit / component / e2e → Tasks 9, 10, 11 ✓
- `apps/web/.claude/CLAUDE.md` → Task 12 ✓
- Root CLAUDE.md link → Task 13 ✓
- CI integration → Task 14 ✓
- Final verification → Task 15 ✓

**Known fragilities (documented inline in the relevant tasks):**

- Playwright peer-dep variants between `playwright` and `playwright-core` (Task 11 fallback).
- `playwright/test` export availability for `playwright.config.ts` (Task 7 fallback).
- First-line `// @vitest-environment nuxt` directive is easy to misplace (Task 10 troubleshooting).

The plan is sequenced so each task leaves the repo in a working state: every config-only task ends with Vitest reporting "no tests found" (success), and every test-adding task ends with green tests.
