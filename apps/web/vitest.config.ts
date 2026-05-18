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
