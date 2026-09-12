import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import Index from '../index.vue'

// Mutable holder the mocked composable reads at component-setup time, so each
// test can arrange its own data/loading/error state before mounting.
const s = vi.hoisted(() => ({
  list: { items: [] as unknown[], pending: false, error: null as unknown, exhausted: true },
  reset: vi.fn(),
}))

mockNuxtImport('useAppList', () => () => ({
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

const anApp = (over = {}) => ({
  slug: 'my-app',
  image: 'ghcr.io/acme/my-app:v2',
  url: 'https://my-app.marsa.app',
  createdAt: '2026-07-10T10:00:00.000Z',
  updatedAt: '2026-07-10T10:01:00.000Z',
  ...over,
})

describe('apps/index list page', () => {
  it('always shows the Apps title and a link to the deploy form', async () => {
    const wrapper = await mountSuspended(Index)
    expect(wrapper.text()).toContain('Apps')
    const deployLink = wrapper.findAll('a').find(a => a.attributes('href') === '/apps/new')
    expect(deployLink).toBeTruthy()
  })

  // Loaded in onMounted, not with a top-level await — a top-level await suspends the
  // component until the request resolves and the skeleton below never renders.
  it('loads the first page on mount', async () => {
    await mountSuspended(Index)
    expect(s.reset).toHaveBeenCalledTimes(1)
  })

  it('renders the empty state when no apps are deployed', async () => {
    const wrapper = await mountSuspended(Index)
    expect(wrapper.text()).toContain('Deploy your first app')
  })

  it('lists each deployed app with its image, url, and a link to its detail view', async () => {
    s.list.items = [anApp(), anApp({ slug: 'web-ui', image: 'ghcr.io/acme/web-ui:latest', url: 'https://web-ui.marsa.app' })]
    const wrapper = await mountSuspended(Index)
    expect(wrapper.text()).toContain('my-app')
    expect(wrapper.text()).toContain('web-ui')
    expect(wrapper.text()).toContain('ghcr.io/acme/my-app:v2')
    expect(wrapper.text()).toContain('https://my-app.marsa.app')
    const detailLink = wrapper.findAll('a').find(a => a.attributes('href') === '/apps/my-app')
    expect(detailLink).toBeTruthy()
  })

  it('shows a loading skeleton while pending (no empty state yet)', async () => {
    s.list.pending = true
    s.list.items = []
    const wrapper = await mountSuspended(Index)
    expect(wrapper.text()).not.toContain('Deploy your first app')
  })

  it('shows an error alert when the first page fails', async () => {
    s.list.error = new Error('boom')
    const wrapper = await mountSuspended(Index)
    expect(wrapper.text()).toContain('Couldn\'t load apps')
  })

  // Replacing the list would take the already-loaded rows off screen along with the
  // footer's Retry button, leaving no way back.
  it('keeps the loaded rows when a later page fails, and offers a retry', async () => {
    s.list.items = [anApp()]
    s.list.error = new Error('boom')
    s.list.exhausted = false
    const wrapper = await mountSuspended(Index)

    expect(wrapper.text()).not.toContain('Couldn\'t load apps')
    expect(wrapper.text()).toContain('my-app')
    expect(wrapper.text()).toContain('Retry')
  })
})
