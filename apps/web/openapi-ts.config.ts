import { defineConfig } from '@hey-api/openapi-ts'

export default defineConfig({
  input: '../api/openapi.json',
  output: {
    path: 'app/api',
    format: 'prettier',
  },
  // Types + Zod only. No SDK / client — calls go through Nuxt's $fetch.
  // compatibilityVersion: 3 keeps the generated zod on the v3 API
  // (`z.number().int()`, not v4's `z.int()`) — the catalog pins zod 3.x.
  plugins: ['@hey-api/typescript', { name: 'zod', compatibilityVersion: 3 }],
})
