import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ref } from 'vue'
import { nextTick, ref } from 'vue'

import Detail from '../[slug].vue'

// Mutable holders the mocked composables read at component-setup time, so each
// test can arrange its own data/loading/error state before mounting.
const s = vi.hoisted(() => ({
  health: { data: null as unknown, status: 'success', error: null as unknown },
  releases: { items: [] as unknown[], pending: false, error: null as unknown },
  logs: { data: { podName: null, logs: '' } as unknown, status: 'success', error: null as unknown },
  config: {
    data: { slug: 'my-app', env: {} } as unknown,
    status: 'success',
    error: null as unknown,
  },
  builds: { items: [] as unknown[], pending: false, error: null as unknown },
  refreshBuilds: vi.fn(),
  rebuild: vi.fn(),
  refreshHealth: vi.fn(),
  refreshReleases: vi.fn(),
  refreshLogs: vi.fn(),
  refreshConfig: vi.fn(),
  ship: vi.fn(),
  // Captured from useAppRunLogs so a test can assert the selector drives the
  // tailLines the composable fetches with. Seeded as a plain holder because
  // vi.hoisted runs before imports — the real ref is assigned by the mock.
  tailLines: { value: 0 } as { value: number },
}))

mockNuxtImport('useRoute', () => () => ({ params: { slug: 'my-app' } }))
mockNuxtImport('useAppHealth', () => () => ({
  data: ref(s.health.data),
  status: ref(s.health.status),
  error: ref(s.health.error),
  refresh: s.refreshHealth,
}))
mockNuxtImport('useAppReleases', () => () => ({
  items: ref(s.releases.items),
  pending: ref(s.releases.pending),
  error: ref(s.releases.error),
  exhausted: ref(true),
  canLoadMore: () => false,
  loadMore: vi.fn(),
  reset: s.refreshReleases,
}))
mockNuxtImport('useShipRelease', () => () => ({ ship: s.ship }))
mockNuxtImport('useAppRunLogs', () => (_slug: string, tailLines: Ref<number>) => {
  s.tailLines = tailLines
  return {
    data: ref(s.logs.data),
    status: ref(s.logs.status),
    error: ref(s.logs.error),
    refresh: s.refreshLogs,
  }
})
mockNuxtImport('useAppDetail', () => () => ({
  data: ref(s.config.data),
  status: ref(s.config.status),
  error: ref(s.config.error),
  refresh: s.refreshConfig,
}))
mockNuxtImport('useAppBuilds', () => () => ({
  items: ref(s.builds.items),
  pending: ref(s.builds.pending),
  error: ref(s.builds.error),
  exhausted: ref(true),
  canLoadMore: () => false,
  loadMore: vi.fn(),
  reset: s.refreshBuilds,
}))
mockNuxtImport('useRebuild', () => () => ({ rebuild: s.rebuild }))
mockNuxtImport('useBuildLogs', () => () => ({ read: vi.fn().mockResolvedValue({ logs: '' }) }))
mockNuxtImport('useUpdateApp', () => () => ({ update: vi.fn() }))

const del = vi.hoisted(() => ({ remove: vi.fn() }))
const nav = vi.hoisted(() => vi.fn())
const toastAdd = vi.hoisted(() => vi.fn())

mockNuxtImport('useDeleteApp', () => () => ({ remove: del.remove }))
mockNuxtImport('navigateTo', () => nav)
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

const listNodes = vi.hoisted(() => vi.fn())
mockNuxtImport('useNodeList', () => () => ({ list: listNodes }))

beforeEach(() => {
  s.health = { data: null, status: 'success', error: null }
  s.releases = { items: [], pending: false, error: null }
  s.logs = { data: { podName: null, logs: '' }, status: 'success', error: null }
  s.config = {
    data: {
      slug: 'my-app',
      image: 'nginx:1.27',
      containerPort: 80,
      env: {},
      minReplicas: 1,
      maxReplicas: 1,
      nodePin: null,
      hasUndeployedChanges: false,
      project: { slug: 'demo', name: 'Demo' },
      environment: { uuid: '0190c3c0-0000-7000-8000-000000000002', slug: 'dev', name: 'Dev' },
    },
    status: 'success',
    error: null,
  }
  s.refreshHealth = vi.fn()
  s.refreshReleases = vi.fn()
  s.refreshLogs = vi.fn()
  s.refreshConfig = vi.fn()
  s.builds = { items: [], pending: false, error: null }
  s.refreshBuilds.mockReset()
  s.rebuild.mockReset().mockResolvedValue({})
  s.ship = vi.fn().mockResolvedValue({
    releaseUuid: 'r-new',
    appSlug: 'my-app',
    url: 'https://my-app.marsa.cc',
    deployStatus: 'pending',
  })
  del.remove.mockReset()
  del.remove.mockResolvedValue(undefined)
  nav.mockReset()
  toastAdd.mockReset()
  listNodes.mockReset().mockResolvedValue([])
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

  it('names the app\'s project and environment in the header', async () => {
    const wrapper = await mountSuspended(Detail)
    expect(wrapper.text()).toContain('demo / dev')
  })

  it('shows health status + replica count', async () => {
    s.health.data = { status: 'healthy', availableReplicas: 2, desiredReplicas: 3 }
    const wrapper = await mountSuspended(Detail)
    expect(wrapper.text()).toContain('healthy')
    expect(wrapper.text()).toContain('2 / 3 replicas available')
  })

  it('describes an idle app as sleeping rather than broken', async () => {
    s.health.data = { status: 'idle', availableReplicas: 0, desiredReplicas: 0 }
    const wrapper = await mountSuspended(Detail)
    expect(wrapper.text()).toContain('idle')
    expect(wrapper.text()).toContain('no pods running')
  })

  it('shows a single always-on replica without a range', async () => {
    const wrapper = await mountSuspended(Detail)
    expect(wrapper.text()).toContain('Scaling: 1 replica')
  })

  it('spells out that a zero floor means the app sleeps', async () => {
    s.config.data = { ...(s.config.data as object), minReplicas: 0, maxReplicas: 3 }
    const wrapper = await mountSuspended(Detail)
    expect(wrapper.text()).toContain('Scaling: 0–3 replicas, sleeps when idle')
  })

  it('lists releases with status and image', async () => {
    s.releases.items = [aRelease(), aRelease({ uuid: 'r2', imageRef: 'nginx:1.28', deployStatus: 'pending' })]
    const wrapper = await mountSuspended(Detail)
    expect(wrapper.text()).toContain('nginx:1.27')
    expect(wrapper.text()).toContain('nginx:1.28')
    expect(wrapper.text()).toContain('succeeded')
    expect(wrapper.text()).toContain('pending')
  })

  it('surfaces the failure reason on a failed release', async () => {
    s.releases.items = [
      aRelease({ deployStatus: 'failed', failureReason: 'ImagePullBackOff', failureMessage: 'not found' }),
    ]
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

  it('refreshes the logs on demand', async () => {
    const wrapper = await mountSuspended(Detail)

    await wrapper.find('[data-testid="refresh-logs"]').trigger('click')

    expect(s.refreshLogs).toHaveBeenCalled()
  })

  it('re-fetches the logs with the selected line count', async () => {
    const wrapper = await mountSuspended(Detail)
    expect(s.tailLines.value).toBe(100)

    // The dropdown is portalled and doesn't open under happy-dom, so drive the
    // selection through the component's v-model rather than the popover UI.
    const select = wrapper.findComponent({ name: 'USelect' })
    expect(select.props('items')).toEqual([50, 100, 200, 500, 1000])
    select.vm.$emit('update:modelValue', 500)
    await nextTick()

    expect(s.tailLines.value).toBe(500)
  })

  it('shows an error state when the stored config fails to load', async () => {
    // A genuine initial-load failure has no data; the card deliberately keeps
    // rendering when a *refetch* fails on top of a config it already holds.
    s.config = { data: null, status: 'error', error: new Error('boom') }
    const wrapper = await mountSuspended(Detail)

    expect(wrapper.text()).toContain('Couldn\'t load the configuration')
    expect(wrapper.find('[data-testid="save-config"]').exists()).toBe(false)
  })

  it('shows a danger zone with a delete button', async () => {
    const wrapper = await mountSuspended(Detail)
    expect(wrapper.text()).toContain('Danger zone')
    expect(wrapper.text()).toContain('Delete app')
  })

  it('keeps confirmation disabled until the typed slug matches, then deletes and navigates away', async () => {
    const wrapper = await mountSuspended(Detail, { attachTo: document.body })

    await wrapper.find('[data-testid="delete-app"]').trigger('click')
    await nextTick()

    const confirm = () => document.querySelector('[data-testid="confirm-delete"]') as HTMLButtonElement
    expect(confirm().disabled).toBe(true)

    const input = document.querySelector('[data-testid="confirm-slug"]') as HTMLInputElement
    input.value = 'my-app'
    input.dispatchEvent(new Event('input'))
    await nextTick()

    expect(confirm().disabled).toBe(false)
    confirm().click()
    await flushPromises()

    expect(del.remove).toHaveBeenCalledWith('my-app')
    expect(nav).toHaveBeenCalledWith('/apps')
  })

  it('confirms the deletion with a toast, since the page navigates away', async () => {
    const wrapper = await mountSuspended(Detail, { attachTo: document.body })

    await wrapper.find('[data-testid="delete-app"]').trigger('click')
    await nextTick()

    const input = document.querySelector('[data-testid="confirm-slug"]') as HTMLInputElement
    input.value = 'my-app'
    input.dispatchEvent(new Event('input'))
    await nextTick()
    ;(document.querySelector('[data-testid="confirm-delete"]') as HTMLButtonElement).click()
    await flushPromises()

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'my-app deleted', color: 'success' }),
    )
  })

  it('does not delete when the typed slug does not match', async () => {
    const wrapper = await mountSuspended(Detail, { attachTo: document.body })

    await wrapper.find('[data-testid="delete-app"]').trigger('click')
    await nextTick()

    const input = document.querySelector('[data-testid="confirm-slug"]') as HTMLInputElement
    input.value = 'wrong-name'
    input.dispatchEvent(new Event('input'))
    await nextTick()
    ;(document.querySelector('[data-testid="confirm-delete"]') as HTMLButtonElement).click()
    await flushPromises()

    expect(del.remove).not.toHaveBeenCalled()
    expect(nav).not.toHaveBeenCalled()
  })

  it('surfaces the API error and stays on the page when deletion fails', async () => {
    del.remove.mockRejectedValueOnce({ data: { message: 'Could not remove it.' } })
    const wrapper = await mountSuspended(Detail, { attachTo: document.body })

    await wrapper.find('[data-testid="delete-app"]').trigger('click')
    await nextTick()

    const input = document.querySelector('[data-testid="confirm-slug"]') as HTMLInputElement
    input.value = 'my-app'
    input.dispatchEvent(new Event('input'))
    await nextTick()
    ;(document.querySelector('[data-testid="confirm-delete"]') as HTMLButtonElement).click()
    await flushPromises()

    expect(document.body.textContent).toContain('Could not remove it.')
    expect(nav).not.toHaveBeenCalled()
    // The error belongs next to the retry button, not in a toast the user has
    // to look away for.
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('ships the current config from the Redeploy button and refreshes everything', async () => {
    const wrapper = await mountSuspended(Detail)
    s.refreshReleases.mockClear()

    await clickRedeploy(wrapper)

    expect(s.ship).toHaveBeenCalledWith('my-app', {})
    expect(s.refreshReleases).toHaveBeenCalled()
    expect(s.refreshHealth).toHaveBeenCalled()
    expect(s.refreshConfig).toHaveBeenCalled()
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Deploy started', color: 'success' }),
    )
  })

  it('reports a failed ship and still refreshes so the failed or newer release shows', async () => {
    s.ship = vi.fn().mockRejectedValue({ data: { message: 'Release r1 is not the newest release.' } })
    const wrapper = await mountSuspended(Detail)
    s.refreshReleases.mockClear()

    await clickRedeploy(wrapper)

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Deploy failed',
        description: 'Release r1 is not the newest release.',
        color: 'error',
      }),
    )
    expect(s.refreshReleases).toHaveBeenCalled()
  })

  it('shows the undeployed-changes banner and deploys from it', async () => {
    s.config.data = { ...(s.config.data as object), hasUndeployedChanges: true }
    const wrapper = await mountSuspended(Detail)

    expect(wrapper.find('[data-testid="undeployed-banner"]').exists()).toBe(true)
    await wrapper.find('[data-testid="deploy-changes"]').trigger('click')
    await flushPromises()

    expect(s.ship).toHaveBeenCalledWith('my-app', {})
  })

  it('hides the banner when the saved config is what is running', async () => {
    const wrapper = await mountSuspended(Detail)
    expect(wrapper.find('[data-testid="undeployed-banner"]').exists()).toBe(false)
  })

  it('rolls back to an older release after confirming', async () => {
    s.releases.items = [aRelease({ uuid: 'r2' }), aRelease({ uuid: 'r1', imageRef: 'nginx:1.26' })]
    const wrapper = await mountSuspended(Detail, { attachTo: document.body })

    await wrapper.find('[data-testid="rollback"]').trigger('click')
    await nextTick()
    ;(document.querySelector('[data-testid="confirm-rollback"]') as HTMLButtonElement).click()
    await flushPromises()

    expect(s.ship).toHaveBeenCalledWith('my-app', { fromReleaseUuid: 'r1' })
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: 'Rollback started' }))
    wrapper.unmount()
  })
})

describe('apps/[slug] builds', () => {
  const source = {
    installationUuid: 'i1',
    repo: 'acme/shop',
    branch: 'main',
    rootDir: '.',
    dockerfilePath: 'Dockerfile',
  }
  const sourced = (latestStatus: string | null, extra: Record<string, unknown> = {}) => ({
    slug: 'my-app',
    image: latestStatus === 'succeeded' ? 'registry/my-app:abc' : null,
    env: {},
    project: { slug: 'p', name: 'P' },
    environment: { uuid: 'e1', slug: 'dev', name: 'Dev' },
    source,
    latestBuild: latestStatus
      ? {
          uuid: 'b1',
          status: latestStatus,
          commitSha: 'a'.repeat(40),
          failureReason: null,
          createdAt: '2026-09-24T00:00:00.000Z',
        }
      : null,
    ...extra,
  })

  it('hides the builds card for an image app', async () => {
    const wrapper = await mountSuspended(Detail)

    expect(wrapper.find('[data-testid="rebuild"]').exists()).toBe(false)
  })

  it('shows the builds card with its source for a source app, and loads the builds', async () => {
    s.config.data = sourced('succeeded')
    const wrapper = await mountSuspended(Detail)
    await flushPromises()

    expect(wrapper.text()).toContain('acme/shop@main')
    expect(s.refreshBuilds).toHaveBeenCalled()
  })

  it('rebuilds and refreshes the builds', async () => {
    s.config.data = sourced('succeeded')
    const wrapper = await mountSuspended(Detail)
    s.refreshBuilds.mockClear()

    await wrapper.find('[data-testid="rebuild"]').trigger('click')
    await flushPromises()

    expect(s.rebuild).toHaveBeenCalledWith('my-app')
    expect(s.refreshBuilds).toHaveBeenCalled()
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: 'Build started' }))
  })

  it('cannot redeploy before the first image exists', async () => {
    s.config.data = sourced('running')
    const wrapper = await mountSuspended(Detail)

    const redeploy = wrapper.findAll('button').find(button => button.text().includes('Redeploy'))
    expect(redeploy?.attributes('disabled')).toBeDefined()
  })

  it('follows a running build by refreshing every 5 seconds', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    try {
      s.config.data = sourced('running')
      await mountSuspended(Detail)
      s.refreshConfig.mockClear()

      vi.advanceTimersByTime(5000)

      expect(s.refreshConfig).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
