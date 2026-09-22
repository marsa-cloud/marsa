import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import { useEnvironmentList } from '../useEnvironmentList'

const environment = {
  uuid: '0190c3c0-0000-7000-8000-000000000002',
  name: 'Dev',
  slug: 'dev',
  namespace: 'demo-dev',
  createdAt: '2026-09-19T00:00:00.000Z',
}

registerEndpoint('/api/v1/projects/demo/environments', {
  method: 'GET',
  handler: () => ({ items: [environment], meta: { next: null } }),
})

describe('useEnvironmentList.list', () => {
  it('returns the project\'s environments', async () => {
    expect(await useEnvironmentList().list('demo')).toEqual([environment])
  })
})
