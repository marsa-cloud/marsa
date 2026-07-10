import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import New from '../new.vue'

const deploy = vi.hoisted(() => vi.fn())

mockNuxtImport('useDeployApp', () => () => ({ deploy }))

beforeEach(() => {
  deploy.mockReset()
})

const flush = () => new Promise(resolve => setTimeout(resolve))

async function fillValidForm(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  await wrapper.find('input#slug').setValue('my-app')
  await wrapper.find('input#image').setValue('nginx:1.27')
  // UInputNumber (reka-ui NumberField) commits its numeric value on blur.
  const port = wrapper.find('input#containerPort')
  await port.setValue('80')
  await port.trigger('blur')
}

describe('apps/new deploy form', () => {
  it('renders the deploy form', async () => {
    const wrapper = await mountSuspended(New)

    expect(wrapper.text()).toContain('Slug')
    expect(wrapper.text()).toContain('Image')
    expect(wrapper.text()).toContain('Deploy')
    expect(wrapper.find('input#slug').exists()).toBe(true)
  })

  it('deploys and shows the public URL + status on success', async () => {
    deploy.mockResolvedValueOnce({
      appSlug: 'my-app',
      url: 'https://my-app.marsa.cc',
      releaseUuid: 'r1',
      deployStatus: 'pending',
    })

    const wrapper = await mountSuspended(New)
    await fillValidForm(wrapper)
    await wrapper.find('form').trigger('submit.prevent')
    await flush()

    expect(deploy).toHaveBeenCalledWith({
      slug: 'my-app',
      image: 'nginx:1.27',
      containerPort: 80,
    })
    expect(wrapper.text()).toContain('Deploy started')
    expect(wrapper.text()).toContain('https://my-app.marsa.cc')
    expect(wrapper.text()).toContain('pending')
  })

  it('includes non-empty env rows in the deploy command', async () => {
    deploy.mockResolvedValueOnce({
      appSlug: 'my-app',
      url: 'https://my-app.marsa.cc',
      releaseUuid: 'r1',
      deployStatus: 'pending',
    })

    const wrapper = await mountSuspended(New)
    await fillValidForm(wrapper)
    await wrapper.find('input[aria-label="env key 1"]').setValue('LOG_LEVEL')
    await wrapper.find('input[aria-label="env value 1"]').setValue('info')
    await wrapper.find('form').trigger('submit.prevent')
    await flush()

    expect(deploy).toHaveBeenCalledWith({
      slug: 'my-app',
      image: 'nginx:1.27',
      containerPort: 80,
      env: { LOG_LEVEL: 'info' },
    })
  })

  it('includes replicas in the command when set', async () => {
    deploy.mockResolvedValueOnce({
      appSlug: 'my-app',
      url: 'https://my-app.marsa.cc',
      releaseUuid: 'r1',
      deployStatus: 'pending',
    })

    const wrapper = await mountSuspended(New)
    await fillValidForm(wrapper)
    const replicas = wrapper.find('input#replicas')
    await replicas.setValue('3')
    await replicas.trigger('blur')
    await wrapper.find('form').trigger('submit.prevent')
    await flush()

    expect(deploy).toHaveBeenCalledWith({
      slug: 'my-app',
      image: 'nginx:1.27',
      containerPort: 80,
      replicas: 3,
    })
  })

  it('surfaces a useful message when the API rejects with a 400', async () => {
    deploy.mockRejectedValueOnce({
      data: { statusCode: 400, message: 'slug must be a valid DNS-1123 label', error: 'Bad Request' },
    })

    const wrapper = await mountSuspended(New)
    await fillValidForm(wrapper)
    await wrapper.find('form').trigger('submit.prevent')
    await flush()

    expect(wrapper.text()).toContain('slug must be a valid DNS-1123 label')
  })

  it('blocks submit and does not call the API on invalid input', async () => {
    const wrapper = await mountSuspended(New)
    // slug left blank, port missing — schema validation should stop submit
    await wrapper.find('input#image').setValue('nginx:1.27')
    await wrapper.find('form').trigger('submit.prevent')
    await flush()

    expect(deploy).not.toHaveBeenCalled()
  })
})
