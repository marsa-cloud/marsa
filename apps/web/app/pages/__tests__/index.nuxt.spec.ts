import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import Index from '../index.vue'

// Mutable holders the mocked composables read at component-setup time, so each
// test arranges its own user / status before mounting.
const s = vi.hoisted(() => ({
  user: null as unknown,
  status: null as unknown,
}))

mockNuxtImport('useCurrentUser', () => () => ({ data: ref(s.user) }))
mockNuxtImport('useApiStatus', () => () => ({ data: ref(s.status) }))

beforeEach(() => {
  s.user = null
  s.status = null
})

describe('dashboard (index) page', () => {
  it('greets the signed-in user by login and shows the API version', async () => {
    s.user = { login: 'octocat' }
    s.status = { version: '1.2.3' }
    const wrapper = await mountSuspended(Index)
    expect(wrapper.text()).toContain('Welcome, @octocat')
    expect(wrapper.text()).toContain('1.2.3')
  })

  it('falls back to a plain welcome and an em dash before data loads', async () => {
    const wrapper = await mountSuspended(Index)
    expect(wrapper.text()).toContain('Welcome')
    expect(wrapper.text()).not.toContain('Welcome, @')
    expect(wrapper.text()).toContain('—')
  })
})
