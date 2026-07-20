import { fileURLToPath } from 'node:url'

import { createPage, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

import { authenticate } from './support/session'

await setup({
  rootDir: fileURLToPath(new URL('../..', import.meta.url)),
  browser: true,
  server: true,
})

// Slugs seeded by apps/api seed-dev (SAMPLE_APP_SLUGS).
const SEEDED_APP_SLUGS = ['todos', 'blog']

describe('apps list (e2e, real API)', () => {
  it('lists the seeded operator’s deployed apps', async () => {
    const page = await createPage()
    await authenticate(page.context())
    await page.goto(url('/apps'), { waitUntil: 'networkidle' })

    await expect.poll(() => new URL(page.url()).pathname).toBe('/apps')
    for (const slug of SEEDED_APP_SLUGS) {
      await expect.poll(() => page.getByText(slug, { exact: false }).count()).toBeGreaterThan(0)
    }
    await page.close()
  })
})
