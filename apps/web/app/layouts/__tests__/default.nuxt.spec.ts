import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import Default from '../default.vue'

// No signed-in user → footer avatar hidden; we only care about the nav here.
mockNuxtImport('useCurrentUser', () => () => ({ data: ref(null) }))

describe('default layout sidebar', () => {
  it('renders the sidebar navigation links', async () => {
    const wrapper = await mountSuspended(Default)

    const hrefs = wrapper.findAll('a').map(a => a.attributes('href'))
    expect(hrefs).toContain('/')
    expect(hrefs).toContain('/apps')
    expect(wrapper.text()).toContain('Apps')
  })
})
