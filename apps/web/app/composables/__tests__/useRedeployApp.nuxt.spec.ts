import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'

import { useRedeployApp } from '../useRedeployApp'

const response = {
  appSlug: 'my-app',
  url: 'https://my-app.marsa.cc',
  releaseUuid: '11111111-1111-1111-1111-111111111111',
  deployStatus: 'pending',
}

const handler = vi.fn(() => response)
registerEndpoint('/api/v1/apps/my-app/redeploy', { method: 'POST', handler: () => handler() })

describe('useRedeployApp.redeploy', () => {
  it('POSTs to the app-scoped redeploy route and returns the contract-validated response', async () => {
    const { redeploy } = useRedeployApp()
    const result = await redeploy('my-app')
    expect(result).toEqual(response)
    expect(handler).toHaveBeenCalled()
  })
})
