import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'

import Index from '../index.vue'

const fetchManifest = vi.hoisted(() => vi.fn())
const submitForm = vi.hoisted(() => vi.fn())

mockNuxtImport('useGithubProvisioning', () => () => ({ fetchManifest, convert: vi.fn() }))
mockNuxtImport('submitManifestForm', () => submitForm)

describe('setup/github/index', () => {
  it('renders a Connect GitHub button', async () => {
    const wrapper = await mountSuspended(Index)

    expect(wrapper.text()).toContain('Connect GitHub')
  })

  it('submits the manifest form on click', async () => {
    const manifest = { manifest: {}, formAction: 'https://github.com/x', state: 's' }
    fetchManifest.mockResolvedValueOnce(manifest)

    const wrapper = await mountSuspended(Index)
    await wrapper.find('button').trigger('click')
    await new Promise(resolve => setTimeout(resolve))

    expect(fetchManifest).toHaveBeenCalled()
    expect(submitForm).toHaveBeenCalledWith(manifest)
  })

  it('shows an error when manifest fetch fails', async () => {
    fetchManifest.mockRejectedValueOnce(new Error('boom'))

    const wrapper = await mountSuspended(Index)
    await wrapper.find('button').trigger('click')
    await new Promise(resolve => setTimeout(resolve))

    expect(wrapper.text()).toContain('Could not start GitHub App creation')
  })
})
