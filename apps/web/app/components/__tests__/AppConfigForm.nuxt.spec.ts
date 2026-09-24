import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ViewAppDetailResponse } from '~/api/types.gen'

import AppConfigForm from '../AppConfigForm.vue'

const update = vi.hoisted(() => vi.fn())
mockNuxtImport('useUpdateApp', () => () => ({ update }))

const listNodes = vi.hoisted(() => vi.fn())
mockNuxtImport('useNodeList', () => () => ({ list: listNodes }))

const config: ViewAppDetailResponse = {
  slug: 'my-app',
  image: 'nginx:1.27',
  url: 'https://my-app.marsa.cc',
  containerPort: 80,
  minReplicas: 1,
  maxReplicas: 2,
  env: { LOG_LEVEL: 'info' },
  nodePin: null,
  source: null,
  latestBuild: null,
  hasUndeployedChanges: false,
  project: { slug: 'demo', name: 'Demo' },
  environment: { uuid: '0190c3c0-0000-7000-8000-000000000002', slug: 'dev', name: 'Dev' },
  createdAt: '2026-09-18T00:00:00.000Z',
  updatedAt: '2026-09-18T00:00:00.000Z',
}

const flush = () => new Promise(resolve => setTimeout(resolve))
const mount = (over: typeof config = config) =>
  mountSuspended(AppConfigForm, { props: { slug: 'my-app', config: over } })

beforeEach(() => {
  update.mockReset().mockResolvedValue({ ...config })
  listNodes.mockReset().mockResolvedValue([
    { name: 'node-a', labels: { 'kubernetes.io/hostname': 'node-a' }, ready: true },
  ])
})

describe('AppConfigForm', () => {
  it('seeds every field from the saved config', async () => {
    const wrapper = await mount()

    expect((wrapper.find('input#config-image').element as HTMLInputElement).value).toBe('nginx:1.27')
    expect(
      (wrapper.find('input[aria-label="env key 1"]').element as HTMLInputElement).value,
    ).toBe('LOG_LEVEL')
  })

  it('saves the whole config and emits saved', async () => {
    const wrapper = await mount()
    await wrapper.find('input#config-image').setValue('nginx:1.28')
    await wrapper.find('input[aria-label="env value 1"]').setValue('debug')
    await wrapper.find('form').trigger('submit.prevent')
    await flush()

    expect(update).toHaveBeenCalledWith('my-app', {
      image: 'nginx:1.28',
      containerPort: 80,
      minReplicas: 1,
      maxReplicas: 2,
      env: { LOG_LEVEL: 'debug' },
      nodePin: null,
    })
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  it('blocks a variable with a value but no name', async () => {
    const wrapper = await mount()
    await wrapper.find('input[aria-label="env key 1"]').setValue('')
    await wrapper.find('form').trigger('submit.prevent')
    await flush()

    expect(update).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Every variable needs a name')
  })

  it('blocks duplicate variable names', async () => {
    const wrapper = await mount()
    await wrapper.find('button[aria-label="Add variable"]').trigger('click')
    await wrapper.find('input[aria-label="env key 2"]').setValue('LOG_LEVEL')
    await wrapper.find('form').trigger('submit.prevent')
    await flush()

    expect(update).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Duplicate variable name "LOG_LEVEL"')
  })

  it('shows the API message and does not emit when saving fails', async () => {
    update.mockRejectedValueOnce({ data: { statusCode: 400, message: 'image should not be empty' } })

    const wrapper = await mount()
    await wrapper.find('form').trigger('submit.prevent')
    await flush()

    expect(wrapper.text()).toContain('image should not be empty')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })
  it('keeps unsaved edits when the saved config is refetched', async () => {
    const wrapper = await mount()
    await wrapper.find('input#config-image').setValue('nginx:draft')

    await wrapper.setProps({ config: { ...config, hasUndeployedChanges: true } })

    expect((wrapper.find('input#config-image').element as HTMLInputElement).value).toBe(
      'nginx:draft',
    )
  })

  it('reseeds from a refetch when there are no unsaved edits', async () => {
    const wrapper = await mount()

    await wrapper.setProps({ config: { ...config, image: 'nginx:rolled-back', env: { A: '1' } } })

    expect((wrapper.find('input#config-image').element as HTMLInputElement).value).toBe(
      'nginx:rolled-back',
    )
    expect(
      (wrapper.find('input[aria-label="env key 1"]').element as HTMLInputElement).value,
    ).toBe('A')
  })

  it('accepts the next refetch after a successful save', async () => {
    const wrapper = await mount()
    await wrapper.find('input#config-image').setValue('nginx:1.28')
    await wrapper.find('form').trigger('submit.prevent')
    await flush()

    await wrapper.setProps({ config: { ...config, image: 'nginx:1.28-normalised' } })

    expect((wrapper.find('input#config-image').element as HTMLInputElement).value).toBe(
      'nginx:1.28-normalised',
    )
  })

  it('seeds the picker from the saved pin', async () => {
    const wrapper = await mount({
      ...config,
      nodePin: { key: 'kubernetes.io/hostname', values: ['node-a'], strategy: 'required' },
    })
    await flush()

    expect(wrapper.text()).toContain('node-a')
  })

  it('clears the pin with an explicit null rather than omitting it', async () => {
    const wrapper = await mount({
      ...config,
      nodePin: { key: 'kubernetes.io/hostname', values: ['node-a'], strategy: 'required' },
    })
    await flush()
    await wrapper.find('button[aria-label="Remove node-a"]').trigger('click')
    await wrapper.find('form').trigger('submit.prevent')
    await flush()

    expect(update).toHaveBeenCalledWith('my-app', expect.objectContaining({ nodePin: null }))
  })
})
