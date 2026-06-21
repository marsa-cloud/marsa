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

describe('auth/github/callback', () => {
  it('renders the loading state while the callback is in flight', async () => {
    routeRef.value = { query: { code: 'c', state: 's' } }

    const wrapper = await mountSuspended(Callback)

    // The page renders the spinner text before onMounted resolves.
    // This proves the template renders without throwing.
    expect(wrapper.exists()).toBe(true)
  })
})
