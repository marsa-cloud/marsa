import { fileURLToPath } from 'node:url'

import { createPage, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

await setup({
  rootDir: fileURLToPath(new URL('../..', import.meta.url)),
  browser: true,
  server: true,
})

describe('authentication gate (e2e, real API)', () => {
  it('redirects an unauthenticated visitor from a protected route to /login', async () => {
    const page = await createPage()
    await page.goto(url('/'), { waitUntil: 'networkidle' })

    await expect.poll(() => new URL(page.url()).pathname).toBe('/login')
    await page.close()
  })

  it('shows the GitHub sign-in action on the login page', async () => {
    const page = await createPage()
    await page.goto(url('/login'), { waitUntil: 'networkidle' })

    await expect
      .poll(() => page.getByRole('button', { name: /sign in with github/i }).count())
      .toBeGreaterThan(0)
    await page.close()
  })
})
