import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import AppBuildList from '../AppBuildList.vue'

const build = (uuid: string, extra: Record<string, unknown> = {}) => ({
  uuid,
  commitSha: `${uuid}${'0'.repeat(40 - uuid.length)}`,
  branch: 'main',
  status: 'succeeded' as const,
  trigger: 'push' as const,
  imageRef: null,
  failureReason: null,
  createdAt: '2026-09-24T00:00:00.000Z',
  updatedAt: '2026-09-24T00:00:00.000Z',
  ...extra,
})

const baseProps = {
  pending: false,
  error: null,
  exhausted: true,
  canLoadMore: () => false,
  loadMore: async () => {},
}

describe('AppBuildList', () => {
  it('shows each build’s status, short commit and trigger', async () => {
    const wrapper = await mountSuspended(AppBuildList, {
      props: { ...baseProps, builds: [build('abcdef1234', { status: 'running' })] },
    })

    expect(wrapper.text()).toContain('running')
    expect(wrapper.text()).toContain('abcdef1')
    expect(wrapper.text()).not.toContain('abcdef12')
    expect(wrapper.text()).toContain('push')
  })

  it('explains a failed build', async () => {
    const wrapper = await mountSuspended(AppBuildList, {
      props: {
        ...baseProps,
        builds: [build('b1', { status: 'failed', failureReason: 'failed to read dockerfile' })],
      },
    })

    expect(wrapper.text()).toContain('failed to read dockerfile')
  })

  it('asks for a build’s logs', async () => {
    const wrapper = await mountSuspended(AppBuildList, {
      props: { ...baseProps, builds: [build('b2'), build('b1')] },
    })

    await wrapper.findAll('[data-testid="build-logs"]')[1]!.trigger('click')

    expect(wrapper.emitted('logs')).toEqual([['b1']])
  })

  it('shows the empty state', async () => {
    const wrapper = await mountSuspended(AppBuildList, { props: { ...baseProps, builds: [] } })

    expect(wrapper.text()).toContain('No builds yet.')
  })
})
