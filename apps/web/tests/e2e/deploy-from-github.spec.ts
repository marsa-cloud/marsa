import { fileURLToPath } from 'node:url'

import { createPage, setup, url } from '@nuxt/test-utils/e2e'
import type { Page } from 'playwright-core'
import { describe, expect, it } from 'vitest'

import { authenticate } from './support/session'

await setup({
  rootDir: fileURLToPath(new URL('../..', import.meta.url)),
  browser: true,
  server: true,
})

// The rest of the page is inert until the popup closes, so a fill made before then is dropped.
async function pick(page: Page, trigger: string, option: string) {
  await page.getByText(trigger).click()
  await page.getByRole('option', { name: option }).click()
  await page.getByRole('listbox').waitFor({ state: 'detached' })
}

// Needs seed-dev's GitHub installation; the test-mode api lists the mock GitHub client's repos.
describe('deploy from GitHub (e2e, real API with mock GitHub)', () => {
  it('creates an app from a repository and lands on its running build', async () => {
    const page = await createPage()
    await authenticate(page.context())
    await page.goto(url('/apps/new'), { waitUntil: 'networkidle' })

    await pick(page, 'Choose a repository', 'marsa-mock/hello')

    const slug = `gh-e2e-${Date.now()}`
    await page.getByRole('textbox', { name: 'Slug*' }).fill(slug)

    await pick(page, 'Choose a project', 'Dev')
    await pick(page, 'Choose an environment', 'Production')

    await page.getByRole('button', { name: 'Deploy', exact: true }).click()

    await expect.poll(() => new URL(page.url()).pathname).toBe(`/apps/${slug}`)
    await expect.poll(() => page.getByText('marsa-mock/hello@main').count()).toBeGreaterThan(0)
    await expect.poll(() => page.getByText('running', { exact: true }).count()).toBeGreaterThan(0)
    await page.close()
  })
})
