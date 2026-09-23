import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import Detail from '../[slug].vue'

const remove = vi.hoisted(() => vi.fn())
const nav = vi.hoisted(() => vi.fn())
const toastAdd = vi.hoisted(() => vi.fn())

const s = vi.hoisted(() => ({
  data: null as unknown,
  pending: false,
  error: null as unknown,
}))

mockNuxtImport('useDatabaseDetail', () => () => ({
  data: ref(s.data),
  pending: ref(s.pending),
  error: ref(s.error),
}))
mockNuxtImport('useDeleteDatabase', () => () => ({ remove }))
mockNuxtImport('navigateTo', () => nav)
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))
mockNuxtImport('useRoute', () => () => ({ params: { slug: 'orders' } }))

const aDatabase = (over = {}) => ({
  slug: 'orders',
  engine: 'postgres',
  version: '17',
  image: 'postgres:17.11',
  storageGib: 10,
  status: 'ready',
  nodePin: null,
  connection: { host: 'orders', port: 5432, user: 'postgres', database: 'orders' },
  project: { slug: 'demo', name: 'Demo' },
  environment: { slug: 'dev', name: 'Dev' },
  createdAt: '2026-09-23T10:00:00.000Z',
  updatedAt: '2026-09-23T10:01:00.000Z',
  ...over,
})

beforeEach(() => {
  s.data = aDatabase()
  s.pending = false
  s.error = null
  remove.mockReset().mockResolvedValue(undefined)
  nav.mockReset()
  toastAdd.mockReset()
})

// The modal teleports out of the wrapper, so its controls are read off the document.
const confirmButton = () =>
  document.querySelector('[data-testid="confirm-delete"]') as HTMLButtonElement

async function openConfirmAndType(
  wrapper: Awaited<ReturnType<typeof mountSuspended>>,
  value: string,
) {
  await wrapper.find('[data-testid="delete-database"]').trigger('click')
  await nextTick()
  const input = document.querySelector('[data-testid="confirm-slug"]') as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input'))
  await nextTick()
}

describe('databases/[slug] detail page', () => {
  it('shows the connection details and never a password', async () => {
    const wrapper = await mountSuspended(Detail)

    expect(wrapper.find('[data-testid="connection-host"]').text()).toBe('orders')
    expect(wrapper.text()).toContain('5432')
    expect(wrapper.text()).toContain('postgres')
    expect(wrapper.text().toLowerCase()).not.toContain('password')
  })

  it('states that the requested size is not enforced', async () => {
    const wrapper = await mountSuspended(Detail)

    expect(wrapper.text()).toContain('local-path does not enforce it')
  })

  it('shows a node pin as read-only when one is set', async () => {
    s.data = aDatabase({
      nodePin: { key: 'kubernetes.io/hostname', values: ['node-a'], strategy: 'required' },
    })

    const wrapper = await mountSuspended(Detail)

    expect(wrapper.text()).toContain('node-a')
    expect(wrapper.text()).toContain('fixed at creation')
  })

  it('keeps delete disabled until the typed name matches', async () => {
    const wrapper = await mountSuspended(Detail, { attachTo: document.body })

    await wrapper.find('[data-testid="delete-database"]').trigger('click')
    await nextTick()
    expect(confirmButton().disabled).toBe(true)

    const input = document.querySelector('[data-testid="confirm-slug"]') as HTMLInputElement
    input.value = 'orders'
    input.dispatchEvent(new Event('input'))
    await nextTick()

    expect(confirmButton().disabled).toBe(false)
  })

  it('deletes, confirms with a toast, then returns to the list', async () => {
    const wrapper = await mountSuspended(Detail, { attachTo: document.body })
    await openConfirmAndType(wrapper, 'orders')
    confirmButton().click()
    await flushPromises()

    expect(remove).toHaveBeenCalledWith('orders')
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'orders deleted', color: 'success' }),
    )
    expect(nav).toHaveBeenCalledWith('/databases')
  })

  it('keeps the modal open and reports why a failed delete did not happen', async () => {
    remove.mockRejectedValueOnce({ data: { statusCode: 502, message: 'cluster unreachable' } })

    const wrapper = await mountSuspended(Detail, { attachTo: document.body })
    await openConfirmAndType(wrapper, 'orders')
    confirmButton().click()
    await flushPromises()

    expect(document.body.textContent).toContain('cluster unreachable')
    expect(nav).not.toHaveBeenCalled()
  })

  it('reports a database it cannot load', async () => {
    s.data = null
    s.error = new Error('boom')

    const wrapper = await mountSuspended(Detail)

    expect(wrapper.text()).toContain("Couldn't load this database")
  })
})
