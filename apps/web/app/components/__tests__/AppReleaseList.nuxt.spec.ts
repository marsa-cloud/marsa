import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import AppReleaseList from '../AppReleaseList.vue'

const release = (uuid: string, extra: Record<string, unknown> = {}) => ({
  uuid,
  imageRef: `nginx:${uuid}`,
  triggeredBy: 'manual' as const,
  deployStatus: 'succeeded' as const,
  sourceReleaseUuid: null,
  createdAt: '2026-09-18T00:00:00.000Z',
  updatedAt: '2026-09-18T00:00:00.000Z',
  ...extra,
})

const baseProps = {
  pending: false,
  error: null,
  exhausted: true,
  canLoadMore: () => false,
  loadMore: async () => {},
  busy: false,
}

describe('AppReleaseList', () => {
  it('offers rollback on every release except the newest', async () => {
    const wrapper = await mountSuspended(AppReleaseList, {
      props: { ...baseProps, releases: [release('3'), release('2'), release('1')] },
    })

    expect(wrapper.findAll('[data-testid="rollback"]')).toHaveLength(2)
  })

  it('emits rollback with the chosen release only after confirming', async () => {
    const wrapper = await mountSuspended(AppReleaseList, {
      props: { ...baseProps, releases: [release('2'), release('1')] },
      attachTo: document.body,
    })

    await wrapper.find('[data-testid="rollback"]').trigger('click')
    await nextTick()
    expect(wrapper.emitted('rollback')).toBeUndefined()
    expect(document.body.textContent).toContain('nginx:1')

    ;(document.querySelector('[data-testid="confirm-rollback"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(wrapper.emitted('rollback')).toEqual([['1']])
    wrapper.unmount()
  })

  it('labels a rollback release with its source', async () => {
    const wrapper = await mountSuspended(AppReleaseList, {
      props: {
        ...baseProps,
        releases: [
          release('abcdef1234', { triggeredBy: 'rollback', sourceReleaseUuid: '0123456789' }),
        ],
      },
    })

    expect(wrapper.text()).toContain('Rollback of 01234567')
  })

  it('disables rollback while a deploy is in flight', async () => {
    const wrapper = await mountSuspended(AppReleaseList, {
      props: { ...baseProps, busy: true, releases: [release('2'), release('1')] },
    })

    expect(wrapper.find('[data-testid="rollback"]').attributes('disabled')).toBeDefined()
  })

  it('shows the empty state', async () => {
    const wrapper = await mountSuspended(AppReleaseList, { props: { ...baseProps, releases: [] } })

    expect(wrapper.text()).toContain('No releases yet.')
  })
})
