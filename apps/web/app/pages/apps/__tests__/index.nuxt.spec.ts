import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import Index from '../index.vue'

// Mutable holder the mocked composable reads at component-setup time, so each
// test can arrange its own data/loading/error state before mounting.
const s = vi.hoisted(() => ({
  list: { data: { apps: [] } as unknown, status: 'success', error: null as unknown },
}))

mockNuxtImport('useAppList', () => () => ({
  data: ref(s.list.data),
  status: ref(s.list.status),
  error: ref(s.list.error),
}))

beforeEach(() => {
  s.list = { data: { apps: [] }, status: 'success', error: null }
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

  it('renders the empty state when no apps are deployed', async () => {
    const wrapper = await mountSuspended(Index)
    expect(wrapper.text()).toContain('Deploy your first app')
  })

  it('lists each deployed app with its image, url, and a link to its detail view', async () => {
    s.list.data = { apps: [anApp(), anApp({ slug: 'web-ui', image: 'ghcr.io/acme/web-ui:latest', url: 'https://web-ui.marsa.app' })] }
    const wrapper = await mountSuspended(Index)
    expect(wrapper.text()).toContain('my-app')
    expect(wrapper.text()).toContain('web-ui')
    expect(wrapper.text()).toContain('ghcr.io/acme/my-app:v2')
    expect(wrapper.text()).toContain('https://my-app.marsa.app')
    const detailLink = wrapper.findAll('a').find(a => a.attributes('href') === '/apps/my-app')
    expect(detailLink).toBeTruthy()
  })

  it('shows a loading skeleton while pending (no empty state yet)', async () => {
    s.list.status = 'pending'
    s.list.data = null
    const wrapper = await mountSuspended(Index)
    expect(wrapper.text()).not.toContain('Deploy your first app')
  })

  it('shows an error alert when the request fails', async () => {
    s.list.error = new Error('boom')
    const wrapper = await mountSuspended(Index)
    expect(wrapper.text()).toContain('Couldn\'t load apps')
  })
})
