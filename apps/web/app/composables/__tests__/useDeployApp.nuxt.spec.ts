import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'

import { useDeployApp } from '../useDeployApp'

const response = {
  appSlug: 'my-app',
  url: 'https://my-app.marsa.cc',
  releaseUuid: '11111111-1111-1111-1111-111111111111',
  deployStatus: 'pending',
}

const handler = vi.fn(() => response)
registerEndpoint('/api/v1/deployments/deploy', { method: 'POST', handler: () => handler() })

describe('useDeployApp.deploy', () => {
  it('POSTs the deploy command and returns the contract-validated response', async () => {
    const { deploy } = useDeployApp()
    const result = await deploy({ slug: 'my-app', image: 'ghcr.io/acme/my-app:v2', containerPort: 8080 })
    expect(result).toEqual(response)
    expect(handler).toHaveBeenCalled()
  })
})
