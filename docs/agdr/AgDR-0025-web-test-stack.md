---
id: AgDR-0025
timestamp: 2026-05-17T00:00:00Z
agent: claude
model: claude-opus-4-8
trigger: user-prompt
status: accepted
ticket: marsa-cloud/marsa#94
---

# Web test stack: Vitest + @nuxt/test-utils + Playwright (happy-dom), one fast layer + one e2e layer

> In the context of standing up testing for the SPA-only Nuxt app (`apps/web`), facing the need for unit, component, and end-to-end coverage so feature work lands with tests from day one, I decided to use **Vitest as the runner, `@nuxt/test-utils` for Nuxt integration, happy-dom for the DOM, and Playwright (Chromium) driven through `@nuxt/test-utils` for e2e** — split into a fast `vitest.config.ts` layer (unit + component) and a slow `vitest.e2e.config.ts` layer — to achieve first-party, ecosystem-idiomatic testing, accepting a per-file `// @vitest-environment nuxt` gotcha and Playwright's first-run browser-download cost.

## Context

`apps/web` is Nuxt 4, SPA-only (`ssr: false`), with all backend calls going to `apps/api` (no Nitro server / BFF). It needed a working three-layer test setup. `apps/api` (NestJS) has its own separate test harness and is unaffected. The decision was to pick Nuxt's first-party tooling so tests are sanctioned and stable rather than bolted on.

## Options Considered

| Option | Pros | Cons |
| ------ | ---- | ---- |
| **Vitest + `@nuxt/test-utils` + happy-dom + Playwright-via-test-utils** (chosen) | First-party Vite/Nuxt integration; `mountSuspended`/`mockNuxtImport`/`setup`/`createPage` are the sanctioned Nuxt test APIs; happy-dom ~3× faster than jsdom; Playwright driven as a library (not a second runner) keeps one test surface | Per-file `// @vitest-environment nuxt` directive is easy to forget; Playwright downloads Chromium (~150MB) on first CI run |
| Jest + standalone Playwright | Familiar; mature | Non-idiomatic in the Vue/Nuxt ecosystem; no first-party Nuxt integration; two disjoint runners |
| jsdom instead of happy-dom | Slightly broader DOM spec coverage | Nuxt/Vitest default is happy-dom; ~3× slower; spec coverage gap irrelevant for component tests |

## Decision

Chosen: **Vitest + `@nuxt/test-utils` + happy-dom + Playwright (Chromium)**.

- **Two configs.** `vitest.config.ts` runs the fast layer (unit in `node` env, component in `nuxt` env via the per-file directive, `include: app/**/__tests__/**/*.spec.ts`); `vitest.e2e.config.ts` runs the slow layer (`tests/e2e/**`, `pool: 'forks'` so each e2e file gets its own Nuxt instance, long timeouts for browser/Nuxt boot).
- **Component vs unit is the environment directive, not a folder/command split.** A file opts into the Nuxt runtime with `// @vitest-environment nuxt`; without it, it runs fast in `node`.
- **Conventions.** Co-located `__tests__/` dirs; `.spec.ts` suffix; e2e under `tests/e2e/` at the package root.
- **CI.** Web test step + `playwright install --with-deps chromium` + e2e step, browser binaries cached on the Playwright version. Splitting the steps lets e2e be downgraded to warn-only later without restructuring the pipeline.
- **Versions** are pinned in the root `pnpm-workspace.yaml` catalog (`"catalog:"` references).

Deliberately deferred: Testing-Library vs raw `@vue/test-utils` style, CI coverage thresholds (added later — see AgDR/CLAUDE.md coverage gates), and visual-regression tooling.

## Consequences

- Feature work can land with all three test layers available from day one.
- The `// @vitest-environment nuxt` directive is a documented gotcha; forgetting it produces a confusing missing-Nuxt-context error (called out in `apps/web/.claude/CLAUDE.md`).
- `pool: 'forks'` for e2e is intentional — `setup()` mutates per-instance global state, so shared workers would cross-pollute.
- Catalog drift is a risk: all test deps must be added to the catalog in one PR or `pnpm` refuses the `"catalog:"` references.

## Artifacts

- Recording ticket: marsa-cloud/marsa#94 (back-fill consolidation)
- Back-filled from the design spec authored during the `apps/web` test-setup work (`docs/superpowers/specs/2026-05-17-nuxt-testing-setup-design.md`, removed in #94 once consolidated here).
- Key files: `apps/web/vitest.config.ts`, `apps/web/vitest.e2e.config.ts`, `apps/web/playwright.config.ts`, `apps/web/.claude/CLAUDE.md`, `.github/workflows/ci.yml` (web test + e2e steps)
