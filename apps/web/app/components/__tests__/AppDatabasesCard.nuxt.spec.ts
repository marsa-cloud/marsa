import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import AppDatabasesCard from '../AppDatabasesCard.vue'

const attach = vi.hoisted(() => vi.fn())
const detach = vi.hoisted(() => vi.fn())
const refresh = vi.hoisted(() => vi.fn())
const loadDatabases = vi.hoisted(() => vi.fn())
const toastAdd = vi.hoisted(() => vi.fn())

const s = vi.hoisted(() => ({
  attachments: null as unknown,
  status: 'success',
  error: null as unknown,
  databases: [] as unknown[],
}))

mockNuxtImport('useAppAttachments', () => () => ({
  data: ref(s.attachments),
  status: ref(s.status),
  error: ref(s.error),
  refresh,
}))
mockNuxtImport('useDatabaseList', () => () => ({
  items: ref(s.databases),
  reset: loadDatabases,
}))
mockNuxtImport('useAttachDatabase', () => () => ({ attach }))
mockNuxtImport('useDetachDatabase', () => () => ({ detach }))
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

const anAttachment = (over = {}) => ({
  databaseSlug: 'orders',
  alias: null,
  engine: 'postgres',
  version: '17',
  variables: ['DATABASE_URL', 'PGHOST'],
  ...over,
})

beforeEach(() => {
  // Each mount teleports its modals into the body and never unmounts, so a stale dialog from
  // the previous test would be the one a data-testid lookup finds.
  document.body.innerHTML = ''
  s.attachments = { items: [anAttachment()] }
  s.status = 'success'
  s.error = null
  s.databases = [{ slug: 'analytics' }, { slug: 'orders' }]
  attach.mockReset().mockResolvedValue({ databaseSlug: 'analytics', alias: null, variables: [] })
  detach.mockReset().mockResolvedValue(undefined)
  refresh.mockReset()
  loadDatabases.mockReset()
  toastAdd.mockReset()
})

const mount = () =>
  mountSuspended(AppDatabasesCard, {
    props: { slug: 'my-app', environmentUuid: '11111111-1111-4111-8111-111111111111' },
    attachTo: document.body,
  })

// The modals teleport out of the wrapper, so their controls are read off the document.
const queryTestId = (id: string) => document.querySelector(`[data-testid="${id}"]`)

// USelect renders its listbox lazily, so the model is driven through the component directly.
async function pickDatabase(wrapper: Awaited<ReturnType<typeof mount>>, slug: string) {
  const select = wrapper.findAllComponents({ name: 'USelect' })[0]
  select?.vm.$emit('update:modelValue', slug)
  await nextTick()
}

async function typeAlias(wrapper: Awaited<ReturnType<typeof mount>>, alias: string) {
  const input = queryTestId('attach-alias') as HTMLInputElement
  input.value = alias
  input.dispatchEvent(new Event('input'))
  await nextTick()
}

describe('AppDatabasesCard', () => {
  it('lists an attachment with the variables it injects', async () => {
    const wrapper = await mount()

    expect(wrapper.text()).toContain('orders')
    expect(wrapper.text()).toContain('DATABASE_URL')
  })

  it('badges the alias when the attachment carries one', async () => {
    s.attachments = { items: [anAttachment({ alias: 'analytics' })] }

    const wrapper = await mount()

    expect(wrapper.text()).toContain('analytics')
  })

  it('shows the empty state when nothing is attached', async () => {
    s.attachments = { items: [] }

    const wrapper = await mount()

    expect(wrapper.text()).toContain('No databases attached')
  })

  it('offers only databases that are not attached yet', async () => {
    const wrapper = await mount()

    await wrapper.find('[data-testid="open-attach"]').trigger('click')
    await nextTick()

    expect(loadDatabases).toHaveBeenCalled()
    const select = queryTestId('attach-database-select')
    expect(select?.textContent).not.toContain('orders')
  })

  it('attaches the chosen database with the typed alias', async () => {
    s.attachments = { items: [] }

    const wrapper = await mount()
    await wrapper.find('[data-testid="open-attach"]').trigger('click')
    await nextTick()

    await pickDatabase(wrapper, 'analytics')
    await typeAlias(wrapper, 'reporting')
    ;(queryTestId('confirm-attach') as HTMLButtonElement).click()
    await flushPromises()

    expect(attach).toHaveBeenCalledWith('my-app', {
      databaseSlug: 'analytics',
      alias: 'reporting',
    })
    expect(toastAdd).toHaveBeenCalled()
  })

  it('omits the alias entirely when the field is left blank', async () => {
    s.attachments = { items: [] }

    const wrapper = await mount()
    await wrapper.find('[data-testid="open-attach"]').trigger('click')
    await nextTick()

    await pickDatabase(wrapper, 'analytics')
    ;(queryTestId('confirm-attach') as HTMLButtonElement).click()
    await flushPromises()

    expect(attach).toHaveBeenCalledWith('my-app', { databaseSlug: 'analytics' })
  })

  it('surfaces the API\'s conflict message when an alias is missing', async () => {
    s.attachments = { items: [] }
    attach.mockRejectedValue({
      data: { message: 'App \'my-app\' already has an unprefixed database attached.' },
    })

    const wrapper = await mount()
    await wrapper.find('[data-testid="open-attach"]').trigger('click')
    await nextTick()

    await pickDatabase(wrapper, 'analytics')
    ;(queryTestId('confirm-attach') as HTMLButtonElement).click()
    await flushPromises()

    expect(document.body.textContent).toContain('already has an unprefixed database attached')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('surfaces a failed detach instead of closing the dialog', async () => {
    detach.mockRejectedValue({ data: { message: 'Could not update my-app in the cluster.' } })

    const wrapper = await mount()
    await wrapper.find('[data-testid="detach-orders"]').trigger('click')
    await nextTick()
    ;(queryTestId('confirm-detach') as HTMLButtonElement).click()
    await flushPromises()

    expect(document.body.textContent).toContain('Could not update my-app in the cluster')
  })

  it('detaches only after the confirmation is accepted', async () => {
    const wrapper = await mount()

    await wrapper.find('[data-testid="detach-orders"]').trigger('click')
    await nextTick()
    expect(detach).not.toHaveBeenCalled()

    ;(queryTestId('confirm-detach') as HTMLButtonElement).click()
    await nextTick()

    expect(detach).toHaveBeenCalledWith('my-app', 'orders')
  })
})
