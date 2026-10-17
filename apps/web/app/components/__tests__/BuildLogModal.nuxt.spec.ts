import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import BuildLogModal from '../BuildLogModal.vue'

const read = vi.hoisted(() => vi.fn())
mockNuxtImport('useBuildLogs', () => () => ({ read }))

beforeEach(() => {
  read.mockReset().mockResolvedValue({ logs: '#1 [internal] load build definition' })
})

describe('BuildLogModal', () => {
  it('loads and shows the log of the opened build', async () => {
    const wrapper = await mountSuspended(BuildLogModal, {
      props: { slug: 'shop', buildUuid: 'b1' },
      attachTo: document.body,
    })
    await flushPromises()

    expect(read).toHaveBeenCalledWith('shop', 'b1')
    expect(document.body.textContent).toContain('#1 [internal] load build definition')
    wrapper.unmount()
  })

  it('shows the api’s reason when the logs are gone', async () => {
    read.mockRejectedValueOnce({
      data: {
        statusCode: 404,
        message: 'Build logs are kept for one hour after the build finishes.',
      },
    })
    const wrapper = await mountSuspended(BuildLogModal, {
      props: { slug: 'shop', buildUuid: 'b1' },
      attachTo: document.body,
    })
    await flushPromises()

    expect(document.querySelector('[data-testid="build-logs-empty"]')?.textContent).toContain(
      'kept for one hour',
    )
    wrapper.unmount()
  })

  it('fetches nothing while closed', async () => {
    await mountSuspended(BuildLogModal, { props: { slug: 'shop', buildUuid: null } })

    expect(read).not.toHaveBeenCalled()
  })
})
