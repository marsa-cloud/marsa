import { fileURLToPath } from 'node:url'

import { createPage, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

import { AN_OPERATOR, mockApi } from './support/mock-api'

await setup({
  rootDir: fileURLToPath(new URL('../..', import.meta.url)),
  browser: true,
  server: true,
})

describe('dashboard (e2e)', () => {
  it('greets the signed-in operator and shows the live API version', async () => {
    const page = await createPage()
    await mockApi(page, {
      '/v1/auth/me': { json: AN_OPERATOR },
      '/v1/status': { json: { name: 'marsa-api', version: '9.9.9', commit: null, nodeEnv: 'test', uptimeSeconds: 1 } },
    })
    await page.goto(url('/'), { waitUntil: 'networkidle' })

    await expect.poll(() => new URL(page.url()).pathname).toBe('/')
    await expect.poll(() => page.getByText('@octocat').count()).toBeGreaterThan(0)
    await expect.poll(() => page.getByText('9.9.9').count()).toBeGreaterThan(0)
    await page.close()
  })
})
