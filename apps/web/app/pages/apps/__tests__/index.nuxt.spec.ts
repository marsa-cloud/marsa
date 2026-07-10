import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import Index from '../index.vue'

describe('apps/index shell', () => {
  it('renders the Apps shell with a link to the deploy form', async () => {
    const wrapper = await mountSuspended(Index)

    expect(wrapper.text()).toContain('Apps')
    const deployLink = wrapper.findAll('a').find(a => a.attributes('href') === '/apps/new')
    expect(deployLink).toBeTruthy()
  })
})
