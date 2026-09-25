import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import Index from '../index.vue'

const s = vi.hoisted(() => ({
  list: { items: [] as unknown[], pending: false, error: null as unknown, exhausted: true },
  reset: vi.fn(),
}))

mockNuxtImport('useDatabaseList', () => () => ({
  items: ref(s.list.items),
  pending: ref(s.list.pending),
  error: ref(s.list.error),
  exhausted: ref(s.list.exhausted),
  canLoadMore: () => false,
  loadMore: vi.fn(),
  reset: s.reset,
}))

beforeEach(() => {
  s.list = { items: [], pending: false, error: null, exhausted: true }
  s.reset.mockClear()
})

const aDatabase = (over = {}) => ({
  slug: 'orders',
  engine: 'postgres',
  version: '17',
  status: 'ready',
  project: { slug: 'demo', name: 'Demo' },
  environment: { slug: 'dev', name: 'Dev' },
  createdAt: '2026-09-23T10:00:00.000Z',
  updatedAt: '2026-09-23T10:01:00.000Z',
  ...over,
})

describe('databases/index list page', () => {
  it('always shows the title and a link to the create form', async () => {
    const wrapper = await mountSuspended(Index)

    expect(wrapper.text()).toContain('Databases')
    expect(wrapper.findAll('a').some(a => a.attributes('href') === '/databases/new')).toBe(true)
  })

  it('loads the first page on mount', async () => {
    await mountSuspended(Index)

    expect(s.reset).toHaveBeenCalledOnce()
  })

  it('renders a row per database with its engine version and status', async () => {
    s.list.items = [aDatabase()]

    const wrapper = await mountSuspended(Index)

    expect(wrapper.text()).toContain('orders')
    expect(wrapper.text()).toContain('PostgreSQL 17')
    expect(wrapper.text()).toContain('Ready')
    expect(wrapper.findAll('a').some(a => a.attributes('href') === '/databases/orders')).toBe(true)
  })

  it('labels a database the cluster has no record of', async () => {
    s.list.items = [aDatabase({ status: 'not_found' })]

    const wrapper = await mountSuspended(Index)

    expect(wrapper.text()).toContain('Not running')
  })

  it('keeps the rows on screen when a later page fails', async () => {
    s.list.items = [aDatabase()]
    s.list.error = new Error('boom')

    const wrapper = await mountSuspended(Index)

    expect(wrapper.text()).toContain('orders')
    expect(wrapper.text()).not.toContain('Couldn\'t load databases')
  })

  it('shows the empty state when there is nothing yet', async () => {
    const wrapper = await mountSuspended(Index)

    expect(wrapper.text()).toContain('Add your first database')
  })
})
