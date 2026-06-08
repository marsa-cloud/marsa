import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'

import Callback from '../callback.vue'

const routeRef = vi.hoisted(() => ({ value: { query: {} as Record<string, string> } }))
const convert = vi.hoisted(() => vi.fn())

mockNuxtImport('useRoute', () => () => routeRef.value)
mockNuxtImport('useGithubProvisioning', () => () => ({ convert, fetchManifest: vi.fn() }))

async function settle() {
  await new Promise(resolve => setTimeout(resolve))
}

describe('setup/github/callback', () => {
  it('shows an error when code/state are missing', async () => {
    routeRef.value = { query: {} }

    const wrapper = await mountSuspended(Callback)
    await settle()

    expect(wrapper.text()).toContain('Missing authorization code')
    expect(convert).not.toHaveBeenCalled()
  })

  it('shows success after a successful conversion', async () => {
    routeRef.value = { query: { code: 'c', state: 's' } }
    convert.mockResolvedValueOnce({
      appSlug: 'marsa-x',
      appName: 'marsa.x',
      htmlUrl: 'https://github.com/apps/marsa-x',
      installUrl: 'https://github.com/apps/marsa-x/installations/new',
    })

    const wrapper = await mountSuspended(Callback)
    await settle()

    expect(wrapper.text()).toContain('marsa.x created')
  })

  it('shows an error when conversion fails', async () => {
    routeRef.value = { query: { code: 'c', state: 's' } }
    convert.mockRejectedValueOnce(new Error('expired'))

    const wrapper = await mountSuspended(Callback)
    await settle()

    expect(wrapper.text()).toContain('Could not complete GitHub App setup')
  })
})
