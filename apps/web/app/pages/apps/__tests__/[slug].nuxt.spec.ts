import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import Detail from '../[slug].vue'

// Mutable holders the mocked composables read at component-setup time, so each
// test can arrange its own data/loading/error state before mounting.
const s = vi.hoisted(() => ({
  health: { data: null as unknown, status: 'success', error: null as unknown },
  releases: { data: { releases: [] } as unknown, status: 'success', error: null as unknown },
  logs: { data: { podName: null, logs: '' } as unknown, status: 'success', error: null as unknown },
  refreshHealth: vi.fn(),
  refreshReleases: vi.fn(),
  redeploy: vi.fn(),
}))

mockNuxtImport('useRoute', () => () => ({ params: { slug: 'my-app' } }))
mockNuxtImport('useAppHealth', () => () => ({
  data: ref(s.health.data),
  status: ref(s.health.status),
  error: ref(s.health.error),
  refresh: s.refreshHealth,
}))
mockNuxtImport('useAppReleases', () => () => ({
  data: ref(s.releases.data),
  status: ref(s.releases.status),
  error: ref(s.releases.error),
  refresh: s.refreshReleases,
}))
mockNuxtImport('useRedeployApp', () => () => ({ redeploy: s.redeploy }))
mockNuxtImport('useAppRunLogs', () => () => ({
  data: ref(s.logs.data),
  status: ref(s.logs.status),
  error: ref(s.logs.error),
}))

beforeEach(() => {
  s.health = { data: null, status: 'success', error: null }
  s.releases = { data: { releases: [] }, status: 'success', error: null }
  s.logs = { data: { podName: null, logs: '' }, status: 'success', error: null }
  s.refreshHealth = vi.fn()
  s.refreshReleases = vi.fn()
  s.redeploy = vi.fn().mockResolvedValue({
    appSlug: 'my-app',
    url: 'https://my-app.marsa.cc',
    releaseUuid: 'r-new',
    deployStatus: 'pending',
  })
})

const clickRedeploy = async (wrapper: { findAll: (s: string) => { text: () => string, trigger: (e: string) => Promise<void> }[] }) => {
  const button = wrapper.findAll('button').find(b => b.text().includes('Redeploy'))
  if (!button) throw new Error('Redeploy button not found')
  await button.trigger('click')
  await new Promise(resolve => setTimeout(resolve, 0))
}

const aRelease = (over = {}) => ({
  uuid: 'r1',
  imageRef: 'nginx:1.27',
  triggeredBy: 'manual',
  deployStatus: 'succeeded',
  createdAt: '2026-07-10T10:00:00.000Z',
  updatedAt: '2026-07-10T10:01:00.000Z',
  failureReason: null,
  failureMessage: null,
  ...over,
})

describe('apps/[slug] detail page', () => {
  it('renders all three sections with the slug in the title bar', async () => {
    const wrapper = await mountSuspended(Detail)
    expect(wrapper.text()).toContain('my-app')
    expect(wrapper.text()).toContain('Health')
    expect(wrapper.text()).toContain('Release history')
    expect(wrapper.text()).toContain('Run logs')
  })

  it('shows health status + replica count', async () => {
    s.health.data = { status: 'healthy', availableReplicas: 2, desiredReplicas: 3 }
    const wrapper = await mountSuspended(Detail)
    expect(wrapper.text()).toContain('healthy')
    expect(wrapper.text()).toContain('2 / 3 replicas available')
  })

  it('lists releases with status and image', async () => {
    s.releases.data = { releases: [aRelease(), aRelease({ uuid: 'r2', imageRef: 'nginx:1.28', deployStatus: 'pending' })] }
    const wrapper = await mountSuspended(Detail)
    expect(wrapper.text()).toContain('nginx:1.27')
    expect(wrapper.text()).toContain('nginx:1.28')
    expect(wrapper.text()).toContain('succeeded')
    expect(wrapper.text()).toContain('pending')
  })

  it('surfaces the failure reason on a failed release', async () => {
    s.releases.data = {
      releases: [aRelease({ deployStatus: 'failed', failureReason: 'ImagePullBackOff', failureMessage: 'not found' })],
    }
    const wrapper = await mountSuspended(Detail)
    expect(wrapper.text()).toContain('ImagePullBackOff')
    expect(wrapper.text()).toContain('not found')
  })

  it('renders logs with the pod name', async () => {
    s.logs.data = { podName: 'pod-abc', logs: 'hello from the pod\n' }
    const wrapper = await mountSuspended(Detail)
    expect(wrapper.text()).toContain('pod-abc')
    expect(wrapper.text()).toContain('hello from the pod')
  })

  it('shows empty states when there are no releases or logs', async () => {
    const wrapper = await mountSuspended(Detail)
    expect(wrapper.text()).toContain('No releases yet.')
    expect(wrapper.text()).toContain('No logs available.')
  })

  it('shows a per-section error state when each section fails to load', async () => {
    s.health.error = new Error('boom')
    s.releases.error = new Error('boom')
    s.logs.error = new Error('boom')
    const wrapper = await mountSuspended(Detail)
    expect(wrapper.text()).toContain('Couldn\'t load health')
    expect(wrapper.text()).toContain('Couldn\'t load releases')
    expect(wrapper.text()).toContain('Couldn\'t load logs')
  })

  it('shows the health empty-state when no health data is returned', async () => {
    s.health.data = null
    const wrapper = await mountSuspended(Detail)
    expect(wrapper.text()).toContain('No health data yet.')
  })

  it('redeploys the app and refreshes releases + health', async () => {
    const wrapper = await mountSuspended(Detail)

    await clickRedeploy(wrapper)

    expect(s.redeploy).toHaveBeenCalledWith('my-app')
    expect(s.refreshReleases).toHaveBeenCalled()
    expect(s.refreshHealth).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Redeploy started')
  })

  it('surfaces the API message and skips the refresh when redeploy fails', async () => {
    s.redeploy = vi.fn().mockRejectedValue({ data: { message: 'No app with that slug.' } })
    const wrapper = await mountSuspended(Detail)

    await clickRedeploy(wrapper)

    expect(wrapper.text()).toContain('Redeploy failed')
    expect(wrapper.text()).toContain('No app with that slug.')
    expect(s.refreshReleases).not.toHaveBeenCalled()
  })
})
