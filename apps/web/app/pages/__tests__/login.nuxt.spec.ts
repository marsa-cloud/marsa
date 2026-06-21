import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import Login from '../login.vue'

describe('login page', () => {
  it('renders the sign-in button', async () => {
    const wrapper = await mountSuspended(Login)
    expect(wrapper.text()).toContain('Sign in with GitHub')
  })
})
