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
    coverage: {
      provider: 'v8',
      // Measure only hand-written app source. Config files and the
      // committed-but-generated API client (app/api/*, lint/format-ignored
      // per apps/web/.claude/CLAUDE.md) are not meaningful coverage targets.
      include: ['app/**/*.{ts,vue}'],
      exclude: ['app/api/**', 'app/**/__tests__/**'],
      reporter: ['text', 'text-summary'],
      // Ratchet floor — raise these as coverage improves (issue #39).
      // Baseline at introduction: lines/statements 90.4%, branches 100%,
      // functions 66.7%. Floors sit a few points below so a real regression
      // fails CI without day-one churn from minor fluctuation.
      thresholds: {
        lines: 88,
        functions: 60,
        branches: 90,
        statements: 88,
      },
    },
  },
})
