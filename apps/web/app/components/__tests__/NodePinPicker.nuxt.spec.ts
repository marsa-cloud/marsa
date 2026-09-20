import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import NodePinPicker from '../NodePinPicker.vue'

const list = vi.hoisted(() => vi.fn())
mockNuxtImport('useNodeList', () => () => ({ list }))

const flush = () => new Promise(resolve => setTimeout(resolve))

const pinnedToNodeA = {
  key: 'kubernetes.io/hostname',
  values: ['node-a'],
  strategy: 'required' as const,
}

const mount = (props: { modelValue: unknown, maxReplicas?: number }) =>
  mountSuspended(NodePinPicker, { props })

beforeEach(() => {
  list.mockReset().mockResolvedValue([
    { name: 'node-a', labels: { 'kubernetes.io/hostname': 'node-a' }, ready: true },
    { name: 'node-b', labels: { 'kubernetes.io/hostname': 'node-b' }, ready: false },
  ])
})

describe('NodePinPicker', () => {
  it('hides the strategy choice while nothing is selected', async () => {
    const wrapper = await mount({ modelValue: null })
    await flush()

    expect(wrapper.text()).not.toContain('If no selected node is available')
  })

  it('seeds its selection from an existing pin', async () => {
    const wrapper = await mount({ modelValue: pinnedToNodeA })
    await flush()

    expect(wrapper.text()).toContain('node-a')
    expect(wrapper.text()).toContain('If no selected node is available')
  })

  it('emits null once the last node is removed', async () => {
    const wrapper = await mount({ modelValue: pinnedToNodeA })
    await flush()
    await wrapper.find('button[aria-label="Remove node-a"]').trigger('click')
    await flush()

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null])
  })

  it('warns that one hard-pinned node co-locates every replica', async () => {
    const wrapper = await mount({ modelValue: pinnedToNodeA, maxReplicas: 3 })
    await flush()

    expect(wrapper.text()).toContain('All replicas will run on that one node')
  })

  it('does not warn when only one replica is possible', async () => {
    const wrapper = await mount({ modelValue: pinnedToNodeA, maxReplicas: 1 })
    await flush()

    expect(wrapper.text()).not.toContain('All replicas will run on that one node')
  })
})
