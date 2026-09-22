import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NodePin } from '~/api/types.gen'

import NodePinPicker from '../NodePinPicker.vue'

const list = vi.hoisted(() => vi.fn())
mockNuxtImport('useNodeList', () => () => ({ list }))

const flush = () => new Promise(resolve => setTimeout(resolve))

const pinnedToNodeA: NodePin = {
  key: 'kubernetes.io/hostname',
  values: ['node-a'],
  strategy: 'required',
}

const mount = (props: { modelValue: NodePin | null, maxReplicas?: number }) =>
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

  it('refuses to edit a pin targeting a label it does not understand', async () => {
    const wrapper = await mount({
      modelValue: { key: 'marsa.cc/pool', values: ['gpu'], strategy: 'required' },
    })
    await flush()

    expect(wrapper.text()).toContain('Pinned by label')
    expect(wrapper.text()).toContain('marsa.cc/pool=gpu')
    // Rewriting the key would pin to nodes matching nothing, and pins apply immediately.
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.find('button[aria-label="Remove gpu"]').exists()).toBe(false)
  })

  it('resyncs when the pin changes underneath it', async () => {
    const wrapper = await mount({ modelValue: null })
    await flush()
    expect(wrapper.text()).not.toContain('node-b')

    await wrapper.setProps({
      modelValue: { key: 'kubernetes.io/hostname', values: ['node-b'], strategy: 'preferred' },
    })
    await flush()

    expect(wrapper.text()).toContain('node-b')
  })

  it('pins on the hostname label value, not the node object name', async () => {
    // A cloud provider names nodes by instance id; the hostname label is what a pin must match.
    list.mockResolvedValue([
      {
        name: 'i-0abc123',
        labels: { 'kubernetes.io/hostname': 'worker-1.internal' },
        ready: true,
      },
    ])
    const wrapper = await mount({
      modelValue: {
        key: 'kubernetes.io/hostname',
        values: ['worker-1.internal'],
        strategy: 'preferred',
      },
    })
    await flush()

    // Operators know the node by its name, so that is what the chip shows.
    expect(wrapper.text()).toContain('i-0abc123')
    await wrapper.find('button[aria-label="Remove i-0abc123"]').trigger('click')
    await flush()

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null])
  })

  it('falls back to the node name when it carries no hostname label', async () => {
    list.mockResolvedValue([{ name: 'bare-node', labels: {}, ready: true }])
    const wrapper = await mount({
      modelValue: { key: 'kubernetes.io/hostname', values: ['bare-node'], strategy: 'preferred' },
    })
    await flush()

    expect(wrapper.text()).toContain('bare-node')
  })

  it('emits nothing on mount, so seeding a saved pin never looks like an edit', async () => {
    const wrapper = await mount({ modelValue: pinnedToNodeA })
    await flush()

    // AppConfigForm treats any emitted change as unsaved work, which blocks it from reseeding.
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('emits nothing on mount when unpinned', async () => {
    const wrapper = await mount({ modelValue: null })
    await flush()

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
