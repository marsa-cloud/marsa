import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import Detail from '../[slug].vue'

// Mutable holders the mocked composables read at component-setup time, so each
// test can arrange its own data/loading/error state before mounting.
const s = vi.hoisted(() => ({
  health: { data: null as unknown, status: 'success', error: null as unknown },
  releases: { data: { releases: [] } as unknown, status: 'success', error: null as unknown },
  logs: { data: { podName: null, logs: '' } as unknown, status: 'success', error: null as unknown },
}))

mockNuxtImport('useRoute', () => () => ({ params: { slug: 'my-app' } }))
mockNuxtImport('useAppHealth', () => () => ({
  data: ref(s.health.data),
  status: ref(s.health.status),
  error: ref(s.health.error),
}))
mockNuxtImport('useAppReleases', () => () => ({
  data: ref(s.releases.data),
  status: ref(s.releases.status),
  error: ref(s.releases.error),
}))
mockNuxtImport('useAppRunLogs', () => () => ({
  data: ref(s.logs.data),
  status: ref(s.logs.status),
  error: ref(s.logs.error),
}))

const del = vi.hoisted(() => ({ remove: vi.fn() }))
const nav = vi.hoisted(() => vi.fn())
const toastAdd = vi.hoisted(() => vi.fn())

mockNuxtImport('useDeleteApp', () => () => ({ remove: del.remove }))
mockNuxtImport('navigateTo', () => nav)
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

beforeEach(() => {
  s.health = { data: null, status: 'success', error: null }
  s.releases = { data: { releases: [] }, status: 'success', error: null }
  s.logs = { data: { podName: null, logs: '' }, status: 'success', error: null }
  del.remove.mockReset()
  del.remove.mockResolvedValue(undefined)
  nav.mockReset()
  toastAdd.mockReset()
})

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
})
