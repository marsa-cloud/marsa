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
      exclude: [
        'app/api/**',
        'app/**/__tests__/**',
        // Logic-free shells: root app container and the auth layout are pure
        // framework-component templates (no script, no branches) — a test would
        // only assert that Nuxt renders <NuxtLayout>/<slot>, not our behaviour.
        'app/app.vue',
        'app/layouts/auth.vue',
      ],
      reporter: ['text', 'text-summary'],
      thresholds: {
        lines: 88,
        functions: 60,
        branches: 85,
        statements: 88,
      },
    },
  },
})
