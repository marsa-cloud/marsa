import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'

import { useDeleteApp } from '../useDeleteApp'

const handler = vi.fn(() => null)
registerEndpoint('/api/v1/apps/my-app', { method: 'DELETE', handler: () => handler() })

registerEndpoint('/api/v1/apps/stuck-app', {
  method: 'DELETE',
  handler: () => {
    throw new Error('teardown failed')
  },
})

describe('useDeleteApp.remove', () => {
  it('DELETEs the app endpoint', async () => {
    await useDeleteApp().remove('my-app')

    expect(handler).toHaveBeenCalled()
  })

  it('propagates the failure so the caller can surface it', async () => {
    await expect(useDeleteApp().remove('stuck-app')).rejects.toBeDefined()
  })
})
