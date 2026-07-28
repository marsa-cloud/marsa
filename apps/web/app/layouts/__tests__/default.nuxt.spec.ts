import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import Default from '../default.vue'

// Mutable holder so each test arranges its own signed-in state before mounting.
const s = vi.hoisted(() => ({ user: null as unknown }))

mockNuxtImport('useCurrentUser', () => () => ({ data: ref(s.user) }))

beforeEach(() => {
  s.user = null
})

describe('default layout sidebar', () => {
  it('renders the sidebar navigation links', async () => {
    const wrapper = await mountSuspended(Default)

    const hrefs = wrapper.findAll('a').map(a => a.attributes('href'))
    expect(hrefs).toContain('/')
    expect(hrefs).toContain('/apps')
    expect(wrapper.text()).toContain('Apps')
  })

  it('shows the signed-in user in the footer', async () => {
    s.user = { id: '1', login: 'octocat' }
    const wrapper = await mountSuspended(Default)
    expect(wrapper.text()).toContain('@octocat')
  })
})
