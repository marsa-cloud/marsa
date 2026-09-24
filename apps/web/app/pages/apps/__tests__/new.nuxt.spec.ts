import { mockComponent, mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import New from '../new.vue'

const create = vi.hoisted(() => vi.fn())
const ship = vi.hoisted(() => vi.fn())
const nav = vi.hoisted(() => vi.fn())
const toastAdd = vi.hoisted(() => vi.fn())

// The picker has its own spec; here it just reports a chosen environment (or none).
const picked = vi.hoisted(() => ({ uuid: 'e1' as string | undefined }))
mockComponent('ProjectEnvironmentPicker', async () => {
  const { defineComponent, h } = await import('vue')
  return defineComponent({
    props: { modelValue: { type: String, default: undefined } },
    emits: ['update:modelValue'],
    setup(_, { emit }) {
      if (picked.uuid) emit('update:modelValue', picked.uuid)
      return () => h('div')
    },
  })
})

// Same treatment as the environment picker: its own spec covers it, here it just reports a pin.
const pinned = vi.hoisted(() => ({ value: null as unknown }))
mockComponent('NodePinPicker', async () => {
  const { defineComponent, h } = await import('vue')
  return defineComponent({
    props: { modelValue: { type: Object, default: null } },
    emits: ['update:modelValue'],
    setup(_, { emit }) {
      if (pinned.value) emit('update:modelValue', pinned.value)
      return () => h('div')
    },
  })
})

// Its own spec covers loading and empty states; here it just reports a chosen repository.
const chosen = vi.hoisted(() => ({
  repo: null as null | {
    installationUuid: string
    fullName: string
    defaultBranch: string
    private: boolean
  },
}))
mockComponent('GithubRepoPicker', async () => {
  const { defineComponent, h } = await import('vue')
  return defineComponent({
    props: { modelValue: { type: Object, default: undefined } },
    emits: ['update:modelValue'],
    setup(_, { emit }) {
      if (chosen.repo) emit('update:modelValue', chosen.repo)
      return () => h('div')
    },
  })
})

mockNuxtImport('useCreateApp', () => () => ({ create }))
mockNuxtImport('useShipRelease', () => () => ({ ship }))
mockNuxtImport('navigateTo', () => nav)
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

const CREATED = { slug: 'my-app', url: 'https://my-app.marsa.cc' }

beforeEach(() => {
  picked.uuid = 'e1'
  pinned.value = null
  chosen.repo = null
  create.mockReset().mockResolvedValue(CREATED)
  ship.mockReset().mockResolvedValue({
    releaseUuid: 'r1',
    appSlug: 'my-app',
    url: CREATED.url,
    deployStatus: 'pending',
  })
  nav.mockReset()
  toastAdd.mockReset()
})

const flush = () => new Promise(resolve => setTimeout(resolve))

async function useImageMode(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  await wrapper.find('[data-testid="toggle-image-mode"]').trigger('click')
}

async function fillValidForm(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  await useImageMode(wrapper)
  await wrapper.find('input#slug').setValue('my-app')
  await wrapper.find('input#image').setValue('nginx:1.27')
  // UInputNumber (reka-ui NumberField) commits its numeric value on blur.
  const port = wrapper.find('input#containerPort')
  await port.setValue('80')
  await port.trigger('blur')
}

async function submit(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  await wrapper.find('form').trigger('submit.prevent')
  await flush()
}

describe('apps/new deploy form', () => {
  it('renders the deploy form', async () => {
    const wrapper = await mountSuspended(New)

    expect(wrapper.text()).toContain('Slug')
    expect(wrapper.text()).toContain('Deploy')
    expect(wrapper.find('input#slug').exists()).toBe(true)
  })

  it('creates the app, ships a release, then redirects with a confirming toast', async () => {
    const wrapper = await mountSuspended(New)
    await fillValidForm(wrapper)
    await submit(wrapper)

    expect(create).toHaveBeenCalledWith({
      environmentUuid: 'e1',
      slug: 'my-app',
      image: 'nginx:1.27',
      containerPort: 80,
    })
    expect(ship).toHaveBeenCalledWith('my-app')
    expect(nav).toHaveBeenCalledWith('/apps/my-app')
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Deploy started',
        description: 'my-app is rolling out at https://my-app.marsa.cc',
        color: 'success',
      }),
    )
  })

  it('still lands on the app page with a warning when the deploy step fails', async () => {
    ship.mockRejectedValueOnce({ data: { statusCode: 500, message: 'cluster unreachable' } })

    const wrapper = await mountSuspended(New)
    await fillValidForm(wrapper)
    await submit(wrapper)

    expect(nav).toHaveBeenCalledWith('/apps/my-app')
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'App created, but the deploy failed',
        description: 'cluster unreachable',
        color: 'warning',
      }),
    )
  })

  it('includes non-empty env rows and the replica range in the command', async () => {
    const wrapper = await mountSuspended(New)
    await fillValidForm(wrapper)
    await wrapper.find('input[aria-label="env key 1"]').setValue('LOG_LEVEL')
    await wrapper.find('input[aria-label="env value 1"]').setValue('info')
    const min = wrapper.find('input#minReplicas')
    await min.setValue('0')
    await min.trigger('blur')
    const max = wrapper.find('input#maxReplicas')
    await max.setValue('3')
    await max.trigger('blur')
    await submit(wrapper)

    expect(create).toHaveBeenCalledWith({
      environmentUuid: 'e1',
      slug: 'my-app',
      image: 'nginx:1.27',
      containerPort: 80,
      minReplicas: 0,
      maxReplicas: 3,
      env: { LOG_LEVEL: 'info' },
    })
  })

  it('blocks a ceiling below the floor without calling the API', async () => {
    const wrapper = await mountSuspended(New)
    await fillValidForm(wrapper)
    const min = wrapper.find('input#minReplicas')
    await min.setValue('3')
    await min.trigger('blur')
    const max = wrapper.find('input#maxReplicas')
    await max.setValue('1')
    await max.trigger('blur')
    await submit(wrapper)

    expect(create).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Must be at least the minimum')
  })

  it('keeps the form open with the API message when creating fails', async () => {
    create.mockRejectedValueOnce({
      data: {
        statusCode: 409,
        message: 'An app with slug \'my-app\' already exists.',
        error: 'Conflict',
      },
    })

    const wrapper = await mountSuspended(New)
    await fillValidForm(wrapper)
    await submit(wrapper)

    expect(wrapper.text()).toContain('An app with slug \'my-app\' already exists.')
    expect(ship).not.toHaveBeenCalled()
    expect(nav).not.toHaveBeenCalled()
  })

  it('blocks submit and does not call the API on invalid input', async () => {
    const wrapper = await mountSuspended(New)
    await useImageMode(wrapper)
    await wrapper.find('input#image').setValue('nginx:1.27')
    await submit(wrapper)

    expect(create).not.toHaveBeenCalled()
  })

  it('does not call the API until an environment is picked', async () => {
    picked.uuid = undefined
    const wrapper = await mountSuspended(New)
    await fillValidForm(wrapper)
    await submit(wrapper)

    expect(create).not.toHaveBeenCalled()
  })

  it('omits nodePin when no node is selected', async () => {
    const wrapper = await mountSuspended(New)
    await fillValidForm(wrapper)
    await submit(wrapper)

    expect(create).toHaveBeenCalled()
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('nodePin')
  })

  it('sends the pin when one is selected', async () => {
    pinned.value = { key: 'kubernetes.io/hostname', values: ['node-a'], strategy: 'required' }
    const wrapper = await mountSuspended(New)
    await fillValidForm(wrapper)
    await submit(wrapper)

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        nodePin: { key: 'kubernetes.io/hostname', values: ['node-a'], strategy: 'required' },
      }),
    )
  })
})

describe('apps/new deploy from GitHub', () => {
  const repo = {
    installationUuid: 'i1',
    fullName: 'acme/My-Shop',
    defaultBranch: 'trunk',
    private: false,
  }

  it('opens on GitHub mode, without an image field', async () => {
    const wrapper = await mountSuspended(New)

    expect(wrapper.text()).toContain('Repository')
    expect(wrapper.find('input#image').exists()).toBe(false)
  })

  it('fills the branch and suggests a slug from the chosen repository', async () => {
    chosen.repo = repo
    const wrapper = await mountSuspended(New)
    await flush()

    expect((wrapper.find('input#branch').element as HTMLInputElement).value).toBe('trunk')
    expect((wrapper.find('input#slug').element as HTMLInputElement).value).toBe('my-shop')
  })

  it('creates from the repository and lands on the app without shipping a release', async () => {
    chosen.repo = repo
    const wrapper = await mountSuspended(New)
    await flush()
    await submit(wrapper)

    expect(create).toHaveBeenCalledWith({
      environmentUuid: 'e1',
      slug: 'my-shop',
      source: {
        installationUuid: 'i1',
        repo: 'acme/My-Shop',
        branch: 'trunk',
        rootDir: '.',
        dockerfilePath: 'Dockerfile',
      },
    })
    expect(ship).not.toHaveBeenCalled()
    expect(nav).toHaveBeenCalledWith('/apps/my-app')
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: 'Build started' }))
  })

  it('sends a port only when one is entered', async () => {
    chosen.repo = repo
    const wrapper = await mountSuspended(New)
    await flush()
    const port = wrapper.find('input#containerPort')
    await port.setValue('3000')
    await port.trigger('blur')
    await submit(wrapper)

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ containerPort: 3000 }))
  })

  it('does not call the API until a repository is picked', async () => {
    const wrapper = await mountSuspended(New)
    await wrapper.find('input#slug').setValue('my-app')
    await submit(wrapper)

    expect(create).not.toHaveBeenCalled()
  })
})
