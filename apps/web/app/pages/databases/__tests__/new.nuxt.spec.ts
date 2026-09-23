import { mockComponent, mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import New from '../new.vue'

const create = vi.hoisted(() => vi.fn())
const nav = vi.hoisted(() => vi.fn())

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

mockNuxtImport('useCreateDatabase', () => () => ({ create }))
mockNuxtImport('navigateTo', () => nav)

const CREATED = { slug: 'orders', engine: 'postgres', version: '18', host: 'orders', port: 5432 }

beforeEach(() => {
  picked.uuid = 'e1'
  pinned.value = null
  create.mockReset().mockResolvedValue(CREATED)
  nav.mockReset()
})

const flush = () => new Promise(resolve => setTimeout(resolve))

async function submit(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  await wrapper.find('form').trigger('submit.prevent')
  await flush()
}

describe('databases/new form', () => {
  it('renders the form with the storage caveat spelled out', async () => {
    const wrapper = await mountSuspended(New)

    expect(wrapper.find('input#slug').exists()).toBe(true)
    expect(wrapper.text()).toContain('cannot resize later')
    expect(wrapper.text()).toContain('cannot be changed later')
  })

  it('creates the database with the defaulted version and size, then opens it', async () => {
    const wrapper = await mountSuspended(New)
    await wrapper.find('input#slug').setValue('orders')

    await submit(wrapper)

    expect(create).toHaveBeenCalledWith({
      environmentUuid: 'e1',
      slug: 'orders',
      engine: 'postgres',
      version: '18',
      storageGib: 10,
    })
    expect(nav).toHaveBeenCalledWith('/databases/orders')
  })

  it('sends a node pin when one is chosen', async () => {
    pinned.value = { key: 'kubernetes.io/hostname', values: ['node-a'], strategy: 'required' }

    const wrapper = await mountSuspended(New)
    await wrapper.find('input#slug').setValue('orders')
    await submit(wrapper)

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        nodePin: { key: 'kubernetes.io/hostname', values: ['node-a'], strategy: 'required' },
      }),
    )
  })

  it('surfaces a rejected create and stays on the form', async () => {
    create.mockRejectedValueOnce({ data: { statusCode: 409, message: 'name already in use' } })

    const wrapper = await mountSuspended(New)
    await wrapper.find('input#slug').setValue('orders')
    await submit(wrapper)

    expect(wrapper.text()).toContain('name already in use')
    expect(nav).not.toHaveBeenCalled()
  })

  it('does not submit without an environment', async () => {
    picked.uuid = undefined

    const wrapper = await mountSuspended(New)
    await wrapper.find('input#slug').setValue('orders')
    await submit(wrapper)

    expect(create).not.toHaveBeenCalled()
  })
})
