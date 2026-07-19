import { fileURLToPath } from 'node:url'

import { createPage, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

import { authenticate, SEEDED_LOGIN } from './support/session'

await setup({
  rootDir: fileURLToPath(new URL('../..', import.meta.url)),
  browser: true,
  server: true,
})

describe('dashboard (e2e, real API)', () => {
  it('greets the seeded operator and renders the API status card', async () => {
    const page = await createPage()
    await authenticate(page.context())
    await page.goto(url('/'), { waitUntil: 'networkidle' })

    await expect.poll(() => new URL(page.url()).pathname).toBe('/')
    await expect.poll(() => page.getByText(`@${SEEDED_LOGIN}`).count()).toBeGreaterThan(0)
    await expect.poll(() => page.getByText(/API Status/i).count()).toBeGreaterThan(0)
    await page.close()
  })
})
