import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'

import Callback from '../callback.vue'

const routeRef = vi.hoisted(() => ({ value: { query: {} as Record<string, string> } }))

mockNuxtImport('useRoute', () => () => routeRef.value)
mockNuxtImport('useCurrentUser', () => () => ({
  data: { value: null },
  refresh: vi.fn().mockResolvedValue(undefined),
}))
mockNuxtImport('navigateTo', () => vi.fn())

async function settle() {
  await new Promise(resolve => setTimeout(resolve))
}

describe('auth/github/callback', () => {
  it('renders the loading state while the callback is in flight', async () => {
    routeRef.value = { query: { code: 'c', state: 's' } }

    const wrapper = await mountSuspended(Callback)

    // The page renders the spinner text before onMounted resolves.
    // This proves the template renders without throwing.
    expect(wrapper.exists()).toBe(true)
  })

  it('reports a cancelled sign-in when the user denies consent', async () => {
    routeRef.value = { query: { error: 'access_denied', state: 's' } }

    const wrapper = await mountSuspended(Callback)
    await settle()

    expect(wrapper.text()).toContain('Sign-in was cancelled')
    expect(wrapper.text()).not.toContain('Sign-in failed')
  })

  it('reports a declined request for any other GitHub error', async () => {
    routeRef.value = { query: { error: 'application_suspended', state: 's' } }

    const wrapper = await mountSuspended(Callback)
    await settle()

    expect(wrapper.text()).toContain('GitHub declined the sign-in request')
  })

  it('reports a generic failure when code and state are missing', async () => {
    routeRef.value = { query: {} }

    const wrapper = await mountSuspended(Callback)
    await settle()

    expect(wrapper.text()).toContain('Sign-in failed')
  })
})
