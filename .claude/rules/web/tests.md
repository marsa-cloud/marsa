---
paths:
  - 'apps/web/app/**/__tests__/**/*.ts'
  - 'apps/web/tests/**/*.ts'
---

# Web tests

## The filename selects the environment

```text
WRONG — uses mountSuspended but lands in the node project
  app/composables/__tests__/useAppList.spec.ts

RIGHT
  app/composables/__tests__/useAppList.nuxt.spec.ts
```

Why: since `@nuxt/test-utils` v4, `defineVitestConfig` splits the run into a **nuxt** project
globbing `**/*.nuxt.spec.ts` and a **node** project for everything else. The v3 first-line
`// @vitest-environment nuxt` directive **no longer routes files** — a misnamed file lands in
the node project and fails with confusing errors about missing Nuxt helpers.

Any test using `mountSuspended`, `mockNuxtImport`, or a Nuxt auto-import must be
`*.nuxt.spec.ts`. Pure-logic specs stay plain `*.spec.ts` and run in node.

## Mock auto-imports rather than importing them

```ts
mockNuxtImport('useAppList', () => () => ({
  data: ref(null),
  status: ref('success'),
}))
```

## E2E runs against the real API, not mocks

`tests/e2e/*.spec.ts` boots Chromium plus the Nuxt preview server (whose `routeRules` proxy
`/api/**` → `:3000`), so it needs the api running in test mode and a session cookie in
`E2E_SESSION_COOKIE`. Unauthenticated specs (the `/login` redirect) need no cookie. The local
setup commands live in `apps/web/.claude/CLAUDE.md`.

## Coverage floors are ratchets

Lines/statements 88, branches 85, functions 60 (`vitest.config.ts` → `test.coverage`). Add
tests to clear them — never lower a floor to make a red build pass.
