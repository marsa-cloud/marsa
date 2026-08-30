import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import Pending from '../pending.vue'

mockNuxtImport('useCurrentUser', () => () => ({
  data: ref({ id: '2', login: 'hubot', role: 'guest' }),
}))

describe('pending page', () => {
  it('names the signed-in account and says what is missing', async () => {
    const wrapper = await mountSuspended(Pending)

    expect(wrapper.text()).toContain('hubot')
    expect(wrapper.text()).toContain('hasn\'t approved your account yet')
  })
})
