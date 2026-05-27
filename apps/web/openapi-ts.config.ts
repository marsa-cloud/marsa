import { defineConfig } from '@hey-api/openapi-ts'

export default defineConfig({
  input: '../api/openapi.json',
  output: {
    path: 'app/api',
    format: 'prettier',
  },
  // Types + Zod only. No SDK / client — calls go through Nuxt's $fetch.
  plugins: ['@hey-api/typescript', 'zod'],
})
