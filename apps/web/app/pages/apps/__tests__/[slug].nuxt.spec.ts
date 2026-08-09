import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ref } from 'vue'
import { nextTick, ref } from 'vue'

import Detail from '../[slug].vue'
import { EnvSavedUnreadableError } from '../../../composables/useUpdateAppEnv'

// Mutable holders the mocked composables read at component-setup time, so each
// test can arrange its own data/loading/error state before mounting.
const s = vi.hoisted(() => ({
  health: { data: null as unknown, status: 'success', error: null as unknown },
  releases: { data: { releases: [] } as unknown, status: 'success', error: null as unknown },
  logs: { data: { podName: null, logs: '' } as unknown, status: 'success', error: null as unknown },
  config: {
    data: { slug: 'my-app', env: {} } as unknown,
    status: 'success',
    error: null as unknown,
  },
  refreshHealth: vi.fn(),
  refreshReleases: vi.fn(),
  refreshLogs: vi.fn(),
  refreshConfig: vi.fn(),
  redeploy: vi.fn(),
  updateEnv: vi.fn(),
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
  data: ref(s.releases.data),
  status: ref(s.releases.status),
  error: ref(s.releases.error),
  refresh: s.refreshReleases,
}))
mockNuxtImport('useRedeployApp', () => () => ({ redeploy: s.redeploy }))
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
mockNuxtImport('useUpdateAppEnv', () => () => ({ updateEnv: s.updateEnv }))

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
  s.config = { data: { slug: 'my-app', env: {} }, status: 'success', error: null }
  s.refreshHealth = vi.fn()
  s.refreshReleases = vi.fn()
  s.refreshLogs = vi.fn()
  s.refreshConfig = vi.fn()
  s.updateEnv = vi.fn().mockResolvedValue({
    slug: 'my-app',
    env: { LOG_LEVEL: 'debug' },
    redeployRequired: true,
  })
  s.redeploy = vi.fn().mockResolvedValue({
    appSlug: 'my-app',
    url: 'https://my-app.marsa.cc',
    releaseUuid: 'r-new',
    deployStatus: 'pending',
  })
  del.remove.mockReset()
  del.remove.mockResolvedValue(undefined)
  nav.mockReset()
  toastAdd.mockReset()
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

  it('describes an idle app as sleeping rather than broken', async () => {
    s.health.data = { status: 'idle', availableReplicas: 0, desiredReplicas: 0 }
    const wrapper = await mountSuspended(Detail)
    expect(wrapper.text()).toContain('idle')
    expect(wrapper.text()).toContain('no pods running')
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
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Redeploy started', color: 'success' }),
    )
  })

  it('surfaces the API message and skips the refresh when redeploy fails', async () => {
    s.redeploy = vi.fn().mockRejectedValue({ data: { message: 'No app with that slug.' } })
    const wrapper = await mountSuspended(Detail)

    await clickRedeploy(wrapper)

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Redeploy failed',
        description: 'No app with that slug.',
        color: 'error',
      }),
    )
    expect(s.refreshReleases).not.toHaveBeenCalled()
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

  it('seeds the env editor from the stored config', async () => {
    s.config.data = { slug: 'my-app', env: { LOG_LEVEL: 'info', REGION: 'eu' } }
    const wrapper = await mountSuspended(Detail)

    expect(
      (wrapper.find('input[aria-label="env key 1"]').element as HTMLInputElement).value,
    ).toBe('LOG_LEVEL')
    expect(
      (wrapper.find('input[aria-label="env value 1"]').element as HTMLInputElement).value,
    ).toBe('info')
    expect(
      (wrapper.find('input[aria-label="env key 2"]').element as HTMLInputElement).value,
    ).toBe('REGION')
  })

  it('saves the edited env as a whole record and prompts for a redeploy', async () => {
    s.config.data = { slug: 'my-app', env: { LOG_LEVEL: 'info' } }
    const wrapper = await mountSuspended(Detail)

    await wrapper.find('input[aria-label="env value 1"]').setValue('debug')
    await wrapper.find('[data-testid="save-env"]').trigger('click')
    await flushPromises()

    expect(s.updateEnv).toHaveBeenCalledWith('my-app', { LOG_LEVEL: 'debug' })
    expect(wrapper.find('[data-testid="env-redeploy-prompt"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Saved — redeploy to apply')
  })

  it('clears the redeploy prompt once the redeploy succeeds', async () => {
    const wrapper = await mountSuspended(Detail)

    await wrapper.find('[data-testid="save-env"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="env-redeploy-prompt"]').exists()).toBe(true)

    await wrapper.find('[data-testid="env-redeploy"]').trigger('click')
    await flushPromises()

    expect(s.redeploy).toHaveBeenCalledWith('my-app')
    expect(wrapper.find('[data-testid="env-redeploy-prompt"]').exists()).toBe(false)
  })

  it('blocks the save when a variable has a value but no name, rather than dropping it', async () => {
    s.config.data = { slug: 'my-app', env: { LOG_LEVEL: 'info' } }
    const wrapper = await mountSuspended(Detail)

    await wrapper.find('input[aria-label="env key 1"]').setValue('')
    await wrapper.find('[data-testid="save-env"]').trigger('click')
    await flushPromises()

    expect(s.updateEnv).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Every variable needs a name')
  })

  it('blocks the save on duplicate variable names', async () => {
    s.config.data = { slug: 'my-app', env: { A: '1', B: '2' } }
    const wrapper = await mountSuspended(Detail)

    await wrapper.find('input[aria-label="env key 2"]').setValue('A')
    await wrapper.find('[data-testid="save-env"]').trigger('click')
    await flushPromises()

    expect(s.updateEnv).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Duplicate variable name "A"')
  })

  it('keeps the editor and the redeploy prompt when the post-save refetch fails', async () => {
    const wrapper = await mountSuspended(Detail)

    // refresh() reports failure through `error`, not by rejecting.
    s.refreshConfig = vi.fn().mockImplementation(() => {
      s.config.error = new Error('boom')
      return Promise.resolve()
    })

    await wrapper.find('[data-testid="save-env"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="env-redeploy-prompt"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="save-env"]').exists()).toBe(true)
  })

  it('still prompts for a redeploy when the save lands but the response is unreadable', async () => {
    s.updateEnv = vi.fn().mockRejectedValue(new EnvSavedUnreadableError())
    const wrapper = await mountSuspended(Detail)

    await wrapper.find('[data-testid="save-env"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="env-redeploy-prompt"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('could not be read')
  })

  it('surfaces the API message inline and shows no prompt when the env save fails', async () => {
    s.updateEnv = vi.fn().mockRejectedValue({ data: { message: 'env must be an object' } })
    const wrapper = await mountSuspended(Detail)

    await wrapper.find('[data-testid="save-env"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('env must be an object')
    expect(wrapper.find('[data-testid="env-redeploy-prompt"]').exists()).toBe(false)
  })

  it('shows an error state when the stored config fails to load', async () => {
    // A genuine initial-load failure has no data; the card deliberately keeps
    // rendering when a *refetch* fails on top of a config it already holds.
    s.config = { data: null, status: 'error', error: new Error('boom') }
    const wrapper = await mountSuspended(Detail)

    expect(wrapper.text()).toContain('Couldn\'t load environment variables')
    expect(wrapper.find('[data-testid="save-env"]').exists()).toBe(false)
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
