import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Callback from '../callback.vue'

const routeRef = vi.hoisted(() => ({ value: { query: {} as Record<string, string> } }))
const completeLogin = vi.hoisted(() => vi.fn())

mockNuxtImport('useRoute', () => () => routeRef.value)
mockNuxtImport('useGithubLogin', () => () => ({ completeLogin }))
mockNuxtImport('useCurrentUser', () => () => ({
  data: { value: null },
  refresh: vi.fn().mockResolvedValue(undefined),
}))
mockNuxtImport('navigateTo', () => vi.fn())

async function settle() {
  await new Promise(resolve => setTimeout(resolve))
}

beforeEach(() => {
  completeLogin.mockReset()
  completeLogin.mockResolvedValue(undefined)
})

describe('auth/github/callback', () => {
  it('renders the loading state while the callback is in flight', async () => {
    routeRef.value = { query: { code: 'c', state: 's' } }

    const wrapper = await mountSuspended(Callback)

    expect(wrapper.text()).toContain('Completing sign-in')
  })

  it('exchanges the code for a session when the callback carries code and state', async () => {
    routeRef.value = { query: { code: 'c', state: 's' } }

    await mountSuspended(Callback)
    await settle()

    expect(completeLogin).toHaveBeenCalledWith('c', 's')
  })

  it('reports a cancelled sign-in when the user denies consent', async () => {
    routeRef.value = { query: { error: 'access_denied', state: 's' } }

    const wrapper = await mountSuspended(Callback)
    await settle()

    expect(wrapper.text()).toContain('Sign-in was cancelled')
    expect(wrapper.text()).not.toContain('Sign-in failed')
    expect(completeLogin).not.toHaveBeenCalled()
  })

  it('reports a declined request for any other GitHub error', async () => {
    routeRef.value = { query: { error: 'application_suspended', state: 's' } }

    const wrapper = await mountSuspended(Callback)
    await settle()

    expect(wrapper.text()).toContain('GitHub declined the sign-in request')
    expect(completeLogin).not.toHaveBeenCalled()
  })

  it('reports a generic failure when code and state are missing', async () => {
    routeRef.value = { query: {} }

    const wrapper = await mountSuspended(Callback)
    await settle()

    expect(wrapper.text()).toContain('Sign-in failed')
    expect(completeLogin).not.toHaveBeenCalled()
  })

  it('reports a generic failure when the session exchange throws', async () => {
    routeRef.value = { query: { code: 'c', state: 's' } }
    completeLogin.mockRejectedValue(new Error('boom'))

    const wrapper = await mountSuspended(Callback)
    await settle()

    expect(wrapper.text()).toContain('Sign-in failed')
  })
})
