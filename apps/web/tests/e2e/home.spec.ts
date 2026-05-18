import { fileURLToPath } from 'node:url'

import { $fetch, createPage, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

await setup({
  rootDir: fileURLToPath(new URL('../..', import.meta.url)),
  browser: true,
  server: true,
})

describe('home page (e2e)', () => {
  it('serves the SPA shell over HTTP', async () => {
    const html = await $fetch<string>('/')
    expect(html).toMatch(/<div\s[^>]*id="__nuxt"/)
  })

  it('renders the home page in a real browser', async () => {
    const page = await createPage('/')
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
    await page.close()
  })
})
