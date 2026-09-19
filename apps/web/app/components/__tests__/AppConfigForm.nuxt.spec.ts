import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AppConfigForm from '../AppConfigForm.vue'

const update = vi.hoisted(() => vi.fn())
mockNuxtImport('useUpdateApp', () => () => ({ update }))

const config = {
  slug: 'my-app',
  image: 'nginx:1.27',
  url: 'https://my-app.marsa.cc',
  containerPort: 80,
  minReplicas: 1,
  maxReplicas: 2,
  env: { LOG_LEVEL: 'info' },
  hasUndeployedChanges: false,
  createdAt: '2026-09-18T00:00:00.000Z',
  updatedAt: '2026-09-18T00:00:00.000Z',
}

const flush = () => new Promise(resolve => setTimeout(resolve))
const mount = () => mountSuspended(AppConfigForm, { props: { slug: 'my-app', config } })

beforeEach(() => {
  update.mockReset().mockResolvedValue({ ...config })
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
})
