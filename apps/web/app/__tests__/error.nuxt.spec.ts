import type { NuxtError } from '#app'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import ErrorPage from '../error.vue'

describe('error page', () => {
  it('renders the error status and message without throwing', async () => {
    const error = createError({ statusCode: 500, statusMessage: 'Unable to verify session', fatal: true }) as NuxtError

    const wrapper = await mountSuspended(ErrorPage, {
      props: { error },
    })

    expect(wrapper.text()).toContain('500')
    expect(wrapper.text()).toContain('Unable to verify session')
  })
})
