import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import { useUpdateApp } from '../useUpdateApp'

const saved = {
  slug: 'my-app',
  image: 'nginx:1.28',
  containerPort: 80,
  minReplicas: 1,
  maxReplicas: 1,
  env: { A: '1' },
  nodePin: null,
}
registerEndpoint('/api/v1/apps/my-app', { method: 'PATCH', handler: () => saved })

describe('useUpdateApp.update', () => {
  it('PATCHes the app and returns the saved config', async () => {
    const { update } = useUpdateApp()
    expect(await update('my-app', { image: 'nginx:1.28', env: { A: '1' } })).toEqual(saved)
  })
})
