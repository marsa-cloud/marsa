import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import { useProjectList } from '../useProjectList'

const project = {
  uuid: '0190c3c0-0000-7000-8000-000000000001',
  name: 'Demo',
  slug: 'demo',
  createdAt: '2026-09-19T00:00:00.000Z',
}

registerEndpoint('/api/v1/projects', {
  method: 'GET',
  handler: () => ({ items: [project], meta: { next: null } }),
})

describe('useProjectList.list', () => {
  it('returns the contract-validated projects', async () => {
    expect(await useProjectList().list()).toEqual([project])
  })
})
