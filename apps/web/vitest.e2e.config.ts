import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.spec.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    pool: 'forks',
  },
})
