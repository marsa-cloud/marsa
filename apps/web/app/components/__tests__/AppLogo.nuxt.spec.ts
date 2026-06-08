import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import AppLogo from '../AppLogo.vue'

describe('AppLogo', () => {
  it('renders an SVG element', async () => {
    const wrapper = await mountSuspended(AppLogo)
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('uses currentColor for the wordmark paths', async () => {
    const wrapper = await mountSuspended(AppLogo)
    const wordmark = wrapper.findAll('path').filter(p => p.attributes('fill') === 'currentColor')
    expect(wordmark.length).toBeGreaterThan(0)
  })
})
