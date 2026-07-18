import { fileURLToPath } from 'node:url'

import { createPage, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

import { AN_OPERATOR, mockApi } from './support/mock-api'

await setup({
  rootDir: fileURLToPath(new URL('../..', import.meta.url)),
  browser: true,
  server: true,
})

const app = {
  slug: 'my-app',
  image: 'ghcr.io/acme/my-app:v2',
  url: 'https://my-app.marsa.app',
  createdAt: '2026-07-10T10:00:00.000Z',
  updatedAt: '2026-07-10T10:01:00.000Z',
}

describe('apps list (e2e)', () => {
  it('lists a deployed app for the signed-in operator', async () => {
    const page = await createPage()
    await mockApi(page, {
      '/v1/auth/me': { json: AN_OPERATOR },
      '/v1/deployments/apps': { json: { apps: [app] } },
    })
    await page.goto(url('/apps'), { waitUntil: 'networkidle' })

    await expect.poll(() => page.getByText('my-app').count()).toBeGreaterThan(0)
    await page.close()
  })

  it('shows the empty state when no apps are deployed', async () => {
    const page = await createPage()
    await mockApi(page, {
      '/v1/auth/me': { json: AN_OPERATOR },
      '/v1/deployments/apps': { json: { apps: [] } },
    })
    await page.goto(url('/apps'), { waitUntil: 'networkidle' })

    await expect.poll(() => page.getByText(/deploy your first app/i).count()).toBeGreaterThan(0)
    await page.close()
  })
})
