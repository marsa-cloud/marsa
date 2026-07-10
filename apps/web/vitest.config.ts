import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    globals: true,
    environment: 'node',
    // Each *.nuxt.spec.ts boots a Nuxt environment in a beforeAll hook; the
    // 10s default is too tight when several boot in parallel on a loaded
    // machine (intermittent "Hook timed out in 10000ms" in setupNuxt). The
    // Nuxt setup is legitimately slow, not hung — give it headroom.
    hookTimeout: 30_000,
    include: ['app/**/__tests__/**/*.spec.ts'],
    exclude: ['tests/e2e/**', 'node_modules', '.nuxt', '.output'],
    environmentOptions: {
      nuxt: {
        domEnvironment: 'happy-dom',
      },
    },
    coverage: {
      provider: 'v8',
      // Measure only hand-written app source. Config files and the
      // committed-but-generated API client (app/api/*, lint/format-ignored
      // per apps/web/.claude/CLAUDE.md) are not meaningful coverage targets.
      include: ['app/**/*.{ts,vue}'],
      exclude: ['app/api/**', 'app/**/__tests__/**'],
      reporter: ['text', 'text-summary'],
      // TEMPORARY v4 ratchet — see #66.
      // Vitest 4 + @nuxt/test-utils 4 instrument files the Nuxt test-bootstrap
      // loads (app.vue, plugins, auto-imported composables) plus the untested
      // starter scaffolding (index.vue, TemplateMenu.vue), which vitest 3 did
      // not count — dropping measured coverage from ~90% to ~30%. Rather than
      // mask scaffolding via excludes, the floors are lowered to current
      // reality and #66 tracks adding tests + ratcheting them back up.
      thresholds: {
        lines: 28,
        functions: 12,
        branches: 30,
        statements: 28,
      },
    },
  },
})
